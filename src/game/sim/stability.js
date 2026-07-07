// National Stability (see design/gdd/stability.md).
//
// Each nation's stability (0..100) eases every tick toward a live target of
// 100 − Σ penalties, drawn from population loss, wars beyond the first, leadership
// killed or bunkered, and points deficits. It is an ambient pressure readout shown
// in the HUD; a low bar carries no mechanical consequence of its own. Pure and
// deterministic — no RNG, no history.
import {STABILITY} from "../data/constants.js";
import {nationOf} from "./worldState.js";
import {netIncomeOf, populationOf} from "./queries.js";

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

// HUD status for a nation: current % and the live target it is easing toward.
export function stabilityStatus(w, slot) {
    const n = nationOf(w, slot);
    if (!n) return null;
    return {
        pct: Math.round(n.stability ?? 100),
        target: Math.round(stabilityTarget(w, n)),
    };
}

// Per-tick: ease every living nation's stability toward its target.
export function updateStability(w, dt) {
    if (dt <= 0) return;
    const k = Math.min(1, STABILITY.easePerSec * dt);
    for (const n of w.nations) {
        if (!n.alive) continue;
        if (n.stability == null) n.stability = 100;
        const target = stabilityTarget(w, n);
        n.stability += (target - n.stability) * k;
        if (n.stability < 0) n.stability = 0;
        else if (n.stability > 100) n.stability = 100;
    }
}
