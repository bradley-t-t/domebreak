// Peace: evaluatePeaceOffer answers an incoming white-peace offer from the
// ledger and the cached war state (losing/routed accepts, ahead-and-early
// refuses, decline caps, vindictive grudges that need real damage behind them);
// foesToSue picks which fronts to probe for an exit — never an opening war,
// never a foe one shot from decapitation, on a patience-scaled cadence, and
// with two-front relief when one war is going badly. Personalities are forced
// explicitly so no assertion rides on seed luck.
import {describe, expect, it} from "vitest";
import {createWorld, declareWar, UNITS} from "../../../src/game/engine.js";
import {DIPLOMACY} from "../../../src/game/data/constants.js";
import {evaluatePeaceOffer, foesToSue} from "../../../src/game/sim/ai/diplomacy/peace.js";
import {ensureDiplo, rel} from "../../../src/game/sim/ai/diplomacy/ledger.js";
import {buildFrame, capPositions} from "../../../src/game/sim/ai/perception/perception.js";
import {PEACE} from "../../../src/game/sim/ai/tuning.js";

// slot 0 = player (US), slot 1 = the AI under test (RU), slot 2 = AI (CN).
// Real ISO codes on real soil so perception's geography holds up.
function fresh() {
    return createWorld({
        mySlot: 0, seed: 7,
        nations: [
            {slot: 0, name: "America", iso: "US", isAi: false, gdp: 5},
            {slot: 1, name: "Russia", iso: "RU", isAi: true, gdp: 5},
            {slot: 2, name: "China", iso: "CN", isAi: true, gdp: 5},
        ],
        cities: [
            {id: "u1", slot: 0, name: "Topeka", state: "KS", cap: 1, pop: 1e6, econ: 1, lng: -98, lat: 39},
            {id: "u2", slot: 0, name: "Denver", state: "CO", cap: 0, pop: 7e5, econ: 1, lng: -104.99, lat: 39.74},
            {id: "r1", slot: 1, name: "Moscow", state: "MOW", cap: 1, pop: 1e6, econ: 1, lng: 37.62, lat: 55.75},
            {id: "r2", slot: 1, name: "Kazan", state: "TA", cap: 0, pop: 6e5, econ: 1, lng: 49.11, lat: 55.79},
            {id: "c1", slot: 2, name: "Beijing", state: "BJ", cap: 1, pop: 1e6, econ: 1, lng: 116.4, lat: 39.9},
            {id: "c2", slot: 2, name: "Shanghai", state: "SH", cap: 0, pop: 9e5, econ: 1, lng: 121.47, lat: 31.23},
        ],
        rules: {playerGraceSec: 0}, // so t=0 declareWar calls stand up their wars
    });
}

const nation = (w, slot) => w.nations.find((n) => n.slot === slot);

// A fixed, mid-road personality — tests override the trait they exercise.
function persona(over = {}) {
    return {
        aggression: 0.5, paranoia: 0.5, industrialism: 0.5, navalism: 0.5, spaceRush: 0.5,
        decapFocus: 0.3, loyalty: 0.5, vindictiveness: 0.2, patience: 0.8, ...over,
    };
}

function frameFor(w, slot) {
    const unitsBySlot = new Map();
    for (const u of w.units) {
        if (u.hp <= 0) continue;
        if (!unitsBySlot.has(u.slot)) unitsBySlot.set(u.slot, []);
        unitsBySlot.get(u.slot).push(u);
    }
    return buildFrame(w, nation(w, slot), {unitsBySlot, caps: capPositions(w)});
}

describe("evaluatePeaceOffer — answering an incoming white peace", () => {
    it("test_accepts_when_cached_war_state_is_losing", () => {
        const w = fresh();
        declareWar(w, 1, 0);
        const n = nation(w, 1);
        n.personality = persona({vindictiveness: 0.9}); // even a grudge-holder folds
        ensureDiplo(n).warState[0] = "losing";
        w.time = 30;                                    // young war — state overrides age
        expect(evaluatePeaceOffer(w, 1, 0)).toBe(true);
    });

    it("test_accepts_when_cached_war_state_is_routed", () => {
        const w = fresh();
        declareWar(w, 1, 0);
        const n = nation(w, 1);
        n.personality = persona();
        ensureDiplo(n).warState[0] = "routed";
        rel(n, 0).dealt = 500;                          // ahead on damage yet routed — still yes
        rel(n, 0).taken = 10;
        expect(evaluatePeaceOffer(w, 1, 0)).toBe(true);
    });

    it("test_accepts_on_high_taken_dealt_ratio_past_min_war_sec", () => {
        const w = fresh();
        declareWar(w, 1, 0);
        const n = nation(w, 1);
        n.personality = persona({vindictiveness: 0.9});
        rel(n, 0).taken = 300;                          // ratio 3 > acceptDamageRatio
        rel(n, 0).dealt = 100;
        w.time = DIPLOMACY.minWarSec + 10;
        expect(evaluatePeaceOffer(w, 1, 0)).toBe(true);
    });

    it("test_refuses_early_war_while_clearly_ahead", () => {
        const w = fresh();
        declareWar(w, 1, 0);
        const n = nation(w, 1);
        n.personality = persona();
        rel(n, 0).dealt = 500;                          // ratio 0.02 < refuseDamageRatio
        rel(n, 0).taken = 10;
        w.time = DIPLOMACY.minWarSec - 60;              // opening phase — press the advantage
        expect(evaluatePeaceOffer(w, 1, 0)).toBe(false);
        w.time = DIPLOMACY.minWarSec + 60;              // same ledger, war grown old — settles
        expect(evaluatePeaceOffer(w, 1, 0)).toBe(true);
    });

    it("test_refuses_after_more_than_max_declines", () => {
        const w = fresh();
        declareWar(w, 1, 0);
        const n = nation(w, 1);
        n.personality = persona();
        rel(n, 0).taken = 100;                          // even ledger — would settle by default
        rel(n, 0).dealt = 100;
        w.time = DIPLOMACY.minWarSec + 10;
        // The gate reads THIS war's refusal count, not the lifetime grudge.
        rel(n, 0).declinedWar = PEACE.maxDeclinesPerWar;   // at the cap — still settles
        expect(evaluatePeaceOffer(w, 1, 0)).toBe(true);
        rel(n, 0).declinedWar = PEACE.maxDeclinesPerWar + 1; // past it — they spurned us enough
        expect(evaluatePeaceOffer(w, 1, 0)).toBe(false);
        // A lifetime grudge from PAST wars alone does not refuse this one.
        rel(n, 0).declinedWar = 0;
        rel(n, 0).declined = PEACE.maxDeclinesPerWar + 3;
        expect(evaluatePeaceOffer(w, 1, 0)).toBe(true);
    });

    it("test_vindictive_nation_landing_blows_refuses", () => {
        const w = fresh();
        declareWar(w, 1, 0);
        const n = nation(w, 1);
        n.personality = persona({vindictiveness: 0.9});
        rel(n, 0).dealt = 50;                           // real damage behind the grudge
        rel(n, 0).taken = 40;                           // ratio 0.8 — otherwise settles
        w.time = DIPLOMACY.minWarSec + 10;
        expect(evaluatePeaceOffer(w, 1, 0)).toBe(false);
    });

    it("test_zero_damage_old_war_settles_despite_vindictiveness", () => {
        const w = fresh();
        declareWar(w, 1, 0);
        const n = nation(w, 1);
        n.personality = persona({vindictiveness: 0.9});
        w.time = DIPLOMACY.minWarSec * 2 + 20;          // phony war: nothing dealt, nothing taken
        expect(rel(n, 0).dealt).toBe(0);
        expect(evaluatePeaceOffer(w, 1, 0)).toBe(true);
    });
});

describe("foesToSue — which fronts to probe for an exit", () => {
    it("test_skips_opening_wars", () => {
        const w = fresh();
        declareWar(w, 1, 2);
        w.time = DIPLOMACY.minWarSec - 60;
        const out = foesToSue(w, frameFor(w, 1), {2: "opening"}, persona());
        expect(out).toEqual([]);
    });

    it("test_honors_the_sue_cadence_via_suing_timestamps", () => {
        const w = fresh();
        declareWar(w, 1, 2);
        w.time = DIPLOMACY.minWarSec + 110;
        const frame = frameFor(w, 1);
        const p = persona({patience: 0.5});             // losing cadence = 45 x (0.6 + 0.4) = 45s
        frame.diplo.suing[2] = w.time - 10;             // sued 10s ago — too soon
        expect(foesToSue(w, frame, {2: "losing"}, p)).toEqual([]);
        frame.diplo.suing[2] = w.time - 100;            // cadence elapsed — retry
        expect(foesToSue(w, frame, {2: "losing"}, p)).toEqual([2]);
    });

    it("test_never_sues_a_foe_under_the_decapitation_threshold", () => {
        const w = fresh();
        declareWar(w, 1, 2);
        w.time = DIPLOMACY.minWarSec + 110;
        nation(w, 2).lead = {total: 100, lost: 80, sheltered: 0}; // foe leadership 20 < decapLeadPct
        for (let i = 0; i < 3; i++) {                   // three strike platforms — kill is credible
            w.units.push({id: `s${i}`, slot: 1, type: "silo", lng: 38 + i, lat: 55.9, hp: UNITS.silo.hp});
        }
        expect(foesToSue(w, frameFor(w, 1), {2: "losing"}, persona())).toEqual([]);
        w.units.pop();                                  // two platforms — decap no longer credible
        expect(foesToSue(w, frameFor(w, 1), {2: "losing"}, persona())).toEqual([2]);
    });

    it("test_two_front_relief_probes_the_prosecute_front_too", () => {
        const w = fresh();
        declareWar(w, 1, 0);
        declareWar(w, 1, 2);
        w.time = DIPLOMACY.minWarSec + 110;
        const out = foesToSue(w, frameFor(w, 1), {0: "losing", 2: "prosecute"}, persona({patience: 0.5}));
        expect([...out].sort()).toEqual([0, 2]);        // the winnable front gets probed as a stall
    });

    it("test_prosecute_front_is_not_sued_without_a_bad_front", () => {
        const w = fresh();
        declareWar(w, 1, 2);
        w.time = DIPLOMACY.minWarSec + 110;
        expect(foesToSue(w, frameFor(w, 1), {2: "prosecute"}, persona())).toEqual([]);
    });
});
