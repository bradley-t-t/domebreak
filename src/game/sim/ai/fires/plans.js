// AI-authored attack plans — one per active war, shaped exactly like the
// player's Battle Plans so the shared solver (battlePlan.solvePlan) can run
// them. The war plan's goal picks the target categories; decap wars run with
// overkill on (saturate the bunker, waste be damned); a war we are actively
// suing out of holds fire so no shots land while the offer is pending.
import {UNITS, isAttacker} from "../../../data/constants.js";
import {PEACE, FIRES} from "../tuning.js";

// Goal priority when several wars compete for the same launcher.
const GOAL_RANK = {decap: 0, capture: 1, cityStrike: 2, attritional: 3};

// My offensive platform types the strategic solver may task — everything that
// isn't a ground-war unit (those maneuver, they don't get standing strike
// orders from the solver).
function attackerTypes(frame) {
    const types = new Set();
    for (const u of frame.me.units) {
        const def = UNITS[u.type];
        if (isAttacker(def) && def.targets !== "land") types.add(u.type);
    }
    return [...types];
}

export function buildFirePlans(frame, warPlans) {
    const types = attackerTypes(frame);
    if (!types.length) return [];
    const out = [];
    for (const foe in warPlans) {
        const wp = warPlans[foe];
        // Any war we just sued out of holds fire while the offer is pending —
        // whatever the lifecycle state (the two-front-relief sue fires from
        // "prosecute" and must not keep launching mid-offer either).
        const suedAt = frame.diplo.suing[foe];
        const holdFire = suedAt != null && frame.time - suedAt < PEACE.losingRetrySec;
        out.push({
            foe: +foe,
            goal: wp.goal,
            rank: GOAL_RANK[wp.goal] ?? 9,
            holdFire,
            plan: {
                attackerTypes: types,
                targetTypes: wp.targets,
                engagementKm: FIRES.engagementKm,
                overkill: wp.goal === "decap",
                targetNations: [+foe],
            },
        });
    }
    out.sort((a, b) => a.rank - b.rank);
    return out;
}
