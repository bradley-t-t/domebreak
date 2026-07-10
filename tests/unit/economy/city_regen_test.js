// City reconstruction: a damaged-but-living city with people still in it rebuilds
// hp toward maxHp every tick, provided its owner is still standing — alive and not
// inside the post-surrender defeat window. Destroyed cities (their population is
// gone) and 0-pop cities never rebuild. Deterministic, no RNG, no I/O.
import {describe, expect, it} from "vitest";
import {healCities} from "../../../src/game/engine.js";
import {CITY_REGEN, STABILITY} from "../../../src/game/data/constants.js";

const R = CITY_REGEN.hpFracPerSec;

// A damaged living city owned by slot 0 unless overridden.
function city(over = {}) {
    return {id: over.id || "c", slot: 0, name: "C", pop: 1e6, pop0: 1e6, econ: 0.5, hp: 40, maxHp: 100, alive: true, lng: 0, lat: 0, ...over};
}

function world(cities, nations = [{slot: 0, alive: true}], time = 1000) {
    return {time, cities, nations};
}

describe("healCities — regeneration", () => {
    it("test_damaged_city_heals_by_rate_times_dt", () => {
        const c = city({hp: 40});
        healCities(world([c]), 10);
        expect(c.hp).toBeCloseTo(40 + 100 * R * 10, 6);
    });

    it("test_heal_clamps_at_max_hp", () => {
        const c = city({hp: 99.9});
        healCities(world([c]), 1e9);
        expect(c.hp).toBe(100);
    });

    it("test_capital_heals_proportionally_to_its_max", () => {
        // Flat FRACTION of maxHp — a 140-hp capital rebuilds on the same timescale.
        const cap = city({hp: 70, maxHp: 140});
        healCities(world([cap]), 10);
        expect(cap.hp).toBeCloseTo(70 + 140 * R * 10, 6);
    });

    it("test_full_health_city_is_untouched", () => {
        const c = city({hp: 100});
        healCities(world([c]), 10);
        expect(c.hp).toBe(100);
    });

    it("test_nonpositive_dt_is_a_noop", () => {
        const c = city({hp: 40});
        healCities(world([c]), 0);
        healCities(world([c]), -5);
        expect(c.hp).toBe(40);
    });
});

describe("healCities — gating", () => {
    it("test_destroyed_city_never_rebuilds", () => {
        const c = city({hp: 0, alive: false});
        healCities(world([c]), 1000);
        expect(c.hp).toBe(0);
        expect(c.alive).toBe(false);
    });

    it("test_zero_pop_city_does_not_heal", () => {
        const c = city({hp: 40, pop: 0});
        healCities(world([c]), 10);
        expect(c.hp).toBe(40);
    });

    it("test_eliminated_owner_does_not_rebuild", () => {
        const c = city({hp: 40});
        healCities(world([c], [{slot: 0, alive: false}]), 10);
        expect(c.hp).toBe(40);
    });

    it("test_surrendered_owner_does_not_rebuild", () => {
        // Owner lost a war moments ago — inside the defeat window, no reconstruction.
        const n = {slot: 0, alive: true, defeatPenalties: [{t0: 900}]};
        const c = city({hp: 40});
        healCities(world([c], [n], 1000), 10);
        expect(c.hp).toBe(40);
    });

    it("test_rebuilding_resumes_once_the_defeat_window_decays", () => {
        const n = {slot: 0, alive: true, defeatPenalties: [{t0: 0}]};
        const c = city({hp: 40});
        healCities(world([c], [n], STABILITY.defeatSec + 1), 10);
        expect(c.hp).toBeCloseTo(40 + 100 * R * 10, 6);
    });

    it("test_at_war_owner_still_rebuilds", () => {
        // War alone doesn't stop reconstruction — only surrender or elimination does.
        const n = {slot: 0, alive: true, relations: {1: "war"}};
        const c = city({hp: 40});
        healCities(world([c], [n]), 10);
        expect(c.hp).toBeCloseTo(40 + 100 * R * 10, 6);
    });

    it("test_ownerless_city_does_not_heal", () => {
        const c = city({hp: 40, slot: 7});
        healCities(world([c]), 10);
        expect(c.hp).toBe(40);
    });

    it("test_gating_is_per_owner", () => {
        // Slot 0 stands, slot 1 surrendered — only slot 0's city rebuilds.
        const a = city({id: "a", hp: 40, slot: 0});
        const b = city({id: "b", hp: 40, slot: 1});
        const nations = [
            {slot: 0, alive: true},
            {slot: 1, alive: true, defeatPenalties: [{t0: 999}]},
        ];
        healCities(world([a, b], nations, 1000), 10);
        expect(a.hp).toBeGreaterThan(40);
        expect(b.hp).toBe(40);
    });
});
