// Alliance diplomacy (ai/diplomacy/alliance.js): the accept / propose / break triad.
// evaluateAllianceOffer answers proposals — shared enemies and relative strength say
// yes, a dirty ledger (backstabs) or a full ally roster is a hard no, and the loyal
// lean yes only on an honored record. allianceCandidates gates who an AI courts:
// loyalty floor, posture (pacts are a turtle/hold move unless a counterweight is
// needed), backstab memory, and DIPLOMACY.allyRangeKm. allyToBreak lets only the
// near-disloyal walk out on a strength flip. Deterministic — synthetic worlds, no RNG.
import {describe, expect, it} from "vitest";
import {createWorld, declareWar, formAlliance} from "../../../src/game/engine.js";
import {allianceCandidates, allyToBreak, evaluateAllianceOffer} from "../../../src/game/sim/ai/diplomacy/alliance.js";
import {rel} from "../../../src/game/sim/ai/diplomacy/ledger.js";
import {buildFrame, capPositions} from "../../../src/game/sim/ai/perception/perception.js";

// Slot 1 (US, Kansas) is the AI under test. Canada (2) is the natural pact partner
// ~1800 km away; Mexico (3) is the shared enemy; Russia (4) sits ~8700 km out —
// inside great-power war reach (gdp 50 -> ~14000 km) but past DIPLOMACY.allyRangeKm
// (4200). The human (0) idles out of everyone's reach in Australia. Each nation has
// one econ-1 capital so gdpOf === n.gdp; the econ-0 spare cities exist purely to
// move survivingFrac when killed.
function fresh({gdpA = 5, gdpB = 5, gdpR = 5} = {}) {
    return createWorld({
        mySlot: 0, seed: 7,
        nations: [
            {slot: 0, name: "Aussie", iso: "AU", isAi: false, gdp: 5},
            {slot: 1, name: "Amer", iso: "US", isAi: true, gdp: gdpA},
            {slot: 2, name: "Cana", iso: "CA", isAi: true, gdp: gdpB},
            {slot: 3, name: "Mexo", iso: "MX", isAi: true, gdp: 5},
            {slot: 4, name: "Russ", iso: "RU", isAi: true, gdp: gdpR},
        ],
        cities: [
            {id: "p1", slot: 0, name: "P-Cap", state: "NT", cap: 1, pop: 1e6, econ: 1, lng: 133.87, lat: -23.7},
            {id: "a1", slot: 1, name: "A-Cap", state: "KS", cap: 1, pop: 1e6, econ: 1, lng: -98, lat: 39},
            {id: "a2", slot: 1, name: "A-2", state: "CO", cap: 0, pop: 5e5, econ: 0, lng: -104.99, lat: 39.74},
            {id: "b1", slot: 2, name: "B-Cap", state: "ON", cap: 1, pop: 1e6, econ: 1, lng: -80, lat: 49},
            {id: "b2", slot: 2, name: "B-2", state: "BC", cap: 0, pop: 5e5, econ: 0, lng: -123.1, lat: 49.28},
            {id: "e1", slot: 3, name: "E-Cap", state: "ZA", cap: 1, pop: 1e6, econ: 1, lng: -102.5, lat: 23.6},
            {id: "r1", slot: 4, name: "R-Cap", state: "MOW", cap: 1, pop: 1e6, econ: 1, lng: 37.6, lat: 55.75},
        ],
        rules: {playerGraceSec: 0},   // t=0 declareWar calls stand up their wars
    });
}

const nation = (w, slot) => w.nations.find((n) => n.slot === slot);
const kill = (w, id) => { w.cities.find((c) => c.id === id).alive = false; };
const unitsIndex = (w) => new Map(w.nations.map((n) => [n.slot, []]));

function frameFor(w, slot) {
    return buildFrame(w, nation(w, slot), {unitsBySlot: unitsIndex(w), caps: capPositions(w)});
}

// US and Canada both at war with Mexico — the classic shared-enemy pact setup.
function sharedEnemy(w) {
    declareWar(w, 1, 3);
    declareWar(w, 2, 3);
}

describe("evaluateAllianceOffer — answering a proposal", () => {
    it("test_shared_enemy_is_a_yes", () => {
        const w = fresh();
        sharedEnemy(w);
        expect(evaluateAllianceOffer(w, 1, 2)).toBe(true);
    });

    it("test_proposer_at_least_our_strength_is_a_yes", () => {
        const w = fresh();
        // Equal footing (both surviving fractions 1) already clears the >= bar.
        expect(evaluateAllianceOffer(w, 1, 2)).toBe(true);
        // A wounded evaluator says yes to an untouched proposer all the more.
        kill(w, "a2");                                     // my frac 0.5, theirs 1
        expect(evaluateAllianceOffer(w, 1, 2)).toBe(true);
    });

    it("test_backstab_ledger_is_a_hard_no", () => {
        const w = fresh();
        sharedEnemy(w);                                    // would otherwise be a clear yes
        rel(nation(w, 1), 2).backstabs = 1;
        expect(evaluateAllianceOffer(w, 1, 2)).toBe(false);
    });

    it("test_full_ally_roster_is_a_no", () => {
        const w = fresh();
        sharedEnemy(w);                                    // would otherwise be a clear yes
        formAlliance(w, 1, 0);                             // DIPLOMACY.maxAllies = 2
        formAlliance(w, 1, 4);
        expect(evaluateAllianceOffer(w, 1, 2)).toBe(false);
    });

    it("test_weaker_proposer_without_trust_is_a_no", () => {
        const w = fresh();
        kill(w, "b2");                                     // proposer frac 0.5 < my 1
        nation(w, 1).personality = {loyalty: 0.9};         // loyal, but the record is blank
        expect(evaluateAllianceOffer(w, 1, 2)).toBe(false);
    });

    it("test_loyal_nation_leans_yes_on_an_honored_record", () => {
        const w = fresh();
        kill(w, "b2");                                     // proposer frac 0.5 < my 1
        nation(w, 1).personality = {loyalty: 0.9};
        rel(nation(w, 1), 2).honored = 1;
        expect(evaluateAllianceOffer(w, 1, 2)).toBe(true);
    });
});

describe("allianceCandidates — who an AI courts", () => {
    it("test_hold_posture_with_shared_enemy_courts_the_cobelligerent", () => {
        const w = fresh();
        sharedEnemy(w);
        const out = allianceCandidates(w, frameFor(w, 1), {mode: "hold"}, {loyalty: 0.8});
        expect(out.map(([s]) => s)).toEqual([2]);
        expect(out[0][1]).toBeGreaterThan(0);
    });

    it("test_loyalty_below_the_propose_floor_courts_nobody", () => {
        const w = fresh();
        sharedEnemy(w);
        const f = frameFor(w, 1);
        expect(allianceCandidates(w, f, {mode: "hold"}, {loyalty: 0.39})).toEqual([]);
        expect(allianceCandidates(w, f, {mode: "hold"}, {loyalty: 0.4}).length).toBe(1);
    });

    it("test_press_posture_without_counterweight_need_proposes_nothing", () => {
        const w = fresh();
        sharedEnemy(w);
        const f = frameFor(w, 1);                          // strengthRatio 1.0 — no rising bloc
        expect(f.world.strengthRatio).toBeGreaterThanOrEqual(0.9);
        expect(allianceCandidates(w, f, {mode: "press"}, {loyalty: 0.8})).toEqual([]);
    });

    it("test_counterweight_need_overrides_press_posture", () => {
        const w = fresh({gdpB: 50});                       // Canada dwarfs us — ratio 0.1
        const f = frameFor(w, 1);
        expect(f.world.strengthRatio).toBeLessThan(0.9);
        const slots = allianceCandidates(w, f, {mode: "press"}, {loyalty: 0.8}).map(([s]) => s);
        expect(slots).toContain(2);                        // no shared enemy needed
    });

    it("test_backstabbed_rival_is_never_courted_again", () => {
        const w = fresh();
        sharedEnemy(w);
        rel(nation(w, 1), 2).backstabs = 1;
        expect(allianceCandidates(w, frameFor(w, 1), {mode: "hold"}, {loyalty: 0.8})).toEqual([]);
    });

    it("test_capital_past_ally_range_is_excluded", () => {
        const w = fresh({gdpA: 50});                       // great-power reach sees Moscow
        sharedEnemy(w);
        declareWar(w, 4, 3);                               // Russia shares the enemy too
        const f = frameFor(w, 1);
        expect(f.world.rivals.some((m) => m.slot === 4)).toBe(true);
        const slots = allianceCandidates(w, f, {mode: "hold"}, {loyalty: 0.8}).map(([s]) => s);
        expect(slots).toContain(2);                        // Canada: 1811 km, in range
        expect(slots).not.toContain(4);                    // Moscow: 8675 km > allyRangeKm
    });
});

describe("allyToBreak — walking out on a strength flip", () => {
    // The flip compares RAW national power, not bloc power — a mutual pact puts
    // both partners in each other's bloc, which would pin that ratio at 1
    // forever. A gdp-50 us against a gdp-5 Canada dwarfs the ally 10:1, well
    // past ALLIANCE.breakStrengthFlip (1.8).
    function lopsided() {
        const w = fresh({gdpA: 50});
        formAlliance(w, 1, 2);
        return w;
    }

    it("test_disloyal_nation_breaks_the_dwarfed_ally", () => {
        const w = lopsided();
        expect(allyToBreak(w, frameFor(w, 1), {loyalty: 0.1}, unitsIndex(w))).toBe(2);
    });

    it("test_loyal_nation_never_breaks_on_strength_alone", () => {
        const w = lopsided();
        const f = frameFor(w, 1);
        expect(allyToBreak(w, f, {loyalty: 0.9}, unitsIndex(w))).toBe(null);
        // Boundary: breakLoyaltyMax is exclusive — 0.2 exactly still holds the pact.
        expect(allyToBreak(w, f, {loyalty: 0.2}, unitsIndex(w))).toBe(null);
    });
});
