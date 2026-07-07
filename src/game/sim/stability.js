// National Stability & Civil War (see design/gdd/stability-and-civil-war.md).
//
// Each nation's stability (0..100) eases every tick toward a live target of
// 100 − Σ penalties, drawn from population loss, wars beyond the first, leadership
// killed or bunkered, and points deficits. A nation held at collapse for
// STABILITY.civilWarSec fractures: a geographic half secedes as a new hostile AI
// (civil war), local units defect, and both successor states get a fresh leadership
// pool. Pure/deterministic apart from the seeded rand(w) used to stagger the new
// rebel AI's think timer, preserving replay/save reproducibility.
import {STABILITY, colorForSlot} from "../data/constants.js";
import {nationOf, nextId, rand} from "./worldState.js";
import {netIncomeOf, populationOf} from "./queries.js";
import {bunkerOf, retargetFerry, seedLeadership} from "./leadership.js";
import {haversine} from "../geo/geo.js";

// Wars a nation is currently fighting.
function warCount(n) {
    let k = 0;
    for (const s in n.relations) if (n.relations[s] === "war") k++;
    return k;
}

// A nation's original total population: the sum of pop0 over ALL its cities (alive
// or dead), so bombing and lost cities surface as a population-loss penalty. Falls
// back to current pop for legacy saves that predate pop0.
function basePopOf(w, slot) {
    let p = 0;
    for (const c of w.cities) if (c.slot === slot) p += (c.pop0 ?? c.pop ?? 0);
    return p;
}

// The stability a nation is trending toward right now: 100 minus every active
// penalty. Pure function of current state — no RNG, no history.
export function stabilityTarget(w, n) {
    let penalty = 0;
    // Population loss (captures depopulation AND cities/territory lost to war).
    const base = basePopOf(w, n.slot);
    if (base > 0) {
        const lostFrac = Math.max(0, Math.min(1, 1 - populationOf(w, n.slot) / base));
        penalty += lostFrac * STABILITY.wPopLoss;
    }
    // Too many simultaneous wars (the first freeWars are "normal").
    penalty += Math.max(0, warCount(n) - STABILITY.freeWars) * STABILITY.wPerWar;
    // Leadership killed (heavy) and the softer cost of keeping leaders bunkered.
    const total = n.lead?.total || 0;
    if (total > 0) {
        penalty += ((n.lead.lost || 0) / total) * STABILITY.wLeadLoss;
        penalty += ((n.lead.sheltered || 0) / total) * STABILITY.wBunkered;
    }
    // Running a points deficit.
    if (netIncomeOf(w, n.slot) < 0) penalty += STABILITY.wDeficit;
    return Math.max(0, Math.min(100, 100 - penalty));
}

// Stability as a rounded 0..100 percentage for display.
export function stabilityOf(n) {
    return Math.round(n?.stability ?? 100);
}

// HUD status for a nation: current %, live target, and civil-war countdown state.
export function stabilityStatus(w, slot) {
    const n = nationOf(w, slot);
    if (!n) return null;
    const unrest = n._unrest || 0;
    return {
        pct: Math.round(n.stability ?? 100),
        target: Math.round(stabilityTarget(w, n)),
        collapsing: unrest > 0,
        secToCivilWar: unrest > 0 ? Math.max(0, STABILITY.civilWarSec - unrest) : null,
    };
}

// Per-tick: ease every living nation's stability toward its target, then fracture
// any that has sat at collapse for civilWarSec. Iterates a snapshot of w.nations so
// a freshly-spawned rebel isn't processed mid-fracture.
export function updateStability(w, dt) {
    if (dt <= 0) return;
    const k = Math.min(1, STABILITY.easePerSec * dt);
    for (const n of [...w.nations]) {
        if (!n.alive) continue;
        if (n.stability == null) n.stability = 100;
        const target = stabilityTarget(w, n);
        n.stability += (target - n.stability) * k;
        if (n.stability < 0) n.stability = 0;
        else if (n.stability > 100) n.stability = 100;
        if (n.stability <= STABILITY.collapseAt) {
            n._unrest = (n._unrest || 0) + dt;
            if (n._unrest >= STABILITY.civilWarSec) fractureNation(w, n);
        } else {
            n._unrest = 0;
        }
    }
}

// Splits a collapsed nation in two — the civil war. Its living cities are bisected
// along the axis of greatest geographic spread; the capital's half stays loyal and
// the other secedes as a new hostile AI ("Free <Name>"). Units whose nearest living
// city is now a rebel city defect. Both successor states get a fresh leadership pool
// and reset stability so neither instantly re-fractures, and the two begin at war.
// Returns the new rebel nation, or null when the nation is too small to split.
export function fractureNation(w, parent) {
    const cities = w.cities.filter((c) => c.slot === parent.slot && c.alive);
    if (cities.length < STABILITY.minCitiesToFracture) {
        // A one-city rump can't break in half — relieve the pressure instead.
        parent.stability = STABILITY.resetStability;
        parent._unrest = 0;
        return null;
    }
    // Bisect along the wider geographic axis, at the median.
    const lngs = cities.map((c) => c.lng), lats = cities.map((c) => c.lat);
    const spanLng = Math.max(...lngs) - Math.min(...lngs);
    const spanLat = Math.max(...lats) - Math.min(...lats);
    const axis = spanLng >= spanLat ? "lng" : "lat";
    const sorted = [...cities].sort((a, b) => a[axis] - b[axis]);
    const mid = Math.floor(sorted.length / 2);
    const groupA = sorted.slice(0, mid), groupB = sorted.slice(mid);
    // The capital's group stays loyal; the other secedes. If neither/both hold a
    // capital, the smaller-population group secedes.
    const capInA = groupA.some((c) => c.cap), capInB = groupB.some((c) => c.cap);
    let loyal, rebel;
    if (capInA && !capInB) { loyal = groupA; rebel = groupB; }
    else if (capInB && !capInA) { loyal = groupB; rebel = groupA; }
    else {
        const popA = groupA.reduce((s, c) => s + (c.pop || 0), 0);
        const popB = groupB.reduce((s, c) => s + (c.pop || 0), 0);
        if (popA <= popB) { rebel = groupA; loyal = groupB; } else { rebel = groupB; loyal = groupA; }
    }
    if (!rebel.length || !loyal.length) { parent.stability = STABILITY.resetStability; parent._unrest = 0; return null; }

    const newSlot = w.nations.reduce((m, n) => Math.max(m, n.slot), 0) + 1;
    // Seceding cities change hands.
    const rebelIds = new Set(rebel.map((c) => c.id));
    for (const c of w.cities) if (rebelIds.has(c.id)) c.slot = newSlot;
    // Units defect when their nearest living city (among the two successor states) is
    // now a rebel city.
    for (const u of w.units) {
        if (u.slot !== parent.slot) continue;
        let best = Infinity, bestSlot = parent.slot;
        for (const c of w.cities) {
            if (!c.alive || (c.slot !== parent.slot && c.slot !== newSlot)) continue;
            const d = haversine(u.lng, u.lat, c.lng, c.lat);
            if (d < best) { best = d; bestSlot = c.slot; }
        }
        if (bestSlot === newSlot) u.slot = newSlot;
    }
    // The breakaway inherits a population-proportional share of the parent's economy.
    const rebelPop = rebel.reduce((s, c) => s + (c.pop || 0), 0);
    const totalPop = rebelPop + loyal.reduce((s, c) => s + (c.pop || 0), 0);
    const share = totalPop > 0 ? rebelPop / totalPop : 0.5;
    const rebelNation = {
        slot: newSlot,
        name: `Free ${parent.name}`,
        iso: parent.iso,
        isAi: true,
        rebel: true,
        gdp: (parent.gdp || 0) * share,
        color: colorForSlot(newSlot),
        points: Math.round((parent.points || 0) * share),
        alive: true,
        relations: {},
        _ai: 2 + rand(w) * 3,
        _diplo: null,
        research: {queue: [], current: null, done: []},
        ammo: {},
        prod: {queue: [], current: null},
        dmgMult: 1, interceptAdd: 0, incomeMult: 1, rangeMult: 1, reloadMult: 1,
        defRangeMult: 1, radarMult: 1, interceptorSpeedMult: 1, buildCostMult: 1,
        upkeepMult: 1, researchSpeedMult: 1, moveCostMult: 1, hypersonicEvasion: 0, sonarMult: 1,
    };
    parent.points = Math.round((parent.points || 0) * (1 - share));
    parent.gdp = (parent.gdp || 0) * (1 - share);
    w.nations.push(rebelNation);
    // Fresh government for both halves (capital-first seeding over their new cities).
    seedLeadership(parent, w.cities.filter((c) => c.slot === parent.slot));
    seedLeadership(rebelNation, w.cities.filter((c) => c.slot === newSlot));
    // The civil war itself: parent and breakaway at war; all others stay neutral.
    parent.relations[newSlot] = "war";
    rebelNation.relations[parent.slot] = "war";
    (parent._warStart || (parent._warStart = {}))[newSlot] = w.time;
    (rebelNation._warStart || (rebelNation._warStart = {}))[parent.slot] = w.time;
    // Relieve the pressure so neither successor instantly re-fractures.
    parent.stability = STABILITY.resetStability; parent._unrest = 0;
    rebelNation.stability = STABILITY.resetStability; rebelNation._unrest = 0;
    // Make sure the bunker check is valid post-split (parent may have lost its bunker
    // to the rebel half); reconciliation next tick handles any orphaned sheltered.
    if (parent.lead && !bunkerOf(w, parent.slot)) parent.lead.sheltered = 0;
    // Re-aim any leadership ferry caught in transit at the split: each successor's
    // planes now deliver to an asset it actually owns (a surviving bunker, else its
    // nearest owned city) instead of flying command into what is now enemy hands.
    for (const u of w.units) {
        if (u.type === "transport" && u.mission?.role === "leadershipFerry"
            && (u.slot === parent.slot || u.slot === newSlot)) retargetFerry(w, u);
    }
    w.events.push({
        id: nextId(w, "e"), t: w.time, type: "civilwar",
        slot: parent.slot, rebelSlot: newSlot, name: rebelNation.name,
        lng: rebel[0].lng, lat: rebel[0].lat,
    });
    return rebelNation;
}
