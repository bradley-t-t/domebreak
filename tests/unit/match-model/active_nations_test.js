// Bounded-match / neutral-world model: victory resolves against the
// ACTIVE set (passive neutrals never block a win), and active nations are seeded
// scattered across the globe. Neutrals are non-interactable scenery — never targeted
// or captured. Deterministic, no RNG, no I/O.
import {describe, expect, it} from "vitest";
import {stepVictory} from "../../../src/game/sim/tickPhases.js";
import {isActive} from "../../../src/game/sim/queries.js";
import {buildSetup, pickActiveIsos} from "../../../src/game/sim/newGame.js";
import {NEUTRAL} from "../../../src/game/data/constants.js";

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

describe("online victory has no single 'me' — one player's death never ends the war", () => {
    // The server world is authoritative for every slot; mySlot points at the
    // first player (buildSetup uses isos[0]) but must NOT decide the outcome.
    const online = (nations, cities) => ({mySlot: 0, time: 0, over: false, paused: false, winnerSlot: undefined, nations, cities, meta: {mode: "online"}});

    it("test_an_eliminated_player_does_not_end_the_match_for_the_survivors", () => {
        // Slot 0 (the "me" the setup happened to pick) is wiped out, but two active
        // nations fight on — the war must continue, not end in a false Annihilation.
        // A populous neutral (slot 3) keeps either survivor's share below domination.
        const nations = [nat(0, true), nat(1, true), nat(2, true), nat(3, false)];
        const w = online(nations, [city(1, 100), city(2, 100), city(3, 300)]); // slot 0 holds nothing
        stepVictory(w);
        expect(w.over).toBe(false);
        expect(nations[0].alive).toBe(false); // flagged out of the war for its client
        expect(nations[1].alive).toBe(true);
    });

    it("test_last_active_standing_crowns_the_real_survivor_not_slot_zero", () => {
        // Slot 0 is dead; slot 2 is the lone survivor and must be the winner, even
        // though mySlot is 0. The old code crowned mySlot (or a null Annihilation).
        const nations = [nat(0, true), nat(1, true), nat(2, true)];
        const w = online(nations, [city(2, 100)]);
        stepVictory(w);
        expect(w.over).toBe(true);
        expect(w.winnerSlot).toBe(2);
    });

    it("test_population_domination_crowns_the_dominator", () => {
        const nations = [nat(0, true), nat(1, true), nat(2, false)];
        const w = online(nations, [city(1, 600), city(0, 100), city(2, 300)]); // slot 1: 600/1000 ≥ 0.5
        stepVictory(w);
        expect(w.over).toBe(true);
        expect(w.winnerSlot).toBe(1);
    });

    it("test_mutual_annihilation_ends_with_no_winner", () => {
        const nations = [nat(0, true), nat(1, true)];
        const w = online(nations, []); // every city gone
        stepVictory(w);
        expect(w.over).toBe(true);
        expect(w.winnerSlot).toBe(null);
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

    it("test_a_full_twelve_human_lobby_keeps_every_participant_active", () => {
        // Every human claims an active belligerent slot: a 12-participant roster
        // must field all 12 as active even when the scatter count is left at the
        // singleplayer default (participants are never dropped to hit the count).
        const isos = ["US", "CN", "RU", "DE", "IN", "GB", "FR", "JP", "KR", "IT", "BR", "CA"];
        const cities = Object.fromEntries(isos.map((iso, i) => [iso, [{lng: i * 30 - 165, lat: 0, cap: true}]]));
        const picked = pickActiveIsos({cities}, isos, [], NEUTRAL.defaultActive);
        expect(picked).toHaveLength(12);
        expect(new Set(picked).size).toBe(12);
        for (const iso of isos) expect(picked).toContain(iso);
    });
});

describe("player-pinned AI nations join the active roster", () => {
    // 20 well-scattered fake nations so the spacing gate never starves the random
    // fill: capitals on a lat/lng grid far enough apart to clear scatterMinKm.
    const ISOS = Array.from({length: 20}, (_, i) => `X${i}`);
    const data = {
        cities: Object.fromEntries(ISOS.map((iso, i) => [iso, [{lng: (i % 5) * 60 - 120, lat: (Math.floor(i / 5) % 4) * 40 - 60, cap: true, p: 100}]])),
        countries: ISOS.map((iso) => ({iso, name: iso, count: 1})),
    };
    const pool = ISOS.slice();
    const activeIsos = (setup) => setup.nations.filter((n) => n.active).map((n) => n.iso);

    it("test_pinned_nations_are_always_active_belligerents", () => {
        const pins = ["X7", "X13", "X18"];
        const setup = buildSetup(data, "X0", null, 42, {activeCount: 8, aiPicks: pins, seedPool: pool});
        const active = activeIsos(setup);
        for (const iso of pins) expect(active).toContain(iso);
        // Pinned opponents run as AI, not the player.
        for (const iso of pins) expect(setup.nations.find((n) => n.iso === iso).isAi).toBe(true);
    });

    it("test_pins_plus_random_fill_reaches_active_count", () => {
        const setup = buildSetup(data, "X0", null, 42, {activeCount: 8, aiPicks: ["X7", "X13"], seedPool: pool});
        // player + 8 total belligerents; pins are a subset, the rest random-filled.
        expect(activeIsos(setup)).toHaveLength(8);
    });

    it("test_empty_pins_is_fully_random_fill", () => {
        const setup = buildSetup(data, "X0", null, 42, {activeCount: 6, aiPicks: [], seedPool: pool});
        const active = activeIsos(setup);
        expect(active).toHaveLength(6);
        expect(active[0]).toBe("X0"); // the player is always slot-first active
    });

    it("test_pinning_more_than_active_count_widens_the_war_up_to_the_cap", () => {
        // 13 pins + the player = 14 forced, past maxActive (12): trimmed to the cap.
        const pins = ISOS.slice(1, 14);
        const setup = buildSetup(data, "X0", null, 42, {activeCount: 4, aiPicks: pins, seedPool: pool});
        expect(activeIsos(setup)).toHaveLength(NEUTRAL.maxActive);
    });

    it("test_the_player_cannot_be_pinned_as_its_own_opponent", () => {
        const setup = buildSetup(data, "X0", null, 42, {activeCount: 4, aiPicks: ["X0", "X9"], seedPool: pool});
        expect(setup.nations.find((n) => n.iso === "X0").isAi).toBe(false);
        expect(activeIsos(setup)).toContain("X9");
    });
});

describe("the bounded-match cap admits up to twelve players", () => {
    it("test_max_active_is_twelve", () => {
        // The sim's active-nation ceiling is the human-player cap (server
        // HARD_MAX_PLAYERS mirrors it), so it must stay at 12.
        expect(NEUTRAL.maxActive).toBe(12);
        expect(NEUTRAL.minActive).toBeLessThanOrEqual(NEUTRAL.maxActive);
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
