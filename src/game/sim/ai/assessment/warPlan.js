// Per-war goals. Each active war gets a plan: WHAT we're trying to do to this
// foe (attrition, decapitation, counter-value city strikes, or ground capture)
// and which target categories that implies for the fires solver. Goals flip on
// lifecycle state changes — a war that turns against us drops the decap dream
// and grinds the foe's launchers instead.
import {CAPTURE} from "../../../data/constants.js";
import {POSTURE} from "../tuning.js";

// Target-category priority per goal (BATTLE_PLAN.targetCategories ids).
const GOAL_TARGETS = {
    attritional: ["strike", "airdef", "sensors", "airbases"],
    decap: ["command", "sensors", "airdef"],
    cityStrike: ["city", "strike"],
    capture: ["ground", "airdef", "airbases"],
};

export function assessWarPlans(frame, posture, personality) {
    const plans = {};
    for (const front of frame.fronts) {
        const foe = front.foe;
        const p = frame.world.profiles[foe];
        const state = frame.diplo.warState[foe] || "opening";
        let goal = "attritional";
        if (state === "losing" || state === "routed") {
            goal = "attritional";                    // survival first — grind their shooters
        } else if (posture.mode === "decap" && posture.decapFoe === foe) {
            goal = "decap";
        } else if (p && p.lead.pct < POSTURE.decapLeadPct && personality.decapFocus > 0.5) {
            goal = "decap";
        } else if (p && frame.me.units.filter((u) => u.type === "infantry" || u.type === "tank").length
            >= Math.max(3, p.ground.count) && front.distKm < CAPTURE.holdKm * 40) {
            goal = "capture";                        // ground superiority on a reachable front
        } else if (posture.mode === "blitz" || (personality.aggression > 0.6 && p && p.defense.count <= 2)) {
            goal = "cityStrike";                     // soft air defense invites counter-value
        }
        // Escalation: once the counterforce fight is won — the foe's strike arm
        // is nearly gone, or a stall is running in our favor — attrition
        // upgrades to counter-value so wars drive to a decision instead of
        // grinding into a permanent stalemate.
        if (goal === "attritional" && p && state !== "losing" && state !== "routed") {
            const wonCounterforce = p.arsenal.strike <= 2 && (state === "prosecute" || state === "stall");
            if (wonCounterforce) goal = "cityStrike";
        }
        const phase = front.age < 60 ? "opening" : (p && p.frac < 0.55 ? "closing" : "rolling");
        plans[foe] = {foe, goal, targets: GOAL_TARGETS[goal], phase, state};
    }
    return plans;
}
