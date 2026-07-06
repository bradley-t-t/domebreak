// The main simulation step: research/production progress, unit movement and
// firing, projectile flight and interception, sensor sweeps, and the simple
// opponent AI. This is the tick engine's single entry point (step()).
import {
    AI_TUNING,
    AIRSTRIP_RUNWAY,
    DEFAULT_BUILD_TIME,
    DEFAULT_HIT_PROB,
    DEFAULT_RELOAD,
    DIPLOMACY,
    FALLOUT,
    HANGAR_SPEC,
    INTERCEPT_CAP,
    INTERCEPT_KILL_RADIUS_KM,
    INTERCEPTOR_SPEED,
    MIRV_SPLIT_AT,
    MISSILE_SPEED,
    TECHS,
    UNITS,
    WARHEADS,
} from "../data/constants.js";
import {haversine} from "../geo/geo.js";
import {nationOf, nextId, rand} from "./worldState.js";
import {
    airborne,
    atWar,
    defenseRange,
    defenseMinRange,
    falloutIntensity,
    falloutProximity,
    inTerritory,
    netIncomeOf,
    placementBlocked,
    sensorsCover,
    sensorsOf
} from "./queries.js";
import {findTarget, launch, leadInterceptPoint, mirvSplit, resolveHit, trackPoint} from "./combat.js";
import {ensureHangar, flyAircraft, polarFrom, runAirbase, steamShip} from "./aircraft.js";
import {canQueue, commandAttack, declareWar, enqueueResearch, ensureProd, makePeace, prodCount, queueAmmo, queueUnit, unitLockReason} from "./production.js";
import {replenishmentBuff} from "./queries.js";
import {evacTick, reconcileLeadership, updateCommand} from "./leadership.js";
import {LEADERSHIP} from "../data/constants.js";
import {isSea} from "../geo/seaRoute.js";

// Reload multiplier a hull gets while inside a friendly Replenishment Ship's
// resupplyKm (underway replenishment cuts turnaround). Local tuning knob —
// belongs in data/constants.js once Phase 1's data contract is open to edits.
const REPLENISH_RELOAD_MULT = 0.7;

// Delivers one finished production-line item into the world: a replacement
// aircraft goes straight into its ordering base's hangar stock; a new unit
// gets placed near its reserved spot (nudged if it's since been taken, or
// refunded if nothing nearby fits).
function spawnQueuedUnit(w, n, it) {
    const def = UNITS[it.type];
    // Replacement aircraft: delivered straight into the ordering base's hangar
    // (housed, ready to launch). Refund if the base was lost while it was built.
    if (it.forBase) {
        const base = w.units.find((b) => b.id === it.forBase && b.hp > 0 && b.slot === n.slot);
        if (!base) {
            n.points += it.paid;
            return;
        }
        ensureHangar(w, base);
        base.hangar[it.type] = (base.hangar[it.type] || 0) + 1;
        return;
    }
    // The reserved spot may have been taken while the unit was on the line — nudge
    // around it, and refund if nowhere nearby fits.
    let spot = null;
    for (let k = 0; k < 9 && !spot; k++) {
        const lng = it.lng + (k ? Math.cos(k) * 0.5 * k * 0.35 : 0),
            lat = it.lat + (k ? Math.sin(k) * 0.5 * k * 0.35 : 0);
        if (!placementBlocked(w, lng, lat, null)) spot = {lng, lat};
    }
    if (!spot) {
        n.points += it.paid;
        return;
    }
    const base = {
        id: nextId(w, "u"),
        slot: n.slot,
        type: it.type,
        lng: spot.lng,
        lat: spot.lat,
        hp: def.hp,
        cooldown: 0,
        targetId: null,
        warhead: def.kind === "offense" ? "standard" : null
    };
    if (def.wing) {
        base.hangar = {...HANGAR_SPEC[it.type]};   // full complement in stock
        base.patrolSize = 0;                        // patrols launch on command
        base.awacsPatrol = false;
        base.op = null;
        base.runwayA = it.type === "carrier" ? Math.PI / 2 : AIRSTRIP_RUNWAY;
        if (it.type !== "carrier") base.face = polarFrom(base, 150, base.runwayA); // canted runway icon
    }
    w.units.push(base);
}

// Weighted-by-population target pick (prefers populous enemy cities; skips pop-0 when possible).
function pickTarget(w, enemies) {
    const en = new Set(enemies.map((e) => e.slot));
    let pool = w.cities.filter((c) => c.alive && en.has(c.slot) && (c.pop || 0) > 0);
    if (!pool.length) pool = w.cities.filter((c) => c.alive && en.has(c.slot));
    if (!pool.length) return null;
    const total = pool.reduce((s, c) => s + (c.pop || 1), 0);
    let r = rand(w) * total;
    for (const c of pool) {
        r -= (c.pop || 1);
        if (r <= 0) return c;
    }
    return pool[pool.length - 1];
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
        if (queueUnit(w, n.slot, type, p.lng, p.lat).ok) return true;
    }
    return false;
}

// Coastal-water spot near the capital for naval builds — probes outward until it
// finds sea that isn't blocked. Falls back to null (skip the build) if the
// capital is landlocked within reach.
function aiSeaSpot(w, slot, city) {
    for (let k = 0; k < 24; k++) {
        const r = 1.5 + rand(w) * 6;
        const a = rand(w) * Math.PI * 2;
        const lng = city.lng + Math.cos(a) * r, lat = city.lat + Math.sin(a) * r;
        if (isSea(lng, lat) && inTerritory(w, slot, lng, lat) && !placementBlocked(w, lng, lat, null)) return {lng, lat};
    }
    return null;
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

// Total cities a slot started with (baseline for the sue-for-peace loss ratio).
// Static — every city is alive at setup — so it's computed once and cached.
function startCityCounts(w) {
    if (w._startCities) return w._startCities;
    const m = {};
    for (const c of w.cities) m[c.slot] = (m[c.slot] || 0) + 1;
    w._startCities = m;
    return m;
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

// True when a nation is "hot" — at war, or its capital sits within activeRangeKm of
// the player's. Hot nations run aiTick at full cadence; the rest idle-throttle.
function nearPlayer(w, n, caps) {
    const a = caps[n.slot], p = caps[w.mySlot];
    if (!a || !p) return false;
    return haversine(a.lng, a.lat, p.lng, p.lat) <= DIPLOMACY.activeRangeKm;
}

// Deeper research: push tracks toward researchDepthTarget. Modern/Space tiers
// (>= deepTierGate) cost far more, so they demand the deeper points cushion before
// the AI commits. Returns true if it enqueued something (caller yields the tick).
function aiResearch(w, n) {
    if (n.research.current || n.research.queue.length) return false;
    const avail = Object.keys(TECHS).filter((t) => canQueue(n, t) && TECHS[t].tier <= AI_TUNING.researchDepthTarget);
    const affordable = avail.filter((t) => {
        const reserve = TECHS[t].tier >= AI_TUNING.deepTierGate ? AI_TUNING.deepReserve : AI_TUNING.researchMinPoints;
        return n.points >= TECHS[t].cost + reserve;
    });
    if (affordable.length && rand(w) < AI_TUNING.researchChance) {
        enqueueResearch(w, n.slot, affordable[Math.floor(rand(w) * affordable.length)]);
        return true;
    }
    return false;
}

// AI diplomacy — the living world. On each nation's staggered _diplo cadence it may
// sue for peace (losing badly, or a random ceasefire once a war is old enough) and
// may open a fresh war on a reachable rival, weighted toward wealthy/weak targets.
// Every roll uses the seeded rand(w), so the whole diplomatic history is
// reproducible from (seed, playerIso). Cheap timers run every tick; the O(N) rival
// scan only fires on the few nations whose cadence elapses this tick.
function diploTick(w, dt) {
    let firing = null;
    for (const n of w.nations) {
        if (!n.isAi || !n.alive) continue;
        if (n._diplo == null) n._diplo = DIPLOMACY.thinkMin + rand(w) * DIPLOMACY.thinkSpan;
        n._diplo -= dt;
        if (n._diplo > 0) continue;
        n._diplo = DIPLOMACY.thinkMin + rand(w) * DIPLOMACY.thinkSpan;
        (firing || (firing = [])).push(n);
    }
    if (!firing) return;
    const caps = capPositions(w);
    const alive = aliveCityCounts(w);
    const start = startCityCounts(w);
    for (const n of firing) {
        diploMakePeace(w, n, alive, start);
        diploDeclareWar(w, n, caps, alive);
    }
}

function diploMakePeace(w, n, alive, start) {
    const frac = (alive.get(n.slot) || 0) / (start[n.slot] || 1);
    const losing = frac < DIPLOMACY.peaceLossThreshold;
    for (const s in n.relations) {
        if (n.relations[s] !== "war") continue;
        const foe = +s;
        const age = w.time - (n._warStart?.[foe] ?? 0);
        if (losing || (age > DIPLOMACY.minWarSec && rand(w) < DIPLOMACY.peaceChance)) makePeace(w, n.slot, foe);
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
        if (m.slot === n.slot || !m.alive || n.relations[m.slot] === "war") continue;
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

// --- Strategic placement (design/quick-specs/ai-strategic-placement-2026-07-06.md)
// The AI sites each unit by role and spreads its forces across its cities rather
// than piling everything onto the capital. All sampling uses the seeded rand(w).

// Capital + population weighting used to rank anchor / protect targets.
function cityValue(c) {
    return (c.pop || 0) * (c.cap ? 1.5 : 1) + (c.cap ? 5e6 : 0);
}

// A nation's alive cities, most valuable first.
function aiCities(w, slot) {
    const out = [];
    for (const c of w.cities) if (c.slot === slot && c.alive) out.push(c);
    out.sort((a, b) => cityValue(b) - cityValue(a));
    return out;
}

// High-value points a nation wants shielded: its cities plus its command assets
// (leadership bunker, space HQ), which sit away from cities but must not be left
// exposed. Value-sorted so callers take the most valuable uncovered one first.
function protectPoints(w, slot, myUnits) {
    const pts = [];
    for (const c of w.cities) if (c.slot === slot && c.alive) pts.push({lng: c.lng, lat: c.lat, val: cityValue(c)});
    for (const u of myUnits) if (u.type === "bunker" || u.type === "spacehq") pts.push({lng: u.lng, lat: u.lat, val: 8e6});
    pts.sort((a, b) => b.val - a.val);
    return pts;
}

// Is a point already inside a friendly defense's engagement envelope?
function defenseCovers(w, myUnits, lng, lat) {
    for (const u of myUnits) {
        if (UNITS[u.type].kind !== "defense") continue;
        if (haversine(u.lng, u.lat, lng, lat) <= defenseRange(w, u)) return true;
    }
    return false;
}

// The "front" a nation orients to: the nearest at-war enemy capital, or (in peace)
// the nearest neighbour's capital so outward-facing builds still make sense. Enemy
// capitals weigh closer so an active war wins the tie. null only if truly alone.
function frontPos(w, n, caps) {
    const a = caps[n.slot];
    if (!a) return null;
    let best = null, bd = Infinity;
    for (const m of w.nations) {
        if (m.slot === n.slot || !m.alive) continue;
        const b = caps[m.slot];
        if (!b) continue;
        const d = haversine(a.lng, a.lat, b.lng, b.lat) * (n.relations[m.slot] === "war" ? 0.5 : 1);
        if (d < bd) { bd = d; best = b; }
    }
    return best;
}

function farthestCity(cities, ref) {
    if (!ref) return cities[0];
    let best = cities[0], bd = -Infinity;
    for (const c of cities) { const d = haversine(c.lng, c.lat, ref.lng, ref.lat); if (d > bd) { bd = d; best = c; } }
    return best;
}

function nearestCity(cities, ref) {
    if (!ref) return cities[0];
    let best = cities[0], bd = Infinity;
    for (const c of cities) { const d = haversine(c.lng, c.lat, ref.lng, ref.lat); if (d < bd) { bd = d; best = c; } }
    return best;
}

function aiRole(def) {
    if (def.kind === "defense") return "defense";
    if (def.kind === "industry") return "industry";
    if (def.kind === "offense") return "offense";
    if (def.detect) return "sensor";
    return "other";
}

// Would a spot crowd a live same-role unit inside spreadKm? Stops the AI stacking
// two radars / two factories / two domes on the same ground.
function crowdsSameRole(role, myUnits, lng, lat) {
    for (const u of myUnits) {
        if (aiRole(UNITS[u.type]) !== role) continue;
        if (haversine(u.lng, u.lat, lng, lat) < AI_TUNING.spreadKm) return true;
    }
    return false;
}

// Sample a valid build spot around an anchor city — biased toward the front (sensors,
// forward offense) or away into the interior (industry, command), and spread from
// same-role units. Falls back to any valid nearby spot so a build is never dropped.
function spotAround(w, slot, anchor, front, role, toward, away, myUnits) {
    const cosLat = Math.max(0.2, Math.cos((anchor.lat * Math.PI) / 180));
    let brng = null;
    if (front && (toward || away)) {
        brng = Math.atan2(front.lng - anchor.lng, front.lat - anchor.lat) + (away ? Math.PI : 0);
    }
    for (let ring = 0; ring < 5; ring++) {
        const rDeg = 0.55 + ring * 0.5;
        for (let k = 0; k < 6; k++) {
            const ang = brng != null ? brng + (rand(w) - 0.5) * 1.6 : rand(w) * Math.PI * 2;
            const lat = anchor.lat + Math.cos(ang) * rDeg;
            const lng = anchor.lng + (Math.sin(ang) * rDeg) / cosLat;
            if (!inTerritory(w, slot, lng, lat)) continue;
            if (placementBlocked(w, lng, lat, null)) continue;
            if (crowdsSameRole(role, myUnits, lng, lat)) continue;
            return {lng, lat};
        }
    }
    // Spread constraint too tight for the room available — take any valid spot.
    for (let k = 0; k < 12; k++) {
        const lng = anchor.lng + (rand(w) - 0.5) * 2.2, lat = anchor.lat + (rand(w) - 0.5) * 2.2;
        if (inTerritory(w, slot, lng, lat) && !placementBlocked(w, lng, lat, null)) return {lng, lat};
    }
    return null;
}

// Site a unit by role: defense over the most valuable uncovered protect-point,
// sensors/forward-offense toward the front, industry/command in the safe interior.
function aiPlace(w, n, type, myUnits, cities, front) {
    const def = UNITS[type];
    if (!cities.length) return null;
    const role = aiRole(def);
    const forward = role === "sensor" || (role === "offense" && def.range < 12000);
    let anchor;
    if (role === "defense") {
        const pts = protectPoints(w, n.slot, myUnits);
        anchor = pts.find((p) => !defenseCovers(w, myUnits, p.lng, p.lat)) || pts[0] || cities[0];
    } else if (forward) {
        anchor = nearestCity(cities, front);   // frontier — face the threat
    } else if (role === "industry" || def.maxCount) {
        anchor = farthestCity(cities, front);  // safe interior (also bunker / space HQ)
    } else {
        anchor = cities[0];
    }
    if (!anchor) return null;
    if (def.domain === "sea") return aiSeaSpot(w, n.slot, anchor);
    const away = role === "industry" || type === "bunker" || type === "spacehq";
    return spotAround(w, n.slot, anchor, front, role, forward, away, myUnits);
}

function aiTick(w, dt) {
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
        if (!n.isAi || !n.alive) continue;
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
        // A launcher stuck on an empty magazine falls back to whatever's stocked.
        for (const u of myUnits) {
            if (UNITS[u.type].kind !== "offense") continue;
            const wh = u.warhead || "standard";
            if (!(n.ammo[wh] > 0) && (n.ammo.standard || 0) > 0) u.warhead = "standard";
        }
        // Units come off the production line idle — point one at a target per tick.
        if (enemies.length) {
            const idle = myUnits.find((u) => !u.targetId && UNITS[u.type].kind === "offense");
            if (idle) {
                const tgt = pickTarget(w, enemies);
                if (tgt) {
                    // City-killers only come off the shelf — no conjured warheads.
                    if ((n.ammo.thermo || 0) > 0 && rand(w) < AI_TUNING.thermoChance) idle.warhead = "thermo";
                    commandAttack(w, idle.id, tgt.id);
                }
            }
        }
        const myCap = w.cities.find((c) => c.slot === n.slot && c.alive);
        if (!myCap) continue;
        // Fielding cap — a nation at its unit ceiling stops adding units and only
        // researches further, keeping the global unit count (and the interception
        // loop with it) bounded no matter how many nations are simultaneously at war.
        if (myUnits.length >= DIPLOMACY.aiUnitCap) {
            aiResearch(w, n);
            continue;
        }
        const net = netIncomeOf(w, n.slot);
        const lineBusy = (n.prod.current ? 1 : 0) + n.prod.queue.length;
        if (lineBusy >= AI_TUNING.queueMax) continue; // keep the line short — the AI plans, it doesn't hoard
        // Strategic siting context, shared by every build this think: the nation's
        // cities (value-sorted), the front it faces, and a role-aware placer.
        const cities = aiCities(w, n.slot);
        const front = frontPos(w, n, caps);
        const place = (type) => aiPlace(w, n, type, myUnits, cities, front);
        // In the red, everything else waits — industry is the only way back out
        // (the same deficit gate the player lives under, enforced in queueUnit).
        if (net < 0) {
            if (n.points >= UNITS.factory.cost) {
                const p = place("factory");
                if (p && queueUnit(w, n.slot, "factory", p.lng, p.lat).ok) return;
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
            if (p && queueUnit(w, n.slot, "dome", p.lng, p.lat).ok) return;
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
        // 3. Early-warning radar — spread across the frontier for coverage.
        const radars = myUnits.filter((u) => u.type === "radar").length + prodCount(n, "unit", "radar");
        const radarTarget = Math.min(AI_TUNING.radarMax, Math.max(1, Math.round(cities.length * AI_TUNING.radarPerCity)));
        if (defenders > 0 && radars < radarTarget && n.points >= UNITS.radar.cost + AI_TUNING.radarReserve) {
            const p = place("radar");
            if (p && queueUnit(w, n.slot, "radar", p.lng, p.lat).ok) return;
        }
        // 4. Industry — build the economy early (safe interior, factories spread) so
        // the nation can actually afford the rest of its doctrine.
        const industry = myUnits.filter((u) => UNITS[u.type].kind === "industry").length + prodCount(n, "unit", "factory");
        if (defenders > 0 && industry < AI_TUNING.industryTarget && n.points >= UNITS.factory.cost + AI_TUNING.factoryReserve) {
            const p = place("factory");
            if (p && queueUnit(w, n.slot, "factory", p.lng, p.lat).ok) return;
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
                if (p && queueUnit(w, n.slot, "bunker", p.lng, p.lat).ok) return;
            } else if (net > 0) {
                continue; // income positive — bank toward the bunker before lesser builds
            }
        }
        // 6. Extend the shield — more air defense out to the target, each dome aimed
        // (via aiPlace) at the most valuable point not yet inside a friendly envelope.
        if (defenders < defenseTarget && n.points >= UNITS.dome.cost) {
            const p = place("dome");
            if (p && queueUnit(w, n.slot, "dome", p.lng, p.lat).ok) return;
        }
        // 7. One over-the-horizon array for strategic warning (safe interior).
        const oths = myUnits.filter((u) => u.type === "oth").length + prodCount(n, "unit", "oth");
        if (radars > 0 && oths === 0 && n.points >= UNITS.oth.cost + AI_TUNING.othReserve) {
            const p = place("oth");
            if (p && queueUnit(w, n.slot, "oth", p.lng, p.lat).ok) return;
        }
        // 8. Tech-gated unlocked units (space HQ, subs, modern defenses…), by role.
        if (aiBuildUnlocked(w, n, myUnits, cities, front)) return;
        // 9. Deeper research.
        if (aiResearch(w, n)) return;
        // 10. Offense — forward toward the front, once at war.
        if (!enemies.length) continue;
        if (n.points >= UNITS.silo.cost + AI_TUNING.siloReserve && net > AI_TUNING.siloMinNet) {
            const p = place("silo");
            if (p) queueUnit(w, n.slot, "silo", p.lng, p.lat);
        }
    }
}

// Advances the world by dt seconds: research/production, unit AI and firing,
// projectile flight and interception, sensor sweeps, opponent AI, and the
// end-of-tick cleanup (dead unit/projectile pruning, win condition).
export function step(w, dt) {
    if (w.over || dt <= 0) return w;
    w.time += dt;
    // Refresh each nation's leadership command factor before the economy reads it
    // (incomeOf / research below both scale by n.commandMult).
    updateCommand(w);
    for (const n of w.nations) if (n.alive) n.points = Math.max(0, n.points + netIncomeOf(w, n.slot) * dt);

    for (const n of w.nations) {
        if (!n.alive) continue;
        const rr = n.research;
        if (!rr.current && rr.queue.length) rr.current = {id: rr.queue.shift(), progress: 0};
        if (rr.current) {
            // Weakened leadership slows research too (command factor), when enabled.
            const cmd = LEADERSHIP.penalizeResearch ? (n.commandMult ?? 1) : 1;
            rr.current.progress += (dt / TECHS[rr.current.id].time) * (n.researchSpeedMult ?? 1) * cmd;
            if (rr.current.progress >= 1) {
                TECHS[rr.current.id].apply(n);
                rr.done.push(rr.current.id);
                w.events.push({id: nextId(w, "e"), t: w.time, type: "research", slot: n.slot, techId: rr.current.id});
                rr.current = null;
            }
        }
    }

    for (const n of w.nations) {
        if (!n.alive) continue;
        ensureProd(n);
        const pr = n.prod;
        if (!pr.current && pr.queue.length) pr.current = {item: pr.queue.shift(), progress: 0};
        if (pr.current) {
            const it = pr.current.item;
            const t = it.kind === "ammo" ? WARHEADS[it.type].prodTime : (UNITS[it.type].buildTime || DEFAULT_BUILD_TIME);
            pr.current.progress += dt / t;
            if (pr.current.progress >= 1) {
                if (it.kind === "ammo") n.ammo[it.type] = (n.ammo[it.type] || 0) + 1;
                else spawnQueuedUnit(w, n, it);
                w.events.push({
                    id: nextId(w, "e"),
                    t: w.time,
                    type: "built",
                    slot: n.slot,
                    kind: it.kind,
                    unit: it.type
                });
                pr.current = null;
            }
        }
    }

    for (const u of w.units) {
        if (u.hp <= 0) continue;
        u.cooldown = Math.max(0, u.cooldown - dt);
        const def = UNITS[u.type];
        if (def.wing) runAirbase(w, u, dt);
        if ((def.navalSpeed || def.landSpeed) && u.dest) steamShip(u, def, dt);
        else if (def.airSpeed && u.baseId) {
            // Sub-step the flight physics: at 4×–10× game speed a whole tick can
            // be a full second — one turn-rate-limited update per tick makes the
            // heading saw-tooth around the path. Integrating in ≤80 ms slices
            // keeps the nose on the velocity vector at any speed.
            let rem = dt;
            while (rem > 1e-6 && u.hp > 0) {
                const h = Math.min(0.08, rem);
                flyAircraft(w, u, def, h);
                rem -= h;
            }
        }
        if (def.kind === "offense" && u.targetId && u.cooldown <= 0 && airborne(u)) {
            const t = findTarget(w, u.targetId);
            if (!t || !t.alive || !atWar(w, u.slot, t.slot)) {
                u.targetId = null;
                continue;
            }
            const n = nationOf(w, u.slot);
            if (haversine(u.lng, u.lat, t.lng, t.lat) <= def.range * (n?.rangeMult ?? 1)) {
                ensureProd(n);
                // Missile units spend a warhead from the strategic arsenal (and can't
                // fire when it's empty). Conventional units — tanks, aircraft, ships —
                // fire their own munitions and never draw the arsenal.
                const _wh = def.warheads ? (u.warhead || "standard") : "standard";
                if (!def.warheads || (n.ammo[_wh] || 0) > 0) {
                    if (def.warheads) n.ammo[_wh] -= 1;
                    launch(w, u, t, _wh);
                    // Ships rearming under a Replenishment Ship recycle faster.
                    const replen = def.domain === "sea" && replenishmentBuff(w, u) ? REPLENISH_RELOAD_MULT : 1;
                    u.cooldown = def.reload * (n?.reloadMult ?? 1) * replen;
                }
            }
        }
    }

    // Index live defenses by the nation they protect. A battery only ever engages
    // ordnance inbound on its own nation (the inboundSlot gate below), so each
    // projectile need only test that nation's defenders — this bounds the loop by
    // per-nation unit count instead of scanning the world's entire unit list every
    // projectile (was O(projectiles × all units), the hot loop at full-world scale).
    const defBySlot = new Map();
    for (const d of w.units) {
        // Fighters flying a leadership escort are not air-defense batteries — skip
        // them so they hold formation instead of peeling off to fire interceptors.
        if (d.hp <= 0 || UNITS[d.type].kind !== "defense" || d.mission?.role === "leadershipEscort") continue;
        let arr = defBySlot.get(d.slot);
        if (!arr) defBySlot.set(d.slot, arr = []);
        arr.push(d);
    }

    for (const p of w.projectiles) {
        p.travelled += (p.speed ?? MISSILE_SPEED) * dt;
        p.progress = Math.min(1, p.travelled / (p.dist || 1));
        const pos = trackPoint(p, p.progress);
        p.lng = pos[0];
        p.lat = pos[1];
        const ah = trackPoint(p, Math.min(1, p.progress + 0.03));
        p.aheadLng = ah[0];
        p.aheadLat = ah[1];
        // MIRVs descend from their release altitude; whole missiles fly the sine arc.
        p.altNorm = p.altStart != null ? p.altStart * (1 - p.progress) : Math.sin(p.progress * Math.PI);
        if (p.warhead === "cluster" && !p.sub && !p._dead && p.progress >= MIRV_SPLIT_AT) {
            mirvSplit(w, p);
            p._dead = true;
            continue;
        }
        // Defenses fire interceptors (gated by reload + points). Only ordnance
        // actually inbound on the defender's own nation is engaged — missiles
        // transiting past a third party are not their problem.
        const inboundSlot = findTarget(w, p.targetId)?.slot;
        const defenders = inboundSlot == null ? null : defBySlot.get(inboundSlot);
        if (defenders) for (const d of defenders) {
            // Fighters kill what flies in the air column — not ballistic reentry
            // vehicles screaming down from space. BMD stays with ground/sea defenses.
            if (UNITS[d.type].airSpeed && UNITS[p.type]?.ballistic) continue;
            if (d.slot === p.slot || d.cooldown > 0 || p.tried.includes(d.id) || !airborne(d)) continue;
            // Engage only within the battery's annulus: inside defenseRange (outer
            // reach) but outside defenseMinRange (the keep-out gap for area ABMs
            // like THAAD, which can't kill a target that's already dived in close).
            const dToTarget = haversine(d.lng, d.lat, p.lng, p.lat);
            if (dToTarget <= defenseRange(w, d) && dToTarget >= defenseMinRange(w, d)) {
                const dn = nationOf(w, d.slot);
                if (dn.points <= 0 && netIncomeOf(w, d.slot) < 0) continue; // upkeep unmet — interceptors offline
                p.tried.push(d.id);
                // Sea-based defenses (cruiser/destroyer/Aegis afloat) reload faster
                // while replenished by a nearby oiler.
                const dReplen = UNITS[d.type].domain === "sea" && replenishmentBuff(w, d) ? REPLENISH_RELOAD_MULT : 1;
                d.cooldown = (UNITS[d.type].reload || DEFAULT_RELOAD) * dReplen;
                // Hypersonic-evasion: fast boost-glide weapons (off8 / Hypersonic
                // Missile Battery) shave the interceptor's hit probability by the
                // firing nation's evasion. Floored to a small residual chance
                // (derived from INTERCEPT_CAP, no magic number) so evasion makes a
                // strike hard to stop but never truly un-interceptable.
                const baseProb = Math.min(INTERCEPT_CAP, UNITS[d.type].intercept + (dn.interceptAdd ?? 0));
                const evadeFloor = baseProb * (1 - INTERCEPT_CAP);
                const hitProb = Math.max(evadeFloor, baseProb - (p.evasion ?? 0));
                w.interceptors.push({
                    id: nextId(w, "i"),
                    slot: d.slot,
                    srcType: d.type,   // firing battery type — drives the sky sprite variant
                    targetId: p.id,
                    hitProb,
                    speed: INTERCEPTOR_SPEED * (dn.interceptorSpeedMult ?? 1),
                    altNorm: 0,
                    launchDist: Math.max(1, dToTarget),
                    fromLng: d.lng,
                    fromLat: d.lat,
                    lng: d.lng,
                    lat: d.lat,
                    toLng: p.lng,
                    toLat: p.lat
                });
            }
        }
        if (!p._dead && p.progress >= 1) {
            resolveHit(w, p);
            p._dead = true;
        }
    }

    // Radioactive fallout: each contamination cloud ages, drifts on the prevailing
    // wind, and irradiates every living city and unit inside its radius — friend or
    // foe alike — for damage over time, then decays away. Pure math (intensity /
    // proximity / drift are functions of age, position, and dt, no rng), so the
    // sim stays deterministic. A city that fallout drops to 0 hp dies exactly like
    // a direct hit — same destroy event, so the toast, explosion, and ruin fire.
    if (w.effects && w.effects.length) {
        for (const fx of w.effects) {
            if (fx.type !== "fallout") continue;
            fx.age += dt;
            const driftKm = FALLOUT.driftKmPerSec * dt;
            const brng = (FALLOUT.driftHeadingDeg * Math.PI) / 180;
            fx.lat += (driftKm * Math.cos(brng)) / 111;
            fx.lng += (driftKm * Math.sin(brng)) / (111 * Math.cos((fx.lat * Math.PI) / 180) || 1);
            const intensity = falloutIntensity(fx.age);
            if (intensity <= 0) continue;
            const rate = FALLOUT.dmgPerSec * intensity * dt;
            for (const c of w.cities) {
                if (!c.alive) continue;
                const prox = falloutProximity(haversine(fx.lng, fx.lat, c.lng, c.lat), fx.radiusKm);
                if (prox <= 0) continue;
                c.hp -= rate * prox;
                if (c.hp <= 0) {
                    c.hp = 0;
                    c.alive = false;
                    w.events.push({
                        id: nextId(w, "e"), t: w.time, type: "destroy", kind: "city",
                        cityId: c.id, lng: c.lng, lat: c.lat, slot: fx.slot, fallout: 1
                    });
                }
            }
            for (const u of w.units) {
                if (u.hp <= 0) continue;
                const prox = falloutProximity(haversine(fx.lng, fx.lat, u.lng, u.lat), fx.radiusKm);
                if (prox > 0) u.hp -= rate * prox;
            }
        }
        w.effects = w.effects.filter((fx) => fx.type !== "fallout" || fx.age < FALLOUT.lifeSec);
    }

    // Sensor sweep (~4 Hz): each nation's radars pick up missiles entering their
    // coverage. A track, once held, is never dropped. The intended victim's first
    // pickup of ordnance inbound on them raises the "detected" warning — without
    // OTH coverage of the launch site that's the first they hear of it.
    w._det = (w._det || 0) + dt;
    if (w._det >= 0.25) {
        w._det = 0;
        // Sensor coverage is entirely unit-derived (sensorsOf), so only nations that
        // actually field units can hold a track — skip the rest of the ~222-nation
        // roster on both the build and the per-projectile test.
        const slotsWithUnits = new Set();
        for (const u of w.units) if (u.hp > 0) slotsWithUnits.add(u.slot);
        const sensors = {};
        for (const n of w.nations) if (n.alive && slotsWithUnits.has(n.slot)) sensors[n.slot] = sensorsOf(w, n.slot);
        for (const p of w.projectiles) {
            if (p._dead) continue;
            if (!p.seenBy) p.seenBy = []; // saves from before fog of war
            const tgtSlot = findTarget(w, p.targetId)?.slot;
            for (const n of w.nations) {
                if (!n.alive || p.seenBy.includes(n.slot) || !sensors[n.slot]?.length) continue;
                if (!sensorsCover(sensors[n.slot], p.lng, p.lat)) continue;
                p.seenBy.push(n.slot);
                if (n.slot === tgtSlot) w.events.push({
                    id: nextId(w, "e"), t: w.time, type: "detected", slot: n.slot, lng: p.lng, lat: p.lat
                });
            }
        }
    }

    for (const it of w.interceptors) {
        const tgt = w.projectiles.find((p) => p.id === it.targetId && !p._dead);
        if (!tgt) {
            it._dead = true;
            continue;
        }
        // Lead pursuit: steer toward where the target *will* be, not where it is.
        // The kill test still measures the real separation (below), so leading only
        // shapes the flight path — it can't teleport a hit.
        const aim = leadInterceptPoint(it, tgt);
        it.toLng = aim[0];
        it.toLat = aim[1];
        const dist = haversine(it.lng, it.lat, tgt.lng, tgt.lat);
        const stepKm = it.speed * dt;
        it.altNorm = (tgt.altNorm ?? 0) * Math.min(1, Math.max(0, 1 - dist / (it.launchDist || 1)));
        if (dist <= Math.max(INTERCEPT_KILL_RADIUS_KM, stepKm)) {
            it._dead = true;
            if (rand(w) < (it.hitProb ?? DEFAULT_HIT_PROB)) {
                tgt._dead = true;
                w.events.push({
                    id: nextId(w, "e"),
                    t: w.time,
                    type: "intercept",
                    lng: tgt.lng,
                    lat: tgt.lat,
                    alt: tgt.altNorm ?? 0,
                    byLng: it.fromLng,
                    byLat: it.fromLat
                });
            } else {
                w.events.push({
                    id: nextId(w, "e"),
                    t: w.time,
                    type: "miss",
                    lng: it.lng,
                    lat: it.lat,
                    alt: it.altNorm ?? 0
                });
            }
        } else {
            const aimDist = haversine(it.lng, it.lat, aim[0], aim[1]) || 1;
            const f = Math.min(1, stepKm / aimDist);
            it.lng += (aim[0] - it.lng) * f;
            it.lat += (aim[1] - it.lat) * f;
        }
    }

    // Turn any leaders killed this tick into permanent losses BEFORE the prune,
    // while a downed ferry (hp 0) still carries its cargo to be accounted for.
    reconcileLeadership(w);

    w.interceptors = w.interceptors.filter((it) => !it._dead);
    w.projectiles = w.projectiles.filter((p) => !p._dead);
    w.units = w.units.filter((u) => u.hp > 0);
    if (w.events.length > 60) w.events.splice(0, w.events.length - 60);

    aiTick(w, dt);
    diploTick(w, dt);
    // Dispatch/relaunch leadership evac ferries for nations actively sheltering
    // (player pressed Shelter, or an AI that has entered a war).
    evacTick(w);
    // One pass over cities: which slots still hold a living city, and the population
    // tally for the domination check. O(cities), not O(nations × cities) — the naive
    // per-nation `cities.some(...)` was 222 × ~2565 every tick at full-world scale.
    const slotsAlive = new Set();
    let myPop = 0, totPop = 0;
    for (const c of w.cities) {
        if (!c.alive) continue;
        slotsAlive.add(c.slot);
        const p = c.pop || 0;
        totPop += p;
        if (c.slot === w.mySlot) myPop += p;
    }
    for (const n of w.nations) if (n.alive && !slotsAlive.has(n.slot)) n.alive = false;
    const me = nationOf(w, w.mySlot);
    if (!me || !me.alive) {
        // Player eliminated — immediate defeat, regardless of the surviving world.
        w.over = true;
        w.winnerSlot = null;
        w.paused = true;
        return w;
    }
    // Victory: last nation standing, or a commanding share of surviving world
    // population (last-of-222 is impractical, so domination is the reachable win).
    const aliveNations = w.nations.filter((n) => n.alive);
    const dominant = totPop > 0 && myPop / totPop >= DIPLOMACY.dominationPopFrac;
    if (aliveNations.length <= 1 || dominant) {
        w.over = true;
        w.winnerSlot = me.slot;
        w.paused = true;
    }
    return w;
}
