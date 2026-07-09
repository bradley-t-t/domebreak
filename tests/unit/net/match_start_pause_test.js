import {describe, expect, test} from "vitest";
import {openingFreeze} from "../../../server/match/openingFreeze.js";

// The opening freeze holds an online match paused for a fixed countdown, then
// releases it to live play. START/UNTIL are fixed anchors so the transition is
// deterministic (no wall-clock reads).
const START = 1_000_000;
const UNTIL = START + 30_000; // 30s freeze

describe("openingFreeze", () => {
    test("holds paused with a full countdown at match start", () => {
        expect(openingFreeze(START, UNTIL)).toEqual({paused: true, startsIn: 30});
    });

    test("counts down in whole seconds while frozen", () => {
        expect(openingFreeze(UNTIL - 1_000, UNTIL)).toEqual({paused: true, startsIn: 1});
        expect(openingFreeze(UNTIL - 1, UNTIL)).toEqual({paused: true, startsIn: 1});
    });

    test("releases to live play at the deadline", () => {
        expect(openingFreeze(UNTIL, UNTIL)).toEqual({paused: false, startsIn: 0});
    });

    test("stays live after the deadline", () => {
        expect(openingFreeze(UNTIL + 5_000, UNTIL)).toEqual({paused: false, startsIn: 0});
    });

    test("a zero-length freeze is live immediately", () => {
        expect(openingFreeze(START, START)).toEqual({paused: false, startsIn: 0});
    });
});
