// The Leadership Bunker is hardened: ONLY a direct hit from a thermonuclear-class
// warhead (LEADERSHIP.bunkerKillWarheads) destroys it. Every other warhead, the
// blast wave, fallout, and ground fire all bounce off. Deterministic — no RNG, no
// I/O. Regression guard for the "bunker only falls to a direct thermo hit" rule.
import {describe, expect, it} from "vitest";
import {createWorld, step} from "../../../src/game/engine.js";
import {directFire, findTarget, resolveHit, spawnFallout} from "../../../src/game/sim/combat.js";

// Minimal world with the fields resolveHit/directFire/applyBlast touch.
function miniWorld(cities = [], units = []) {
    return {time: 0, _id: 0, cities, units, effects: [], events: []};
}
const bunker = (over = {}) => ({id: "b", slot: 1, type: "bunker", hp: 220, lng: 5, lat: 6, ...over});

describe("bunker survivability — direct hits", () => {
    it("test_direct_thermo_hit_destroys_the_bunker", () => {
        const b = bunker();
        const w = miniWorld([], [b]);
        resolveHit(w, {warhead: "thermo", targetId: "b", damage: 30, slot: 0, toLng: 5, toLat: 6});
        expect(b.hp).toBe(0);
        expect(w.events.some((e) => e.type === "destroy" && e.bunker && e.cityId === "b")).toBe(true);
    });

    it("test_direct_thermomirv_hit_destroys_the_bunker", () => {
        const b = bunker();
        const w = miniWorld([], [b]);
        resolveHit(w, {warhead: "thermomirv", targetId: "b", damage: 10, slot: 0, toLng: 5, toLat: 6});
        expect(b.hp).toBe(0);
    });

    it("test_direct_conventional_hit_is_deflected", () => {
        const b = bunker();
        const w = miniWorld([], [b]);
        // Damage far exceeds hp — it still bounces off, because it isn't thermonuclear.
        resolveHit(w, {warhead: "standard", targetId: "b", damage: 9999, slot: 0, toLng: 5, toLat: 6});
        expect(b.hp).toBe(220);
        expect(w.events.some((e) => e.type === "hit" && e.bunker && e.shielded)).toBe(true);
    });

    it("test_direct_hgv_hit_is_deflected", () => {
        const b = bunker();
        const w = miniWorld([], [b]);
        resolveHit(w, {warhead: "hgv", targetId: "b", damage: 9999, slot: 0, toLng: 5, toLat: 6});
        expect(b.hp).toBe(220);
    });

    it("test_ground_fire_is_deflected", () => {
        const b = bunker();
        const w = miniWorld([], [b]);
        directFire(w, {slot: 0, type: "infantry", lng: 5, lat: 6}, findTarget(w, "b"));
        expect(b.hp).toBe(220);
        expect(w.events.some((e) => e.type === "hit" && e.bunker && e.shielded)).toBe(true);
    });
});

describe("bunker survivability — area effects", () => {
    it("test_thermo_blast_on_a_neighbor_does_not_scratch_the_bunker", () => {
        // A thermo (blastKm 170) lands on a city ~11 km from the bunker: the city and
        // any nearby units eat blast, but the bunker is blast-proof.
        const b = bunker({lng: 5.1, lat: 6});
        const w = miniWorld([{id: "c", slot: 1, hp: 100, maxHp: 100, alive: true, lng: 5, lat: 6}], [b]);
        resolveHit(w, {warhead: "thermo", targetId: "c", damage: 200, slot: 0, toLng: 5, toLat: 6});
        expect(w.cities[0].alive).toBe(false);  // the city is glassed
        expect(b.hp).toBe(220);                  // the bunker is not
    });

    it("test_fallout_never_damages_the_bunker", () => {
        // Full tick with a fallout cloud sitting on top of the bunker: a normal unit
        // at ground zero is irradiated, the bunker is untouched.
        const w = createWorld({
            mySlot: 0, seed: 1,
            nations: [{slot: 0, name: "A", iso: "AAA", gdp: 10}, {slot: 1, name: "B", iso: "BBB", gdp: 10}],
            cities: [
                {id: "a", slot: 0, name: "A", cap: 1, pop: 1e6, econ: 0.5, lng: 40, lat: 0},
                {id: "b", slot: 1, name: "B", cap: 1, pop: 1e6, econ: 0.5, lng: -40, lat: 0},
            ],
        });
        const bunk = {id: "bunk", slot: 0, type: "bunker", hp: 220, lng: 0, lat: 0};
        const silo = {id: "silo", slot: 0, type: "silo", hp: 100, cooldown: 0, targetId: null, lng: 0, lat: 0};
        w.units.push(bunk, silo);
        spawnFallout(w, 0, 0, 0);
        for (let t = 0; t < 20; t++) step(w, 1);
        expect(bunk.hp).toBe(220);                                   // bunker sealed
        const s = w.units.find((u) => u.id === "silo");
        expect(!s || s.hp < 100).toBe(true);                         // ordinary unit irradiated
    });
});
