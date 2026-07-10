// Threat map: per-cell inbound-fire pressure over a nation's ground. Covers
// pressure projection (in-range platforms press, out-of-range ones don't),
// the ballistic share (only ballistic:true platforms fill it), friendly
// defense coverage shrinking the gap, topGaps ordering/filtering, and the
// reduced peacetime-rival weight (THREAT.peacetimeRivalW). Deterministic —
// buildThreatMap is a pure function of the world and its inputs.
import {describe, expect, it} from "vitest";
import {UNITS, createWorld} from "../../../src/game/engine.js";
import {buildThreatMap, meanPressure, topGaps} from "../../../src/game/sim/ai/perception/threatMap.js";
import {THREAT} from "../../../src/game/sim/ai/tuning.js";

// slot 0 = my nation (US soil: a capital in Kansas plus Denver), slot 1 = the
// hostile nation (Russia). Distances: Moscow -> Kansas ~8700 km, so a silo
// (range 20000) ranges the whole grid while a battleship (range 8000) parked
// far away cannot.
const CAP = {lng: -98, lat: 39};        // Kansas capital
const SECOND = {lng: -104.99, lat: 39.74}; // Denver
const MOSCOW = {lng: 37.6, lat: 55.75};

function fresh() {
    return createWorld({
        mySlot: 0, seed: 7,
        nations: [
            {slot: 0, name: "Aland", iso: "US", isAi: false, gdp: 5},
            {slot: 1, name: "Bland", iso: "RU", isAi: true, gdp: 5},
        ],
        cities: [
            {id: "a1", slot: 0, name: "A-Cap", state: "KS", cap: 1, pop: 1e6, econ: 1, ...CAP},
            {id: "a2", slot: 0, name: "A-2", state: "CO", cap: 0, pop: 4e5, econ: 1, ...SECOND},
            {id: "b1", slot: 1, name: "B-Cap", state: "MOW", cap: 1, pop: 1e6, econ: 1, ...MOSCOW},
        ],
        rules: {playerGraceSec: 0},
    });
}

let seq = 0;
function unit(slot, type, {lng, lat}) {
    return {id: "u" + ++seq, slot, type, lng, lat, hp: UNITS[type].hp};
}

// Build slot 0's threat map with slot 1's units cast as at-war enemies or
// peacetime rivals — the only difference buildFrame would feed in.
function mapFor(w, {enemyUnits = [], rivalUnits = [], myUnits = []} = {}) {
    const foe = w.nations[1];
    const unitsBySlot = new Map([[0, myUnits], [1, [...enemyUnits, ...rivalUnits]]]);
    return buildThreatMap(w, w.nations[0], {
        cities: w.cities.filter((c) => c.slot === 0 && c.alive),
        myUnits,
        enemies: enemyUnits.length ? [foe] : [],
        rivals: rivalUnits.length ? [foe] : [],
        unitsBySlot,
    });
}

// The grid cell whose center is nearest a point (deterministic: strict <, so
// the first cell in row-major order wins any tie).
function cellAt(map, {lng, lat}) {
    let best = null, bd = Infinity;
    for (const c of map.cells) {
        const d = (c.lng - lng) ** 2 + (c.lat - lat) ** 2;
        if (d < bd) { bd = d; best = c; }
    }
    return best;
}

describe("buildThreatMap — inbound pressure", () => {
    it("test_enemy_silo_in_range_raises_pressure_over_my_city", () => {
        const w = fresh();
        const map = mapFor(w, {enemyUnits: [unit(1, "silo", MOSCOW)]});
        const cell = cellAt(map, CAP);
        expect(cell.pressure).toBeGreaterThan(0);
        expect(cell.value).toBeGreaterThan(0);      // capital pop + leadership sit here
        expect(cell.gap).toBeGreaterThan(0);        // pressure x value, nothing covering
    });

    it("test_out_of_range_platform_contributes_nothing", () => {
        const w = fresh();
        // Battleship (range 8000) off Cape Town — over 13000 km from every cell.
        const map = mapFor(w, {enemyUnits: [unit(1, "battleship", {lng: 18.4, lat: -33.9})]});
        expect(map.cells.every((c) => c.pressure === 0)).toBe(true);
        expect(meanPressure(map)).toBe(0);
    });

    it("test_ballistic_platform_fills_the_ballistic_share", () => {
        const w = fresh();
        const map = mapFor(w, {enemyUnits: [unit(1, "silo", MOSCOW)]});
        const cell = cellAt(map, CAP);
        expect(cell.ballistic).toBeGreaterThan(0);
        expect(cell.ballistic).toBe(cell.pressure); // the silo is the only source
    });

    it("test_non_ballistic_offense_in_range_presses_without_ballistic_share", () => {
        const w = fresh();
        // Battleship well inside its 8000 km reach of the grid.
        const map = mapFor(w, {enemyUnits: [unit(1, "battleship", {lng: -110, lat: 42})]});
        const cell = cellAt(map, CAP);
        expect(cell.pressure).toBeGreaterThan(0);
        expect(cell.ballistic).toBe(0);
    });

    it("test_peacetime_rival_pressure_is_scaled_by_the_tuning_weight", () => {
        const atWar = mapFor(fresh(), {enemyUnits: [unit(1, "silo", MOSCOW)]});
        const rival = mapFor(fresh(), {rivalUnits: [unit(1, "silo", MOSCOW)]});
        const warCell = cellAt(atWar, CAP);
        const rivalCell = cellAt(rival, CAP);
        expect(rivalCell.pressure).toBeGreaterThan(0);
        expect(rivalCell.pressure).toBeCloseTo(warCell.pressure * THREAT.peacetimeRivalW, 10);
        expect(meanPressure(rival)).toBeCloseTo(meanPressure(atWar) * THREAT.peacetimeRivalW, 10);
    });
});

describe("buildThreatMap — friendly coverage", () => {
    it("test_my_defense_unit_raises_coverage_and_lowers_gap", () => {
        const silo = () => unit(1, "silo", MOSCOW);
        const bare = mapFor(fresh(), {enemyUnits: [silo()]});
        const w = fresh();
        const guarded = mapFor(w, {enemyUnits: [silo()], myUnits: [unit(0, "battery", CAP)]});
        const before = cellAt(bare, CAP);
        const after = cellAt(guarded, CAP);
        expect(before.coverage).toBe(0);
        expect(after.coverage).toBeGreaterThan(0);
        expect(after.pressure).toBe(before.pressure);            // coverage never edits pressure
        expect(after.gap).toBeLessThan(before.gap);
        // gap = pressure x value / (1 + coverage), coverage = intercept x tuning weight
        const denom = 1 + UNITS.battery.intercept * THREAT.coverageIntercept;
        expect(after.gap * denom).toBeCloseTo(before.gap, 6);
    });

    it("test_defense_coverage_is_local_not_national", () => {
        const w = fresh();
        const map = mapFor(w, {enemyUnits: [unit(1, "silo", MOSCOW)], myUnits: [unit(0, "battery", CAP)]});
        // Denver sits ~600 km out — far beyond the battery's 320 km envelope.
        expect(cellAt(map, SECOND).coverage).toBe(0);
    });
});

describe("topGaps", () => {
    it("test_topgaps_returns_only_value_bearing_cells_sorted_worst_first", () => {
        const w = fresh();
        const map = mapFor(w, {enemyUnits: [unit(1, "silo", MOSCOW)]});
        // The silo pressures every cell, so empty steppe exists and must be skipped.
        expect(map.cells.some((c) => c.value === 0 && c.pressure > 0)).toBe(true);
        const gaps = topGaps(map, 10);
        expect(gaps.length).toBeGreaterThan(0);
        expect(gaps.every((c) => c.value > 0 && c.gap > 0)).toBe(true);
        for (let i = 1; i < gaps.length; i++) expect(gaps[i - 1].gap).toBeGreaterThanOrEqual(gaps[i].gap);
        // Worst-first means the head of the list is the global maximum gap.
        expect(gaps[0].gap).toBe(Math.max(...map.cells.map((c) => c.gap)));
    });

    it("test_topgaps_respects_k", () => {
        const w = fresh();
        const map = mapFor(w, {enemyUnits: [unit(1, "silo", MOSCOW)]});
        expect(topGaps(map, 1)).toHaveLength(1);
    });

    it("test_topgaps_ballistic_only_predicate_filters_conventional_threat", () => {
        const ballisticOnly = (c) => c.ballistic > 0;
        // Battleship pressure is real but conventional — a THAAD query sees nothing.
        const conv = mapFor(fresh(), {enemyUnits: [unit(1, "battleship", {lng: -110, lat: 42})]});
        expect(topGaps(conv, 5).length).toBeGreaterThan(0);
        expect(topGaps(conv, 5, ballisticOnly)).toHaveLength(0);
        // A silo threat passes the same predicate.
        const ball = mapFor(fresh(), {enemyUnits: [unit(1, "silo", MOSCOW)]});
        expect(topGaps(ball, 5, ballisticOnly).length).toBeGreaterThan(0);
    });
});

describe("meanPressure", () => {
    it("test_mean_pressure_is_zero_with_no_hostile_sources", () => {
        const w = fresh();
        expect(meanPressure(mapFor(w, {}))).toBe(0);
    });
});
