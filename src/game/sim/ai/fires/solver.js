// Fires solve: run each AI war plan through the SAME saturation/no-overkill
// solver the player's Battle Plans use (battlePlan.solvePlan). Two layers of
// priority the raw solver doesn't have:
//   - across wars, higher-priority plans claim launchers first (a decapitation
//     strike is never starved by an attritional sideshow);
//   - within a plan, target CATEGORIES are staged in order — a decap plan
//     saturates command before anything spills onto sensors.
// Pure: the orders layer applies the result. ammoWanted is derived from the
// merged assignments and feeds the next budget cycle's magazine wants.
import {UNITS} from "../../../data/constants.js";
import {loadedWarhead, solvePlan} from "../../battlePlan.js";

export function solveFires(w, frame, firePlans) {
    const assignments = new Map();          // unitId -> {targetId, foe, goal}
    const holdFoes = new Set();
    for (const fp of firePlans) {
        if (fp.holdFire) {
            holdFoes.add(fp.foe);
            continue;
        }
        // Stage the categories: each solve excludes attackers already claimed
        // by an earlier stage or war, so a busy launcher can't phantom-claim
        // (and saturate) a later stage's target that a genuinely free launcher
        // should have taken. Earlier categories and earlier wars stay on top.
        for (const category of fp.plan.targetTypes) {
            const plan = {...fp.plan, targetTypes: [category], excludeIds: new Set(assignments.keys())};
            const solved = solvePlan(w, plan, frame.me.slot);
            for (const [uid, tid] of solved.assignments) {
                assignments.set(uid, {targetId: tid, foe: fp.foe, goal: fp.goal});
            }
        }
    }
    // One desired round per assigned warhead-capable attacker, by loaded payload.
    const ammoWanted = {};
    const byId = new Map(frame.me.units.map((u) => [u.id, u]));
    for (const uid of assignments.keys()) {
        const u = byId.get(uid);
        if (!u || !UNITS[u.type].warheads) continue;
        const wh = loadedWarhead(u);
        ammoWanted[wh] = (ammoWanted[wh] || 0) + 1;
    }
    return {assignments, ammoWanted, holdFoes};
}
