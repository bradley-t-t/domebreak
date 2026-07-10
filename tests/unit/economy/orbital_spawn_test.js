// Production-line delivery of orbital assets: sats deploy above the surface, so the
// ground minimum-separation rule that nudges (or refunds) a blocked ground spawn must
// not touch them — they launch onto exactly the parallel the player picked, mirroring
// queueUnit's placement exemption.
import {describe, expect, it} from "vitest";
import {spawnQueuedUnit} from "../../../src/game/sim/tickSpawn.js";

const item = (type, lng, lat) => ({kind: "unit", type, lng, lat, paid: 100});

describe("orbital production delivery", () => {
    it("test_orbital_spawn_ignores_ground_separation_and_keeps_its_spot", () => {
        // Reserved orbit sits directly over a city and a unit — a ground spawn here
        // would be nudged away; the sat must not be.
        const w = {
            _id: 0,
            cities: [{id: "c1", slot: 1, lng: 10, lat: 50, alive: true}],
            units: [{id: "u1", slot: 1, type: "battery", hp: 40, lng: 10, lat: 50}],
        };
        const n = {slot: 0, points: 0};
        spawnQueuedUnit(w, n, item("orbitalstrike", 10, 50));
        const sat = w.units.find((u) => u.slot === 0);
        expect(sat).toBeTruthy();
        expect(sat.lng).toBe(10);
        expect(sat.lat).toBe(50);
        expect(n.points).toBe(0); // no refund
    });

    it("test_ground_spawn_still_nudges_off_a_taken_spot", () => {
        const w = {
            _id: 0,
            cities: [],
            units: [{id: "u1", slot: 0, type: "battery", hp: 40, lng: 10, lat: 50}],
        };
        const n = {slot: 0, points: 0};
        spawnQueuedUnit(w, n, item("silo", 10, 50));
        const silo = w.units.find((u) => u.slot === 0 && u.type === "silo");
        expect(silo).toBeTruthy();
        expect(silo.lng === 10 && silo.lat === 50).toBe(false);
    });
});
