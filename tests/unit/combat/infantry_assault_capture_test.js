// Infantry city assault: a capture-flagged unit that ATTACKS the city it is
// holding drives the capture flip CAPTURE.assaultMult times faster than merely
// standing on it. Also pins the "assault feeds capture, it does not raze"
// contract at the sim level — the city stays alive/full-HP while being taken.
// Deterministic: capture is a pure function of positions, war state, and dt.
import {describe, expect, it} from "vitest";
import {captureTick} from "../../../src/game/sim/occupation.js";
import {CAPTURE} from "../../../src/game/data/constants.js";

// Minimal theatre: nation 0 (attacker) at war with nation 1 (city owner), a lone
// infantry sitting on the enemy city so it is unambiguously the nearest captor
// and nothing hostile is nearby to contest the hold.
function theatre({targetId = null} = {}) {
    return {
        time: 0,
        events: [],
        nations: [
            {slot: 0, relations: {1: "war"}},
            {slot: 1, relations: {0: "war"}}
        ],
        units: [{id: "u1", slot: 0, type: "infantry", lng: 0, lat: 0, hp: 75, targetId}],
        cities: [{id: "c1", slot: 1, lng: 0, lat: 0, alive: true, state: "Testland", hp: 100, capture: null}]
    };
}

describe("infantry city capture", () => {
    it("test_hold_accrues_base_rate", () => {
        const w = theatre();
        captureTick(w, 1);
        expect(w.cities[0].capture.slot).toBe(0);
        expect(w.cities[0].capture.progress).toBeCloseTo(1 / CAPTURE.captureSec, 6);
        expect(w.cities[0].capture.assault).toBe(false);
    });

    it("test_assault_multiplies_capture_rate", () => {
        const w = theatre({targetId: "c1"});
        captureTick(w, 1);
        expect(w.cities[0].capture.assault).toBe(true);
        expect(w.cities[0].capture.progress).toBeCloseTo(CAPTURE.assaultMult / CAPTURE.captureSec, 6);
    });

    it("test_assault_is_strictly_faster_than_holding", () => {
        const hold = theatre();
        const assault = theatre({targetId: "c1"});
        captureTick(hold, 1);
        captureTick(assault, 1);
        expect(assault.cities[0].capture.progress).toBeGreaterThan(hold.cities[0].capture.progress);
    });

    it("test_assault_does_not_raze_the_city", () => {
        // The whole point: attacking the city accelerates the flip, it must not
        // destroy the objective. captureTick never touches city HP or aliveness.
        const w = theatre({targetId: "c1"});
        captureTick(w, 1);
        expect(w.cities[0].alive).toBe(true);
        expect(w.cities[0].hp).toBe(100);
    });
});
