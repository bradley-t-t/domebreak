// Leadership airlift dispatch: an airstrip staggers its ferry takeoffs (a queue,
// not all-at-once) and scrambles a fighter escort with every ferry it launches.
// Deterministic — evacTick has no RNG; we drive world time by hand.
import {describe, expect, it} from "vitest";
import {evacTick} from "../../../src/game/sim/leadership.js";
import {LEADERSHIP} from "../../../src/game/data/constants.js";

// Minimal shelter-in-progress world: one nation actively evacuating, one capital
// still holding all its leaders, a bunker to fly them to, and one airstrip.
function world() {
    return {
        time: 0,
        _id: 0,
        events: [],
        nations: [{slot: 0, alive: true, isAi: false, relations: {}, lead: {total: 12, lost: 0, sheltered: 0}, _evac: "shelter"}],
        cities: [{id: "c1", slot: 0, alive: true, cap: true, pop: 1000, leaders: 12, lng: 0, lat: 0}],
        units: [
            {id: "bunker", slot: 0, type: "bunker", hp: 100, lng: 1, lat: 1},
            {id: "strip", slot: 0, type: "airstrip", hp: 100, lng: 0.5, lat: 0.5},
        ],
    };
}

const ferries = (w) => w.units.filter((u) => u.mission?.role === "leadershipFerry");
const escorts = (w) => w.units.filter((u) => u.mission?.role === "leadershipEscort");

describe("leadership airlift dispatch", () => {
    it("test_ferry_launches_with_a_fighter_escort", () => {
        const w = world();
        evacTick(w);
        expect(ferries(w).length).toBe(1);
        const esc = escorts(w);
        expect(esc.length).toBe(LEADERSHIP.escortsPerFerry);
        // Escorts belong to the player, guard THIS ferry, and are real fighters.
        expect(esc.every((e) => e.slot === 0)).toBe(true);
        expect(esc.every((e) => e.mission.leadId === ferries(w)[0].id)).toBe(true);
        expect(esc.every((e) => e.type === "interceptor")).toBe(true);
    });

    it("test_takeoffs_are_queued_not_simultaneous", () => {
        const w = world();
        evacTick(w);                 // launches ferry #1
        expect(ferries(w).length).toBe(1);
        evacTick(w);                 // same tick-time: the queue gap blocks a 2nd
        expect(ferries(w).length).toBe(1);
        w.time = LEADERSHIP.launchGapSec + 0.1; // gap elapsed
        evacTick(w);                 // now the next one may roll
        expect(ferries(w).length).toBe(2);
    });

    it("test_escorts_draw_from_fighter_stock", () => {
        const w = world();
        evacTick(w);
        const strip = w.units.find((u) => u.id === "strip");
        // Started at HANGAR_SPEC.airstrip.interceptor (10); two were scrambled.
        expect(strip.hangar.interceptor).toBe(10 - LEADERSHIP.escortsPerFerry);
        expect(strip.hangar.transport).toBe(20 - 1);
    });
});
