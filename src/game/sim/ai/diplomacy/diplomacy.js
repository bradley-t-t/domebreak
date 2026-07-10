// Diplomacy decisions for one nation's think: sue for peace by lifecycle
// state, form coalitions, cut loose freeloaders, take betrayal windows, and
// open wars deliberately — readiness-gated, bandwidth-gated, and grudge-
// weighted. Pure decision layer: returns an action list the orders module
// executes, so every world mutation still flows through one door.
import {DIPLOMACY} from "../../../data/constants.js";
import {haversine} from "../../../geo/geo.js";
import {rand} from "../../worldState.js";
import {weightedPick} from "../../../../lib/random.js";
import {clamp} from "../../../../lib/math.js";
import {blocPower, capPositions, warRangeFor} from "../perception/perception.js";
import {defenderCount, have} from "../doctrine/lib.js";
import {ensureDiplo, rel} from "./ledger.js";
import {foesToSue} from "./peace.js";
import {allianceCandidates, allyToBreak} from "./alliance.js";
import {betrayalTarget} from "./betrayal.js";
import {DECLARE, PEACE, POSTURE, WANTS} from "../tuning.js";

function warCount(n) {
    let k = 0;
    for (const s in n.relations) if (n.relations[s] === "war") k++;
    return k;
}

function sharesEnemy(a, b) {
    for (const s in a.relations) if (a.relations[s] === "war" && b.relations[s] === "war") return true;
    return false;
}

// How stocked the war machine is against its own doctrine floor: strike
// platforms, a standing wall, and rounds in the magazine. Prevents
// "declare then scramble".
function warReadiness(frame) {
    const strikers = have(frame, "silo") + have(frame, "launcher") + have(frame, "hypersonicbty")
        + have(frame, "sub-ssbn") + have(frame, "orbitalstrike");
    const wall = defenderCount(frame);
    const shots = (frame.me.ammo.standard || 0) + (frame.me.ammo.thermo || 0)
        + (frame.me.ammo.sicbm || 0) + (frame.me.ammo.hgv || 0);
    const wallFloor = Math.min(3, frame.me.protect.length);
    return (Math.min(1, strikers / POSTURE.decapStrikeMin)
        + Math.min(1, wallFloor ? wall / wallFloor : 1)
        + Math.min(1, shots / 3)) / 3;
}

// Weakness-first war declaration with the three new predicate gates (readiness,
// bandwidth, grudge bias) layered on the bloc-power weighing.
function declareTarget(w, frame, posture, personality, readiness, unitsBySlot) {
    const n = frame.n;
    if (warCount(n) >= DIPLOMACY.maxWars) return null;
    if (w.time < (w.rules?.playerGraceSec ?? DIPLOMACY.playerGraceSec)) return null;
    if (posture.mode === "turtle") return null;
    if (readiness < DECLARE.readinessMin) return null;
    // A nation losing one war doesn't open a second.
    if (Object.values(frame.diplo.warState).some((s) => s === "losing" || s === "routed")) return null;
    if (rand(w) >= DIPLOMACY.declareChance) return null;
    const caps = capPositions(w);
    const capA = caps[n.slot];
    if (!capA) return null;
    const myBloc = blocPower(w, n, unitsBySlot);
    const reach = warRangeFor(n);
    const d = ensureDiplo(n);
    const aliveBy = new Map();
    for (const c of w.cities) if (c.alive) aliveBy.set(c.slot, (aliveBy.get(c.slot) || 0) + 1);
    const rivals = [];
    for (const m of frame.world.rivals) {
        const capB = caps[m.slot];
        if (!capB || haversine(capA.lng, capA.lat, capB.lng, capB.lat) > reach) continue;
        if (w.time - (d.ceaseFire[m.slot] ?? -1e9) < PEACE.ceaseFireSec) continue;   // honor the white peace
        const theirBloc = blocPower(w, m, unitsBySlot);
        if (myBloc < theirBloc * DECLARE.blocAdvantageMin) continue;                 // never pick a losing fight
        const cA = Math.max(1, aliveBy.get(n.slot) || 0);
        const cB = Math.max(1, aliveBy.get(m.slot) || 0);
        let weight = Math.pow(myBloc / Math.max(0.1, theirBloc), DECLARE.blocGdpWeight)
            * Math.pow(cA / cB, DECLARE.blocForceWeight);
        if (sharesEnemy(n, m)) weight *= 1 + DIPLOMACY.allySharedEnemyW * 0.25;
        // Grudges: damage they've done us and peace they've refused us both
        // raise the odds, scaled by how much this nation dwells on the past.
        const r = rel(n, m.slot);
        weight *= 1 + DECLARE.grudgeW * personality.vindictiveness * Math.min(2, r.taken / DECLARE.grudgeDamageT);
        weight *= 1 + DECLARE.declinedW * Math.min(3, r.declined);
        // Good faith honored cools the pick — a fair peace is remembered too.
        weight /= 1 + 0.3 * r.honored;
        weight = clamp(weight, DIPLOMACY.wMin, DIPLOMACY.wMax);
        rivals.push([m.slot, weight]);
    }
    if (!rivals.length) return null;
    rivals.sort((a, b) => b[1] - a[1]);
    return weightedPick(rivals.slice(0, DECLARE.weaknessTopN), () => rand(w));
}

// The full diplomacy pass for one nation's diplo tick. Returns ordered actions.
export function diplomacyActions(w, frame, posture, warStates, personality, unitsBySlot) {
    const actions = [];

    // 1. Exits first — peace offers by lifecycle state (and two-front relief).
    for (const foe of foesToSue(w, frame, warStates, personality)) {
        actions.push({kind: "offerPeace", to: foe});
    }

    // 2. Coalitions: propose to one weighted candidate on the propose chance.
    const candidates = allianceCandidates(w, frame, posture, personality);
    if (candidates.length && rand(w) < DIPLOMACY.allyProposeChance) {
        const target = weightedPick(candidates, () => rand(w));
        if (target != null) actions.push({kind: "proposeAlliance", to: target});
    }

    // 3. Housecleaning: drop a freeloading (or dwarfed, for the disloyal) ally.
    const exAlly = allyToBreak(w, frame, personality, unitsBySlot);
    if (exAlly != null) actions.push({kind: "breakAlliance", to: exAlly});

    const readiness = warReadiness(frame);

    // 4. Opportunism: a staggering neighbour (or ally) is a window.
    const stab = betrayalTarget(w, frame, posture, personality, readiness);
    if (stab) {
        if (stab.breakFirst) actions.push({kind: "breakAlliance", to: stab.target});
        actions.push({kind: "declareWar", to: stab.target});
        return actions;   // one war opening per pass is plenty
    }

    // 5. Deliberate war: weakness-weighted, readiness/bandwidth/grudge gated.
    const target = declareTarget(w, frame, posture, personality, readiness, unitsBySlot);
    if (target != null) actions.push({kind: "declareWar", to: target});

    return actions;
}
