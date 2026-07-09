// National Stability.
//
// Each nation's stability (0..100) eases every tick toward a live target of
// 100 − Σ penalties, drawn from population loss, wars beyond the first, leadership
// killed or bunkered, and points deficits. It is an ambient pressure readout shown
// in the HUD; a low bar carries no mechanical consequence of its own. Pure and
// deterministic — no RNG, no history.
import {STABILITY} from "../data/constants.js";
import {nationOf} from "./worldState.js";
import {netIncomeOf, populationOf} from "./queries.js";
import {clamp, clamp01} from "../../lib/math.js";

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

// Every active stability penalty for a nation, itemized — the reasoning behind the
// target. One entry per pressure that is currently dragging stability down (nothing
// is listed when a factor is inactive). Pure; stabilityTarget just sums these, so
// the HUD breakdown and the simulated target can never diverge.
function stabilityFactors(w, n) {
    const f = [];
    // Population loss (captures depopulation AND cities/territory lost to war).
    const base = basePopOf(w, n.slot);
    if (base > 0) {
        const lostFrac = clamp01(1 - populationOf(w, n.slot) / base);
        if (lostFrac > 0) f.push({
            key: "pop", label: "Population lost", penalty: lostFrac * STABILITY.wPopLoss,
            detail: `${Math.round(lostFrac * 100)}% of citizens gone`,
        });
    }
    // Too many simultaneous wars (the first freeWars are "normal").
    const wars = warCount(n);
    if (wars - STABILITY.freeWars > 0) f.push({
        key: "war", label: "Too many wars", penalty: (wars - STABILITY.freeWars) * STABILITY.wPerWar,
        detail: `${wars} active fronts`,
    });
    // Leadership killed (heavy) and the softer cost of keeping leaders bunkered.
    const total = n.lead?.total || 0;
    if (total > 0) {
        if ((n.lead.lost || 0) > 0) f.push({
            key: "lead", label: "Leadership killed", penalty: (n.lead.lost / total) * STABILITY.wLeadLoss,
            detail: `${n.lead.lost} of ${total} lost`,
        });
        if ((n.lead.sheltered || 0) > 0) f.push({
            key: "bunker", label: "Leadership bunkered", penalty: (n.lead.sheltered / total) * STABILITY.wBunkered,
            detail: `${n.lead.sheltered} sheltered, not governing`,
        });
    }
    // Running a points deficit.
    if (netIncomeOf(w, n.slot) < 0) f.push({
        key: "deficit", label: "Points deficit", penalty: STABILITY.wDeficit,
        detail: "spending outpaces income",
    });
    // Recent military defeats: a morale hit that eases linearly to zero over defeatSec
    // (one in-game year). Each lost war decays independently and they stack. See
    // sim/warResolution.js, which stamps `defeatPenalties` on the loser.
    if (n.defeatPenalties?.length) {
        let sum = 0;
        for (const p of n.defeatPenalties) {
            const frac = 1 - (w.time - p.t0) / STABILITY.defeatSec;
            if (frac > 0) sum += STABILITY.wDefeat * frac;
        }
        if (sum > 0) f.push({
            key: "defeat", label: "Recent defeat", penalty: sum,
            detail: n.defeatPenalties.length > 1 ? `${n.defeatPenalties.length} wars lost` : "morale after losing a war",
        });
    }
    return f;
}

// The stability a nation is trending toward right now: 100 minus every active
// penalty. Pure function of current state — no RNG, no history.
export function stabilityTarget(w, n) {
    let penalty = 0;
    for (const f of stabilityFactors(w, n)) penalty += f.penalty;
    return clamp(100 - penalty, 0, 100);
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

// HUD breakdown for the Stability readout: current %, the target it eases toward,
// and every active penalty itemized (penalties rounded to whole points for display).
// `factors` is empty when nothing is dragging stability down.
export function stabilityBreakdown(w, slot) {
    const n = nationOf(w, slot);
    if (!n) return null;
    return {
        pct: Math.round(n.stability ?? 100),
        target: Math.round(stabilityTarget(w, n)),
        factors: stabilityFactors(w, n).map((f) => ({...f, penalty: Math.round(f.penalty)})),
    };
}

// Per-tick: ease every living nation's stability toward its target.
export function updateStability(w, dt) {
    if (dt <= 0) return;
    const k = Math.min(1, STABILITY.easePerSec * dt);
    for (const n of w.nations) {
        if (!n.alive) continue;
        if (n.stability == null) n.stability = 100;
        // Prune fully-decayed defeat penalties so saved state stays small.
        if (n.defeatPenalties?.length) {
            n.defeatPenalties = n.defeatPenalties.filter((p) => w.time - p.t0 < STABILITY.defeatSec);
        }
        const target = stabilityTarget(w, n);
        n.stability = clamp(n.stability + (target - n.stability) * k, 0, 100);
    }
}
