// populationTrendOf: the instantaneous rate of change of a nation's living
// population (populationOf, people per game-second), derived from the same model
// growCities/healCities apply — pop growth (until the cap) plus heal-driven
// vitality gain (until full hp, owner standing). Drives the HUD PopTrend caret.
import {describe, expect, it} from "vitest";
import {growCities, healCities, populationOf, populationTrendOf} from "../../../src/game/engine.js";
import {POPULATION, CITY_REGEN} from "../../../src/game/data/constants.js";

function city(over = {}) {
    const pop = over.pop ?? 1e6;
    return {id: over.id || "c", slot: 0, name: "C", pop, pop0: pop, econ: 0.5, hp: 100, maxHp: 100, alive: true, lng: 0, lat: 0, ...over};
}

function world(cities, nations = [{slot: 0, alive: true, gdp: 2}]) {
    return {cities, units: [], nations};
}

describe("populationTrendOf — sign and gating", () => {
    it("test_healthy_uncapped_city_reports_positive_growth", () => {
        expect(populationTrendOf(world([city()]), 0)).toBeGreaterThan(0);
    });

    it("test_capped_city_reports_no_growth", () => {
        const c = city({pop: 1e6 * POPULATION.growthCapMult, pop0: 1e6, hp: 100, maxHp: 100});
        expect(populationTrendOf(world([c]), 0)).toBe(0);
    });

    it("test_destroyed_city_reports_no_growth", () => {
        expect(populationTrendOf(world([city({alive: false})]), 0)).toBe(0);
    });

    it("test_damaged_city_of_surrendered_owner_only_grows_no_heal", () => {
        const c = city({hp: 40, maxHp: 100});
        const surrendered = world([c], [{slot: 0, alive: true, gdp: 2, defeatPenalties: [{t0: 900}]}]);
        surrendered.time = 1000;
        const standing = world([city({hp: 40, maxHp: 100})]);
        // A surrendered owner loses the heal term, so its rate is strictly lower.
        expect(populationTrendOf(surrendered, 0)).toBeLessThan(populationTrendOf(standing, 0));
    });

    it("test_only_sums_the_requested_slot", () => {
        const w = world([city({id: "a", slot: 0}), city({id: "b", slot: 1})]);
        w.nations = [{slot: 0, alive: true, gdp: 2}, {slot: 1, alive: true, gdp: 2}];
        expect(populationTrendOf(w, 0)).toBeGreaterThan(0);
        expect(populationTrendOf(w, 1)).toBeGreaterThan(0);
    });
});

describe("populationTrendOf — matches the applied model", () => {
    it("test_rate_predicts_one_second_of_growth_and_heal", () => {
        // Predicted d(populationOf)/dt should track the actual delta a 1s tick applies
        // (first-order: exact to the linearization the trend reports).
        const c = city({pop: 1e6, hp: 60, maxHp: 100});
        const w = world([c]);
        w.time = 1000;
        const before = populationOf(w, 0);
        const predicted = populationTrendOf(w, 0);
        healCities(w, 1);
        growCities(w, 1);
        const actual = populationOf(w, 0) - before;
        // Second-order compounding over a whole game-second keeps them close, not equal.
        expect(predicted).toBeGreaterThan(0);
        expect(actual).toBeGreaterThan(0);
        expect(Math.abs(predicted - actual) / actual).toBeLessThan(0.01);
    });

    it("test_heal_term_uses_the_regen_rate", () => {
        // A full-pop city at half hp, capped so only the heal term contributes:
        // rate should equal pop * hpFracPerSec.
        const c = city({pop: 1e6 * POPULATION.growthCapMult, pop0: 1e6, hp: 50, maxHp: 100});
        const rate = populationTrendOf(world([c]), 0);
        expect(rate).toBeCloseTo(c.pop * CITY_REGEN.hpFracPerSec, 3);
    });
});
