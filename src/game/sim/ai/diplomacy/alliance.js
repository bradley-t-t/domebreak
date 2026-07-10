// Alliances: propose, answer, and — new — deliberately break. Proposals form
// real coalitions (shared enemies, counterweights against a rising bloc)
// gated by loyalty and a clean ledger; answers read the same trust signals;
// breaks happen to freeloaders and, for the least loyal, whenever the strength
// balance flips hard enough. evaluateAllianceOffer is the AI-side answer
// warResolution.proposeAlliance calls — it must never import warResolution.
import {DIPLOMACY} from "../../../data/constants.js";
import {haversine} from "../../../geo/geo.js";
import {nationOf} from "../../worldState.js";
import {ensurePersonality} from "../personality.js";
import {ensureDiplo, rel} from "./ledger.js";
import {capPositions, nationPower} from "../perception/perception.js";
import {survivingFrac} from "../perception/stats.js";
import {ALLIANCE} from "../tuning.js";

function allyCount(n) {
    let k = 0;
    for (const s in n.relations) if (n.relations[s] === "ally") k++;
    return k;
}

function sharesEnemy(a, b) {
    for (const s in a.relations) if (a.relations[s] === "war" && b.relations[s] === "war") return true;
    return false;
}

// Ranked alliance candidates this nation would approach right now, or [] when
// it shouldn't be proposing at all. The orders layer rolls the propose chance
// and sends at most one.
export function allianceCandidates(w, frame, posture, personality) {
    const n = frame.n;
    if (personality.loyalty < ALLIANCE.proposeLoyaltyMin) return [];
    if (allyCount(n) >= DIPLOMACY.maxAllies) return [];
    // Turtles and holders build pacts; a counterweight need overrides posture.
    const needCounterweight = frame.world.strengthRatio < ALLIANCE.counterweightRatio;
    if (!needCounterweight && posture.mode !== "turtle" && posture.mode !== "hold") return [];
    const caps = capPositions(w);
    const capA = caps[n.slot];
    if (!capA) return [];
    const d = ensureDiplo(n);
    const out = [];
    for (const m of [...frame.world.rivals]) {
        const capB = caps[m.slot];
        if (!capB || haversine(capA.lng, capA.lat, capB.lng, capB.lat) > DIPLOMACY.allyRangeKm) continue;
        if (rel(n, m.slot).backstabs > 0) continue;                  // burned once — never again
        if (frame.time - (d.askAlly?.[m.slot] ?? -1e9) < DIPLOMACY.playerAllianceCooldownSec) continue;
        if (!m.isAi) {
            if (w.time < (w.rules?.playerGraceSec ?? DIPLOMACY.playerGraceSec)) continue;
            if (w.time - (n._allianceToPlayerAt ?? -1e9) < DIPLOMACY.playerAllianceCooldownSec) continue;
        }
        const shared = sharesEnemy(n, m);
        if (!shared && !needCounterweight) continue;
        const weight = (1 + (shared ? DIPLOMACY.allySharedEnemyW : 0)) * Math.max(0.2, m.gdp || 0.1);
        out.push([m.slot, weight]);
    }
    return out;
}

// Would this AI accept an alliance proposed by `from`? Shared enemy is a
// strong yes; a proposer at least our strength is a pact worth having; loyal
// nations lean yes on a clean record. A dirty ledger (backstabs) is a hard no.
export function evaluateAllianceOffer(w, ai, from) {
    const nAi = nationOf(w, ai), nFrom = nationOf(w, from);
    if (!nAi || !nFrom) return false;
    if (allyCount(nAi) >= DIPLOMACY.maxAllies) return false;
    if (rel(nAi, from).backstabs > 0) return false;
    if (sharesEnemy(nAi, nFrom)) return true;
    if (survivingFrac(w, from) >= survivingFrac(w, ai)) return true;
    const personality = ensurePersonality(w, nAi);
    return personality.loyalty > ALLIANCE.acceptLoyaltyLean && rel(nAi, from).honored > 0;
}

// An ally this nation should walk away from right now, or null. Freeloaders
// (allies who sat out our wars) and — for the near-disloyal — allies we now
// dwarf are both fair game. Betrayal-driven breaks (attacking the ex-ally)
// come from betrayal.js instead.
export function allyToBreak(w, frame, personality, unitsBySlot) {
    const n = frame.n;
    const d = ensureDiplo(n);
    for (const ally of frame.world.allies) {
        // Freeloader detection: while we fight, an ally at peace with all our
        // foes racks up strikes; enough strikes ends the pact.
        if (frame.world.atWar) {
            const helping = frame.world.enemies.some((e) => ally.relations[e.slot] === "war");
            if (!helping) {
                const strikes = ((d.freeload ??= {})[ally.slot] ?? 0) + 1;
                d.freeload[ally.slot] = strikes;
                // Strikes accrue once per diplomacy pass while a war runs; the
                // threshold is in war-passes, not wars, so a long abandonment ends it.
                if (strikes >= ALLIANCE.freeloaderWars * 10) return ally.slot;
            } else if (d.freeload?.[ally.slot]) {
                d.freeload[ally.slot] = 0;
            }
        }
        if (personality.loyalty < ALLIANCE.breakLoyaltyMax) {
            // Raw national power, not bloc power — a mutual pact puts both
            // partners in each other's bloc, which would pin the ratio at 1.
            const mine = nationPower(w, n, unitsBySlot);
            const theirs = nationPower(w, ally, unitsBySlot);
            if (mine / Math.max(0.1, theirs) > ALLIANCE.breakStrengthFlip) return ally.slot;
        }
    }
    return null;
}
