// Peace: when to sue, and how to answer an offer. Suing stops being a per-tick
// coin flip — it fires from the war-lifecycle state on a cadence that scales
// with desperation (routed retries fast, a stall probes occasionally) and with
// personality.patience. Offer evaluation reads the same ledger: a nation ahead
// on damage refuses, a vindictive one holds grudges, and nobody sues while a
// decapitation kill is one shot away.
//
// evaluatePeaceOffer is ALSO the AI-side answer warResolution.offerPeace calls
// for any incoming offer (player or AI) — so it must never import
// warResolution (the offers themselves are sent by the orders layer).
import {DIPLOMACY} from "../../../data/constants.js";
import {nationOf} from "../../worldState.js";
import {ensurePersonality} from "../personality.js";
import {damageRatio, ensureDiplo, rel} from "./ledger.js";
import {nearDecapKill} from "./warLifecycle.js";
import {PEACE, POSTURE} from "../tuning.js";
import {survivingFrac} from "../perception/stats.js";
import {leadershipPct} from "../../leadership.js";

// Sue-for-peace retry interval by state, stretched by patience.
function cadence(state, patience) {
    const base = state === "routed" ? PEACE.routedRetrySec
        : state === "losing" ? PEACE.losingRetrySec
            : PEACE.stallRetrySec;
    return base * (0.6 + 0.8 * patience);
}

// Which foes to sue this think. Returns slots; the orders layer sends the
// offers and stamps diplo.suing. A two-front nation with one war going badly
// also probes the OTHER front for an exit (free the bandwidth, keep pressing
// the war it can still win).
export function foesToSue(w, frame, warStates, personality) {
    const d = ensureDiplo(frame.n);
    const anyBad = Object.values(warStates).some((s) => s === "losing" || s === "routed");
    const out = [];
    for (const front of frame.fronts) {
        const foe = front.foe;
        let state = warStates[foe];
        if (state === "opening" || state === "collapsed") continue;
        // Two-front relief: with one war collapsing, treat a merely-holding
        // second front as a stall worth exiting.
        if (state === "prosecute") {
            if (!(anyBad && frame.fronts.length >= 2)) continue;
            state = "stall";
        }
        if (front.age <= DIPLOMACY.minWarSec) continue;
        if (nearDecapKill(frame, foe)) continue;                    // never sue near a kill
        if (frame.time - (d.suing[foe] ?? -1e9) < cadence(state, personality.patience)) continue;
        if (rel(frame.n, foe).declinedWar >= PEACE.maxDeclinesPerWar && state !== "routed") continue;
        const target = nationOf(w, foe);
        if (target && !target.isAi
            && frame.time - (frame.n._peaceToPlayerAt ?? -1e9) < DIPLOMACY.playerPeaceCooldownSec) continue;
        out.push(foe);
    }
    return out;
}

// Would this AI accept a white peace offered by `from` right now? Called from
// warResolution for every offer made to an AI. Works from persistent state
// only (ledger, cached war state) so it needs no PerceptionFrame.
export function evaluatePeaceOffer(w, ai, from) {
    const n = nationOf(w, ai);
    const offerer = nationOf(w, from);
    if (!n) return true;
    const personality = ensurePersonality(w, n);
    const d = ensureDiplo(n);
    const state = d.warState[from] || null;
    const age = w.time - (n._warStart?.[from] ?? 0);
    const ratio = damageRatio(n, from);
    const myFrac = survivingFrac(w, ai), theirFrac = survivingFrac(w, from);

    // Never let a foe buy its way out from under a decapitation kill.
    if (offerer && leadershipPct(offerer) < POSTURE.decapLeadPct
        && personality.decapFocus > 0.5 && ratio < 1) return false;

    // Clear accepts: we're losing, bleeding, or too impatient to care.
    if (state === "losing" || state === "routed" || state === "collapsed") return true;
    if (ratio > PEACE.acceptDamageRatio && age > DIPLOMACY.minWarSec) return true;
    if ((d.trend || 0) < 0 && age > DIPLOMACY.minWarSec * 1.5) return true;
    if (personality.patience < 0.3 && age > DIPLOMACY.minWarSec * PEACE.impatienceAgeMult) return true;
    // Bloc pressure: the offerer stands beside another of our active foes.
    if (offerer) {
        for (const s in offerer.relations) {
            if (offerer.relations[s] === "ally" && n.relations[s] === "war") return true;
        }
    }

    // Clear refusals: we're ahead and it's early, they've spurned us before,
    // or the grudge is still hot.
    if ((state === "opening" || state === "prosecute" || age <= DIPLOMACY.minWarSec)
        && ratio < PEACE.refuseDamageRatio) return false;
    if (rel(n, from).declinedWar > PEACE.maxDeclinesPerWar) return false;
    // A vindictive nation that is actually landing blows refuses to let the
    // foe off; a phony war with no damage exchanged still settles.
    if (personality.vindictiveness > PEACE.vindictiveMin && ratio < 1.2 && rel(n, from).dealt > 0) return false;

    // Default: accept unless we're visibly winning the attrition.
    return myFrac <= theirFrac || ratio >= 0.9;
}
