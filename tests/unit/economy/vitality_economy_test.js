// Vitality economy: city health scales population, economic share, GDP, income,
// and the industry-capacity cap. Deterministic, no RNG, no I/O.
import {describe, expect, it} from "vitest";
import {
    gdpOf,
    incomeOf,
    industryCapOf,
    industryCountOf,
    populationOf,
    queueUnit,
    vitalityOf,
} from "../../../src/game/engine.js";
import {ECONOMY, INDUSTRY} from "../../../src/game/data/constants.js";

// A city with explicit hp/maxHp; defaults to full health.
function city(over = {}) {
    return {id: over.id || "c", slot: 0, name: "C", pop: 1e6, econ: 0.5, hp: 100, maxHp: 100, alive: true, lng: 0, lat: 0, ...over};
}

// Minimal world: one GDP-rated nation (slot 0) plus its cities/units.
function world({gdp = 10, cities = [], units = []} = {}) {
    return {
        nations: [{slot: 0, gdp, alive: true, incomeMult: 1, points: 100000, relations: {}, prod: {queue: [], current: null}, ammo: {}}],
        cities,
        units,
        _id: 0,
    };
}

describe("vitalityOf", () => {
    it("test_full_health_is_one", () => {
        expect(vitalityOf(city({hp: 100, maxHp: 100}))).toBe(1);
    });
    it("test_half_health_is_half", () => {
        expect(vitalityOf(city({hp: 50, maxHp: 100}))).toBe(0.5);
    });
    it("test_dead_city_is_zero", () => {
        expect(vitalityOf(city({hp: 100, maxHp: 100, alive: false}))).toBe(0);
        expect(vitalityOf(city({hp: 0, maxHp: 100}))).toBe(0);
    });
    it("test_clamped_to_unit_range", () => {
        expect(vitalityOf(city({hp: 200, maxHp: 100}))).toBe(1);
        expect(vitalityOf(city({hp: -10, maxHp: 100}))).toBe(0);
    });
});

describe("baseline invariant (full health == pre-vitality behaviour)", () => {
    const w = world({gdp: 16, cities: [city({id: "a", pop: 3e6, econ: 0.6}), city({id: "b", pop: 2e6, econ: 0.4})]});
    it("test_population_is_raw_sum_at_full_health", () => {
        expect(populationOf(w, 0)).toBe(5e6);
    });
    it("test_gdp_is_full_share_at_full_health", () => {
        // econ shares sum to 1.0 → gdp == nation.gdp
        expect(gdpOf(w, 0)).toBeCloseTo(16, 6);
    });
    it("test_income_matches_formula_at_full_health", () => {
        const expected = ECONOMY.incomeBase + ECONOMY.incomeGdpCoef * Math.sqrt(16) * 1.0;
        expect(incomeOf(w, 0)).toBeCloseTo(expected, 6);
    });
});

describe("damage degrades contribution proportionally", () => {
    it("test_half_hp_halves_population", () => {
        const full = world({cities: [city({pop: 4e6, econ: 1})]});
        const half = world({cities: [city({pop: 4e6, econ: 1, hp: 50, maxHp: 100})]});
        expect(populationOf(half, 0)).toBe(populationOf(full, 0) / 2);
        expect(populationOf(half, 0)).toBe(2e6);
    });
    it("test_half_hp_halves_gdp_economic_share", () => {
        const w = world({gdp: 20, cities: [city({econ: 1, hp: 50, maxHp: 100})]});
        expect(gdpOf(w, 0)).toBeCloseTo(10, 6); // 20 * (1 * 0.5)
    });
    it("test_damage_reduces_income_via_econ_term", () => {
        const full = incomeOf(world({gdp: 16, cities: [city({econ: 1})]}), 0);
        const half = incomeOf(world({gdp: 16, cities: [city({econ: 1, hp: 50, maxHp: 100})]}), 0);
        // Base term is flat; the √gdp·econ term halves.
        const gdpTerm = ECONOMY.incomeGdpCoef * Math.sqrt(16);
        expect(full - half).toBeCloseTo(gdpTerm * 0.5, 6);
    });
    it("test_dead_city_contributes_nothing", () => {
        const w = world({gdp: 16, cities: [city({econ: 1, alive: false})]});
        expect(populationOf(w, 0)).toBe(0);
        expect(gdpOf(w, 0)).toBe(0);
        expect(incomeOf(w, 0)).toBeCloseTo(ECONOMY.incomeBase, 6);
    });
});

describe("industry capacity", () => {
    it("test_cap_is_base_at_zero_population", () => {
        expect(industryCapOf(world({cities: []}), 0)).toBe(INDUSTRY.base);
    });
    it("test_cap_scales_with_living_population", () => {
        const pop = INDUSTRY.popPer * 5; // → base + 5
        const w = world({cities: [city({pop, econ: 1})]});
        expect(industryCapOf(w, 0)).toBe(INDUSTRY.base + 5);
    });
    it("test_cap_is_clamped_at_max", () => {
        const w = world({cities: [city({pop: INDUSTRY.popPer * 1000, econ: 1})]});
        expect(industryCapOf(w, 0)).toBe(INDUSTRY.max);
    });
    it("test_damage_lowers_the_cap", () => {
        const pop = INDUSTRY.popPer * 4;
        const healthy = world({cities: [city({pop, econ: 1})]});
        const bombed = world({cities: [city({pop, econ: 1, hp: 50, maxHp: 100})]});
        expect(industryCapOf(bombed, 0)).toBeLessThan(industryCapOf(healthy, 0));
    });
    it("test_industry_count_ignores_dead_and_non_industry", () => {
        const w = world({
            units: [
                {slot: 0, type: "factory", hp: 60},
                {slot: 0, type: "port", hp: 40},
                {slot: 0, type: "factory", hp: 0},   // destroyed — excluded
                {slot: 0, type: "silo", hp: 60},      // not industry — excluded
            ],
        });
        expect(industryCountOf(w, 0)).toBe(2);
    });
});

describe("queueUnit industry cap enforcement", () => {
    // Three widely-separated factories keep the nation at the base cap (small pop),
    // so a fourth is refused; scrapping one to two lets the next through.
    function industryWorld(count) {
        const units = [];
        for (let i = 0; i < count; i++) units.push({id: `f${i}`, slot: 0, type: "factory", hp: 60, lng: 20 + i * 10, lat: 0});
        // Small living population → cap == INDUSTRY.base (3).
        return world({cities: [city({pop: 1e6, econ: 1, lng: 0, lat: 0})], units});
    }

    it("test_refused_at_capacity", () => {
        const w = industryWorld(INDUSTRY.base); // exactly at cap
        const r = queueUnit(w, 0, "factory", -40, 40, true);
        expect(r.error).toMatch(/Industrial capacity/);
    });
    it("test_allowed_below_capacity", () => {
        const w = industryWorld(INDUSTRY.base - 1);
        const r = queueUnit(w, 0, "factory", -40, 40, true);
        expect(r.ok).toBe(true);
    });
    it("test_queued_industry_counts_against_cap", () => {
        const w = industryWorld(INDUSTRY.base - 1); // one slot free
        expect(queueUnit(w, 0, "factory", -40, 40, true).ok).toBe(true); // fills it (now queued)
        const r = queueUnit(w, 0, "port", -60, 40, true); // different industry type, over cap
        expect(r.error).toMatch(/Industrial capacity/);
    });
});
