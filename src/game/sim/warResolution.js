// War resolution: the three ways a war ends — Victory, Defeat, White Peace.
//
// Occupation (sim/occupation.js) flips a city's `slot` to whoever holds it the
// moment it's captured, mid-war. This module decides whether those flips STICK or
// REVERT when the war ends. Each city carries `owner0` (its match-start owner), so
// "occupied" ≡ `slot !== owner0`. Pure/deterministic — territory moves are a
// function of ownership only; every RNG roll stays in tick.js's seeded stream.
import {DIPLOMACY, STABILITY} from "../data/constants.js";
import {nationOf, nextId} from "./worldState.js";
import {atWar} from "./queries.js";
import {formAlliance, makePeace} from "./production.js";
import {countBy} from "../../lib/iter.js";
import {evaluatePeaceOffer} from "./ai/diplomacy/peace.js";
import {evaluateAllianceOffer} from "./ai/diplomacy/alliance.js";
import {recordAllianceFormed, recordPeaceDeclined, recordWarEnd} from "./ai/diplomacy/ledger.js";

// A city's original owner (fallback to current slot for legacy saves predating owner0).
const origin = (c) => c.owner0 ?? c.slot;

// Legacy saves may not carry the queues; make sure they exist before we touch them.
function ensureWar(w) {
    if (!w.warPopups) w.warPopups = [];
    if (!w.pendingPeace) w.pendingPeace = [];
    if (!w.pendingAlliance) w.pendingAlliance = [];
}

// Alliances a nation currently holds.
function allyCount(n) {
    let k = 0;
    for (const s in n.relations) if (n.relations[s] === "ally") k++;
    return k;
}

// Cities each slot counts as its baseline (by owner0). Cached until the next war
// settlement — endWar invalidates on Victory so ceded cities move to the new owner's
// baseline instead of leaving the loser's denominator permanently inflated.
function startCounts(w) {
    if (w._startOwner) return w._startOwner;
    const m = {};
    for (const [k, v] of countBy(w.cities, origin)) m[k] = v;
    w._startOwner = m;
    return m;
}

// Move every city contested BETWEEN a and b: winner != null → to the winner (Victory —
// the winner keeps all it occupied and the loser cedes); winner == null → back to its
// origin owner (White Peace — both give back what they took from each other). Only
// occupied cities whose {origin, holder} pair is exactly {a, b} are touched — homeland
// and third-party occupations are left alone. On Victory the ceded city's owner0 is
// rewritten to the winner so it counts toward the winner's post-war baseline (and no
// longer against the loser's), keeping surrender math honest across future wars.
function settleTerritory(w, a, b, winner) {
    for (const c of w.cities) {
        if (!c.alive) continue;
        const o = origin(c);
        if (c.slot === o) continue;                                    // homeland, not occupied
        const pair = (o === a && c.slot === b) || (o === b && c.slot === a);
        if (!pair) continue;
        c.slot = winner == null ? o : winner;
        if (winner != null) c.owner0 = winner;                         // spoils rebaseline to the new owner
        c.capture = null;                                              // cancel any in-progress capture
    }
}

// Record a war loss on the loser — a decaying stability penalty read by
// sim/stability.js. Only the timestamp is stored; the magnitude/duration come from
// STABILITY at eval time so no tuning number is baked into saved state.
function applyDefeat(w, slot) {
    const n = nationOf(w, slot);
    if (!n) return;
    (n.defeatPenalties || (n.defeatPenalties = [])).push({t0: w.time});
}

// Enqueue a player-facing popup for a resolution/offer — ONLY when the player is a
// belligerent (AI-vs-AI resolves silently). kind: victory | defeat | whitepeace.
function enqueueOutcome(w, a, b, winner) {
    const me = w.mySlot;
    if (a !== me && b !== me) return;
    const foe = a === me ? b : a;
    const kind = winner == null ? "whitepeace" : winner === me ? "victory" : "defeat";
    w.warPopups.push({id: nextId(w, "e"), kind, foe});
}

function hasOffer(w, from, to) {
    return w.pendingPeace.some((o) => o.from === from && o.to === to);
}

// Drop any pending offer + offer-popup between a and b (their war is settling/settled).
function dropOffers(w, a, b) {
    w.pendingPeace = w.pendingPeace.filter(
        (o) => !((o.from === a && o.to === b) || (o.from === b && o.to === a))
    );
    w.warPopups = w.warPopups.filter((p) => !(p.kind === "offer" && (p.foe === a || p.foe === b)));
}

// End the war between a and b. winner == null → White Peace (territory reverts, no
// penalty). winner == slot → Victory for that side / Defeat for the other (winner takes
// all it occupied, loser cedes and eats the Defeat penalty). opts.popup=false suppresses
// the outcome popup (used when the player just chose the outcome themselves). No-op if
// they aren't actually at war.
export function endWar(w, a, b, winner = null, opts = {}) {
    ensureWar(w);
    if (!atWar(w, a, b)) return {error: "Not at war."};
    recordWarEnd(w, a, b, winner);         // both sides' diplomatic ledgers remember this war
    makePeace(w, a, b);                    // clear the war relation + _warStart (no event)
    dropOffers(w, a, b);
    settleTerritory(w, a, b, winner);
    if (winner != null) {
        w._startOwner = null;              // owner0 changed on ceded cities — rebuild the baseline cache
        const loser = winner === a ? b : a;
        applyDefeat(w, loser);
        w.events.push({id: nextId(w, "e"), t: w.time, type: "conquest", winner, loser});
    } else {
        w.events.push({id: nextId(w, "e"), t: w.time, type: "peace", a, b});
    }
    if (opts.popup !== false) enqueueOutcome(w, a, b, winner);
    return {ok: true};
}

// Would this AI accept a white peace with `foe` right now? The decision lives
// in the AI's diplomacy layer (war-lifecycle state, damage ledger, personality)
// — see ai/diplomacy/peace.js.
const aiAcceptsPeace = (w, ai, foe) => evaluatePeaceOffer(w, ai, foe);

// A white-peace offer from `from` to `to`. If `to` is an AI it decides immediately; if
// `to` is the player, a pending offer is recorded and (when it's the local player) an
// Accept/Decline popup is raised.
export function offerPeace(w, from, to) {
    ensureWar(w);
    if (!atWar(w, from, to)) return {error: "Not at war."};
    const target = nationOf(w, to);
    if (!target) return {error: "No such power."};
    if (!target.isAi) {                                // offered TO a human → ask
        if (hasOffer(w, from, to)) return {ok: true};  // already pending
        const src = nationOf(w, from);
        if (src?.isAi) src._peaceToPlayerAt = w.time;  // starts the cooldown checked in diploOfferPeace
        w.pendingPeace.push({from, to, t: w.time});
        if (to === w.mySlot) w.warPopups.push({id: nextId(w, "e"), kind: "offer", foe: from});
        return {ok: true};
    }
    if (aiAcceptsPeace(w, to, from)) return endWar(w, from, to, null);
    if (from === w.mySlot) w.warPopups.push({id: nextId(w, "e"), kind: "refused", foe: to});
    return {ok: false, refused: true};
}

// The local player answers an AI's white-peace offer. accept → White Peace; decline →
// the offer is dropped and the war continues.
export function respondPeace(w, player, foe, accept) {
    ensureWar(w);
    const idx = w.pendingPeace.findIndex((o) => o.from === foe && o.to === player);
    w.pendingPeace = w.pendingPeace.filter((_, i) => i !== idx);
    w.warPopups = w.warPopups.filter((p) => !(p.kind === "offer" && p.foe === foe));
    if (idx < 0 || !accept) {
        if (idx >= 0 && !accept) {                     // declined — extend the AI's cooldown from now
            const src = nationOf(w, foe);
            if (src?.isAi) src._peaceToPlayerAt = w.time;
            recordPeaceDeclined(w, foe, player);       // the offerer remembers being refused
        }
        return {ok: true, declined: !accept};
    }
    if (!atWar(w, player, foe)) return {ok: true};     // war already ended elsewhere
    return endWar(w, foe, player, null, {popup: false});
}

// --- Alliances: proposal / answer flow (mirrors the white-peace one above). ---

// Would this AI accept an alliance proposed by `from`? The decision lives in
// the AI's diplomacy layer (shared enemies, strength, loyalty, the backstab
// ledger) — see ai/diplomacy/alliance.js.
const aiAcceptsAlliance = (w, ai, from) => evaluateAllianceOffer(w, ai, from);

// An alliance proposal from `from` to `to`. If `to` is an AI it decides immediately
// (forming the pact or refusing); if `to` is the player, a pending offer is recorded
// and (for the local player) an Accept/Decline popup is raised.
export function proposeAlliance(w, from, to) {
    ensureWar(w);
    const a = nationOf(w, from), b = nationOf(w, to);
    if (!a || !b || from === to) return {error: "Invalid order."};
    if (a.relations[to] === "ally") return {error: "Already allied."};
    if (atWar(w, from, to)) return {error: "You are at war with them."};
    if (allyCount(a) >= DIPLOMACY.maxAllies) return {error: "You already hold the maximum alliances."};
    if (!b.isAi) {                                      // proposed TO a human → ask
        if (w.pendingAlliance.some((o) => o.from === from && o.to === to)) return {ok: true};
        if (a.isAi) a._allianceToPlayerAt = w.time;     // starts the cooldown checked in diploProposeAlliance
        w.pendingAlliance.push({from, to, t: w.time});
        if (to === w.mySlot) w.warPopups.push({id: nextId(w, "e"), kind: "ally-offer", foe: from});
        return {ok: true};
    }
    if (aiAcceptsAlliance(w, to, from)) {
        const r = formAlliance(w, from, to);
        if (r.ok) {
            recordAllianceFormed(w, from, to);
            if (from === w.mySlot) w.warPopups.push({id: nextId(w, "e"), kind: "ally-formed", foe: to});
        }
        return r;
    }
    if (from === w.mySlot) w.warPopups.push({id: nextId(w, "e"), kind: "ally-refused", foe: to});
    return {ok: false, refused: true};
}

// The local player answers an AI's alliance proposal. accept → the pact forms
// (unless a war has broken out since); decline → the offer is dropped.
export function respondAlliance(w, player, from, accept) {
    ensureWar(w);
    const idx = w.pendingAlliance.findIndex((o) => o.from === from && o.to === player);
    w.pendingAlliance = w.pendingAlliance.filter((_, i) => i !== idx);
    w.warPopups = w.warPopups.filter((p) => !(p.kind === "ally-offer" && p.foe === from));
    if (idx < 0 || !accept) {
        if (idx >= 0 && !accept) {                     // declined — extend the AI's cooldown from now
            const src = nationOf(w, from);
            if (src?.isAi) src._allianceToPlayerAt = w.time;
        }
        return {ok: true, declined: !accept};
    }
    if (atWar(w, player, from)) return {ok: true};     // relations changed since the offer
    const r = formAlliance(w, from, player);
    if (r.ok) recordAllianceFormed(w, from, player);
    return r;
}

// Knock a routed belligerent out of the match. It becomes a passive NEUTRAL
// (active = false — exactly like a non-participant) but stays on the map as
// capturable territory, and carries a `wipedOut` flag so it reads as defeated-in-war
// rather than a born neutral (the map tints its remnant land a darker wipeout grey).
// Neutralizing it is what stops the "keeps surrendering" loop: nobody targets an
// inactive nation (perception excludes them) and warTick skips it, so stray fallout
// or in-flight strikes that keep it below the floor can't drag it into a new war and
// re-surrender it. Idempotent.
function wipeOut(w, n) {
    if (n.active === false && n.wipedOut) return;
    n.active = false;
    n.wipedOut = true;
}

// Auto-surrender pass (every tick): any belligerent — AI or player — whose surviving-
// city fraction has dropped below DIPLOMACY.surrenderThreshold capitulates in every war
// it's fighting; the foe wins. One O(cities) alive-count pass, then a scan of each
// nation's ≤maxWars relations. atWar is re-checked before each resolution so a single
// tick can't double-end the same war. A routed AI that actually capitulates is then
// neutralized (wipeOut) so it's out of the war game for good; the human commander is
// never auto-neutralized — they keep fighting their remnant (and the victory check
// assumes the local player stays an active belligerent).
export function warTick(w) {
    ensureWar(w);
    const start = startCounts(w);
    const aliveBy = {};
    for (const c of w.cities) if (c.alive) aliveBy[c.slot] = (aliveBy[c.slot] || 0) + 1;
    for (const n of w.nations) {
        if (!n.alive || n.active === false) continue;   // neutrals aren't belligerents — they never surrender
        if ((aliveBy[n.slot] || 0) / (start[n.slot] || 1) >= DIPLOMACY.surrenderThreshold) continue;
        let capitulated = false;
        for (const s in n.relations) {
            if (n.relations[s] !== "war") continue;
            const foe = +s;
            if (!atWar(w, n.slot, foe)) continue;      // may have ended earlier this pass
            endWar(w, foe, n.slot, foe);               // foe wins, n loses (Defeat)
            capitulated = true;
        }
        if (capitulated && n.isAi) wipeOut(w, n);      // routed AI leaves the match as a neutral wreck
    }
}

// Decapitation defeat (every tick): a nation whose entire leadership pool has been
// wiped out (lost >= total — killed in its cities/transports, its bunker destroyed
// by a thermonuclear strike, or the bunker captured) can no longer command. It
// capitulates in every war it's fighting (each foe scores a Victory and takes what
// it occupied) and is eliminated from the match. Runs AFTER reconcileLeadership has
// finalized this tick's losses and after warTick, before the win check. Neutrals
// (never belligerents) and nations without a leadership pool are skipped.
export function decapitationTick(w) {
    ensureWar(w);
    for (const n of w.nations) {
        if (!n.alive || n.active === false || !n.lead || !n.lead.total) continue;
        if (n.lead.lost < n.lead.total) continue;      // command still stands
        for (const s in n.relations) {
            if (n.relations[s] !== "war") continue;
            const foe = +s;
            if (!atWar(w, n.slot, foe)) continue;      // may have ended earlier this pass
            endWar(w, foe, n.slot, foe);               // foe wins, n loses (Defeat)
        }
        n.alive = false;                                // eliminated — command decapitated
        n.wipedOut = true;                              // tint its remnant land as a wipeout, like a routed surrender
        w.events.push({id: nextId(w, "e"), t: w.time, type: "conquest", loser: n.slot, decapitated: 1});
    }
}

// Remove a resolved popup from the queue (the modal's Continue action).
export function dismissWarPopup(w, id) {
    ensureWar(w);
    w.warPopups = w.warPopups.filter((p) => p.id !== id);
    return {ok: true};
}
