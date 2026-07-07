// War resolution: the three ways a war ends — Victory, Defeat, White Peace.
// See design/gdd/war-resolution.md.
//
// Occupation (sim/occupation.js) flips a city's `slot` to whoever holds it the
// moment it's captured, mid-war. This module decides whether those flips STICK or
// REVERT when the war ends. Each city carries `owner0` (its match-start owner), so
// "occupied" ≡ `slot !== owner0`. Pure/deterministic — territory moves are a
// function of ownership only; every RNG roll stays in tick.js's seeded stream.
import {DIPLOMACY, STABILITY} from "../data/constants.js";
import {nationOf, nextId} from "./worldState.js";
import {atWar} from "./queries.js";
import {makePeace} from "./production.js";

// A city's original owner (fallback to current slot for legacy saves predating owner0).
const origin = (c) => c.owner0 ?? c.slot;

// Legacy saves may not carry the queues; make sure they exist before we touch them.
function ensureWar(w) {
    if (!w.warPopups) w.warPopups = [];
    if (!w.pendingPeace) w.pendingPeace = [];
}

// Cities each slot owned at match start (by owner0) — static over a match, so cached.
function startCounts(w) {
    if (w._startOwner) return w._startOwner;
    const m = {};
    for (const c of w.cities) {
        const o = origin(c);
        m[o] = (m[o] || 0) + 1;
    }
    w._startOwner = m;
    return m;
}

// Living cities a slot holds right now.
function aliveCount(w, slot) {
    let k = 0;
    for (const c of w.cities) if (c.alive && c.slot === slot) k++;
    return k;
}

// Surviving-city fraction: living holdings over the match-start holding count.
const survivingFrac = (w, slot) => aliveCount(w, slot) / (startCounts(w)[slot] || 1);

// Move every city contested BETWEEN a and b: winner != null → to the winner (Victory —
// the winner keeps all it occupied and the loser cedes); winner == null → back to its
// origin owner (White Peace — both give back what they took from each other). Only
// occupied cities whose {origin, holder} pair is exactly {a, b} are touched — homeland
// and third-party occupations are left alone.
function settleTerritory(w, a, b, winner) {
    for (const c of w.cities) {
        if (!c.alive) continue;
        const o = origin(c);
        if (c.slot === o) continue;                                    // homeland, not occupied
        const pair = (o === a && c.slot === b) || (o === b && c.slot === a);
        if (!pair) continue;
        c.slot = winner == null ? o : winner;
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
    makePeace(w, a, b);                    // clear the war relation + _warStart (no event)
    dropOffers(w, a, b);
    settleTerritory(w, a, b, winner);
    if (winner != null) {
        const loser = winner === a ? b : a;
        applyDefeat(w, loser);
        w.events.push({id: nextId(w, "e"), t: w.time, type: "conquest", winner, loser});
    } else {
        w.events.push({id: nextId(w, "e"), t: w.time, type: "peace", a, b});
    }
    if (opts.popup !== false) enqueueOutcome(w, a, b, winner);
    return {ok: true};
}

// Would this AI accept a white peace with `foe` right now? Yes once the war is old,
// or whenever it isn't clearly winning (its surviving fraction ≤ the foe's).
function aiAcceptsPeace(w, ai, foe) {
    const age = w.time - (nationOf(w, ai)?._warStart?.[foe] ?? 0);
    if (age > DIPLOMACY.minWarSec) return true;
    return survivingFrac(w, ai) <= survivingFrac(w, foe);
}

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
    if (idx < 0 || !accept) return {ok: true, declined: !accept};
    if (!atWar(w, player, foe)) return {ok: true};     // war already ended elsewhere
    return endWar(w, foe, player, null, {popup: false});
}

// Auto-surrender pass (every tick): any belligerent — AI or player — whose surviving-
// city fraction has dropped below DIPLOMACY.surrenderThreshold capitulates in every war
// it's fighting; the foe wins. One O(cities) alive-count pass, then a scan of each
// nation's ≤maxWars relations. atWar is re-checked before each resolution so a single
// tick can't double-end the same war.
export function warTick(w) {
    ensureWar(w);
    const start = startCounts(w);
    const aliveBy = {};
    for (const c of w.cities) if (c.alive) aliveBy[c.slot] = (aliveBy[c.slot] || 0) + 1;
    for (const n of w.nations) {
        if (!n.alive) continue;
        if ((aliveBy[n.slot] || 0) / (start[n.slot] || 1) >= DIPLOMACY.surrenderThreshold) continue;
        for (const s in n.relations) {
            if (n.relations[s] !== "war") continue;
            const foe = +s;
            if (!atWar(w, n.slot, foe)) continue;      // may have ended earlier this pass
            endWar(w, foe, n.slot, foe);               // foe wins, n loses (Defeat)
        }
    }
}

// Remove a resolved popup from the queue (the modal's Continue action).
export function dismissWarPopup(w, id) {
    ensureWar(w);
    w.warPopups = w.warPopups.filter((p) => p.id !== id);
    return {ok: true};
}
