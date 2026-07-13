// Allies share their radar picture and their air defense: a nation sees what any
// ally's sensors cover, and an ally's batteries intercept ordnance inbound on it.
// Covers alliedSlots / sharedSensorsOf / unitVisibleTo and the stepCombat shared-
// defense gate. Deterministic — fixed equatorial geometry, seeded PRNG, no I/O.
import {describe, expect, it} from "vitest";
import {alliedSlots, haversine, sharedSensorsOf, sharedSubSensorsOf, sensorsOf, unitVisibleTo} from "../../../src/game/engine.js";
import {stepCombat} from "../../../src/game/sim/tickPhases.js";

// Three powers: 0 (me), 1 (my ally), 2 (the enemy). Relations are supplied per
// test so the same roster can model an alliance, a lapsed pact, or plain peace.
function world(rel0 = {1: "ally", 2: "war"}, rel1 = {0: "ally"}, units = []) {
    return {
        time: 0, _r: 12345, _id: 0, events: [], cities: [], interceptors: [], projectiles: [],
        units,
        nations: [
            {slot: 0, alive: true, active: true, relations: rel0},
            {slot: 1, alive: true, active: true, relations: rel1},
            {slot: 2, alive: true, active: true, relations: {0: "war"}},
        ],
    };
}

describe("alliedSlots", () => {
    it("test_lists_living_allies_only", () => {
        const w = world({1: "ally", 2: "war"});
        expect(alliedSlots(w, 0)).toEqual([1]);
    });
    it("test_excludes_peace_and_war", () => {
        const w = world({1: "peace", 2: "war"});
        expect(alliedSlots(w, 0)).toEqual([]);
    });
    it("test_excludes_dead_or_inactive_allies", () => {
        const w = world({1: "ally"});
        w.nations[1].alive = false;
        expect(alliedSlots(w, 0)).toEqual([]);
        w.nations[1].alive = true;
        w.nations[1].active = false;
        expect(alliedSlots(w, 0)).toEqual([]);
    });
});

describe("shared radar picture", () => {
    // My ally holds an early-warning radar (1500 km) over the enemy; I have none.
    const allyRadar = {id: "r", slot: 1, type: "radar", lng: 0, lat: 0, hp: 40};
    const enemyUnit = {id: "e", slot: 2, type: "battery", lng: 2, lat: 0, hp: 100}; // ~222 km from the radar

    it("test_shared_sensors_include_ally_bubbles", () => {
        const w = world({1: "ally", 2: "war"}, {0: "ally"}, [allyRadar, enemyUnit]);
        expect(sensorsOf(w, 0)).toHaveLength(0);            // I emit nothing myself
        expect(sharedSensorsOf(w, 0)).toHaveLength(1);      // but I borrow the ally's array
    });

    it("test_enemy_revealed_by_ally_radar", () => {
        const w = world({1: "ally", 2: "war"}, {0: "ally"}, [allyRadar, enemyUnit]);
        const seen = sharedSensorsOf(w, 0), sub = sharedSubSensorsOf(w, 0);
        expect(haversine(0, 0, 2, 0)).toBeLessThan(1500);   // inside the ally's reach
        expect(unitVisibleTo(w, 0, enemyUnit, seen, sub)).toBe(true);
    });

    it("test_enemy_hidden_without_the_pact", () => {
        // Same geometry, but the alliance has lapsed — no shared radar, so my own
        // (empty) picture leaves the enemy in the fog.
        const w = world({1: "peace", 2: "war"}, {0: "peace"}, [allyRadar, enemyUnit]);
        const seen = sharedSensorsOf(w, 0), sub = sharedSubSensorsOf(w, 0);
        expect(unitVisibleTo(w, 0, enemyUnit, seen, sub)).toBe(false);
    });
});

describe("shared air defense", () => {
    // One inbound ballistic missile (enemy slot 2) diving on my ALLY's city
    // (slot 1). Only I (slot 0) field a battery, co-located at the missile's
    // mid-flight point. With the pact my battery must engage; without it, it
    // stands down — the missile is a third party's problem.
    function engage(rel0, rel1) {
        const dist = haversine(30, 0, 0, 0);
        const p = {
            id: "p1", slot: 2, type: "silo", warhead: "standard", evasion: 0, tried: [], targetId: "c1",
            fromLng: 30, fromLat: 0, toLng: 0, toLat: 0, dist,
            speed: 140, progress: 0.5, travelled: 0.5 * dist, lng: 15, lat: 0, altNorm: 0.5,
        };
        const battery = {id: "b1", slot: 0, type: "battery", hp: 100, cooldown: 0, lng: 15, lat: 0};
        const w = world(rel0, rel1, [battery]);
        w.cities = [{id: "c1", slot: 1, alive: true, lng: 0, lat: 0}];
        w.projectiles = [p];
        stepCombat(w, 0.03);
        return w.interceptors;
    }

    it("test_ally_battery_intercepts_for_partner", () => {
        expect(engage({1: "ally", 2: "war"}, {0: "ally"})).toHaveLength(1);
    });

    it("test_no_intercept_when_not_allied", () => {
        expect(engage({1: "peace", 2: "war"}, {0: "peace"})).toHaveLength(0);
    });
});
