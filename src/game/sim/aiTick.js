// Opponent AI and inter-nation diplomacy: unit/tech build decisions, strategic
// placement, and the living-world war/peace simulation. Split out of tick.js
// (see that file's step() for where aiTick/diploTick run in the tick order).
import {
    AI_TUNING,
    allowedAmmo,
    initialWarhead,
    DIPLOMACY,
    UNITS,
    WARHEADS,
} from "../data/constants.js";
import {haversine} from "../geo/geo.js";
import {rand} from "./worldState.js";
import {atWar, netIncomeOf} from "./queries.js";
import {commandAttack, declareWar, ensureProd, prodCount, queueAmmo, queueUnit, setAwacsPatrol, setMarch, setPatrolSize, unitLockReason} from "./production.js";
import {offerPeace, proposeAlliance} from "./warResolution.js";
import {aiCities, aiPlace, frontPos, protectPoints} from "./aiPlace.js";

// Strategic value of an at-war enemy city as a strike target, seen from `from`:
// counter-value (population, capital weight) discounted by distance (nearer preferred).
function targetValue(from, c) {
    const pop = (c.pop || 0) + 1;
    const capW = c.cap ? 1.6 : 1;
    const dist = from ? haversine(from.lng, from.lat, c.lng, c.lat) : 1;
    const distW = 1 / (1 + dist / AI_TUNING.targetDistScaleKm);
    return pop * capW * distW;
}

// Best strike target for nation `n`: the highest-value living city of a nation it is
// at war with, measured from `from` (its capital). Neutrals are never targeted. A
// weighted pick over the strongest few keeps the AI concentrating on good targets
// while staying varied; every roll uses the seeded rand(w), so it stays reproducible.
function pickTarget(w, n, from) {
    const scored = [];
    for (const c of w.cities) {
        if (!c.alive || c.slot === n.slot || !atWar(w, n.slot, c.slot)) continue;
        scored.push([c, targetValue(from, c)]);
    }
    if (!scored.length) return null;
    scored.sort((a, b) => b[1] - a[1]);
    const top = scored.slice(0, AI_TUNING.targetTopN);
    const total = top.reduce((s, [, v]) => s + v, 0);
    let r = rand(w) * total;
    for (const [c, v] of top) { r -= v; if (r <= 0) return c; }
    return top[0][0];
}

// Tech-gated unit types the AI will pursue once unlocked, in build priority.
// Space Command HQ leads so its dependents become buildable; subs and modern
// defenses follow. Purely a build-order preference over data-driven gates —
// each candidate is still validated by queueUnit (tech + prereq + caps).
const AI_UNLOCK_BUILD_ORDER = [
    "spacehq", "sub-ssn", "sub-ssbn", "patriot", "thaad", "aegis",
    "reconsat", "warnsat", "sbi", "orbitallaser", "hypersonicbty", "orbitalstrike",
];

// Builds one freshly-unlocked, tech-gated unit the nation qualifies for. Honors
// the unit's own requiresTech/requiresUnit/maxCount (via queueUnit) plus AI
// reserves: the pricey space platforms wait behind spaceHqReserve, subs behind
// subReserve. Returns true if it queued something (caller should yield the tick).
function aiBuildUnlocked(w, n, myUnits, cities, front) {
    if (rand(w) >= AI_TUNING.unlockedBuildChance) return false;
    for (const type of AI_UNLOCK_BUILD_ORDER) {
        const def = UNITS[type];
        if (!def) continue;
        // Only chase units this nation has actually unlocked.
        if (def.requiresTech && !n.research.done.includes(def.requiresTech)) continue;
        // maxCount / already-satisfied: don't re-queue a one-off (e.g. spacehq).
        const have = myUnits.filter((u) => u.type === type).length + prodCount(n, "unit", type);
        if (def.maxCount && have >= def.maxCount) continue;
        if (unitLockReason(w, n.slot, type)) continue; // prereq (spacehq) not up yet
        // Reserve cushion: space platforms are the most expensive commitments.
        const isSpace = def.requiresUnit === "spacehq" || type === "spacehq";
        const isSub = type === "sub-ssn" || type === "sub-ssbn";
        const reserve = isSpace ? AI_TUNING.spaceHqReserve : isSub ? AI_TUNING.subReserve : 0;
        const cost = Math.round(def.cost * (n.buildCostMult ?? 1));
        if (n.points < cost + reserve) continue;
        // aiPlace sites by role — sea hulls to coastal water, modern defenses over
        // cities, space/command to the safe interior — and spreads same-role apart.
        const p = aiPlace(w, n, type, myUnits, cities, front);
        if (!p) continue;
        if (queueUnit(w, n.slot, type, p.lng, p.lat, true).ok) return true;
    }
    return false;
}

// Static capital position per slot, cached on the world. Capitals never move, so
// this is built once (the flagged capital city, else the nation's first city) and
// reused by diplomacy (rival reachability) and the aiTick level-of-detail check.
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

// Living-city count per slot right now — one pass, reused across a diplomacy round.
function aliveCityCounts(w) {
    const m = new Map();
    for (const c of w.cities) if (c.alive) m.set(c.slot, (m.get(c.slot) || 0) + 1);
    return m;
}

// How many wars a nation is currently fighting.
function warCount(n) {
    let k = 0;
    for (const s in n.relations) if (n.relations[s] === "war") k++;
    return k;
}

// How many alliances a nation currently holds.
function allyCount(n) {
    let k = 0;
    for (const s in n.relations) if (n.relations[s] === "ally") k++;
    return k;
}

// Does n share a live enemy with m (someone both are at war with)?
function sharesEnemy(n, m) {
    for (const s in n.relations) if (n.relations[s] === "war" && m.relations[s] === "war") return true;
    return false;
}

// True when a nation is "hot" — at war, or its capital sits within activeRangeKm of
// the player's. Hot nations run aiTick at full cadence; the rest idle-throttle.
function nearPlayer(w, n, caps) {
    const a = caps[n.slot], p = caps[w.mySlot];
    if (!a || !p) return false;
    return haversine(a.lng, a.lat, p.lng, p.lat) <= DIPLOMACY.activeRangeKm;
}

// AI diplomacy — the living world. On each nation's staggered _diplo cadence it may
// sue for peace (losing badly, or a random ceasefire once a war is old enough) and
// may open a fresh war on a reachable rival, weighted toward wealthy/weak targets.
// Every roll uses the seeded rand(w), so the whole diplomatic history is
// reproducible from (seed, playerIso). Cheap timers run every tick; the O(N) rival
// scan only fires on the few nations whose cadence elapses this tick.
export function diploTick(w, dt) {
    let firing = null;
    for (const n of w.nations) {
        if (!n.isAi || !n.alive || n.active === false) continue;   // neutrals never run diplomacy
        if (n._diplo == null) n._diplo = DIPLOMACY.thinkMin + rand(w) * DIPLOMACY.thinkSpan;
        n._diplo -= dt;
        if (n._diplo > 0) continue;
        n._diplo = DIPLOMACY.thinkMin + rand(w) * DIPLOMACY.thinkSpan;
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

// An AI courts a mutual-defense pact. Below its ally ceiling it may (allyProposeChance)
// propose to a reachable power it's at peace with, weighted toward one that shares a
// current enemy (a bloc against a common foe), then toward wealth. proposeAlliance
// resolves an AI↔AI proposal at once and routes an AI→player proposal to a popup.
function diploProposeAlliance(w, n, caps) {
    if (allyCount(n) >= DIPLOMACY.maxAllies) return;
    if (rand(w) >= DIPLOMACY.allyProposeChance) return;
    const capA = caps[n.slot];
    if (!capA) return;
    const cand = [];
    let total = 0;
    for (const m of w.nations) {
        if (m.slot === n.slot || !m.alive || m.active === false) continue;   // can't ally a neutral
        const rel = n.relations[m.slot];
        if (rel === "war" || rel === "ally") continue;
        // Respect the player's opening grace window, same as war declarations.
        if (!m.isAi && w.time < DIPLOMACY.playerGraceSec) continue;
        const capB = caps[m.slot];
        if (!capB || haversine(capA.lng, capA.lat, capB.lng, capB.lat) > DIPLOMACY.allyRangeKm) continue;
        const weight = (1 + (sharesEnemy(n, m) ? DIPLOMACY.allySharedEnemyW : 0)) * Math.max(0.2, m.gdp || 0.1);
        cand.push([m.slot, weight]);
        total += weight;
    }
    if (!cand.length || total <= 0) return;
    let r = rand(w) * total;
    for (const [slot, weight] of cand) {
        r -= weight;
        if (r <= 0) return void proposeAlliance(w, n.slot, slot);
    }
    proposeAlliance(w, n.slot, cand[cand.length - 1][0]);
}

// An AI's negotiated exit: once a war is older than minWarSec it may offer white peace
// (peaceOfferChance) to a foe. Surrender/Defeat when a nation is collapsing is handled
// separately and continuously by warTick — this is only the no-loss, mutual ceasefire.
// offerPeace resolves an AI↔AI offer at once and routes an AI→player offer to a popup.
function diploOfferPeace(w, n) {
    for (const s in n.relations) {
        if (n.relations[s] !== "war") continue;
        const foe = +s;
        const age = w.time - (n._warStart?.[foe] ?? 0);
        if (age > DIPLOMACY.minWarSec && rand(w) < DIPLOMACY.peaceOfferChance) offerPeace(w, n.slot, foe);
    }
}

function diploDeclareWar(w, n, caps, alive) {
    if (warCount(n) >= DIPLOMACY.maxWars) return;
    if (rand(w) >= DIPLOMACY.declareChance) return;
    const capA = caps[n.slot];
    if (!capA) return;
    const gdpA = Math.max(0.1, n.gdp || 0.1), cA = Math.max(1, alive.get(n.slot) || 0);
    const rivals = [];
    let total = 0;
    for (const m of w.nations) {
        if (m.slot === n.slot || !m.alive || m.active === false) continue;   // neutrals are captured, not warred
        // Never open a war on an ally or a nation already being fought.
        if (n.relations[m.slot] === "war" || n.relations[m.slot] === "ally") continue;
        // The player gets an opening grace window before any AI may declare on them.
        if (!m.isAi && w.time < DIPLOMACY.playerGraceSec) continue;
        const capB = caps[m.slot];
        if (!capB || haversine(capA.lng, capA.lat, capB.lng, capB.lat) > DIPLOMACY.warRangeKm) continue;
        const gdpB = Math.max(0.1, m.gdp || 0.1), cB = Math.max(1, alive.get(m.slot) || 0);
        let weight = Math.pow(gdpB / gdpA, DIPLOMACY.wGdp) * Math.pow(cA / cB, DIPLOMACY.wWeak);
        weight = Math.min(DIPLOMACY.wMax, Math.max(DIPLOMACY.wMin, weight));
        rivals.push([m.slot, weight]);
        total += weight;
    }
    if (!rivals.length || total <= 0) return;
    let r = rand(w) * total;
    for (const [slot, weight] of rivals) {
        r -= weight;
        if (r <= 0) return void declareWar(w, n.slot, slot);
    }
    declareWar(w, n.slot, rivals[rivals.length - 1][0]);
}

export function aiTick(w, dt) {
    // Index living units by nation once per tick so each AI scans only its own
    // forces (O(own units)), not the whole world's — the roster is now ~222 nations.
    const unitsBySlot = new Map();
    for (const u of w.units) {
        if (u.hp <= 0) continue;
        let arr = unitsBySlot.get(u.slot);
        if (!arr) unitsBySlot.set(u.slot, arr = []);
        arr.push(u);
    }
    const caps = capPositions(w);
    for (const n of w.nations) {
        if (!n.isAi || !n.alive || n.active === false) continue;   // neutrals never build or attack
        n._ai -= dt;
        if (n._ai > 0) continue;
        // Level-of-detail: hot nations (at war, or with a capital near the player's)
        // think at the normal cadence; the rest idle-throttle, so heavy AI work
        // tracks the action on the map rather than the size of the roster.
        const active = warCount(n) > 0 || nearPlayer(w, n, caps);
        n._ai = active
            ? AI_TUNING.thinkMin + rand(w) * AI_TUNING.thinkSpan
            : DIPLOMACY.idleThinkMin + rand(w) * DIPLOMACY.idleThinkSpan;
        ensureProd(n);
        const myUnits = unitsBySlot.get(n.slot) || [];
        const enemies = w.nations.filter((e) => e.alive && atWar(w, n.slot, e.slot));
        // A launcher stuck on an empty magazine falls back to Standard — but only if
        // the platform is cleared to carry it (the strategic-only SSBN is not, so it
        // holds its selected round and waits for strategic stock instead).
        for (const u of myUnits) {
            if (UNITS[u.type].kind !== "offense") continue;
            const wh = u.warhead || initialWarhead(u.type);
            if (!(n.ammo[wh] > 0) && allowedAmmo(u.type).includes("standard") && (n.ammo.standard || 0) > 0) u.warhead = "standard";
        }
        // Point an idle MISSILE platform (not a ground unit) at the best available
        // at-war enemy target each think (neutrals are never targeted).
        const cap = caps[n.slot];
        const idleOff = myUnits.find((u) => !u.targetId && UNITS[u.type].kind === "offense" && UNITS[u.type].targets !== "land");
        if (idleOff) {
            const tgt = pickTarget(w, n, cap);
            if (tgt) {
                // Arm the platform with its signature round when one is stocked — a
                // silo/sub/orbital reaches for the thermo city-killer, a hypersonic
                // launcher/battery for the HGV. Warheads come only off the shelf and
                // only onto a platform cleared to carry them.
                const sig = UNITS[idleOff.type].signature;
                const sigChance = sig === "hgv" ? AI_TUNING.hgvChance : sig === "sicbm" ? AI_TUNING.sicbmChance : AI_TUNING.thermoChance;
                if (sig && allowedAmmo(idleOff.type).includes(sig) && (n.ammo[sig] || 0) > 0 && rand(w) < sigChance) idleOff.warhead = sig;
                commandAttack(w, idleOff.id, tgt.id);
            }
        }
        // Ground forces press the war: send each idle capture-capable battalion to
        // march on and assault the nearest at-war enemy city it can take (never neutrals).
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
        // Bring air power online: stand up fighter patrols + an AWACS orbit on idle
        // airbases once a war is on — the wings then screen the sector and engage on
        // their own (the AI built these but never flew them before).
        if (enemies.length) {
            for (const u of myUnits) {
                if (u.hp <= 0 || !UNITS[u.type].wing) continue;
                if (!u.patrolSize) setPatrolSize(w, n.slot, u.id, AI_TUNING.patrolSize);
                if (!u.awacsPatrol) setAwacsPatrol(w, n.slot, u.id, true);
            }
        }
        const myCap = w.cities.find((c) => c.slot === n.slot && c.alive);
        if (!myCap) continue;
        // Fielding cap — a nation at its unit ceiling stops adding units, keeping the
        // global unit count (and the interception loop with it) bounded no matter how
        // many nations are simultaneously at war.
        if (myUnits.length >= DIPLOMACY.aiUnitCap) continue;
        const net = netIncomeOf(w, n.slot);
        const lineBusy = (n.prod.current ? 1 : 0) + n.prod.queue.length;
        if (lineBusy >= AI_TUNING.queueMax) continue; // keep the line short — the AI plans, it doesn't hoard
        // Strategic siting context, shared by every build this think: the nation's
        // cities (value-sorted), the front it faces, and a role-aware placer.
        const cities = aiCities(w, n.slot);
        const front = frontPos(w, n, caps);
        // aiPlace validates the spot against the nation's own political border
        // (land) or coastal waters (sea) before returning it, so every queueUnit
        // below passes territoryOk:true — territory is checked once, in the placer,
        // exactly as the human path does (LiveGame gates on GID_0, then buyPlace(…,
        // true)). This avoids queueUnit re-applying the looser Voronoi inTerritory
        // rule and silently starving valid in-country builds near a frontier.
        const place = (type) => aiPlace(w, n, type, myUnits, cities, front);
        // In the red, everything else waits — industry is the only way back out
        // (the same deficit gate the player lives under, enforced in queueUnit).
        if (net < 0) {
            if (n.points >= UNITS.factory.cost) {
                const p = place("factory");
                if (p && queueUnit(w, n.slot, "factory", p.lng, p.lat, true).ok) return;
            }
            continue;
        }
        // Build doctrine, in priority order. Every placement goes through aiPlace,
        // which sites by role (defense over cities, sensors/offense toward the front,
        // industry/command in the interior) and spreads same-role units apart.
        const defenders = myUnits.filter((u) => UNITS[u.type].kind === "defense").length
            + prodCount(n, "unit", "dome") + prodCount(n, "unit", "battery");
        const protectN = protectPoints(w, n.slot, myUnits).length;
        const defenseTarget = Math.min(AI_TUNING.defenseMax, Math.max(1, Math.round(protectN * AI_TUNING.defensePerPoint)));

        // 1. Cover the capital first — never leave the heart of the nation open.
        if (defenders === 0 && n.points >= UNITS.dome.cost) {
            const p = place("dome");
            if (p && queueUnit(w, n.slot, "dome", p.lng, p.lat, true).ok) return;
        }
        // 2. Warheads — fed through the same line, same cost/time as the player.
        const hasOffense = myUnits.some((u) => UNITS[u.type].kind === "offense") || prodCount(n, "unit", "silo") > 0 || prodCount(n, "unit", "launcher") > 0;
        const stocked = (t) => (n.ammo[t] || 0) + prodCount(n, "ammo", t);
        if (hasOffense && stocked("standard") < AI_TUNING.stdStockTarget && n.points >= WARHEADS.standard.prodCost + AI_TUNING.stdReserve) {
            if (queueAmmo(w, n.slot, "standard").ok) return;
        }
        if (hasOffense && enemies.length && stocked("thermo") < AI_TUNING.thermoStockTarget && n.points >= WARHEADS.thermo.prodCost + AI_TUNING.thermoReserve && rand(w) < AI_TUNING.thermoChance) {
            if (queueAmmo(w, n.slot, "thermo").ok) return;
        }
        // Hypersonic rounds — only worth stocking if the nation fields a platform
        // cleared to carry them (a launcher or battery), so glide-vehicle stock never
        // piles up unused on a nation that only builds silos.
        const hasHyper = myUnits.some((u) => u.hp > 0 && allowedAmmo(u.type).includes("hgv"));
        if (hasHyper && enemies.length && stocked("hgv") < AI_TUNING.hgvStockTarget && n.points >= WARHEADS.hgv.prodCost + AI_TUNING.hgvReserve && rand(w) < AI_TUNING.hgvChance) {
            if (queueAmmo(w, n.slot, "hgv").ok) return;
        }
        // SICBM rounds — only worth stocking if the nation fields a TEL (the sole
        // platform cleared to carry them).
        const hasTel = myUnits.some((u) => u.hp > 0 && allowedAmmo(u.type).includes("sicbm"));
        if (hasTel && enemies.length && stocked("sicbm") < AI_TUNING.sicbmStockTarget && n.points >= WARHEADS.sicbm.prodCost + AI_TUNING.sicbmReserve && rand(w) < AI_TUNING.sicbmChance) {
            if (queueAmmo(w, n.slot, "sicbm").ok) return;
        }
        // 3. Early-warning radar — spread across the frontier for coverage.
        const radars = myUnits.filter((u) => u.type === "radar").length + prodCount(n, "unit", "radar");
        const radarTarget = Math.min(AI_TUNING.radarMax, Math.max(1, Math.round(cities.length * AI_TUNING.radarPerCity)));
        if (defenders > 0 && radars < radarTarget && n.points >= UNITS.radar.cost + AI_TUNING.radarReserve) {
            const p = place("radar");
            if (p && queueUnit(w, n.slot, "radar", p.lng, p.lat, true).ok) return;
        }
        // 4. Industry — build the economy early (safe interior, factories spread) so
        // the nation can actually afford the rest of its doctrine.
        const industry = myUnits.filter((u) => UNITS[u.type].kind === "industry").length + prodCount(n, "unit", "factory");
        if (defenders > 0 && industry < AI_TUNING.industryTarget && n.points >= UNITS.factory.cost + AI_TUNING.factoryReserve) {
            const p = place("factory");
            if (p && queueUnit(w, n.slot, "factory", p.lng, p.lat, true).ok) return;
        }
        // 5. Leadership bunker — one hardened command node, deep in the interior. A
        // solvent nation (positive net income) banks toward it before lesser builds
        // so command actually gets stood up; a nation with no spare income skips it
        // and keeps developing — no freeze. It becomes a protect-point, so the
        // defense-expansion below shields it too.
        const hasBunker = myUnits.some((u) => u.type === "bunker") || prodCount(n, "unit", "bunker") > 0;
        const wantBunker = !hasBunker && cities.length >= AI_TUNING.bunkerMinCities && defenders > 0;
        if (wantBunker) {
            if (n.points >= UNITS.bunker.cost + AI_TUNING.bunkerReserve) {
                const p = place("bunker");
                if (p && queueUnit(w, n.slot, "bunker", p.lng, p.lat, true).ok) return;
            } else if (net > 0) {
                continue; // income positive — bank toward the bunker before lesser builds
            }
        }
        // 5b. Leadership airfield — at least one airstrip to fly the evacuation. A
        // bunker with no strip is a dead end: leaders can never be airlifted to it,
        // so a nation that has stood up (or queued) a bunker builds a supporting
        // strip next, banking toward it the same way it banks toward the bunker.
        const hasStrip = myUnits.some((u) => u.type === "airstrip") || prodCount(n, "unit", "airstrip") > 0;
        if (hasBunker && !hasStrip && defenders > 0) {
            if (n.points >= UNITS.airstrip.cost + AI_TUNING.bunkerReserve) {
                const p = place("airstrip");
                if (p && queueUnit(w, n.slot, "airstrip", p.lng, p.lat, true).ok) return;
            } else if (net > 0) {
                continue; // bank toward the evac airfield before lesser builds
            }
        }
        // 6. Extend the shield — more air defense out to the target, each dome aimed
        // (via aiPlace) at the most valuable point not yet inside a friendly envelope.
        if (defenders < defenseTarget && n.points >= UNITS.dome.cost) {
            const p = place("dome");
            if (p && queueUnit(w, n.slot, "dome", p.lng, p.lat, true).ok) return;
        }
        // 6b. Ground army — stand up an army base, then a small mobile force. These are
        // the engine of expansion: idle battalions march on and hold nearby enemy and
        // neutral cities (see the ground-order assignment above).
        const hasArmybase = myUnits.some((u) => u.type === "armybase") || prodCount(n, "unit", "armybase") > 0;
        if (defenders > 0 && !hasArmybase && n.points >= UNITS.armybase.cost + AI_TUNING.armyReserve) {
            const p = place("armybase");
            if (p && queueUnit(w, n.slot, "armybase", p.lng, p.lat, true).ok) return;
        }
        const groundForce = myUnits.filter((u) => UNITS[u.type].capture).length + prodCount(n, "unit", "infantry") + prodCount(n, "unit", "tank");
        if (hasArmybase && groundForce < AI_TUNING.groundTarget && n.points >= UNITS.tank.cost + AI_TUNING.armyReserve) {
            const type = rand(w) < 0.5 ? "tank" : "infantry";
            const p = place(type);
            if (p && queueUnit(w, n.slot, type, p.lng, p.lat, true).ok) return;
        }
        // 7. One over-the-horizon array for strategic warning (safe interior).
        const oths = myUnits.filter((u) => u.type === "oth").length + prodCount(n, "unit", "oth");
        if (radars > 0 && oths === 0 && n.points >= UNITS.oth.cost + AI_TUNING.othReserve) {
            const p = place("oth");
            if (p && queueUnit(w, n.slot, "oth", p.lng, p.lat, true).ok) return;
        }
        // 8. Advanced units (space HQ, subs, modern defenses…), by role. All techs
        //    are unlocked at start, so these are gated only by unit prereqs + cost.
        if (aiBuildUnlocked(w, n, myUnits, cities, front)) return;
        // 9. Offense — forward toward the front, once at war.
        if (!enemies.length) continue;
        if (n.points >= UNITS.silo.cost + AI_TUNING.siloReserve && net > AI_TUNING.siloMinNet) {
            const p = place("silo");
            if (p) queueUnit(w, n.slot, "silo", p.lng, p.lat, true);
        }
    }
}
