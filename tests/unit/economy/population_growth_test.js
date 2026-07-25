// Population growth: each living city's people grow per tick, scaled by vitality
// (hp/maxHp) and national prosperity (effective GDP over baseline GDP), capped at
// pop0 * growthCapMult. Deterministic, no RNG, no I/O.
import {describe, expect, it} from "vitest";
import {growCities} from "../../../src/game/engine.js";
import {POPULATION, UNITS} from "../../../src/game/data/constants.js";

const {growthPerSec: R, growthCapMult: CAP} = POPULATION;

// A living city at full health with matching pop0 baseline unless overridden.
function city(over = {}) {
    const pop = over.pop ?? 1e6;
    return {id: over.id || "c", slot: 0, name: "C", pop, pop0: pop, econ: 0.5, hp: 100, maxHp: 100, alive: true, lng: 0, lat: 0, ...over};
}

function world(cities) {
    return {cities};
}

describe("growCities — growth rate and vitality scaling", () => {
    it("test_full_health_grows_by_rate_times_dt", () => {
        const c = city({pop: 1e6});
        growCities(world([c]), 1);
        expect(c.pop).toBeCloseTo(1e6 * (1 + R * 1 * 1), 3);
    });

    it("test_growth_scales_with_dt", () => {
        const a = city({pop: 1e6});
        const b = city({pop: 1e6});
        growCities(world([a]), 1);
        growCities(world([b]), 4);
        // b advanced 4x the game-seconds → 4x the delta (first-order).
        expect(b.pop - 1e6).toBeCloseTo((a.pop - 1e6) * 4, 3);
    });

    it("test_half_hp_grows_at_half_rate", () => {
        const full = city({pop: 1e6, hp: 100, maxHp: 100});
        const half = city({pop: 1e6, hp: 50, maxHp: 100});
        growCities(world([full, half]), 1);
        expect(half.pop - 1e6).toBeCloseTo((full.pop - 1e6) / 2, 3);
    });

    it("test_dead_city_does_not_grow", () => {
        const dead = city({pop: 1e6, alive: false});
        growCities(world([dead]), 10);
        expect(dead.pop).toBe(1e6);
    });

    it("test_zero_hp_city_does_not_grow", () => {
        const rubble = city({pop: 1e6, hp: 0, maxHp: 100});
        growCities(world([rubble]), 10);
        expect(rubble.pop).toBe(1e6);
    });
});

describe("growCities — cap", () => {
    it("test_pop_never_exceeds_cap", () => {
        // Huge dt would overshoot; result is clamped to pop0 * CAP exactly.
        const c = city({pop: 1e6, pop0: 1e6});
        growCities(world([c]), 1e9);
        expect(c.pop).toBe(1e6 * CAP);
    });

    it("test_city_at_cap_stops_growing", () => {
        const c = city({pop: 1e6 * CAP, pop0: 1e6});
        growCities(world([c]), 100);
        expect(c.pop).toBe(1e6 * CAP);
    });

    it("test_growth_is_bounded_over_many_ticks", () => {
        const c = city({pop: 1e6, pop0: 1e6});
        for (let i = 0; i < 100000; i++) growCities(world([c]), 1);
        expect(c.pop).toBeLessThanOrEqual(1e6 * CAP);
        expect(c.pop).toBeCloseTo(1e6 * CAP, 0);
    });
});

describe("growCities — GDP prosperity scaling", () => {
    const nation = (over = {}) => ({slot: 0, alive: true, gdp: 2, ...over});

    it("test_full_economy_grows_at_base_rate", () => {
        // The city carries the nation's whole economy at full health → prosperity 1.
        const c = city({pop: 1e6, econ: 1});
        growCities({cities: [c], nations: [nation()]}, 1);
        expect(c.pop).toBeCloseTo(1e6 * (1 + R), 3);
    });

    it("test_half_economy_halves_growth", () => {
        // Only half the nation's economy still stands → prosperity 0.5.
        const c = city({pop: 1e6, econ: 0.5});
        growCities({cities: [c], nations: [nation()]}, 1);
        expect(c.pop).toBeCloseTo(1e6 * (1 + R * 0.5), 3);
    });

    it("test_wrecked_economy_is_floored", () => {
        const c = city({pop: 1e6, econ: 0});
        growCities({cities: [c], nations: [nation()]}, 1);
        expect(c.pop).toBeCloseTo(1e6 * (1 + R * POPULATION.gdpGrowthFloor), 3);
    });

    it("test_conquest_prosperity_is_capped", () => {
        // Captured cities bring their econ shares along; Σ econ = 2 → clamped at the cap.
        const a = city({id: "a", econ: 1});
        const b = city({id: "b", econ: 1, lng: 10});
        growCities({cities: [a, b], nations: [nation()]}, 1);
        expect(a.pop).toBeCloseTo(1e6 * (1 + R * POPULATION.gdpGrowthCap), 3);
    });

    it("test_built_industry_lifts_growth", () => {
        // A techpark's gdpAdd stacks on the city's half-share economy.
        const gdp = 2;
        const c = city({pop: 1e6, econ: 0.5});
        const units = [{slot: 0, hp: 1, type: "techpark"}];
        growCities({cities: [c], nations: [nation({gdp})], units}, 1);
        const prosperity = 0.5 + UNITS.techpark.gdpAdd / gdp;
        expect(c.pop).toBeCloseTo(1e6 * (1 + R * prosperity), 3);
    });

    it("test_world_without_nations_grows_at_neutral_rate", () => {
        // Legacy saves / bare test worlds: no nation roster → prosperity 1.
        const c = city({pop: 1e6, econ: 0});
        growCities(world([c]), 1);
        expect(c.pop).toBeCloseTo(1e6 * (1 + R), 3);
    });
});

describe("growCities — determinism and no-ops", () => {
    it("test_identical_inputs_yield_identical_output", () => {
        const a = city({pop: 3e6, hp: 70, maxHp: 100});
        const b = city({pop: 3e6, hp: 70, maxHp: 100});
        for (const dt of [0.5, 1, 2, 0.25]) {
            growCities(world([a]), dt);
            growCities(world([b]), dt);
        }
        expect(a.pop).toBe(b.pop);
    });

    it("test_nonpositive_dt_is_a_noop", () => {
        const c = city({pop: 1e6});
        growCities(world([c]), 0);
        growCities(world([c]), -5);
        expect(c.pop).toBe(1e6);
    });

    it("test_missing_pop0_falls_back_to_current_pop", () => {
        // Legacy-save city has no pop0; growth still applies (cap keyed off pop).
        const c = {id: "legacy", slot: 0, pop: 1e6, econ: 0.5, hp: 100, maxHp: 100, alive: true};
        growCities(world([c]), 1);
        expect(c.pop).toBeGreaterThan(1e6);
    });
});
