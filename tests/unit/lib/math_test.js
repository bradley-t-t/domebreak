import {describe, expect, it} from "vitest";
import {clamp, clamp01, clampSym, norm01} from "../../../src/lib/math.js";

describe("clamp", () => {
    it("test_returns_value_inside_range", () => {
        expect(clamp(5, 0, 10)).toBe(5);
    });
    it("test_pins_to_lower_bound_below_range", () => {
        expect(clamp(-3, 0, 10)).toBe(0);
    });
    it("test_pins_to_upper_bound_above_range", () => {
        expect(clamp(42, 0, 10)).toBe(10);
    });
});

describe("clamp01", () => {
    it("test_returns_value_inside_unit_interval", () => {
        expect(clamp01(0.6)).toBe(0.6);
    });
    it("test_pins_negatives_to_zero", () => {
        expect(clamp01(-0.1)).toBe(0);
    });
    it("test_pins_above_one_to_one", () => {
        expect(clamp01(1.4)).toBe(1);
    });
});

describe("clampSym", () => {
    it("test_returns_value_inside_symmetric_range", () => {
        expect(clampSym(0.3, 1)).toBe(0.3);
    });
    it("test_pins_below_neg_limit", () => {
        expect(clampSym(-5, 2)).toBe(-2);
    });
    it("test_pins_above_pos_limit", () => {
        expect(clampSym(5, 2)).toBe(2);
    });
});

describe("norm01", () => {
    it("test_maps_midpoint_to_half", () => {
        expect(norm01(5, 0, 10)).toBe(0.5);
    });
    it("test_pins_below_lo_to_zero", () => {
        expect(norm01(-1, 0, 10)).toBe(0);
    });
    it("test_pins_above_hi_to_one", () => {
        expect(norm01(20, 0, 10)).toBe(1);
    });
    it("test_zero_span_snaps_at_endpoint", () => {
        expect(norm01(5, 5, 5)).toBe(1);
        expect(norm01(4, 5, 5)).toBe(0);
    });
});
