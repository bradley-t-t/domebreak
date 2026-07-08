// Bounded-match / neutral-world model (adr-008): victory resolves against the
// ACTIVE set (passive neutrals never block a win), and active nations are seeded
// scattered across the globe. Neutrals are non-interactable scenery — never targeted
// or captured. Deterministic, no RNG, no I/O.
import {describe, expect, it} from "vitest";
import {stepVictory} from "../../../src/game/sim/tickPhases.js";
import {isActive} from "../../../src/game/sim/queries.js";
import {pickActiveIsos} from "../../../src/game/sim/newGame.js";

// Minimal world for stepVictory: nations[slot] ordered so nationOf hits directly.
function world(nations, cities) {
    return {mySlot: 0, time: 0, over: false, paused: false, winnerSlot: undefined, nations, cities};
}
const nat = (slot, active, alive = true) => ({slot, active, alive, relations: {}});
const city = (slot, pop, alive = true) => ({slot, pop, alive});

describe("victory resolves against the active set", () => {
    it("test_victory_last_active_standing_wins_ignoring_neutrals", () => {
        // Me (active) holds a city; my only rival (active) holds none → eliminated;
        // a populous neutral still stands but must NOT keep the game going.
        const nations = [nat(0, true), nat(1, true), nat(2, false)];
        const w = world(nations, [city(0, 100), city(2, 300)]); // rival (1) holds nothing
        stepVictory(w);
        expect(w.over).toBe(true);
        expect(w.winnerSlot).toBe(0);
    });

    it("test_no_victory_while_two_actives_survive", () => {
        const nations = [nat(0, true), nat(1, true), nat(2, false)];
        const w = world(nations, [city(0, 100), city(1, 100), city(2, 300)]);
        stepVictory(w);
        expect(w.over).toBe(false);
    });

    it("test_multiple_living_neutrals_do_not_block_the_win", () => {
        const nations = [nat(0, true), nat(1, true), nat(2, false), nat(3, false)];
        // rival (1) eliminated; two neutrals alive — still a win.
        const w = world(nations, [city(0, 100), city(2, 200), city(3, 200)]);
        stepVictory(w);
        expect(w.over).toBe(true);
        expect(w.winnerSlot).toBe(0);
    });

    it("test_player_elimination_is_defeat", () => {
        const nations = [nat(0, true), nat(1, true)];
        const w = world(nations, [city(1, 100)]); // I hold nothing
        stepVictory(w);
        expect(w.over).toBe(true);
        expect(w.winnerSlot).toBe(null);
    });

    it("test_domination_over_world_population_wins_with_rival_alive", () => {
        // Captured neutrals count toward my share of the WHOLE world's population.
        const nations = [nat(0, true), nat(1, true), nat(2, false)];
        const w = world(nations, [city(0, 600), city(1, 100), city(2, 300)]); // 600/1000 = 0.6 ≥ 0.5
        stepVictory(w);
        expect(w.over).toBe(true);
        expect(w.winnerSlot).toBe(0);
    });

    it("test_missing_active_flag_counts_as_active_backward_compat", () => {
        // An older save with no `active` field must behave like an all-active match.
        const nations = [{slot: 0, alive: true, relations: {}}, {slot: 1, alive: true, relations: {}}];
        const w = world(nations, [city(0, 100)]); // nation 1 eliminated
        stepVictory(w);
        expect(w.over).toBe(true);       // last (undefined-active → active) standing
        expect(w.winnerSlot).toBe(0);
    });
});

describe("active-nation seeding is scattered", () => {
    // A: origin. B: ~111 km from A (nearest). C: far north. D: antipodal-ish (farthest).
    const data = {
        cities: {
            A: [{lng: 0, lat: 0, cap: true}],
            B: [{lng: 0, lat: 1, cap: true}],
            C: [{lng: 0, lat: 80, cap: true}],
            D: [{lng: 180, lat: 0, cap: true}],
        },
    };

    it("test_seeding_prefers_far_capitals_over_near_ones", () => {
        const picked = pickActiveIsos(data, ["A"], ["B", "C", "D"], 3);
        expect(picked).toHaveLength(3);
        expect(picked[0]).toBe("A");           // the participant is always included first
        expect(picked).toContain("D");         // farthest chosen
        expect(picked).toContain("C");
        expect(picked).not.toContain("B");     // the near neighbour is left out
    });

    it("test_seeding_clamps_to_available_pool", () => {
        expect(pickActiveIsos(data, ["A"], ["B"], 5)).toEqual(["A", "B"]);
    });

    it("test_seeding_of_count_one_is_just_the_participant", () => {
        expect(pickActiveIsos(data, ["A"], ["B", "C"], 1)).toEqual(["A"]);
    });
});

describe("isActive reflects the active flag", () => {
    const w = {
        nations: [
            {slot: 0, active: true, relations: {}},
            {slot: 1, active: false, relations: {}}, // neutral
        ],
    };
    it("test_isActive_true_for_active_nation", () => {
        expect(isActive(w, 0)).toBe(true);
    });
    it("test_isActive_false_for_neutral_nation", () => {
        expect(isActive(w, 1)).toBe(false);
    });
    it("test_isActive_true_when_flag_absent", () => {
        expect(isActive({nations: [{slot: 0, relations: {}}]}, 0)).toBe(true);
    });
});
