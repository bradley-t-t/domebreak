import {describe, expect, it} from "vitest";
import {jitter, randRange, weightedPick} from "../../../src/lib/random.js";

describe("randRange", () => {
    it("test_returns_min_at_sample_zero", () => {
        expect(randRange(0, 10, 5)).toBe(10);
    });
    it("test_returns_min_plus_span_at_sample_one", () => {
        expect(randRange(1, 10, 5)).toBe(15);
    });
    it("test_midpoint_sample_lands_in_middle", () => {
        expect(randRange(0.5, 10, 4)).toBe(12);
    });
});

describe("jitter", () => {
    it("test_returns_zero_at_sample_half", () => {
        expect(jitter(0.5, 4)).toBe(0);
    });
    it("test_returns_negative_half_span_at_sample_zero", () => {
        expect(jitter(0, 4)).toBe(-2);
    });
    it("test_returns_positive_half_span_at_sample_one", () => {
        expect(jitter(1, 4)).toBe(2);
    });
});

describe("weightedPick", () => {
    it("test_returns_first_when_rng_low", () => {
        const entries = [["a", 1], ["b", 2], ["c", 3]];
        // total = 6; r = 0.1 * 6 = 0.6; subtract 1 -> -0.4 -> pick "a"
        expect(weightedPick(entries, () => 0.1)).toBe("a");
    });
    it("test_returns_last_when_rng_high", () => {
        const entries = [["a", 1], ["b", 2], ["c", 3]];
        // total = 6; r = 0.95 * 6 = 5.7; through a (-4.7) through b (-2.7) into c
        expect(weightedPick(entries, () => 0.95)).toBe("c");
    });
    it("test_returns_null_on_empty", () => {
        expect(weightedPick([], () => 0.5)).toBeNull();
    });
    it("test_returns_last_when_total_is_zero", () => {
        expect(weightedPick([["a", 0], ["b", 0]], () => 0.5)).toBe("b");
    });
});
