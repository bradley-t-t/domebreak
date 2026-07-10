// Enemy/rival profiles: the rolling force read every AI builds of its
// neighbours. Covers roster counting (arsenal / defense / ground buckets),
// posture inference from force shape (first-strike, steamroller, turtle,
// aggressive, balanced), hangar aircraft not counting as standing force, and
// survivingFrac against the owner0 match-start baseline (deaths drop it,
// captures count for the holder). Pure data — no RNG anywhere.
import {describe, expect, it} from "vitest";
import {UNITS, createWorld} from "../../../src/game/engine.js";
import {buildProfile} from "../../../src/game/sim/ai/perception/profiles.js";
import {survivingFrac} from "../../../src/game/sim/ai/perception/stats.js";

// slot 0 = player, slot 1 = the profiled AI (two cities so fractions move in
// halves), slot 2 = a third party that can capture from slot 1.
function fresh() {
    return createWorld({
        mySlot: 0, seed: 11,
        nations: [
            {slot: 0, name: "Aland", iso: "US", isAi: false, gdp: 5},
            {slot: 1, name: "Bland", iso: "RU", isAi: true, gdp: 5},
            {slot: 2, name: "Cland", iso: "CN", isAi: true, gdp: 5},
        ],
        cities: [
            {id: "a1", slot: 0, name: "A-Cap", state: "KS", cap: 1, pop: 1e6, econ: 1, lng: -98, lat: 39},
            {id: "b1", slot: 1, name: "B-Cap", state: "MOW", cap: 1, pop: 1e6, econ: 1, lng: 37.6, lat: 55.75},
            {id: "b2", slot: 1, name: "B-2", state: "SPB", cap: 0, pop: 5e5, econ: 1, lng: 30.3, lat: 59.95},
            {id: "c1", slot: 2, name: "C-Cap", state: "BJ", cap: 1, pop: 1e6, econ: 1, lng: 116.4, lat: 39.9},
        ],
        rules: {playerGraceSec: 0},
    });
}

// A slot-1 roster of the given types, indexed the way the pipeline hands it in.
let seq = 0;
function roster(types, extra = {}) {
    return new Map([[1, types.map((type) => ({id: "u" + ++seq, slot: 1, type, lng: 37.6, lat: 55.75, hp: UNITS[type].hp, ...extra}))]]);
}

function profileOf(w, unitsBySlot) {
    return buildProfile(w, w.nations[1], unitsBySlot);
}

describe("buildProfile — roster counting", () => {
    it("test_counts_arsenal_defense_and_ground_buckets", () => {
        const w = fresh();
        const p = profileOf(w, roster([
            "silo", "silo", "launcher",
            "battery", "patriot", "thaad",
            "tank", "tank", "infantry", "artillery",
            "armybase", "bunker",
        ]));
        expect(p.slot).toBe(1);
        expect(p.isHuman).toBe(false);
        expect(p.cities).toBe(2);
        expect(p.arsenal.silos).toBe(2);
        expect(p.arsenal.launchers).toBe(1);
        expect(p.arsenal.strike).toBe(2 * 3 + 1.5);      // silo weight 3, launcher 1.5
        expect(p.defense.count).toBe(3);
        expect(p.defense.batteries).toBe(1);
        expect(p.defense.patriots).toBe(1);
        expect(p.defense.thaad).toBe(1);
        // Ground = capture troops + land movers; the road-mobile TEL is strike, not ground.
        expect(p.ground.count).toBe(4);
        expect(p.ground.tanks).toBe(2);
        expect(p.ground.infantry).toBe(1);
        expect(p.ground.artillery).toBe(1);
        expect(p.ground.bases).toBe(1);
        expect(p.lead.bunker).toBe(true);
    });

    it("test_empty_roster_profiles_cleanly", () => {
        const w = fresh();
        const p = profileOf(w, new Map());
        expect(p.arsenal.strike).toBe(0);
        expect(p.defense.count).toBe(0);
        expect(p.ground.count).toBe(0);
        expect(p.posture).toBe("balanced");
    });
});

describe("buildProfile — posture inference", () => {
    it("test_silo_heavy_thin_defense_reads_first_strike", () => {
        const w = fresh();
        const p = profileOf(w, roster(["silo", "silo", "silo", "silo", "silo", "silo", "silo", "silo", "battery"]));
        expect(p.posture).toBe("first-strike");
    });

    it("test_ground_heavy_force_reads_steamroller", () => {
        const w = fresh();
        const p = profileOf(w, roster(["tank", "tank", "tank", "tank", "battery", "armybase"]));
        expect(p.posture).toBe("steamroller");
    });

    it("test_defense_only_force_reads_turtle", () => {
        const w = fresh();
        const p = profileOf(w, roster(["battery", "battery", "battery", "patriot"]));
        expect(p.posture).toBe("turtle");
    });

    it("test_mixed_offense_lean_reads_aggressive", () => {
        const w = fresh();
        // strike 3 (one silo, under the first-strike floor), ground 2, defense 2:
        // no archetype fires, but strike+ground outweighs defense x 1.3.
        const p = profileOf(w, roster(["silo", "tank", "tank", "battery", "battery"]));
        expect(p.posture).toBe("aggressive");
    });

    it("test_small_force_reads_balanced", () => {
        const w = fresh();
        const p = profileOf(w, roster(["silo", "battery"]));
        expect(p.posture).toBe("balanced");
    });

    it("test_hangar_aircraft_are_not_standing_force", () => {
        const w = fresh();
        const wing = ["silo", "silo", "interceptor", "interceptor", "interceptor"];
        // Loose airframes would tip the total past the small-force floor...
        expect(profileOf(w, roster(wing)).posture).toBe("first-strike");
        // ...but the same aircraft parked in a hangar (baseId set) do not count.
        expect(profileOf(w, roster(wing, {baseId: "strip1"})).posture).toBe("balanced");
    });
});

describe("survivingFrac — owner0 baseline", () => {
    it("test_full_nation_scores_one", () => {
        const w = fresh();
        expect(survivingFrac(w, 1)).toBe(1);
        expect(survivingFrac(w, 2)).toBe(1);
    });

    it("test_dead_city_drops_the_fraction", () => {
        const w = fresh();
        w.cities.find((c) => c.id === "b2").alive = false;
        expect(survivingFrac(w, 1)).toBe(0.5);
        // The profile carries the same figure.
        expect(profileOf(w, new Map()).frac).toBe(0.5);
    });

    it("test_captured_city_counts_for_its_holder", () => {
        const w = fresh();
        w.cities.find((c) => c.id === "b2").slot = 2;    // C occupies B-2, city stays alive
        expect(survivingFrac(w, 1)).toBe(0.5);           // loser: baseline 2, holds 1
        expect(survivingFrac(w, 2)).toBe(2);             // holder: baseline 1, holds 2
    });
});
