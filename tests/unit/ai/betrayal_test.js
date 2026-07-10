// Betrayal windows (ai/diplomacy/betrayal.js): betrayalTarget picks a staggering
// neighbour — at war elsewhere with a surviving fraction under BETRAYAL.targetFracMax —
// for a pressing, ready, low-loyalty nation, flagging breakFirst when the mark is an
// ally. Every gate is exercised: posture, readiness floor, DIPLOMACY.maxWars, a
// losing/routed war of our own, and the post-white-peace cease-fire window.
// Deterministic — synthetic worlds, no RNG; posture/personality/readiness passed in.
import {describe, expect, it} from "vitest";
import {createWorld, declareWar, formAlliance} from "../../../src/game/engine.js";
import {betrayalTarget} from "../../../src/game/sim/ai/diplomacy/betrayal.js";
import {ensureDiplo} from "../../../src/game/sim/ai/diplomacy/ledger.js";
import {buildFrame, capPositions} from "../../../src/game/sim/ai/perception/perception.js";
import {PEACE} from "../../../src/game/sim/ai/tuning.js";

// Slot 1 (US, Kansas) is the AI under test. Canada (2) is the prospective mark —
// three cities so its surviving fraction can fall to 1/3 without elimination —
// and Mexico (3) is the war Canada is losing. The human (0) idles out of reach in
// Australia. Leadership never takes damage here, so staggering() can only trigger
// through the at-war + surviving-fraction path.
function fresh() {
    return createWorld({
        mySlot: 0, seed: 7,
        nations: [
            {slot: 0, name: "Aussie", iso: "AU", isAi: false, gdp: 5},
            {slot: 1, name: "Amer", iso: "US", isAi: true, gdp: 5},
            {slot: 2, name: "Cana", iso: "CA", isAi: true, gdp: 5},
            {slot: 3, name: "Mexo", iso: "MX", isAi: true, gdp: 5},
        ],
        cities: [
            {id: "p1", slot: 0, name: "P-Cap", state: "NT", cap: 1, pop: 1e6, econ: 1, lng: 133.87, lat: -23.7},
            {id: "a1", slot: 1, name: "A-Cap", state: "KS", cap: 1, pop: 1e6, econ: 1, lng: -98, lat: 39},
            {id: "b1", slot: 2, name: "B-Cap", state: "ON", cap: 1, pop: 1e6, econ: 1, lng: -80, lat: 49},
            {id: "b2", slot: 2, name: "B-2", state: "SK", cap: 0, pop: 5e5, econ: 1, lng: -106.3, lat: 52.13},
            {id: "b3", slot: 2, name: "B-3", state: "AB", cap: 0, pop: 5e5, econ: 1, lng: -114.07, lat: 51.05},
            {id: "e1", slot: 3, name: "E-Cap", state: "ZA", cap: 1, pop: 1e6, econ: 1, lng: -102.5, lat: 23.6},
        ],
        rules: {playerGraceSec: 0},   // t=0 declareWar calls stand up their wars
    });
}

const nation = (w, slot) => w.nations.find((n) => n.slot === slot);

function frameFor(w, slot) {
    const unitsBySlot = new Map(w.nations.map((n) => [n.slot, []]));
    return buildFrame(w, nation(w, slot), {unitsBySlot, caps: capPositions(w)});
}

// Canada staggers: at war with Mexico and down to 1/3 of its cities (< 0.55).
function stagger(w) {
    declareWar(w, 2, 3);
    w.cities.find((c) => c.id === "b2").alive = false;
    w.cities.find((c) => c.id === "b3").alive = false;
}

const PRESS = {mode: "press"};
const CYNIC = {loyalty: 0.1, aggression: 0.5};

describe("betrayalTarget — the opportunistic strike window", () => {
    it("test_staggering_rival_is_targeted_without_breaking_anything", () => {
        const w = fresh();
        stagger(w);
        expect(betrayalTarget(w, frameFor(w, 1), PRESS, CYNIC, 0.7))
            .toEqual({target: 2, breakFirst: false});
    });

    it("test_staggering_ally_is_targeted_with_break_first", () => {
        const w = fresh();
        formAlliance(w, 1, 2);
        stagger(w);
        expect(betrayalTarget(w, frameFor(w, 1), PRESS, CYNIC, 0.7))
            .toEqual({target: 2, breakFirst: true});
    });

    it("test_hold_and_turtle_postures_never_betray", () => {
        const w = fresh();
        stagger(w);
        const f = frameFor(w, 1);
        expect(betrayalTarget(w, f, {mode: "hold"}, CYNIC, 0.7)).toBe(null);
        expect(betrayalTarget(w, f, {mode: "turtle"}, CYNIC, 0.7)).toBe(null);
    });

    it("test_readiness_floor_gates_the_window", () => {
        const w = fresh();
        stagger(w);
        const f = frameFor(w, 1);
        expect(betrayalTarget(w, f, PRESS, CYNIC, 0.59)).toBe(null);
        expect(betrayalTarget(w, f, PRESS, CYNIC, 0.6)).toEqual({target: 2, breakFirst: false});
    });

    it("test_no_new_front_at_max_wars", () => {
        const w = fresh();
        stagger(w);
        declareWar(w, 1, 3);                               // DIPLOMACY.maxWars = 2
        declareWar(w, 1, 0);
        expect(betrayalTarget(w, frameFor(w, 1), PRESS, CYNIC, 0.7)).toBe(null);
    });

    it("test_a_losing_or_routed_war_of_our_own_blocks_opportunism", () => {
        const w = fresh();
        stagger(w);
        declareWar(w, 1, 3);
        const f = frameFor(w, 1);                          // frame.diplo is the live n.diplo
        ensureDiplo(nation(w, 1)).warState[3] = "losing";
        expect(betrayalTarget(w, f, PRESS, CYNIC, 0.7)).toBe(null);
        ensureDiplo(nation(w, 1)).warState[3] = "routed";
        expect(betrayalTarget(w, f, PRESS, CYNIC, 0.7)).toBe(null);
        ensureDiplo(nation(w, 1)).warState[3] = "winning"; // a war going well is no brake
        expect(betrayalTarget(w, f, PRESS, CYNIC, 0.7)).toEqual({target: 2, breakFirst: false});
    });

    it("test_cease_fire_window_shields_the_target", () => {
        const w = fresh();
        stagger(w);
        ensureDiplo(nation(w, 1)).ceaseFire[2] = 0;        // white peace with Canada at t=0
        w.time = PEACE.ceaseFireSec - 1;
        const f = frameFor(w, 1);                          // betrayalTarget reads w.time live
        expect(betrayalTarget(w, f, PRESS, CYNIC, 0.7)).toBe(null);
        w.time = PEACE.ceaseFireSec;
        expect(betrayalTarget(w, f, PRESS, CYNIC, 0.7)).toEqual({target: 2, breakFirst: false});
    });

    it("test_loyal_and_timid_spares_the_rival_but_aggression_overrides", () => {
        const w = fresh();
        stagger(w);
        const f = frameFor(w, 1);
        expect(betrayalTarget(w, f, PRESS, {loyalty: 0.6, aggression: 0.4}, 0.7)).toBe(null);
        expect(betrayalTarget(w, f, PRESS, {loyalty: 0.6, aggression: 0.9}, 0.7))
            .toEqual({target: 2, breakFirst: false});
    });

    it("test_healthy_belligerent_is_not_staggering", () => {
        const w = fresh();
        declareWar(w, 2, 3);                               // at war, but untouched: frac 1
        expect(betrayalTarget(w, frameFor(w, 1), PRESS, CYNIC, 0.7)).toBe(null);
    });
});
