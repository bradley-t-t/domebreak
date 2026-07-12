// Troops in contact: a marching ground combatant that comes within weapons range
// of an at-war enemy mobile ground unit halts its march and engages until that
// contact is destroyed, then resumes movement. Also pins that the reactive lock
// preserves and restores a standing Command Attack order. Deterministic — ground
// direct fire and the contact scan are pure functions of positions and war state.
import {describe, expect, it} from "vitest";
import {stepMovement} from "../../../src/game/sim/tickPhases.js";
import {UNITS} from "../../../src/game/data/units.js";

// Two nations at war. Nation 0's infantry marches east toward `dest`; nation 1's
// unit sits `enemyLng` away. lat 0 keeps 1 deg ~= 111 km so ranges are easy to
// reason about (infantry range is 250 km).
function theatre({enemyLng = 0.5, enemyType = "infantry", enemyHp = 14, targetId = null, dest = {lng: 5, lat: 0}} = {}) {
    return {
        time: 0,
        _id: 0,
        events: [],
        projectiles: [],
        nations: [
            {slot: 0, relations: {1: "war"}},
            {slot: 1, relations: {0: "war"}}
        ],
        units: [
            {id: "a", slot: 0, type: "infantry", lng: 0, lat: 0, hp: 75, cooldown: 0, targetId, dest: {...dest}, route: [{...dest}]},
            {id: "b", slot: 1, type: enemyType, lng: enemyLng, lat: 0, hp: enemyHp, cooldown: 0, targetId: null}
        ],
        cities: []
    };
}

const a = (w) => w.units.find((u) => u.id === "a");
const b = (w) => w.units.find((u) => u.id === "b");

describe("ground troops in contact", () => {
    it("test_halts_march_and_engages_enemy_in_range", () => {
        const w = theatre();
        stepMovement(w, 0.5);
        // Marcher stayed put (halted for contact) and put fire on the enemy.
        expect(a(w).lng).toBe(0);
        expect(b(w).hp).toBe(0);
        expect(a(w).targetId).toBe("b");
    });

    it("test_resumes_march_once_contact_is_destroyed", () => {
        const w = theatre();
        stepMovement(w, 0.5); // kills the enemy while halted
        expect(b(w).hp).toBe(0);
        stepMovement(w, 0.5); // enemy dead -> contact clears -> march resumes
        expect(a(w).lng).toBeGreaterThan(0);
        expect(a(w).targetId ?? null).toBe(null);
    });

    it("test_marches_normally_with_no_enemy_in_range", () => {
        const w = theatre({enemyLng: 10}); // ~1111 km away, well outside 250 km
        stepMovement(w, 0.5);
        expect(a(w).lng).toBeGreaterThan(0);
        expect(a(w).targetId ?? null).toBe(null);
        expect(b(w).hp).toBe(14); // untouched
    });

    it("test_restores_standing_attack_order_after_contact_breaks", () => {
        // The marcher already has a Command Attack order on a distant enemy city;
        // a nearer enemy unit forces a contact engagement that must not erase it.
        const w = theatre({targetId: "farcity"});
        w.cities.push({id: "farcity", slot: 1, lng: 5, lat: 0, alive: true, hp: 100, pop: 1000});
        stepMovement(w, 0.5); // contact overrides the order and kills the enemy
        expect(a(w).targetId).toBe("b");
        expect(a(w)._orderTarget).toBe("farcity");
        stepMovement(w, 0.5); // contact gone -> the city order is restored
        expect(a(w).targetId).toBe("farcity");
    });

    it("test_artillery_outranges_and_engages_infantry_that_cannot_reach_back", () => {
        // Artillery (range 550 km) halts and shells infantry (range 250 km) sitting
        // at ~445 km: the gunners engage, the riflemen are still out of their reach.
        const w = theatre({enemyType: "infantry", enemyHp: 100, enemyLng: 4});
        a(w).type = "artillery";
        expect(UNITS.artillery.range).toBeGreaterThan(445);
        expect(UNITS.infantry.range).toBeLessThan(445);
        stepMovement(w, 0.5);
        expect(a(w).lng).toBe(0);            // artillery halted to fire
        expect(b(w).hp).toBeLessThan(100);   // infantry taking fire
        expect(b(w).lng).toBe(4);            // infantry hasn't closed (its own halt only if IT had contact in range)
    });
});
