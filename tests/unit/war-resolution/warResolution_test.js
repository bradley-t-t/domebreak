// War resolution: the three war outcomes — Victory, Defeat, White Peace — plus the
// auto-surrender trigger, the decaying Defeat stability penalty, and the white-peace
// offer/response flow. Deterministic — territory moves are a pure function of ownership;
// diplomacy RNG lives in tick.js.
import {describe, expect, it} from "vitest";
import {atWar, createWorld, declareWar, endWar, offerPeace, proposeAlliance, respondAlliance, respondPeace, stabilityBreakdown} from "../../../src/game/engine.js";
import {step} from "../../../src/game/sim/tick.js";
import {DIPLOMACY, STABILITY} from "../../../src/game/data/constants.js";

// slot 0 = player, slots 1 & 2 = AI. B(1) has three cities so it can drop below the
// surrender threshold (1/3) without being eliminated.
function fresh() {
    const w = createWorld({
        mySlot: 0, seed: 7,
        nations: [
            {slot: 0, name: "Aland", iso: "USA", isAi: false, gdp: 5},
            {slot: 1, name: "Bland", iso: "RUS", isAi: true, gdp: 5},
            {slot: 2, name: "Cland", iso: "CHN", isAi: true, gdp: 5},
        ],
        cities: [
            {id: "a1", slot: 0, name: "A-Cap", state: "AS1", cap: 1, pop: 100, econ: 1, lng: 0, lat: 0},
            {id: "a2", slot: 0, name: "A-2", state: "AS2", cap: 0, pop: 50, econ: 1, lng: 1, lat: 0},
            {id: "b1", slot: 1, name: "B-Cap", state: "BS1", cap: 1, pop: 100, econ: 1, lng: 10, lat: 0},
            {id: "b2", slot: 1, name: "B-2", state: "BS2", cap: 0, pop: 50, econ: 1, lng: 11, lat: 0},
            {id: "b3", slot: 1, name: "B-3", state: "BS3", cap: 0, pop: 50, econ: 1, lng: 12, lat: 0},
            {id: "c1", slot: 2, name: "C-Cap", state: "CS1", cap: 1, pop: 100, econ: 1, lng: 20, lat: 0},
        ],
        rules: {playerGraceSec: 0}, // opening ceasefire off so t=0 declareWar calls stand up their wars
    });
    w.city = (id) => w.cities.find((c) => c.id === id);
    return w;
}

describe("endWar — Victory / Defeat territory + penalty", () => {
    it("test_victory_winner_keeps_occupied_loser_cedes", () => {
        const w = fresh();
        declareWar(w, 0, 1);
        w.city("b2").slot = 0;           // A occupied one of B's cities
        w.city("a2").slot = 1;           // B occupied one of A's cities
        endWar(w, 0, 1, 0);              // A wins
        expect(w.city("b2").slot).toBe(0);                 // conquest sticks
        expect(w.city("a2").slot).toBe(0);                 // ceded city reverts to A
        expect(w.city("b1").slot).toBe(1);                 // B keeps un-occupied homeland
        expect(w.city("b3").slot).toBe(1);
        expect(atWar(w, 0, 1)).toBe(false);
    });

    it("test_defeat_penalizes_the_loser_only", () => {
        const w = fresh();
        declareWar(w, 0, 1);
        endWar(w, 0, 1, 0);              // A wins, B loses
        expect(w.nations[1].defeatPenalties).toHaveLength(1);
        expect(w.nations[0].defeatPenalties ?? []).toHaveLength(0);
        expect(stabilityBreakdown(w, 1).factors.some((f) => f.key === "defeat")).toBe(true);
    });

    it("test_victory_enqueues_a_player_popup", () => {
        const w = fresh();
        declareWar(w, 0, 1);
        endWar(w, 0, 1, 0);
        expect(w.warPopups).toEqual([expect.objectContaining({kind: "victory", foe: 1})]);
    });

    it("test_ai_vs_ai_resolution_is_silent", () => {
        const w = fresh();
        declareWar(w, 1, 2);
        endWar(w, 1, 2, 1);              // neither belligerent is the player
        expect(w.warPopups).toHaveLength(0);
    });
});

describe("endWar — White Peace", () => {
    it("test_whitepeace_reverts_pair_occupations_and_spares_third_parties", () => {
        const w = fresh();
        declareWar(w, 0, 1);
        w.city("b2").slot = 0;           // A occupied B's b2
        w.city("a2").slot = 1;           // B occupied A's a2
        w.city("c1").slot = 0;           // A occupied third-party C's c1 (different war)
        endWar(w, 0, 1, null);           // white peace
        expect(w.city("b2").slot).toBe(1);                 // reverts to owner0
        expect(w.city("a2").slot).toBe(0);                 // reverts to owner0
        expect(w.city("c1").slot).toBe(0);                 // untouched — not this pair
    });

    it("test_whitepeace_penalizes_no_one", () => {
        const w = fresh();
        declareWar(w, 0, 1);
        endWar(w, 0, 1, null);
        expect(w.nations[0].defeatPenalties ?? []).toHaveLength(0);
        expect(w.nations[1].defeatPenalties ?? []).toHaveLength(0);
        expect(w.warPopups).toEqual([expect.objectContaining({kind: "whitepeace", foe: 1})]);
    });
});

describe("warTick — auto-surrender through the live tick", () => {
    it("test_collapsed_belligerent_surrenders_and_cedes", () => {
        const w = fresh();
        w.paused = false;
        declareWar(w, 0, 1);
        w.city("b2").slot = 0;           // A holds one B city when B collapses
        w.city("b1").alive = false;      // B down to 1/3 living cities → below surrenderThreshold
        w.city("b3").alive = false;
        step(w, 0.1);
        expect(atWar(w, 0, 1)).toBe(false);
        expect(w.city("b2").slot).toBe(0);                 // victory transfer to A
        expect(w.nations[1].defeatPenalties).toHaveLength(1);
        expect(w.warPopups.some((p) => p.kind === "victory" && p.foe === 1)).toBe(true);
    });

    it("test_routed_ai_is_neutralized_and_cannot_re_surrender", () => {
        const w = fresh();
        w.paused = false;
        declareWar(w, 0, 1);
        w.city("b1").alive = false;
        w.city("b3").alive = false;      // B down to 1/3 living cities → below the surrender floor, keeps b2
        step(w, 0.1);
        expect(atWar(w, 0, 1)).toBe(false);
        expect(w.nations[1].active).toBe(false);           // knocked out → passive neutral
        expect(w.nations[1].wipedOut).toBe(true);
        expect(w.nations[1].alive).toBe(true);             // still on the map — it kept b2
        // Stray fallout / a new declaration can't drag a neutralized nation back into a
        // war and re-surrender it: warTick skips inactive nations. Force a fresh war
        // relation on and confirm no second capitulation fires.
        const surrenders = () => w.events.filter((e) => e.type === "conquest" && e.loser === 1).length;
        const before = surrenders();
        w.nations[0].relations[1] = "war";
        w.nations[1].relations[0] = "war";
        step(w, 0.1);
        expect(surrenders()).toBe(before);
    });

    it("test_human_collapse_surrenders_but_is_not_neutralized", () => {
        const w = fresh();
        w.paused = false;
        w.mySlot = 1;                    // treat B as the human commander
        w.nations[1].isAi = false;
        declareWar(w, 0, 1);
        w.city("b1").alive = false;
        w.city("b3").alive = false;      // B → 1/3 alive → below the floor, keeps b2
        step(w, 0.1);
        expect(atWar(w, 0, 1)).toBe(false);                // the war still resolves as a defeat
        expect(w.nations[1].active).not.toBe(false);       // but the human keeps fighting their remnant
        expect(w.nations[1].wipedOut).toBeFalsy();
    });

    it("test_healthy_belligerents_do_not_surrender", () => {
        const w = fresh();
        w.paused = false;
        declareWar(w, 0, 1);
        step(w, 0.1);
        expect(atWar(w, 0, 1)).toBe(true);
    });

    it("test_prior_defeat_does_not_carry_a_surrender_ratio_into_the_next_war", () => {
        const w = fresh();
        w.paused = false;
        declareWar(w, 0, 1);
        w.city("b2").slot = 0;                             // A occupies two of B's three cities
        w.city("b3").slot = 0;
        endWar(w, 0, 1, 0);                                // A wins; B cedes b2 and b3 but keeps b1
        expect(atWar(w, 0, 1)).toBe(false);
        w.time += DIPLOMACY.minWarSec + 1;
        declareWar(w, 0, 1);                               // fresh war against a shrunken B
        step(w, 0.1);
        expect(atWar(w, 0, 1)).toBe(true);                 // baseline rebaselined — B does not instantly capitulate
    });
});

describe("Defeat stability penalty — decay", () => {
    it("test_penalty_decays_linearly_to_zero_over_defeatSec", () => {
        const w = fresh();
        w.nations[1].defeatPenalties = [{t0: 0}];
        const penAt = (t) => {
            w.time = t;
            return stabilityBreakdown(w, 1).factors.find((f) => f.key === "defeat")?.penalty ?? 0;
        };
        expect(penAt(0)).toBe(STABILITY.wDefeat);
        expect(Math.abs(penAt(STABILITY.defeatSec / 2) - STABILITY.wDefeat / 2)).toBeLessThan(1);
        expect(penAt(STABILITY.defeatSec + 1)).toBe(0);
    });
});

describe("White-peace offer / response", () => {
    it("test_ai_accepts_player_offer_on_an_old_war", () => {
        const w = fresh();
        declareWar(w, 0, 1);
        w.time = DIPLOMACY.minWarSec + 10;
        expect(offerPeace(w, 0, 1).ok).toBe(true);
        expect(atWar(w, 0, 1)).toBe(false);
    });

    it("test_ai_offer_to_player_pends_until_answered", () => {
        const w = fresh();
        declareWar(w, 0, 1);
        offerPeace(w, 1, 0);             // AI(1) → player(0)
        expect(w.pendingPeace).toHaveLength(1);
        expect(w.warPopups.some((p) => p.kind === "offer" && p.foe === 1)).toBe(true);
        expect(atWar(w, 0, 1)).toBe(true);
    });

    it("test_player_accept_resolves_white_peace", () => {
        const w = fresh();
        declareWar(w, 0, 1);
        offerPeace(w, 1, 0);
        respondPeace(w, 0, 1, true);
        expect(atWar(w, 0, 1)).toBe(false);
        expect(w.warPopups.some((p) => p.kind === "offer")).toBe(false);
    });

    it("test_player_decline_keeps_the_war", () => {
        const w = fresh();
        declareWar(w, 0, 1);
        offerPeace(w, 1, 0);
        respondPeace(w, 0, 1, false);
        expect(atWar(w, 0, 1)).toBe(true);
        expect(w.warPopups.some((p) => p.kind === "offer")).toBe(false);
    });
});

// Alliance proposal / response, and the solo-vs-online split of the offer popup.
// A proposal to a human is a pending offer that only resolves when the recipient
// answers — the same shape as the white-peace flow above. In both cases the
// recipient here is the local player (slot 0 = mySlot); the only difference is
// online suppresses the seat-addressed modal popup (the server can't address one
// seat — mySlot is a shared placeholder), so clients drive their own prompt off
// the broadcast pendingAlliance queue instead.
describe("Alliance offer / response", () => {
    // slot 1 flipped off AI so both ends of the pact are human seats.
    function humans(online) {
        const w = fresh();
        w.nations.find((n) => n.slot === 1).isAi = false;
        if (online) w.meta = {mode: "online"};
        return w;
    }

    it("test_solo_proposal_to_the_local_player_pends_and_pops", () => {
        const w = humans(false);            // 1 → 0, and 0 is mySlot (the local seat)
        expect(proposeAlliance(w, 1, 0).ok).toBe(true);
        expect(w.pendingAlliance.some((o) => o.from === 1 && o.to === 0)).toBe(true);
        expect(w.warPopups.some((p) => p.kind === "ally-offer" && p.foe === 1)).toBe(true);
    });

    it("test_online_proposal_pends_without_a_popup", () => {
        const w = humans(true);             // same 1 → 0 (to === mySlot), but online
        expect(proposeAlliance(w, 1, 0).ok).toBe(true);
        // The pending offer still broadcasts — that is what the recipient's client
        // renders its prompt from — but no seat-addressed modal popup is enqueued.
        expect(w.pendingAlliance.some((o) => o.from === 1 && o.to === 0)).toBe(true);
        expect(w.warPopups.some((p) => p.kind === "ally-offer")).toBe(false);
    });

    it("test_accept_forms_the_pact_and_clears_the_offer", () => {
        const w = humans(true);
        proposeAlliance(w, 1, 0);
        respondAlliance(w, 0, 1, true);     // player (0) answers the offer from 1
        expect(w.nations.find((n) => n.slot === 0).relations[1]).toBe("ally");
        expect(w.nations.find((n) => n.slot === 1).relations[0]).toBe("ally");
        expect(w.pendingAlliance.some((o) => o.from === 1 && o.to === 0)).toBe(false);
    });

    it("test_decline_drops_the_offer_and_forms_nothing", () => {
        const w = humans(true);
        proposeAlliance(w, 1, 0);
        respondAlliance(w, 0, 1, false);
        expect(w.nations.find((n) => n.slot === 0).relations[1]).not.toBe("ally");
        expect(w.pendingAlliance.some((o) => o.from === 1 && o.to === 0)).toBe(false);
    });
});
