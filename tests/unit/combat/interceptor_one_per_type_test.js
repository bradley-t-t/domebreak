// A single inbound track must draw at most one interceptor per battery TYPE:
// layered defenses of different types (Golden Dome + Aegis) both engage, but two
// identical batteries (two Aegis) never double-commit to the same warhead.
// Deterministic — fixed equatorial geometry, seeded PRNG, no I/O.
import {describe, expect, it} from "vitest";
import {haversine} from "../../../src/game/engine.js";
import {stepCombat} from "../../../src/game/sim/tickPhases.js";

// One inbound ballistic missile (slot 2) diving on a slot-1 city, with the given
// defenders co-located near its mid-flight point so every battery is in range.
// Returns the interceptors launched on a single stepCombat tick.
function engage(defenders) {
    const dist = haversine(30, 0, 0, 0);
    const p = {
        id: "p1", slot: 2, type: "silo", warhead: "standard", evasion: 0, tried: [], targetId: "c1",
        fromLng: 30, fromLat: 0, toLng: 0, toLat: 0, dist,
        speed: 140, progress: 0.5, travelled: 0.5 * dist, lng: 15, lat: 0, altNorm: 0.5,
    };
    const city = {id: "c1", slot: 1, alive: true, lng: 0, lat: 0};
    const w = {
        time: 0, _r: 12345, _id: 0, events: [],
        cities: [city], units: defenders, projectiles: [p], interceptors: [],
    };
    stepCombat(w, 0.03);
    return w.interceptors;
}

const defender = (id, type) => ({id, slot: 1, type, hp: 100, cooldown: 0, lng: 15, lat: 0});

describe("one interceptor per battery type per target", () => {
    it("test_two_aegis_fire_only_once", () => {
        const shots = engage([defender("a1", "aegis"), defender("a2", "aegis")]);
        expect(shots.length).toBe(1);
        expect(shots[0].srcType).toBe("aegis");
    });

    it("test_dome_and_aegis_both_engage", () => {
        const shots = engage([defender("d1", "dome"), defender("a1", "aegis")]);
        expect(shots.length).toBe(2);
        expect(new Set(shots.map((s) => s.srcType))).toEqual(new Set(["dome", "aegis"]));
    });

    it("test_mixed_fleet_dedupes_per_type", () => {
        // Two Aegis, two Domes, one Patriot -> one shot of each distinct type.
        const shots = engage([
            defender("a1", "aegis"), defender("a2", "aegis"),
            defender("d1", "dome"), defender("d2", "dome"),
            defender("p1", "patriot"),
        ]);
        expect(shots.length).toBe(3);
        expect(new Set(shots.map((s) => s.srcType))).toEqual(new Set(["aegis", "dome", "patriot"]));
    });
});
