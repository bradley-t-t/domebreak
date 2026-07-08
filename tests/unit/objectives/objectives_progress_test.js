// Strategic objectives: structure-count goals (Leadership Bunker + 2 Airstrips)
// and the radar land-coverage goal (80% of the nation's own land under its radar
// picture). Exercises evaluateObjectives and the radarLandCoverage query against
// a synthetic USA world. Deterministic — the country grid is static data, no RNG,
// no I/O, no time dependence.
import {describe, expect, it} from "vitest";
import {evaluateObjectives, radarLandCoverage} from "../../../src/game/engine.js";
import {OBJECTIVES} from "../../../src/game/sim/objectives.js";
import {OBJECTIVES_TUNING} from "../../../src/game/data/constants.js";
import {toGid3} from "../../../src/game/data/iso3.js";
import {countryLandCells} from "../../../src/game/geo/countryOwner.js";

// Minimal world: one USA nation at slot 0, plus whatever units the test supplies.
// USA is a wide land mass, so a single early-warning radar can't blanket it — that
// makes it a good fixture for partial-vs-full coverage.
const world = (units = []) => ({
    time: 10,
    nations: [{slot: 0, iso: "US", alive: true, relations: {}}],
    units,
    cities: [],
});
// A standing structure (full hp) of `type` at a US-interior point unless overridden.
const unit = (type, lng = -98, lat = 39) => ({id: `${type}-${lng}`, slot: 0, type, lng, lat, hp: 100});

const firstObjective = () => OBJECTIVES.find((o) => o.tasks.some((t) => t.kind === "build"));
const coverageObjective = () => OBJECTIVES.find((o) => o.tasks.some((t) => t.kind === "coverage"));

describe("countryLandCells (coverage denominator)", () => {
    it("test_usa_has_weighted_land_area", () => {
        const {cells, area} = countryLandCells(toGid3("US"));
        expect(cells.length).toBeGreaterThan(0);
        expect(area).toBeGreaterThan(0);
    });
    it("test_unknown_country_is_empty", () => {
        expect(countryLandCells(null)).toEqual({cells: [], area: 0});
    });
});

describe("radarLandCoverage", () => {
    it("test_no_emitters_is_zero", () => {
        expect(radarLandCoverage(world([]), 0)).toBe(0);
    });
    it("test_single_early_warning_radar_is_partial", () => {
        // One 1500 km radar can't cover the whole width of the US — strictly (0,1).
        const cov = radarLandCoverage(world([unit("radar")]), 0);
        expect(cov).toBeGreaterThan(0);
        expect(cov).toBeLessThan(1);
    });
    it("test_over_the_horizon_array_blankets_the_nation", () => {
        // A 5000 km OTH array reaches every US cell from the interior.
        expect(radarLandCoverage(world([unit("oth")]), 0)).toBeGreaterThan(OBJECTIVES_TUNING.radarLandCover);
    });
    it("test_dead_radar_contributes_nothing", () => {
        const dead = {...unit("oth"), hp: 0};
        expect(radarLandCoverage(world([dead]), 0)).toBe(0);
    });
});

describe("evaluateObjectives", () => {
    it("test_empty_world_all_incomplete", () => {
        const objs = evaluateObjectives(world([]), 0);
        expect(objs).toHaveLength(OBJECTIVES.length);
        expect(objs.every((o) => !o.done)).toBe(true);
    });

    it("test_bunker_objective_needs_both_structures", () => {
        const id = firstObjective().id;
        // Bunker alone: objective still open (airstrips outstanding).
        let objs = evaluateObjectives(world([unit("bunker")]), 0);
        expect(objs.find((o) => o.id === id).done).toBe(false);

        // Bunker + exactly the required airstrips: objective clears.
        const strips = Array.from({length: OBJECTIVES_TUNING.airstripsRequired}, (_, i) => unit("airstrip", -100 + i));
        objs = evaluateObjectives(world([unit("bunker"), ...strips]), 0);
        const o = objs.find((x) => x.id === id);
        expect(o.done).toBe(true);
        expect(o.tasks.every((t) => t.done)).toBe(true);
    });

    it("test_one_airstrip_short_is_incomplete", () => {
        const id = firstObjective().id;
        const strips = Array.from({length: OBJECTIVES_TUNING.airstripsRequired - 1}, (_, i) => unit("airstrip", -100 + i));
        const objs = evaluateObjectives(world([unit("bunker"), ...strips]), 0);
        const airstripTask = objs.find((o) => o.id === id).tasks.find((t) => t.id === "airstrips");
        expect(airstripTask.done).toBe(false);
        expect(airstripTask.progress).toBeLessThan(1);
    });

    it("test_radar_objective_tracks_coverage_threshold", () => {
        const id = coverageObjective().id;
        // No radar: coverage objective open.
        let objs = evaluateObjectives(world([]), 0);
        expect(objs.find((o) => o.id === id).done).toBe(false);
        // OTH array: coverage clears the 80% threshold.
        objs = evaluateObjectives(world([unit("oth")]), 0);
        expect(objs.find((o) => o.id === id).done).toBe(true);
    });

    it("test_progress_is_clamped_to_unit_interval", () => {
        // Over-building past the target must not push progress above 1.
        const many = Array.from({length: OBJECTIVES_TUNING.airstripsRequired + 3}, (_, i) => unit("airstrip", -105 + i));
        const objs = evaluateObjectives(world([unit("bunker"), ...many]), 0);
        for (const o of objs) for (const t of o.tasks) expect(t.progress).toBeLessThanOrEqual(1);
    });
});
