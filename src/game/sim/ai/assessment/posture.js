// Posture: the one-word strategic stance a nation takes this think, plus an
// aggression scalar the doctrine/focus layers scale by. Derived fresh from the
// PerceptionFrame every think — a nation that loses half its bloc power mid-war
// drops from press to turtle without any special-case code.
//
//   turtle  — outmatched: wall up, keep a minimal deterrent
//   hold    — even footing, no reason to escalate
//   press   — advantage worth spending: build offense, prosecute wars
//   blitz   — decisive superiority: go for territory and cities
//   decap   — a foe's leadership is exposed and we can reach it: kill the head
import {POSTURE} from "../tuning.js";

// Strategic launch platforms that make a decapitation credible.
const STRIKE_TYPES = ["silo", "sub-ssbn", "orbitalstrike", "hypersonicbty", "launcher"];

export function assessPosture(frame, personality) {
    const ratio = frame.world.strengthRatio;
    const aggression = Math.min(1, personality.aggression * (0.6 + 0.6 * Math.min(1.5, ratio)));

    // Decapitation window: an at-war foe with broken leadership, while we still
    // field a real strategic arsenal. decapFocus gates how eagerly a nation
    // looks for the throat at all.
    if (frame.world.atWar && personality.decapFocus > 0.35) {
        const strikers = frame.me.units.filter((u) => STRIKE_TYPES.includes(u.type)).length;
        if (strikers >= POSTURE.decapStrikeMin) {
            for (const e of frame.world.enemies) {
                const p = frame.world.profiles[e.slot];
                if (p && p.lead.pct < POSTURE.decapLeadPct && (p.lead.exposed || p.lead.bunker)) {
                    return {mode: "decap", aggression: Math.max(aggression, 0.7), decapFoe: e.slot};
                }
            }
        }
    }

    if (ratio < POSTURE.turtleRatio) return {mode: "turtle", aggression: aggression * 0.5};
    if (frame.world.atWar) {
        if (ratio >= POSTURE.blitzRatio && aggression > 0.5) return {mode: "blitz", aggression};
        return {mode: "press", aggression};
    }
    // Peace: ambitious nations posture forward (pre-position offense, stock
    // magazines); everyone else holds.
    if (personality.aggression > POSTURE.pressAggression && ratio >= 1) return {mode: "press", aggression};
    return {mode: "hold", aggression};
}
