// THAAD keep-out zone: an area-ABM battery can't engage inside its minimum
// range. Covers the defenseMinRange query and the annulus geometry the map
// overlay uses to draw the hollow interior. Deterministic, no RNG, no I/O.
import {describe, expect, it} from "vitest";
import {defenseMinRange, defenseRange} from "../../../src/game/engine.js";
import {circle} from "../../../src/game/geo/geo.js";
import {UNITS} from "../../../src/game/data/constants.js";

// Minimal world: one nation (slot 0) with no range multipliers.
function world() {
    return {nations: [{slot: 0, alive: true, relations: {}}], units: [], cities: []};
}

const unit = (type) => ({id: "u", slot: 0, type, lng: 0, lat: 0, hp: 100});

describe("defenseMinRange", () => {
    it("test_thaad_has_keep_out_from_data", () => {
        expect(defenseMinRange(world(), unit("thaad"))).toBe(UNITS.thaad.minRange);
        expect(defenseMinRange(world(), unit("thaad"))).toBeGreaterThan(0);
    });
    it("test_point_defense_has_no_keep_out", () => {
        expect(defenseMinRange(world(), unit("battery"))).toBe(0);
        expect(defenseMinRange(world(), unit("patriot"))).toBe(0);
    });
    it("test_keep_out_is_inside_engage_range", () => {
        const w = world(), t = unit("thaad");
        // The annulus must be non-degenerate: min strictly below the outer reach.
        expect(defenseMinRange(w, t)).toBeLessThan(defenseRange(w, t));
    });
});

describe("engage annulus gate", () => {
    // Mirrors the tick.js firing condition: fire only when the target sits in
    // [minRange, engageRange]. A target that has dived inside the keep-out is out.
    const engages = (w, d, distKm) => distKm <= defenseRange(w, d) && distKm >= defenseMinRange(w, d);
    it("test_far_target_engaged", () => {
        const w = world(), t = unit("thaad");
        expect(engages(w, t, UNITS.thaad.range - 1)).toBe(true);
    });
    it("test_target_inside_keep_out_is_ignored", () => {
        const w = world(), t = unit("thaad");
        expect(engages(w, t, UNITS.thaad.minRange - 1)).toBe(false);
    });
    it("test_target_beyond_reach_is_ignored", () => {
        const w = world(), t = unit("thaad");
        expect(engages(w, t, UNITS.thaad.range + 1)).toBe(false);
    });
});

describe("circle annulus geometry", () => {
    it("test_solid_disc_has_one_ring", () => {
        const f = circle(0, 0, 700, 40);
        expect(f.geometry.coordinates).toHaveLength(1);
    });
    it("test_keep_out_punches_a_second_ring", () => {
        const f = circle(0, 0, 700, 40, 250);
        expect(f.geometry.coordinates).toHaveLength(2);
        // Inner ring closes on itself (first vertex === last).
        const inner = f.geometry.coordinates[1];
        expect(inner[0]).toEqual(inner[inner.length - 1]);
    });
    it("test_degenerate_hole_is_dropped", () => {
        // innerKm >= km would invert the ring — treated as no hole.
        expect(circle(0, 0, 300, 40, 300).geometry.coordinates).toHaveLength(1);
        expect(circle(0, 0, 300, 40, 400).geometry.coordinates).toHaveLength(1);
    });
});
