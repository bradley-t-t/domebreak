// The main simulation step: research/production progress, unit movement and
// firing, projectile flight and interception, sensor sweeps, and the simple
// opponent AI. This is the tick engine's single entry point (step()).
// The tick phases live in ./tickPhases.js and the opponent AI / diplomacy
// live in ./aiTick.js — step() below is a thin orchestrator over both.
import {evacTick} from "./leadership.js";
import {updateStability} from "./stability.js";
import {captureTick} from "./occupation.js";
import {aiTick, diploTick} from "./aiTick.js";
import {warTick} from "./warResolution.js";
import {
    growCities,
    stepCombat,
    stepEconomy,
    stepEventPrune,
    stepFallout,
    stepInterceptors,
    stepMovement,
    stepSensors,
    stepVictory,
} from "./tickPhases.js";

export {growCities};

// Advances the world by dt seconds: research/production, unit AI and firing,
// projectile flight and interception, sensor sweeps, opponent AI, and the
// end-of-tick cleanup (dead unit/projectile pruning, win condition). A thin
// orchestrator over the phases above, run in the exact order the original
// inline tick did.
export function step(w, dt) {
    if (w.over || dt <= 0) return w;
    w.time += dt;

    stepEconomy(w, dt);
    stepMovement(w, dt);
    stepCombat(w, dt);
    stepFallout(w, dt);
    stepSensors(w, dt);
    stepInterceptors(w, dt);
    stepEventPrune(w);

    aiTick(w, dt);
    diploTick(w, dt);
    // Dispatch/relaunch leadership evac ferries for nations actively sheltering
    // (player pressed Shelter, or an AI that has entered a war).
    evacTick(w);
    // Advance ground occupation: capture-flagged units holding cleared enemy cities
    // flip their state to the occupier. Runs before growth/tally so a captured city
    // is counted for its new owner's income and domination share this same tick.
    captureTick(w, dt);
    // Resolve wars whose loser has collapsed below the surrender threshold (Defeat /
    // Victory + territory transfer). Runs right after occupation so it reads this
    // tick's flips, and before growth/tally so ceded territory counts for its new
    // owner immediately. See sim/warResolution.js.
    warTick(w);
    // Grow city populations for this tick before the tally reads them, so income,
    // industry cap, and the domination check all see the updated figures.
    growCities(w, dt);
    // Ease each nation's stability toward its live target. Runs after
    // growth/leadership/diplomacy so it reads this tick's population, wars,
    // leadership, and deficit state.
    updateStability(w, dt);

    stepVictory(w);
    return w;
}
