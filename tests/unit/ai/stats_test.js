// Per-slot world aggregates (ai/perception/stats.js). slotStats mirrors the
// canonical economy queries in one pass — these tests pin the agreement so the
// formulas can't silently drift apart, plus the per-step cache key and the
// zeroed default for empty slots.
import {describe, expect, it} from "vitest";
import {createWorld, gdpOf, incomeOf, netIncomeOf, UNITS, upkeepOf} from "../../../src/game/engine.js";
import {slotStats, statOf, survivingFrac} from "../../../src/game/sim/ai/perception/stats.js";

function fresh() {
    const w = createWorld({
        mySlot: 0, seed: 3,
        nations: [
            {slot: 0, name: "A", iso: "US", isAi: false, gdp: 5},
            {slot: 1, name: "B", iso: "RU", isAi: true, gdp: 2},
            {slot: 2, name: "C", iso: "CN", isAi: true, gdp: 0},   // gdp 0 — fallback income path
        ],
        cities: [
            {id: "a1", slot: 0, name: "A1", state: "S", cap: 1, pop: 2e6, econ: 0.6, lng: -98, lat: 39},
            {id: "a2", slot: 0, name: "A2", state: "T", cap: 0, pop: 1e6, econ: 0.4, lng: -105, lat: 40},
            {id: "b1", slot: 1, name: "B1", state: "M", cap: 1, pop: 3e6, econ: 1, lng: 37.6, lat: 55.75},
            {id: "c1", slot: 2, name: "C1", state: "B", cap: 1, pop: 4e6, econ: 1, lng: 116.4, lat: 39.9},
        ],
        rules: {playerGraceSec: 0},
    });
    w.units.push(
        {id: "u1", slot: 0, type: "factory", lng: -99, lat: 38, hp: UNITS.factory.hp},
        {id: "u2", slot: 0, type: "silo", lng: -100, lat: 38, hp: UNITS.silo.hp / 2},   // half hp — force weighting
        {id: "u3", slot: 1, type: "battery", lng: 38, lat: 55, hp: UNITS.battery.hp},
    );
    return w;
}

describe("slotStats — agreement with the canonical queries", () => {
    it("test_gdp_income_upkeep_net_match_queries", () => {
        const w = fresh();
        // Damage a city so vitality weighting is exercised too.
        w.cities.find((c) => c.id === "a2").hp = 40;
        for (const slot of [0, 1, 2]) {
            const s = statOf(w, slot);
            expect(s.gdp).toBeCloseTo(gdpOf(w, slot), 9);
            expect(s.income).toBeCloseTo(incomeOf(w, slot), 9);
            expect(s.upkeep).toBeCloseTo(upkeepOf(w, slot), 9);
            expect(s.net).toBeCloseTo(netIncomeOf(w, slot), 9);
        }
    });

    it("test_surviving_frac_uses_owner0_baseline", () => {
        const w = fresh();
        w.cities.find((c) => c.id === "a2").alive = false;
        expect(survivingFrac(w, 0)).toBe(0.5);
        expect(survivingFrac(w, 1)).toBe(1);
    });

    it("test_cache_is_per_step_and_refreshes_on_time_advance", () => {
        const w = fresh();
        expect(statOf(w, 0).cities).toBe(2);
        w.cities.find((c) => c.id === "a2").alive = false;
        // Same step: the snapshot stays consistent.
        expect(statOf(w, 0).cities).toBe(2);
        // Next step: refreshed.
        w.time += 0.5;
        expect(statOf(w, 0).cities).toBe(1);
    });

    it("test_empty_slot_reads_zeroed_default", () => {
        const w = fresh();
        const s = statOf(w, 99);
        expect(s.cities).toBe(0);
        expect(s.net).toBe(0);
        expect(s.power).toBeCloseTo(0.1, 9);
    });

    it("test_leaders_flag_reads_exposed_leadership", () => {
        const w = fresh();
        expect(statOf(w, 1).leaders).toBe(true);         // distributeLeadership seeded the capital
        for (const c of w.cities) if (c.slot === 1) c.leaders = 0;
        w.time += 0.5;
        expect(statOf(w, 1).leaders).toBe(false);
        expect(slotStats(w)[1].cities).toBe(1);
    });
});
