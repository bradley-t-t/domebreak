// Ground occupation: infantry/tank battalions that hold an enemy city long
// enough capture it, flipping the whole state to the occupier. Territory in
// DomeBreak is a Voronoi partition of living cities (see inTerritory in
// queries.js), so flipping a city's slot transfers its surrounding territory for
// free — this module only has to move ownership. Pure/deterministic (no rng):
// capture is a function of positions, ownership, war state, and dt, so replays
// and headless tests stay stable. See design/gdd/ground-combat-and-occupation.md.
import {haversine} from "../geo/geo.js";
import {CAPTURE, UNITS} from "../data/constants.js";
import {nextId} from "./worldState.js";
import {atWar} from "./queries.js";
import {captureCityLeaders, decapitateNation} from "./leadership.js";

// A unit that can plant the flag: a living capture-flagged ground unit (infantry
// or tank per its UNITS entry).
function isCaptor(u) {
    return u.hp > 0 && UNITS[u.type]?.capture;
}

// Flip every living city sharing the captured city's current owner AND state name
// to the occupier — Trenton's direction: capturing a city takes the whole state/
// province it sits in. Cities keep their hp/pop/econ (occupied, not destroyed) and
// immediately produce for the occupier; income/pop/territory queries read c.slot
// live, so no cache needs touching.
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

// Advance occupation for every capturable city this tick. For each living enemy
// city: if an eligible captor of some hostile-to-owner nation holds within
// holdKm and no unit hostile to that captor sits within contestKm (garrison
// cleared), accrue capture progress toward that captor's slot; otherwise bleed
// progress off. At full progress the city's state flips and a `captured` event
// fires (news headline + sfx).
export function captureTick(w, dt) {
    if (dt <= 0) return;
    for (const c of w.cities) {
        if (!c.alive) {
            c.capture = null;
            continue;
        }
        // Nearest eligible captor to this city that is at war with its owner and
        // inside the hold radius. The nearest holder owns the capture attempt.
        let captor = null, best = Infinity;
        for (const u of w.units) {
            if (!isCaptor(u) || u.slot === c.slot || !atWar(w, u.slot, c.slot)) continue;
            const d = haversine(u.lng, u.lat, c.lng, c.lat);
            if (d <= CAPTURE.holdKm && d < best) {
                best = d;
                captor = u;
            }
        }
        // Decay + drop the tracker when nobody is holding this city.
        if (!captor) {
            if (c.capture) {
                c.capture.progress -= CAPTURE.decayPerSec * dt;
                if (c.capture.progress <= 0) c.capture = null;
            }
            continue;
        }
        // A captor of a different nation than the one already making progress
        // resets the attempt to the newcomer (no shared progress bar).
        if (!c.capture || c.capture.slot !== captor.slot) c.capture = {slot: captor.slot, progress: 0};
        // Contest gate: any unit hostile to the captor within contestKm freezes
        // and bleeds progress — you must clear the garrison before you can hold.
        const contested = w.units.some(
            (u) => u.hp > 0 && atWar(w, captor.slot, u.slot) && haversine(u.lng, u.lat, c.lng, c.lat) <= CAPTURE.contestKm
        );
        if (contested) {
            c.capture.progress = Math.max(0, c.capture.progress - CAPTURE.decayPerSec * dt);
            continue;
        }
        // The nearest captor pressing an assault on this very city (its attack
        // order is set to it) drives the flip faster — boots kicking the door in.
        const assault = captor.targetId === c.id ? (CAPTURE.assaultMult || 1) : 1;
        c.capture.assault = assault > 1; // surfaced in the capture HUD
        c.capture.progress += (dt / CAPTURE.captureSec) * assault;
        if (c.capture.progress >= 1) {
            const toSlot = captor.slot, fromSlot = c.slot;
            w.events.push({
                id: nextId(w, "e"),
                t: w.time,
                type: "captured",
                cityId: c.id,
                state: c.state || "",
                lng: c.lng,
                lat: c.lat,
                slot: toSlot,
                fromSlot
            });
            flipState(w, c, toSlot); // clears c.capture (and the rest of the state's)
        }
    }
    captureBunkers(w, dt);
}

// Ground capture of the Leadership Bunker. Unlike a warhead (which needs a direct
// thermonuclear hit), enemy infantry that hold the bunker uncontested long enough
// SEIZE national command — instantly and totally decapitating its owner, no matter
// how its leaders were dispersed. The owner then surrenders and is eliminated
// (warResolution.decapitationTick). Mirrors the city-capture loop above (same hold/
// contest/assault tuning) but tracks progress on the bunker unit's own `capture`
// field. Pure/deterministic — a function of positions, ownership, and dt.
function captureBunkers(w, dt) {
    for (const b of w.units) {
        if (b.type !== "bunker" || b.hp <= 0) continue;
        let captor = null, best = Infinity;
        for (const u of w.units) {
            if (!isCaptor(u) || u.slot === b.slot || !atWar(w, u.slot, b.slot)) continue;
            const d = haversine(u.lng, u.lat, b.lng, b.lat);
            if (d <= CAPTURE.holdKm && d < best) {
                best = d;
                captor = u;
            }
        }
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
        const contested = w.units.some(
            (u) => u.id !== b.id && u.hp > 0 && atWar(w, captor.slot, u.slot) && haversine(u.lng, u.lat, b.lng, b.lat) <= CAPTURE.contestKm
        );
        if (contested) {
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
