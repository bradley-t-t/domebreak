// Neutral annexation: a capture-flagged ground unit that holds a PASSIVE NEUTRAL
// city bordering its own nation takes that city's state — no war declared, since
// neutrals never resist. The adjacency gate (NEUTRAL.annexBorderKm) means only
// neutral land touching your territory can be absorbed, so conquest spreads
// outward from your borders. Mirrors the war-capture path (same hold/flip), and
// tags the takeover event with `annex` so the UI words it as annexation.
//
// Deterministic: annexation is a pure function of positions, ownership, and dt.
import {describe, expect, it} from "vitest";
import {captureTick} from "../../../src/game/sim/occupation.js";
import {NEUTRAL} from "../../../src/game/data/constants.js";

// slot 0 = an active nation with a border city at the origin; slot 1 = a passive
// neutral whose city sits `gapKm`-ish away. A lone infantry parked on the neutral
// city is unambiguously the nearest annexer with nothing to contest it.
function theatre({gapDeg = 0.3} = {}) {
    return {
        time: 0,
        events: [],
        nations: [
            {slot: 0, active: true, relations: {}},
            {slot: 1, active: false, relations: {}},
        ],
        cities: [
            {id: "home", slot: 0, lng: 0, lat: 0, alive: true, state: "Home", hp: 100},
            {id: "neu", slot: 1, lng: gapDeg, lat: 0, alive: true, state: "Frontier", hp: 100, capture: null},
        ],
        // The infantry sits on the neutral city so it holds within CAPTURE.holdKm.
        units: [{id: "u1", slot: 0, type: "infantry", lng: gapDeg, lat: 0, hp: 75}],
    };
}

describe("neutral annexation", () => {
    it("test_holding_a_bordering_neutral_city_accrues_annex_progress", () => {
        const w = theatre();
        captureTick(w, 1);
        expect(w.cities[1].capture.slot).toBe(0);
        expect(w.cities[1].capture.annex).toBe(true);
        expect(w.cities[1].capture.progress).toBeCloseTo(1 / NEUTRAL.annexSec, 6);
    });

    it("test_full_hold_flips_the_state_and_fires_an_annex_event", () => {
        const w = theatre();
        captureTick(w, NEUTRAL.annexSec);
        // The neutral city is now the annexer's.
        expect(w.cities[1].slot).toBe(0);
        const ev = w.events.find((e) => e.type === "captured");
        expect(ev).toBeTruthy();
        expect(ev.annex).toBe(1);
        expect(ev.slot).toBe(0);
        expect(ev.fromSlot).toBe(1);
    });

    it("test_no_war_is_required", () => {
        const w = theatre();
        // Relations stay empty — annexation never touches them.
        captureTick(w, NEUTRAL.annexSec);
        expect(w.nations[0].relations).toEqual({});
        expect(w.nations[1].relations).toEqual({});
    });

    it("test_neutral_too_far_from_your_territory_is_not_annexable", () => {
        // Push the neutral city well past annexBorderKm from the home city, but keep
        // the infantry sitting on it — it holds, yet the adjacency gate refuses.
        const farDeg = (NEUTRAL.annexBorderKm / 111) + 2; // comfortably beyond the border range
        const w = theatre({gapDeg: farDeg});
        captureTick(w, NEUTRAL.annexSec);
        expect(w.cities[1].slot).toBe(1);      // still neutral
        expect(w.cities[1].capture).toBeNull(); // no attempt ever started
    });

    it("test_a_rival_captor_freezes_the_annexation", () => {
        const w = theatre();
        // slot 2 is another active nation; its infantry contests within contestKm.
        w.nations.push({slot: 2, active: true, relations: {}});
        w.units.push({id: "u2", slot: 2, type: "infantry", lng: 0.35, lat: 0, hp: 75});
        captureTick(w, 1);
        // Contested — no forward progress this tick.
        expect(w.cities[1].capture?.progress ?? 0).toBe(0);
        expect(w.cities[1].slot).toBe(1);
    });
});
