// The C-RAM is a continuous-fire gun, not a one-shot battery: it stays on a
// single track, firing again every reload until the round dies or leaves its
// short envelope. A missile battery, by contrast, commits one interceptor per
// track and never re-engages it. Deterministic — fixed geometry, seeded PRNG.
import {describe, expect, it} from "vitest";
import {haversine} from "../../../src/game/engine.js";
import {stepCombat} from "../../../src/game/sim/tickPhases.js";

// One inbound round ~111 km from a slot-1 defender (inside the C-RAM's 150 km
// reach and the battery's 320 km reach), diving on a slot-1 city.
function scenario(defenders) {
    const dist = haversine(1, 0, 0, 0);
    const p = {
        id: "p1", slot: 2, type: "silo", warhead: "standard", evasion: 0, tried: [], targetId: "c1",
        fromLng: 1, fromLat: 0, toLng: 0, toLat: 0, dist,
        speed: 140, progress: 0.5, travelled: 0.5 * dist, lng: 1, lat: 0, altNorm: 0.5,
    };
    const city = {id: "c1", slot: 1, alive: true, lng: 0, lat: 0};
    return {
        time: 0, _r: 12345, _id: 0, events: [],
        cities: [city], units: defenders, projectiles: [p], interceptors: [],
    };
}

const defender = (id, type) => ({id, slot: 1, type, hp: 100, cooldown: 0, lng: 0, lat: 0});

// Advance one engage tick, then clear the reload so the next tick is gated only
// by the one-shot flags — isolating re-engagement from firing cadence.
function tickReloaded(w) {
    stepCombat(w, 0.03);
    for (const d of w.units) d.cooldown = 0;
}

describe("C-RAM continuous fire", () => {
    it("test_gun_re_engages_the_same_track_every_reload", () => {
        const w = scenario([defender("g1", "cram")]);
        tickReloaded(w);
        tickReloaded(w);
        tickReloaded(w);
        // Three reloads, three tracers hosed at the one track — not a single burst.
        expect(w.interceptors.length).toBe(3);
        expect(new Set(w.interceptors.map((it) => it.srcType))).toEqual(new Set(["cram"]));
        // A gun never records the one-shot flags, which is what lets it re-engage.
        expect(w.projectiles[0].tried).toEqual([]);
    });

    it("test_missile_battery_still_fires_only_once_at_a_track", () => {
        const w = scenario([defender("b1", "battery")]);
        tickReloaded(w);
        tickReloaded(w);
        tickReloaded(w);
        // One-shot: committed a single interceptor and never re-engaged the track.
        expect(w.interceptors.length).toBe(1);
        expect(w.projectiles[0].tried).toContain("b1");
    });

    it("test_gun_stays_silent_against_a_track_outside_its_envelope", () => {
        // Same short 150 km reach: a round ~166 km out (defender at 2 deg vs the
        // track's ~0.5 deg midpoint) is beyond the gun, so it never opens up.
        const w = scenario([defender("g1", "cram")]);
        w.units[0].lng = 2;
        tickReloaded(w);
        tickReloaded(w);
        expect(w.interceptors.length).toBe(0);
    });
});
