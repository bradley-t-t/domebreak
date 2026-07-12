// Ground occupation: infantry/tank battalions that hold an enemy city long enough
// capture it, flipping the whole state to the occupier. Territory is a Voronoi
// partition of living cities (see inTerritory in queries.js), so flipping a city's
// slot transfers its surrounding territory for free. Pure/deterministic: capture
// is a function of positions, ownership, war state, and dt.
import {haversine, withinKm} from "../geo/geo.js";
import {CAPTURE, NEUTRAL, UNITS} from "../data/constants.js";
import {nationOf, nextId} from "./worldState.js";
import {atWar, bordersTerritory, neutralSlotSet} from "./queries.js";
import {captureCityLeaders, decapitateNation} from "./leadership.js";

// A unit that can plant the flag: a living capture-flagged ground unit (infantry
// or tank per its UNITS entry).
function isCaptor(u) {
    return u.hp > 0 && UNITS[u.type]?.capture;
}

// The nearest living captor to (lng, lat) that is at war with `slot` and inside
// the hold radius — the unit that owns the capture attempt on that spot.
function nearestCaptor(w, captors, slot, lng, lat) {
    let captor = null, best = Infinity;
    for (const u of captors) {
        if (u.hp <= 0 || u.slot === slot || !atWar(w, u.slot, slot)) continue;
        if (!withinKm(u.lng, u.lat, lng, lat, CAPTURE.holdKm)) continue;
        const d = haversine(u.lng, u.lat, lng, lat);
        if (d < best) {
            best = d;
            captor = u;
        }
    }
    return captor;
}

// True when any unit hostile to `captorSlot` (other than `selfId`) still stands
// within the contest radius of (lng, lat) — the garrison check that freezes a
// capture attempt.
function contestedAt(w, captorSlot, lng, lat, selfId) {
    for (const u of w.units) {
        if (u.hp <= 0 || u.id === selfId || !atWar(w, captorSlot, u.slot)) continue;
        if (withinKm(u.lng, u.lat, lng, lat, CAPTURE.contestKm)) return true;
    }
    return false;
}

// Flip every living city sharing the captured city's current owner AND state name
// to the occupier — capturing a city takes the whole state/province it sits in.
// Cities keep their hp/pop/econ (occupied, not destroyed) and immediately produce
// for the occupier; income/pop/territory queries read c.slot live, so no cache
// needs touching.
function flipState(w, city, toSlot) {
    const fromSlot = city.slot, state = city.state || "";
    for (const c of w.cities) {
        if (c.alive && c.slot === fromSlot && (c.state || "") === state) {
            // Exposed leaders don't change hands — capturing a leader city kills its
            // command just as destroying it would (credited to the losing owner
            // BEFORE the slot flips).
            captureCityLeaders(w, c);
            c.slot = toSlot;
            c.capture = null;
        }
    }
}

// Advance occupation for every capturable city this tick. Each living city is one
// of two kinds: an enemy city (owned by an active nation you're at war with) is
// CAPTURED by a hostile captor; a passive neutral city bordering an active nation
// is ANNEXED without any war. Both hold-and-flip the same way — same capture ring,
// progress HUD, and state flip — so they route through captureCity / annexCity
// below. At full progress the state flips and a `captured` event fires.
export function captureTick(w, dt) {
    if (dt <= 0) return;
    // The world's capture-capable ground units, gathered once. Every proximity
    // test below runs against this handful — a per-city inner loop over ALL
    // units is an O(cities x units) fixed tax every tick, war or no war. With
    // no captors fielded anywhere the pass reduces to the progress-decay sweep.
    const captors = w.units.filter(isCaptor);
    const neutral = neutralSlotSet(w);
    for (const c of w.cities) {
        if (!c.alive) {
            c.capture = null;
            continue;
        }
        if (neutral.has(c.slot)) annexCity(w, c, dt, captors);
        else captureCity(w, c, dt, captors);
    }
    captureBunkers(w, dt, captors);
}

// War capture of one enemy city: if an eligible captor of a nation at war with the
// owner holds within holdKm and no hostile unit contests within contestKm, accrue
// progress toward that captor's slot (assaulting the city drives it assaultMult
// faster); otherwise bleed it off. At full progress the state flips to the occupier.
function captureCity(w, c, dt, captors) {
    // Nearest eligible captor to this city that is at war with its owner and
    // inside the hold radius. The nearest holder owns the capture attempt.
    const captor = captors.length ? nearestCaptor(w, captors, c.slot, c.lng, c.lat) : null;
    // Decay + drop the tracker when nobody is holding this city.
    if (!captor) {
        if (c.capture) {
            c.capture.progress -= CAPTURE.decayPerSec * dt;
            if (c.capture.progress <= 0) c.capture = null;
        }
        return;
    }
    // A captor of a different nation than the one already making progress
    // resets the attempt to the newcomer (no shared progress bar).
    if (!c.capture || c.capture.slot !== captor.slot) c.capture = {slot: captor.slot, progress: 0};
    // Contest gate: any unit hostile to the captor within contestKm freezes
    // and bleeds progress — you must clear the garrison before you can hold.
    if (contestedAt(w, captor.slot, c.lng, c.lat, null)) {
        c.capture.progress = Math.max(0, c.capture.progress - CAPTURE.decayPerSec * dt);
        return;
    }
    // The nearest captor pressing an assault on this very city (its attack
    // order is set to it) drives the flip faster — boots kicking the door in.
    const assault = captor.targetId === c.id ? (CAPTURE.assaultMult || 1) : 1;
    c.capture.assault = assault > 1; // surfaced in the capture HUD
    c.capture.progress += (dt / CAPTURE.captureSec) * assault;
    if (c.capture.progress >= 1) flipCaptured(w, c, captor.slot, {});
}

// Peaceful annexation of one passive neutral city. Mirrors captureCity but needs
// no war: a capture-flagged ground unit of an ACTIVE nation that holds the city
// (within holdKm) takes it over annexSec — provided that nation already borders
// the city (bordersTerritory, the adjacency gate) so conquest only spreads into
// neutral land touching your own. A rival active nation's captor within contestKm
// freezes the claim, so two powers can't both absorb the same statelet at once.
function annexCity(w, c, dt, captors) {
    const captor = captors.length ? nearestAnnexer(w, captors, c) : null;
    if (!captor) {
        if (c.capture) {
            c.capture.progress -= CAPTURE.decayPerSec * dt;
            if (c.capture.progress <= 0) c.capture = null;
        }
        return;
    }
    if (!c.capture || c.capture.slot !== captor.slot) c.capture = {slot: captor.slot, progress: 0, annex: true};
    if (annexContestedAt(w, captor.slot, c.lng, c.lat)) {
        c.capture.progress = Math.max(0, c.capture.progress - CAPTURE.decayPerSec * dt);
        return;
    }
    c.capture.progress += dt / NEUTRAL.annexSec;
    if (c.capture.progress >= 1) flipCaptured(w, c, captor.slot, {annex: 1});
}

// Fire the takeover event for city c and flip its whole state to `toSlot`. Shared
// by war capture and neutral annexation; `extra` tags the event (annex vs capture)
// so the news ticker can word it correctly.
function flipCaptured(w, c, toSlot, extra) {
    w.events.push({
        id: nextId(w, "e"),
        t: w.time,
        type: "captured",
        cityId: c.id,
        state: c.state || "",
        lng: c.lng,
        lat: c.lat,
        slot: toSlot,
        fromSlot: c.slot,
        ...extra,
    });
    flipState(w, c, toSlot); // clears c.capture (and the rest of the state's)
}

// The nearest capture-flagged unit of an ACTIVE nation holding neutral city c that
// is eligible to annex it (its nation borders the city). Null when none qualifies.
function nearestAnnexer(w, captors, c) {
    let captor = null, best = Infinity;
    for (const u of captors) {
        if (u.hp <= 0 || u.slot === c.slot) continue;
        const n = nationOf(w, u.slot);
        if (!n || n.active === false) continue; // only active nations annex
        if (!withinKm(u.lng, u.lat, c.lng, c.lat, CAPTURE.holdKm)) continue;
        if (!bordersTerritory(w, u.slot, c.lng, c.lat, NEUTRAL.annexBorderKm)) continue;
        const d = haversine(u.lng, u.lat, c.lng, c.lat);
        if (d < best) { best = d; captor = u; }
    }
    return captor;
}

// A rival active nation's captor contesting the same neutral city within contestKm.
function annexContestedAt(w, slot, lng, lat) {
    for (const u of w.units) {
        if (u.hp <= 0 || u.slot === slot || !isCaptor(u)) continue;
        const n = nationOf(w, u.slot);
        if (!n || n.active === false) continue;
        if (withinKm(u.lng, u.lat, lng, lat, CAPTURE.contestKm)) return true;
    }
    return false;
}

// Ground capture of the Leadership Bunker. Unlike a warhead (which needs a direct
// thermonuclear hit), enemy infantry that hold the bunker uncontested long enough
// SEIZE national command — instantly and totally decapitating its owner, no matter
// how its leaders were dispersed. The owner then surrenders and is eliminated
// (warResolution.decapitationTick). Mirrors the city-capture loop above (same hold/
// contest/assault tuning) but tracks progress on the bunker unit's own `capture`
// field. Pure/deterministic — a function of positions, ownership, and dt.
function captureBunkers(w, dt, captors) {
    for (const b of w.units) {
        if (b.type !== "bunker" || b.hp <= 0) continue;
        const captor = captors.length ? nearestCaptor(w, captors, b.slot, b.lng, b.lat) : null;
        if (!captor) {
            if (b.capture) {
                b.capture.progress -= CAPTURE.decayPerSec * dt;
                if (b.capture.progress <= 0) b.capture = null;
            }
            continue;
        }
        if (!b.capture || b.capture.slot !== captor.slot) b.capture = {slot: captor.slot, progress: 0};
        // Garrison contest — the bunker itself doesn't count (it can't defend its own
        // capture), only OTHER hostile units still standing near it.
        if (contestedAt(w, captor.slot, b.lng, b.lat, b.id)) {
            b.capture.progress = Math.max(0, b.capture.progress - CAPTURE.decayPerSec * dt);
            continue;
        }
        const assault = captor.targetId === b.id ? (CAPTURE.assaultMult || 1) : 1;
        b.capture.assault = assault > 1;
        b.capture.progress += (dt / CAPTURE.captureSec) * assault;
        if (b.capture.progress >= 1) {
            const fromSlot = b.slot;
            w.events.push({
                id: nextId(w, "e"), t: w.time, type: "captured", kind: "bunker",
                unitId: b.id, bunker: 1, lng: b.lng, lat: b.lat, slot: captor.slot, fromSlot
            });
            decapitateNation(w, fromSlot); // seizing command ends the nation
            b.capture = null;
            b.hp = 0;                       // the bunker itself falls with its command
        }
    }
}
