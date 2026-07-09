// Opponent AI and inter-nation diplomacy: unit build decisions, strategic
// placement, and the living-world war/peace simulation.
import {
    AI_TUNING,
    allowedAmmo,
    initialWarhead,
    DIPLOMACY,
    HANGAR_SPEC,
    UNITS,
    WARHEADS,
} from "../data/constants.js";
import {haversine} from "../geo/geo.js";
import {rand} from "./worldState.js";
import {atWar, gdpOf, industryCapOf, industryCountOf, netIncomeOf, defenseRange} from "./queries.js";
import {randRange, weightedPick} from "../../lib/random.js";
import {clamp} from "../../lib/math.js";
import {
    commandAttack,
    declareWar,
    ensureProd,
    prodCount,
    queueAircraft,
    queueAmmo,
    queueUnit,
    scrapUnit,
    setAwacsPatrol,
    setMarch,
    setPatrolSize,
    unitLockReason,
} from "./production.js";
import {offerPeace, proposeAlliance} from "./warResolution.js";
import {aiCities, aiPlace, frontPos, protectPoints} from "./aiPlace.js";

// --- Bloc-power math ---------------------------------------------------------
// A nation's raw strength — GDP plus a hp-weighted military score. Cities pass
// through gdpOf, so battered nations already look weaker. Units are weighted by
// their build cost (a rough proxy for battle value) times remaining hp fraction.
function nationPower(w, n) {
    let force = 0;
    for (const u of w.units) {
        if (u.slot !== n.slot || u.hp <= 0) continue;
        const def = UNITS[u.type];
        const cost = def?.cost || 0;
        const hpFrac = def?.hp ? (u.hp / def.hp) : 1;
        force += cost * hpFrac;
    }
    // Scale force by ~1/300 so a 500-point silo (with a healthy hp) contributes
    // ~1.7 units of "power" — comparable to a small-country GDP figure ($T).
    return Math.max(0.1, gdpOf(w, n.slot)) + force / 300;
}

// n's bloc power = n + every ally still alive. Used to decide whether it's safe
// to open a war on a target (must also count the target's allies).
function blocPower(w, n) {
    let sum = nationPower(w, n);
    for (const s in n.relations) {
        if (n.relations[s] !== "ally") continue;
        const ally = w.nations.find((x) => x.slot === +s && x.alive);
        if (ally) sum += nationPower(w, ally);
    }
    return sum;
}

// Strategic value of an at-war enemy city as a strike target, seen from `from`:
// counter-value (population, capital weight) discounted by distance (nearer preferred).
function targetValue(from, c) {
    const pop = (c.pop || 0) + 1;
    const capW = c.cap ? 1.6 : 1;
    const dist = from ? haversine(from.lng, from.lat, c.lng, c.lat) : 1;
    const distW = 1 / (1 + dist / AI_TUNING.targetDistScaleKm);
    return pop * capW * distW;
}

// Best strike target for nation `n`: weighted over living cities of at-war rivals,
// biased toward city value, distance, and how much weaker that rival's bloc is
// than n's. Never targets neutrals. Reproducible via rand(w).
function pickTarget(w, n, from) {
    const myBloc = blocPower(w, n);
    const enemyBlocs = new Map();
    const scored = [];
    for (const c of w.cities) {
        if (!c.alive || c.slot === n.slot || !atWar(w, n.slot, c.slot)) continue;
        let eb = enemyBlocs.get(c.slot);
        if (eb == null) {
            const en = w.nations.find((x) => x.slot === c.slot);
            eb = en ? blocPower(w, en) : 1;
            enemyBlocs.set(c.slot, eb);
        }
        // Weakness ratio: bigger when the enemy bloc is smaller than ours.
        const weakness = Math.pow(myBloc / Math.max(0.1, eb), 0.5);
        scored.push([c, targetValue(from, c) * weakness]);
    }
    if (!scored.length) return null;
    scored.sort((a, b) => b[1] - a[1]);
    const top = scored.slice(0, AI_TUNING.targetTopN);
    return weightedPick(top, () => rand(w));
}

// Tech-gated unit types the AI pursues once unlocked, in build priority. Space
// Command HQ leads so its dependents become buildable; subs and modern defenses
// follow. Purely a build-order preference — each candidate is still validated by
// queueUnit (tech + prereq + caps).
const AI_UNLOCK_BUILD_ORDER = [
    "spacehq", "sub-ssn", "sub-ssbn", "patriot", "thaad", "aegis",
    "reconsat", "orbitallaser", "hypersonicbty", "orbitalstrike",
];

function aiBuildUnlocked(w, n, myUnits, cities, front) {
    if (rand(w) >= AI_TUNING.unlockedBuildChance) return false;
    for (const type of AI_UNLOCK_BUILD_ORDER) {
        const def = UNITS[type];
        if (!def) continue;
        if (def.requiresTech && !n.research.done.includes(def.requiresTech)) continue;
        const have = myUnits.filter((u) => u.type === type).length + prodCount(n, "unit", type);
        if (def.maxCount && have >= def.maxCount) continue;
        if (unitLockReason(w, n.slot, type)) continue;
        const isSpace = def.requiresUnit === "spacehq" || type === "spacehq";
        const isSub = type === "sub-ssn" || type === "sub-ssbn";
        const reserve = isSpace ? AI_TUNING.spaceHqReserve : isSub ? AI_TUNING.subReserve : 0;
        if (n.points < def.cost + reserve) continue;
        const p = aiPlace(w, n, type, myUnits, cities, front);
        if (!p) continue;
        if (queueUnit(w, n.slot, type, p.lng, p.lat, true).ok) return true;
    }
    return false;
}

function capPositions(w) {
    if (w._capPos) return w._capPos;
    const caps = {};
    for (const c of w.cities) {
        const cur = caps[c.slot];
        if (!cur || (c.cap && !cur.cap)) caps[c.slot] = {lng: c.lng, lat: c.lat, cap: !!c.cap};
    }
    w._capPos = caps;
    return caps;
}

function aliveCityCounts(w) {
    const m = new Map();
    for (const c of w.cities) if (c.alive) m.set(c.slot, (m.get(c.slot) || 0) + 1);
    return m;
}

function warCount(n) {
    let k = 0;
    for (const s in n.relations) if (n.relations[s] === "war") k++;
    return k;
}

function allyCount(n) {
    let k = 0;
    for (const s in n.relations) if (n.relations[s] === "ally") k++;
    return k;
}

function sharesEnemy(n, m) {
    for (const s in n.relations) if (n.relations[s] === "war" && m.relations[s] === "war") return true;
    return false;
}

function nearPlayer(w, n, caps) {
    const a = caps[n.slot], p = caps[w.mySlot];
    if (!a || !p) return false;
    return haversine(a.lng, a.lat, p.lng, p.lat) <= DIPLOMACY.activeRangeKm;
}

// Great-power reach: bigger economies see farther diplomatically. A $0.1T micro
// state stays at the base radius; a $27T superpower reaches out to warRangeMaxKm.
function warRangeFor(n) {
    const gdp = Math.max(0.1, n.gdp || 0.1);
    if (gdp <= AI_TUNING.warRangeGdpBoostT) return DIPLOMACY.warRangeKm;
    const t = Math.min(1, Math.log(gdp / AI_TUNING.warRangeGdpBoostT) / Math.log(30));
    return DIPLOMACY.warRangeKm + (AI_TUNING.warRangeMaxKm - DIPLOMACY.warRangeKm) * t;
}

export function diploTick(w, dt) {
    let firing = null;
    for (const n of w.nations) {
        if (!n.isAi || !n.alive || n.active === false) continue;
        if (n._diplo == null) n._diplo = randRange(rand(w), DIPLOMACY.thinkMin, DIPLOMACY.thinkSpan);
        n._diplo -= dt;
        if (n._diplo > 0) continue;
        n._diplo = randRange(rand(w), DIPLOMACY.thinkMin, DIPLOMACY.thinkSpan);
        (firing || (firing = [])).push(n);
    }
    if (!firing) return;
    const caps = capPositions(w);
    const alive = aliveCityCounts(w);
    for (const n of firing) {
        diploOfferPeace(w, n);
        diploProposeAlliance(w, n, caps);
        diploDeclareWar(w, n, caps, alive);
    }
}

function diploProposeAlliance(w, n, caps) {
    if (allyCount(n) >= DIPLOMACY.maxAllies) return;
    if (rand(w) >= DIPLOMACY.allyProposeChance) return;
    const capA = caps[n.slot];
    if (!capA) return;
    const cand = [];
    let total = 0;
    for (const m of w.nations) {
        if (m.slot === n.slot || !m.alive || m.active === false) continue;
        const rel = n.relations[m.slot];
        if (rel === "war" || rel === "ally") continue;
        if (!m.isAi && w.time < (w.rules?.playerGraceSec ?? DIPLOMACY.playerGraceSec)) continue;
        const capB = caps[m.slot];
        if (!capB || haversine(capA.lng, capA.lat, capB.lng, capB.lat) > DIPLOMACY.allyRangeKm) continue;
        const weight = (1 + (sharesEnemy(n, m) ? DIPLOMACY.allySharedEnemyW : 0)) * Math.max(0.2, m.gdp || 0.1);
        cand.push([m.slot, weight]);
        total += weight;
    }
    if (!cand.length || total <= 0) return;
    const target = weightedPick(cand, () => rand(w));
    if (target != null) proposeAlliance(w, n.slot, target);
}

function diploOfferPeace(w, n) {
    for (const s in n.relations) {
        if (n.relations[s] !== "war") continue;
        const foe = +s;
        const age = w.time - (n._warStart?.[foe] ?? 0);
        if (age > DIPLOMACY.minWarSec && rand(w) < DIPLOMACY.peaceOfferChance) offerPeace(w, n.slot, foe);
    }
}

// Weakness-first war declaration. Weigh every reachable rival by how much weaker
// their whole bloc (target + its allies) is than mine (me + my allies). Skip the
// declaration entirely if no rival bloc is soft enough (blocAdvantageMin).
function diploDeclareWar(w, n, caps, alive) {
    if (warCount(n) >= DIPLOMACY.maxWars) return;
    if (rand(w) >= DIPLOMACY.declareChance) return;
    const capA = caps[n.slot];
    if (!capA) return;
    const myBloc = blocPower(w, n);
    const reach = warRangeFor(n);
    const rivals = [];
    let total = 0;
    for (const m of w.nations) {
        if (m.slot === n.slot || !m.alive || m.active === false) continue;
        if (n.relations[m.slot] === "war" || n.relations[m.slot] === "ally") continue;
        if (!m.isAi && w.time < (w.rules?.playerGraceSec ?? DIPLOMACY.playerGraceSec)) continue;
        const capB = caps[m.slot];
        if (!capB || haversine(capA.lng, capA.lat, capB.lng, capB.lat) > reach) continue;
        const theirBloc = blocPower(w, m);
        // Bloc-advantage ratio drives the pick. Nations with strong allies protect
        // each other — sharesEnemy nudges up slightly (a fresh enemy of my enemy).
        const cA = Math.max(1, alive.get(n.slot) || 0);
        const cB = Math.max(1, alive.get(m.slot) || 0);
        const gdpRatio = Math.pow(myBloc / Math.max(0.1, theirBloc), AI_TUNING.blocGdpWeight);
        const softness = Math.pow(cA / cB, AI_TUNING.blocForceWeight);
        let weight = gdpRatio * softness;
        if (sharesEnemy(n, m)) weight *= 1 + DIPLOMACY.allySharedEnemyW * 0.25;
        // Never open a war that our own bloc is likely to lose.
        if (myBloc < theirBloc * AI_TUNING.blocAdvantageMin) continue;
        weight = clamp(weight, DIPLOMACY.wMin, DIPLOMACY.wMax);
        rivals.push([m.slot, weight]);
        total += weight;
    }
    if (!rivals.length || total <= 0) return;
    // Focus the pick on the softest handful of options so weak neighbours get
    // pounced on instead of the choice being diluted across everyone reachable.
    rivals.sort((a, b) => b[1] - a[1]);
    const top = rivals.slice(0, AI_TUNING.weaknessTopN);
    const target = weightedPick(top, () => rand(w));
    if (target != null) declareWar(w, n.slot, target);
}

// --- Doctrine helpers --------------------------------------------------------

function totalOf(myUnits, n, type) {
    return myUnits.filter((u) => u.type === type).length + prodCount(n, "unit", type);
}

function totalDefenders(myUnits, n) {
    const types = ["battery", "dome", "patriot", "aegis", "thaad", "cruiser", "destroyer", "orbitallaser"];
    let k = 0;
    for (const t of types) k += totalOf(myUnits, n, t);
    return k;
}

// Cheapest defender the AI can afford right now that isn't gated off (patriot /
// aegis / thaad by tech; orbital by spacehq). Returns null when nothing fits.
function affordableDefender(w, n, points) {
    const order = ["battery", "patriot", "dome", "aegis", "thaad"];
    for (const t of order) {
        const def = UNITS[t];
        if (!def) continue;
        if (unitLockReason(w, n.slot, t)) continue;
        if (points >= def.cost) return t;
    }
    return null;
}

// Uncovered protect-points — points not inside any live friendly defender.
function uncoveredPoints(w, slot, myUnits) {
    const pts = protectPoints(w, slot, myUnits);
    const out = [];
    for (const p of pts) {
        let covered = false;
        for (const u of myUnits) {
            if (UNITS[u.type].kind !== "defense") continue;
            if (haversine(u.lng, u.lat, p.lng, p.lat) <= defenseRange(w, u)) { covered = true; break; }
        }
        if (!covered) out.push(p);
    }
    return out;
}

// Weakest / most-drainy unit we could safely scrap to escape a deficit — the
// highest-upkeep unit that is NOT covering the capital / bunker, NOT engaged,
// NOT the only defender we own, and NOT the last of its kind.
function pickScrapCandidate(w, n, myUnits) {
    const cap = capPositions(w)[n.slot];
    const bunker = myUnits.find((u) => u.type === "bunker" && u.hp > 0);
    const isRedundantKind = (u) => {
        const type = u.type;
        const kin = myUnits.filter((x) => x.type === type && x.hp > 0).length;
        if (kin <= 1) return false; // last of its kind — keep it
        if (UNITS[type].maxCount) return false; // never scrap uniques (bunker/spacehq)
        if (UNITS[type].kind === "defense") {
            const defenders = totalDefenders(myUnits, n);
            if (defenders <= 2) return false;
        }
        return true;
    };
    let best = null, bestScore = -Infinity;
    for (const u of myUnits) {
        if (u.hp <= 0) continue;
        if (u.type === "bunker" || u.type === "spacehq") continue;
        if (u.targetId) continue;                    // firing at something — leave it
        const def = UNITS[u.type];
        if (!def) continue;
        // Preserve anything defending the heart of the nation.
        if (cap && def.kind === "defense" && haversine(cap.lng, cap.lat, u.lng, u.lat) <= AI_TUNING.scrapSafeRadiusKm) continue;
        if (bunker && def.kind === "defense" && haversine(bunker.lng, bunker.lat, u.lng, u.lat) <= AI_TUNING.scrapSafeRadiusKm) continue;
        if (!isRedundantKind(u)) continue;
        // Score by upkeep (bigger = more relief) with a small bump for lower hp
        // (finish off the least-useful hull first).
        const upkeep = def.upkeep ?? 0;
        const hpFrac = def.hp ? (u.hp / def.hp) : 1;
        const score = upkeep + (1 - hpFrac) * 0.3;
        if (score > bestScore) { bestScore = score; best = u; }
    }
    return best;
}

// Restock the base's hangar to the AI's per-type target via queueAircraft.
// Returns true if it queued something (caller counts one line slot used).
function restockHangar(w, n, myUnits) {
    if (netIncomeOf(w, n.slot) < 0) return false;
    const bases = myUnits.filter((u) => u.hp > 0 && UNITS[u.type].wing);
    if (!bases.length) return false;
    const targets = {
        interceptor: AI_TUNING.hangarInterceptorTarget,
        attack: AI_TUNING.hangarAttackTarget,
        transport: AI_TUNING.hangarTransportTarget,
        awacs: AI_TUNING.hangarAwacsTarget,
        carrierfighter: AI_TUNING.hangarCarrierFighterTarget,
        strikefighter: AI_TUNING.hangarStrikeFighterTarget,
        helo: AI_TUNING.hangarHeloTarget,
        transporthelo: AI_TUNING.hangarTransportHeloTarget,
    };
    for (const base of bases) {
        const spec = HANGAR_SPEC[base.type];
        if (!spec) continue;
        for (const type of Object.keys(spec)) {
            const cap = spec[type] || 0;
            const desired = Math.min(cap, targets[type] || 0);
            if (desired <= 0) continue;
            const stock = base.hangar?.[type] || 0;
            const live = w.units.filter((u) => u.baseId === base.id && u.type === type && u.hp > 0).length;
            const queued = prodCount(n, "unit", type);
            const total = stock + live + queued;
            if (total >= desired) continue;
            const cost = UNITS[type]?.cost || 0;
            if (n.points < cost + 20) continue;
            const r = queueAircraft(w, n.slot, base.id, type);
            if (r.ok) return true;
        }
    }
    return false;
}

// The core doctrine ladder. Returns true when it queues one thing (units + ammo
// come through this one hook, so the caller can loop up to queueMax cleanly).
// Ordering matters: cheaper survival needs first, then economy, then power
// projection, and finally the pricey capstone platforms.
function aiBuildDoctrine(w, n, myUnits, cities, front, enemies) {
    const net = netIncomeOf(w, n.slot);
    const deficit = net < 0;
    const place = (type) => aiPlace(w, n, type, myUnits, cities, front);
    const q = (type) => {
        const p = place(type);
        if (!p) return false;
        return queueUnit(w, n.slot, type, p.lng, p.lat, true).ok;
    };
    const canAfford = (type, reserve = 0) => n.points >= (UNITS[type]?.cost || 0) + reserve;

    // Living defenders (counting anything on the line too).
    const defenders = totalDefenders(myUnits, n);
    const protects = protectPoints(w, n.slot, myUnits);
    const protectN = protects.length;
    const defenseTarget = Math.min(AI_TUNING.defenseMax, Math.max(1, Math.round(protectN * AI_TUNING.defensePerPoint)));

    // 1. First-line defense over the capital — pick the cheapest defender we can
    //    field, so a broke nation gets battery cover instead of freezing.
    if (defenders === 0) {
        const type = affordableDefender(w, n, n.points);
        if (type && q(type)) return true;
    }

    // 2. Warhead stocks. Standard is always useful (any warhead-capable platform
    //    can fall back to it). Strategic rounds stock lightly in peace and heavier
    //    at war so an AI never enters a war with an empty magazine.
    const hasOffense = myUnits.some((u) => UNITS[u.type].kind === "offense")
        || prodCount(n, "unit", "silo") > 0
        || prodCount(n, "unit", "launcher") > 0
        || prodCount(n, "unit", "hypersonicbty") > 0
        || prodCount(n, "unit", "sub-ssbn") > 0;
    const stocked = (t) => (n.ammo[t] || 0) + prodCount(n, "ammo", t);
    if (!deficit && hasOffense && stocked("standard") < AI_TUNING.stdStockTarget && canAfford("standard", 0) && n.points >= WARHEADS.standard.prodCost + AI_TUNING.stdReserve) {
        if (queueAmmo(w, n.slot, "standard").ok) return true;
    }
    const thermoTarget = enemies.length ? AI_TUNING.thermoStockTarget : AI_TUNING.peaceThermoStock;
    if (!deficit && hasOffense && stocked("thermo") < thermoTarget && n.points >= WARHEADS.thermo.prodCost + AI_TUNING.thermoReserve && rand(w) < AI_TUNING.thermoChance) {
        if (queueAmmo(w, n.slot, "thermo").ok) return true;
    }
    const hasHyper = myUnits.some((u) => u.hp > 0 && allowedAmmo(u.type).includes("hgv"))
        || prodCount(n, "unit", "hypersonicbty") > 0;
    const hgvTarget = enemies.length ? AI_TUNING.hgvStockTarget : AI_TUNING.peaceHgvStock;
    if (!deficit && hasHyper && stocked("hgv") < hgvTarget && n.points >= WARHEADS.hgv.prodCost + AI_TUNING.hgvReserve && rand(w) < AI_TUNING.hgvChance) {
        if (queueAmmo(w, n.slot, "hgv").ok) return true;
    }
    const hasTel = myUnits.some((u) => u.hp > 0 && allowedAmmo(u.type).includes("sicbm"))
        || prodCount(n, "unit", "launcher") > 0;
    const sicbmTarget = enemies.length ? AI_TUNING.sicbmStockTarget : AI_TUNING.peaceSicbmStock;
    if (!deficit && hasTel && stocked("sicbm") < sicbmTarget && n.points >= WARHEADS.sicbm.prodCost + AI_TUNING.sicbmReserve && rand(w) < AI_TUNING.sicbmChance) {
        if (queueAmmo(w, n.slot, "sicbm").ok) return true;
    }

    // 3. Radar coverage — humans set up early warning before they build out. A
    //    broke nation still gets radar since it's only 150 pts.
    const radars = totalOf(myUnits, n, "radar");
    const radarTarget = Math.min(AI_TUNING.radarMax, Math.max(1, Math.round(cities.length * AI_TUNING.radarPerCity)));
    if (radars < radarTarget && n.points >= UNITS.radar.cost + AI_TUNING.radarReserve) {
        if (q("radar")) return true;
    }

    // 4. Industry ladder — factory → port (coastal) → refinery → techpark, all
    //    bounded by industryCapOf. In a deficit only factory is allowed (mirrors
    //    the human deficit rule in queueUnit).
    const indUsed = industryCountOf(w, n.slot);
    const indCap = industryCapOf(w, n.slot);
    const factories = totalOf(myUnits, n, "factory");
    if (indUsed < indCap && factories < Math.max(3, Math.ceil(indCap * 0.4)) && canAfford("factory", AI_TUNING.factoryReserve)) {
        if (q("factory")) return true;
    }
    if (!deficit && indUsed < indCap) {
        const ports = totalOf(myUnits, n, "port");
        if (ports < AI_TUNING.portTarget && canAfford("port", AI_TUNING.portReserve)) {
            if (q("port")) return true;
        }
        const hasFactoryUp = myUnits.some((u) => u.type === "factory" && u.hp > 0);
        if (hasFactoryUp) {
            const refineries = totalOf(myUnits, n, "refinery");
            if (refineries < AI_TUNING.refineryTarget && canAfford("refinery", AI_TUNING.refineryReserve)) {
                if (q("refinery")) return true;
            }
            const techparks = totalOf(myUnits, n, "techpark");
            if (techparks < AI_TUNING.techparkTarget && canAfford("techpark", AI_TUNING.techparkReserve)) {
                if (q("techpark")) return true;
            }
        }
    }

    // 5. Leadership bunker — one hardened command node.
    const hasBunker = totalOf(myUnits, n, "bunker") > 0;
    if (!deficit && !hasBunker && cities.length >= AI_TUNING.bunkerMinCities && defenders > 0 && canAfford("bunker", AI_TUNING.bunkerReserve)) {
        if (q("bunker")) return true;
    }

    // 5b. Airstrip — the evac field for leadership AND the home of the air wing.
    //     A bunker without one leaves leaders stranded, so this shadows the bunker.
    const hasStrip = totalOf(myUnits, n, "airstrip") > 0;
    if (!deficit && !hasStrip && defenders > 0 && canAfford("airstrip", AI_TUNING.bunkerReserve)) {
        if (q("airstrip")) return true;
    }

    // 6. Layered defense expansion — fill uncovered protect-points with the
    //    cheapest defender we can field. Batteries first (150) then dome / aegis
    //    for the highest-value gaps.
    if (defenders < defenseTarget) {
        const uncov = uncoveredPoints(w, n.slot, myUnits);
        if (uncov.length) {
            const type = affordableDefender(w, n, n.points);
            if (type && q(type)) return true;
        }
    }

    // 6b. Ground army — armybase then a tank/infantry/artillery mix. Artillery
    //     rounds out the stack (currently ignored by the AI).
    const hasArmybase = totalOf(myUnits, n, "armybase") > 0;
    if (!deficit && defenders > 0 && !hasArmybase && canAfford("armybase", AI_TUNING.armyReserve)) {
        if (q("armybase")) return true;
    }
    const groundForce = myUnits.filter((u) => UNITS[u.type].capture).length
        + prodCount(n, "unit", "infantry") + prodCount(n, "unit", "tank") + prodCount(n, "unit", "artillery");
    if (!deficit && hasArmybase && groundForce < AI_TUNING.groundTarget) {
        const roll = rand(w);
        const type = roll < AI_TUNING.artilleryShare ? "artillery" : (roll < 0.6 ? "tank" : "infantry");
        if (canAfford(type, AI_TUNING.armyReserve) && q(type)) return true;
    }

    // 7. Strategic warning array.
    const oths = totalOf(myUnits, n, "oth");
    if (!deficit && radars > 0 && oths === 0 && canAfford("oth", AI_TUNING.othReserve)) {
        if (q("oth")) return true;
    }

    // 8. Air-wing restock — humans keep hangars full via queueAircraft. Only
    //    runs when solvent because queueAircraft rejects in deficit anyway.
    if (restockHangar(w, n, myUnits)) return true;

    // 9. Offense platforms — humans stand up a deterrent BEFORE the shooting.
    //    Cheap launcher first, then hypersonic battery (if tech done), then silo.
    if (!deficit) {
        const launchers = totalOf(myUnits, n, "launcher");
        if (launchers < AI_TUNING.launcherTarget && canAfford("launcher", AI_TUNING.launcherReserve)) {
            if (q("launcher")) return true;
        }
        const hypers = totalOf(myUnits, n, "hypersonicbty");
        if (!unitLockReason(w, n.slot, "hypersonicbty") && hypers < AI_TUNING.hyperTarget && canAfford("hypersonicbty", AI_TUNING.hyperReserve)) {
            if (q("hypersonicbty")) return true;
        }
        const silos = totalOf(myUnits, n, "silo");
        const wantSilos = enemies.length ? AI_TUNING.siloTarget : Math.max(1, Math.floor(AI_TUNING.siloTarget / 2));
        if (silos < wantSilos && canAfford("silo", AI_TUNING.siloReserve) && net > AI_TUNING.siloMinNet) {
            if (q("silo")) return true;
        }
    }

    // 10. Advanced tech-gated units (space HQ, subs, modern defense layers).
    if (!deficit && aiBuildUnlocked(w, n, myUnits, cities, front)) return true;

    // 11. Naval surface group — coastal AIs pull together a screen. aiPlace's
    //     sea-spot check returns null for landlocked capitals, so the build just
    //     gets skipped there.
    if (!deficit) {
        const naval = [
            ["destroyer", AI_TUNING.destroyerTarget, AI_TUNING.destroyerReserve],
            ["cruiser", AI_TUNING.cruiserTarget, AI_TUNING.cruiserReserve],
            ["battleship", AI_TUNING.battleshipTarget, AI_TUNING.battleshipReserve],
            ["replenish", AI_TUNING.replenishTarget, AI_TUNING.replenishReserve],
            ["amphib", AI_TUNING.amphibTarget, AI_TUNING.amphibReserve],
            ["carrier", AI_TUNING.carrierTarget, AI_TUNING.carrierReserve],
        ];
        for (const [type, target, reserve] of naval) {
            if (unitLockReason(w, n.slot, type)) continue;
            const have = totalOf(myUnits, n, type);
            if (have >= target) continue;
            if (!canAfford(type, reserve)) continue;
            if (q(type)) return true;
        }
    }

    return false;
}

export function aiTick(w, dt) {
    const unitsBySlot = new Map();
    for (const u of w.units) {
        if (u.hp <= 0) continue;
        let arr = unitsBySlot.get(u.slot);
        if (!arr) unitsBySlot.set(u.slot, arr = []);
        arr.push(u);
    }
    const caps = capPositions(w);
    for (const n of w.nations) {
        if (!n.isAi || !n.alive || n.active === false) continue;
        n._ai -= dt;
        if (n._ai > 0) continue;
        const active = warCount(n) > 0 || nearPlayer(w, n, caps);
        n._ai = active
            ? randRange(rand(w), AI_TUNING.thinkMin, AI_TUNING.thinkSpan)
            : randRange(rand(w), DIPLOMACY.idleThinkMin, DIPLOMACY.idleThinkSpan);
        ensureProd(n);
        let myUnits = unitsBySlot.get(n.slot) || [];
        const enemies = w.nations.filter((e) => e.alive && atWar(w, n.slot, e.slot));
        // A launcher stuck on an empty magazine falls back to Standard.
        for (const u of myUnits) {
            if (UNITS[u.type].kind !== "offense") continue;
            const wh = u.warhead || initialWarhead(u.type);
            if (!(n.ammo[wh] > 0) && allowedAmmo(u.type).includes("standard") && (n.ammo.standard || 0) > 0) u.warhead = "standard";
        }
        // Assign every idle strike platform (not ground units) a target using the
        // bloc-aware weakness picker.
        const cap = caps[n.slot];
        for (const u of myUnits) {
            if (u.targetId) continue;
            const def = UNITS[u.type];
            if (def.kind !== "offense" || def.targets === "land") continue;
            const tgt = pickTarget(w, n, cap);
            if (!tgt) break;
            const sig = def.signature;
            const sigChance = sig === "hgv" ? AI_TUNING.hgvChance : sig === "sicbm" ? AI_TUNING.sicbmChance : AI_TUNING.thermoChance;
            if (sig && allowedAmmo(u.type).includes(sig) && (n.ammo[sig] || 0) > 0 && rand(w) < sigChance) u.warhead = sig;
            commandAttack(w, u.id, tgt.id);
        }
        // Ground forces press the war: send each idle capture-capable battalion
        // to the nearest at-war city.
        for (const u of myUnits) {
            if (u.dest || u.hp <= 0 || !UNITS[u.type].capture) continue;
            let best = null, bd = Infinity;
            for (const c of w.cities) {
                if (!c.alive || c.slot === n.slot || !atWar(w, n.slot, c.slot)) continue;
                const d = haversine(u.lng, u.lat, c.lng, c.lat);
                if (d < bd) { bd = d; best = c; }
            }
            if (best) {
                setMarch(w, n.slot, u.id, best.lng, best.lat);
                commandAttack(w, u.id, best.id);
            }
        }
        // Bring air power online — patrols + AWACS orbit on every airbase.
        if (enemies.length) {
            for (const u of myUnits) {
                if (u.hp <= 0 || !UNITS[u.type].wing) continue;
                if (!u.patrolSize) setPatrolSize(w, n.slot, u.id, AI_TUNING.patrolSize);
                if (!u.awacsPatrol) setAwacsPatrol(w, n.slot, u.id, true);
            }
        }
        const myCap = w.cities.find((c) => c.slot === n.slot && c.alive);
        if (!myCap) continue;
        if (myUnits.length >= DIPLOMACY.aiUnitCap) continue;

        // Deficit response: humans SELL. Scrap the highest-upkeep redundant hull
        // to shed drag before queueing anything else. Capped per think so we
        // don't dismantle the whole force in one flurry.
        const net = netIncomeOf(w, n.slot);
        if (net < AI_TUNING.scrapMinNet) {
            let scrapped = 0;
            while (scrapped < AI_TUNING.scrapMaxPerThink) {
                const victim = pickScrapCandidate(w, n, myUnits);
                if (!victim) break;
                if (!scrapUnit(w, n.slot, victim.id).ok) break;
                scrapped++;
                // Refresh the local roster and world snapshot to reflect the sale.
                myUnits = (unitsBySlot.get(n.slot) || []).filter((u) => u.id !== victim.id);
                unitsBySlot.set(n.slot, myUnits);
            }
        }

        // Build until the line is full or nothing more qualifies. Humans queue
        // multiple items per session — same idea, bounded by queueMax.
        const cities = aiCities(w, n.slot);
        const front = frontPos(w, n, caps);
        for (let i = 0; i < AI_TUNING.queueMax + 2; i++) {
            const lineBusy = (n.prod.current ? 1 : 0) + n.prod.queue.length;
            if (lineBusy >= AI_TUNING.queueMax) break;
            if (myUnits.length + n.prod.queue.length >= DIPLOMACY.aiUnitCap) break;
            const built = aiBuildDoctrine(w, n, myUnits, cities, front, enemies);
            if (!built) break;
        }
    }
}
