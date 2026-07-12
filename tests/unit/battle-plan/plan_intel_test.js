// Battle Planning intel helpers — the derived readouts the planning console shows the
// player: per-category live target counts, the "fit" engagement suggestion, and the
// solver's firepower / volleys-to-clear estimate. Deterministic, no RNG, no I/O; fixtures
// carry only the fields these functions touch (mirrors plan_solver_test.js).
import {describe, expect, it} from "vitest";
import {liveTargetCounts, solvePlan, suggestEngagementKm} from "../../../src/game/engine.js";
import {BATTLE_PLAN} from "../../../src/game/data/constants.js";
import {haversine} from "../../../src/game/geo/geo.js";

// slot 0 = me, at war with 1 and 2, at peace with 3. Same shape the solver test uses.
function world(over = {}) {
    return {
        _id: 0,
        nations: [
            {slot: 0, name: "Me", relations: {1: "war", 2: "war"}, dmgMult: 1, rangeMult: 1, ammo: {}},
            {slot: 1, name: "A", relations: {0: "war"}},
            {slot: 2, name: "B", relations: {0: "war"}},
            {slot: 3, name: "Neutral", relations: {}},
        ],
        cities: [],
        units: [],
        ...over,
    };
}

const silo = (id, lng, lat, over = {}) => ({id, slot: 0, type: "silo", hp: 60, lng, lat, ...over});
const city = (id, slot, lng, lat, over = {}) => ({id, slot, lng, lat, alive: true, maxHp: 100, ...over});
const enemyUnit = (id, slot, type, lng, lat, over = {}) => ({id, slot, type, hp: 60, lng, lat, ...over});

const BIG = BATTLE_PLAN.maxEngagementKm;
const plan = (over) => ({attackerTypes: ["silo"], targetTypes: ["city"], engagementKm: BIG, ...over});

describe("battle-plan intel — liveTargetCounts", () => {
    it("test_counts_cities_and_units_by_category_for_at_war_nations", () => {
        const w = world({
            cities: [city("cA", 1, 0, 1), city("cB", 2, 0, 2)],
            units: [enemyUnit("r1", 1, "radar", 0, 3), enemyUnit("s1", 2, "silo", 0, 4)],
        });
        const counts = liveTargetCounts(w, 0, null);
        expect(counts.city).toBe(2);      // both enemy cities
        expect(counts.sensors).toBe(1);   // the radar
        expect(counts.strike).toBe(1);    // the enemy silo
    });

    it("test_excludes_peace_nations_and_dead_entities", () => {
        const w = world({
            cities: [city("cA", 1, 0, 1), city("cDead", 1, 0, 2, {alive: false}), city("cN", 3, 0, 3)],
            units: [enemyUnit("s1", 2, "silo", 0, 4, {hp: 0})],
        });
        const counts = liveTargetCounts(w, 0, null);
        expect(counts.city).toBe(1);          // dead + neutral-nation cities excluded
        expect(counts.strike ?? 0).toBe(0);   // dead unit excluded
    });

    it("test_nation_scope_narrows_the_count", () => {
        const w = world({cities: [city("cA", 1, 0, 1), city("cB", 2, 0, 2)]});
        expect(liveTargetCounts(w, 0, [1]).city).toBe(1);      // only nation 1 in scope
        expect(liveTargetCounts(w, 0, [1, 2]).city).toBe(2);
    });
});

describe("battle-plan intel — solve firepower estimate", () => {
    it("test_reports_damage_per_volley_and_volleys_to_clear", () => {
        // Two silos (55 dmg each → 110/volley) vs a 200-hp city → ceil(200/110)=2 volleys.
        const w = world({units: [silo("s1", 0, 0), silo("s2", 0, 0.1)], cities: [city("cA", 1, 0, 1, {maxHp: 200})]});
        const r = solvePlan(w, plan(), 0);
        expect(r.targetHpLive).toBe(200);
        expect(r.damagePerVolley).toBe(110);
        expect(r.volleysToClear).toBe(2);
    });

    it("test_out_of_range_attackers_do_not_count_toward_firepower", () => {
        // One silo in reach, one silo far from the only target beyond its hardware range?
        // Silos reach 20000 km (global), so instead make the second attacker's only target
        // absent by giving it nothing in reach: place target near s1, and s2 at the antipode
        // still reaches globally — so use range clamp via a tight dial instead.
        const w = world({units: [silo("s1", 0, 0), silo("s2", 0, 40)], cities: [city("cA", 1, 0, 1)]});
        // Dial clamps reach to 500 km: s1 (~111 km away) is in range, s2 (~4300 km) is not.
        const r = solvePlan(w, plan({engagementKm: 500}), 0);
        expect(r.outOfRange).toContain("s2");
        expect(r.damagePerVolley).toBe(55); // only s1 contributes
    });

    it("test_no_firepower_yields_null_volleys", () => {
        const w = world({units: [], cities: [city("cA", 1, 0, 1)]});
        const r = solvePlan(w, plan(), 0);
        expect(r.damagePerVolley).toBe(0);
        expect(r.volleysToClear).toBeNull();
    });
});

describe("battle-plan intel — suggestEngagementKm", () => {
    it("test_fits_to_the_farthest_reachable_target_rounded_to_step", () => {
        const w = world({units: [silo("s1", 0, 0)], cities: [city("near", 1, 0, 1), city("far", 2, 0, 10)]});
        const far = haversine(0, 0, 0, 10);            // ~1112 km
        const km = suggestEngagementKm(w, plan(), 0);
        expect(km % BATTLE_PLAN.engagementStepKm).toBe(0);   // snapped to the slider step
        expect(km).toBeGreaterThanOrEqual(far);              // still reaches the far target
        expect(km).toBeLessThan(far + BATTLE_PLAN.engagementStepKm);
    });

    it("test_null_when_no_attackers_or_no_targets", () => {
        expect(suggestEngagementKm(world({cities: [city("cA", 1, 0, 1)]}), plan(), 0)).toBeNull();
        expect(suggestEngagementKm(world({units: [silo("s1", 0, 0)]}), plan(), 0)).toBeNull();
    });
});
