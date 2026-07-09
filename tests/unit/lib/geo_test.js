import {describe, expect, it} from "vitest";
import {cosLatSafe, offsetKmPolar, screenHeadingDeg, unwrapLng, wrapAnglePi} from "../../../src/lib/geo.js";

describe("unwrapLng", () => {
    it("test_returns_input_when_within_range", () => {
        expect(unwrapLng(120, 100)).toBe(120);
    });
    it("test_subtracts_360_when_more_than_180_ahead", () => {
        expect(unwrapLng(200, -170)).toBe(-160);
    });
    it("test_adds_360_when_more_than_180_behind", () => {
        expect(unwrapLng(-179, 179)).toBe(181);
    });
});

describe("wrapAnglePi", () => {
    it("test_returns_delta_inside_range", () => {
        expect(wrapAnglePi(0.5)).toBeCloseTo(0.5, 10);
    });
    it("test_folds_positive_over_pi", () => {
        expect(wrapAnglePi(1.5 * Math.PI)).toBeCloseTo(-0.5 * Math.PI, 10);
    });
    it("test_folds_negative_below_neg_pi", () => {
        expect(wrapAnglePi(-1.5 * Math.PI)).toBeCloseTo(0.5 * Math.PI, 10);
    });
});

describe("cosLatSafe", () => {
    it("test_returns_cos_lat_at_moderate_latitude", () => {
        expect(cosLatSafe(0)).toBeCloseTo(1, 10);
        expect(cosLatSafe(60)).toBeCloseTo(0.5, 10);
    });
    it("test_floors_near_the_poles", () => {
        expect(cosLatSafe(89.9)).toBe(0.05);
        expect(cosLatSafe(-89.9)).toBe(0.05);
    });
    it("test_respects_custom_floor", () => {
        expect(cosLatSafe(89.9, 0.1)).toBe(0.1);
    });
});

describe("offsetKmPolar", () => {
    it("test_returns_origin_for_zero_km", () => {
        const p = offsetKmPolar({lng: 10, lat: 20}, 0, 0);
        expect(p.lng).toBeCloseTo(10, 10);
        expect(p.lat).toBeCloseTo(20, 10);
    });
    it("test_offsets_east_at_equator_by_km_over_111", () => {
        const p = offsetKmPolar({lng: 0, lat: 0}, 111, 0);
        expect(p.lng).toBeCloseTo(1, 6);
        expect(p.lat).toBeCloseTo(0, 6);
    });
    it("test_offsets_north_by_km_over_111", () => {
        const p = offsetKmPolar({lng: 0, lat: 0}, 111, Math.PI / 2);
        expect(p.lng).toBeCloseTo(0, 6);
        expect(p.lat).toBeCloseTo(1, 6);
    });
});

describe("screenHeadingDeg", () => {
    it("test_returns_zero_for_zero_delta", () => {
        expect(screenHeadingDeg(0, 0)).toBe(0);
    });
    it("test_returns_zero_for_pure_up_delta", () => {
        expect(screenHeadingDeg(0, -1)).toBeCloseTo(0, 10);
    });
    it("test_returns_ninety_for_pure_right_delta", () => {
        expect(screenHeadingDeg(1, 0)).toBeCloseTo(90, 10);
    });
});
