// The tick engine's single entry point: step() advances the whole simulation.
// The tick phases live in ./tickPhases.js and the opponent AI (including its
// diplomacy) lives in ./ai/ — step() below is a thin orchestrator over both.
import {evacTick} from "./leadership.js";
import {updateStability} from "./stability.js";
import {captureTick} from "./occupation.js";
import {aiTick} from "./ai/index.js";
import {decapitationTick, warTick} from "./warResolution.js";
import {
    growCities,
    healCities,
    populationTrendOf,
    stepCombat,
    stepEconomy,
    stepEventPrune,
    stepFallout,
    stepInterceptors,
    stepMovement,
    stepSensors,
    stepVictory,
} from "./tickPhases.js";

export {growCities, healCities, populationTrendOf};

// Advances the world by dt seconds: research/production, unit AI and firing,
// projectile flight and interception, sensor sweeps, opponent AI, and the
// end-of-tick cleanup (dead unit/projectile pruning, win condition).
//
// `predict` marks a CLIENT-SIDE prediction tick in an online match. The server is
// authoritative and streams full-world snapshots (SNAPSHOT_MS, server/config.js);
// between them the client runs this to smooth continuous MOTION (units, missiles,
// interceptors, sensors, fallout) up to 30fps. On a prediction tick it must NOT re-run the discrete, server-owned
// systems — economy/production/research, opponent AI, diplomacy, leadership evac,
// occupation, war resolution, growth, stability, and the win check — because
// predicting those makes the client repeatedly "complete" then revert server state
// against the next snapshot (the online production-queue stutter/stall bug). Solo
// play and the authoritative server call step(w, dt) with predict=false: full tick.
export function step(w, dt, predict = false) {
    if (w.over || dt <= 0) return w;
    w.time += dt;

    // Discrete, server-owned economy (production/research/points) — carried by
    // snapshots online, so a prediction tick leaves it untouched.
    if (!predict) stepEconomy(w, dt);
    stepMovement(w, dt);
    stepCombat(w, dt);
    stepFallout(w, dt);
    stepSensors(w, dt);
    stepInterceptors(w, dt);
    stepEventPrune(w);

    // A client prediction tick stops here: everything below mutates discrete,
    // server-authoritative state that arrives via snapshots. Running it locally only
    // fights the next snapshot.
    if (predict) return w;

    aiTick(w, dt);
    // Dispatch/relaunch leadership evac ferries for nations actively sheltering
    // (player pressed Shelter, or an AI that has entered a war). Assignment runs
    // on a ~4 Hz sweep like the sensor pass: it only decides WHICH ferries to
    // launch (the aircraft themselves fly every tick), launches are already
    // spaced by LEADERSHIP.launchGapSec, and each sweep re-scans every active
    // nation's cities and units — far too heavy to repeat every tick.
    w._evacT = (w._evacT || 0) + dt;
    if (w._evacT >= 0.25) {
        w._evacT = 0;
        evacTick(w);
    }
    // Advance ground occupation: capture-flagged units holding cleared enemy cities
    // flip their state to the occupier. Runs before growth/tally so a captured city
    // is counted for its new owner's income and domination share this same tick.
    captureTick(w, dt);
    // Resolve wars whose loser has collapsed below the surrender threshold (Defeat /
    // Victory + territory transfer). Runs right after occupation so it reads this
    // tick's flips, and before growth/tally so ceded territory counts for its new
    // owner immediately. See sim/warResolution.js.
    warTick(w);
    // Decapitation defeat: any nation whose leadership pool is fully wiped out this
    // tick (bombed in its cities, bunker glassed by a thermonuclear hit, or bunker
    // captured) surrenders every war and is eliminated. Runs after warTick so it
    // reads settled relations, and before the win check so the elimination counts.
    decapitationTick(w);
    // Rebuild damaged cities whose owner is still standing, then grow city
    // populations — heal first so growth reads this tick's restored vitality, and
    // both before the tally so income, industry cap, and the domination check all
    // see the updated figures.
    healCities(w, dt);
    growCities(w, dt);
    // Ease each nation's stability toward its live target. Runs after
    // growth/leadership/diplomacy so it reads this tick's population, wars,
    // leadership, and deficit state.
    updateStability(w, dt);

    stepVictory(w);
    return w;
}
