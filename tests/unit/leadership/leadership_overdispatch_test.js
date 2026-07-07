// Leadership airlift over-dispatch guard: a ferry sitting on a pickup pad LOADING
// has already claimed that source's leaders, but it hasn't drawn them out of the
// stock yet (that happens the instant loading finishes). The evac controller must
// count a loading ferry as coverage — otherwise a second airstrip re-sends a ferry
// for leaders already being lifted, and it arrives to an empty source: a wasted
// round trip. This is the multi-airfield bug. Deterministic — evacTick has no RNG.
import {describe, expect, it} from "vitest";
import {evacTick} from "../../../src/game/sim/leadership.js";
import {LEADERSHIP} from "../../../src/game/data/constants.js";

const P = LEADERSHIP.perPlane;
const ferries = (w) => w.units.filter((u) => u.mission?.role === "leadershipFerry");

// Two airstrips (the multi-airfield case), a bunker, and one capital. Optionally
// seeds a ferry already LOADING at the capital so we can prove it counts as
// coverage. time is past the takeoff gap so the queue interval is never the thing
// suppressing a launch — only the coverage accounting is under test.
function shelterWorld(cityLeaders, {loading = false} = {}) {
    const w = {
        time: LEADERSHIP.launchGapSec + 1,
        _id: 0,
        events: [],
        nations: [{slot: 0, alive: true, isAi: false, relations: {}, lead: {total: 12, lost: 0, sheltered: 0}, _evac: "shelter"}],
        cities: [{id: "c1", slot: 0, alive: true, cap: true, pop: 1000, leaders: cityLeaders, lng: 0, lat: 0}],
        units: [
            {id: "bunker", slot: 0, type: "bunker", hp: 100, lng: 1, lat: 1},
            {id: "stripA", slot: 0, type: "airstrip", hp: 100, lng: 0.5, lat: 0.5},
            {id: "stripB", slot: 0, type: "airstrip", hp: 100, lng: -0.5, lat: -0.5},
        ],
    };
    if (loading) w.units.push({
        id: "f-load", slot: 0, type: "transport", hp: 50, lng: 0, lat: 0, baseId: "stripA",
        mission: {role: "leadershipFerry", mode: "shelter", phase: "loading", capId: "c1", bunkerId: "bunker", homeId: "stripA", timer: 2, cargo: 0},
    });
    return w;
}

// Release variant: leaders sheltered in the bunker, a living city to receive them,
// two strips, and optionally a release ferry LOADING at the bunker.
function releaseWorld(sheltered, {loading = false} = {}) {
    const w = {
        time: LEADERSHIP.launchGapSec + 1,
        _id: 0,
        events: [],
        nations: [{slot: 0, alive: true, isAi: false, relations: {}, lead: {total: 12, lost: 0, sheltered}, _evac: "release"}],
        cities: [{id: "c1", slot: 0, alive: true, cap: true, pop: 1000, leaders: 0, lng: 0, lat: 0}],
        units: [
            {id: "bunker", slot: 0, type: "bunker", hp: 100, lng: 1, lat: 1},
            {id: "stripA", slot: 0, type: "airstrip", hp: 100, lng: 0.5, lat: 0.5},
            {id: "stripB", slot: 0, type: "airstrip", hp: 100, lng: -0.5, lat: -0.5},
        ],
    };
    if (loading) w.units.push({
        id: "f-load", slot: 0, type: "transport", hp: 50, lng: 1, lat: 1, baseId: "stripA",
        mission: {role: "leadershipFerry", mode: "release", phase: "loading", capId: "c1", bunkerId: "bunker", homeId: "stripA", timer: 2, cargo: 0},
    });
    return w;
}

describe("leadership airlift over-dispatch", () => {
    it("test_loading_ferry_blocks_redundant_shelter_dispatch", () => {
        // One ferry loading fully covers a capital holding exactly perPlane leaders.
        // No second ferry should launch from either airstrip.
        const w = shelterWorld(P, {loading: true});
        evacTick(w);
        expect(ferries(w).length).toBe(1);
    });

    it("test_incomplete_coverage_still_dispatches_but_not_more_than_needed", () => {
        // Capital holds 2*perPlane; the loading ferry covers one plane-load, so
        // exactly ONE more ferry is needed — not two. Proves the fix doesn't
        // over-suppress (no stranded leaders) and doesn't over-send.
        const w = shelterWorld(P * 2, {loading: true});
        evacTick(w);
        expect(ferries(w).length).toBe(2);
    });

    it("test_no_loading_ferry_dispatches_exactly_one_for_a_small_city", () => {
        // Baseline: a lone capital with perPlane leaders and two strips must draw
        // exactly one ferry in a tick (same-tick multi-strip claim already works).
        const w = shelterWorld(P);
        evacTick(w);
        expect(ferries(w).length).toBe(1);
    });

    it("test_loading_ferry_blocks_redundant_release_dispatch", () => {
        // Reverse airlift: a release ferry loading at the bunker covers the whole
        // sheltered pool (perPlane), so no redundant release ferry launches.
        const w = releaseWorld(P, {loading: true});
        evacTick(w);
        expect(ferries(w).length).toBe(1);
    });
});
