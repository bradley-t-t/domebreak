// Battle Planning solver — the pure fire-allocation logic behind player-authored
// attack plans, now driven by attacker unit TYPES → target CATEGORIES (no map picking).
// Covers the engagement-range clamp, the no-overkill stacking rule, fair spread across
// enemy nations, the target-category filter, and at-war/alive eligibility.
// Deterministic, no RNG, no I/O — fixtures carry only the fields the solver touches.
import {describe, expect, it} from "vitest";
import {solvePlan, planTargets, targetCategoryOf} from "../../../src/game/engine.js";
import {BATTLE_PLAN} from "../../../src/game/data/constants.js";

// slot 0 = me, at war with 1 and 2, neutral toward 3. nations[slot] ordering matches
// slot so nationOf hits directly; each nation carries the mults + ammo the solver reads.
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

// silo: my platform (slot 0), hardware range 20000 km, damage 55, default warhead
// standard (dmgMult 1) → 55 dmg/shot, so a 100-hp city needs two silos (no-overkill).
const silo = (id, lng, lat, over = {}) => ({id, slot: 0, type: "silo", hp: 60, lng, lat, ...over});
// launcher: hardware range 8000 km — probes the hardware-range ceiling.
const launcher = (id, lng, lat, over = {}) => ({id, slot: 0, type: "launcher", hp: 45, lng, lat, ...over});
// A live, undamaged enemy city (no hp field yet → remaining hp falls back to maxHp).
const city = (id, slot, lng, lat, over = {}) => ({id, slot, lng, lat, alive: true, maxHp: 100, ...over});
// An enemy unit of a given type (a target for the counter-force categories).
const enemyUnit = (id, slot, type, lng, lat, over = {}) => ({id, slot, type, hp: 60, lng, lat, ...over});

const BIG = BATTLE_PLAN.maxEngagementKm; // dial wide open → hardware range governs
const plan = (over) => ({attackerTypes: ["silo"], targetTypes: ["city"], engagementKm: BIG, ...over});

describe("battle-plan solver — range gating", () => {
    it("test_solver_target_within_reach_is_assigned", () => {
        const w = world({units: [silo("s1", 0, 0)], cities: [city("cA", 1, 0, 1)]});
        const r = solvePlan(w, plan(), 0);
        expect(r.assignments.get("s1")).toBe("cA");
        expect(r.firing).toBe(1);
    });

    it("test_solver_target_beyond_hardware_range_is_out_of_range", () => {
        // launcher reaches 8000 km; a target ~8895 km out (80° lat) is beyond it.
        const w = world({units: [launcher("l1", 0, 0)], cities: [city("cA", 1, 0, 80)]});
        const r = solvePlan(w, plan({attackerTypes: ["launcher"]}), 0);
        expect(r.firing).toBe(0);
        expect(r.outOfRange).toContain("l1");
    });

    it("test_solver_engagement_dial_below_target_distance_holds_fire", () => {
        const w = world({units: [silo("s1", 0, 0)], cities: [city("cA", 1, 0, 20)]}); // ~2223 km
        const r = solvePlan(w, plan({engagementKm: 1000}), 0);
        expect(r.firing).toBe(0);
    });

    it("test_solver_engagement_dial_above_target_distance_fires", () => {
        const w = world({units: [silo("s1", 0, 0)], cities: [city("cA", 1, 0, 20)]});
        const r = solvePlan(w, plan({engagementKm: 3000}), 0);
        expect(r.assignments.get("s1")).toBe("cA");
    });
});

describe("battle-plan solver — no-overkill allocation", () => {
    it("test_solver_stacks_just_enough_attackers_to_kill_then_idles_the_rest", () => {
        const w = world({units: [silo("s1", 0, 0), silo("s2", 0, 0.01), silo("s3", 0, 0.02)], cities: [city("cA", 1, 0, 1)]});
        const r = solvePlan(w, plan(), 0);
        expect(r.firing).toBe(2);
        expect(r.idle).toEqual(["s3"]);
    });

    it("test_solver_overkill_toggle_commits_every_attacker", () => {
        const w = world({units: [silo("s1", 0, 0), silo("s2", 0, 0.01), silo("s3", 0, 0.02)], cities: [city("cA", 1, 0, 1)]});
        const r = solvePlan(w, plan({overkill: true}), 0);
        expect(r.firing).toBe(3);
    });
});

describe("battle-plan solver — fair spread across enemy nations", () => {
    it("test_solver_spreads_two_attackers_across_two_enemy_nations", () => {
        const cA = city("cA", 1, 0, 1);   // nation 1, ~111 km (nearer)
        const cB = city("cB", 2, 0, 2);   // nation 2, ~222 km
        const w = world({units: [silo("s1", 0, 0), silo("s2", 0, 0.01)], cities: [cA, cB]});
        const r = solvePlan(w, plan(), 0);
        expect(r.assignments.get("s1")).toBe("cA");
        expect(r.assignments.get("s2")).toBe("cB");
        expect(r.targetsCovered).toBe(2);
    });
});

describe("battle-plan solver — attacker/target type selection", () => {
    it("test_solver_only_commands_selected_attacker_types", () => {
        // Plan selects silos only — the launcher is not part of it and never fires.
        const w = world({units: [silo("s1", 0, 0), launcher("l1", 0, 0)], cities: [city("cA", 1, 0, 1)]});
        const r = solvePlan(w, plan({attackerTypes: ["silo"]}), 0);
        expect(r.attackerCount).toBe(1);
        expect(r.assignments.has("l1")).toBe(false);
    });

    it("test_solver_city_category_selects_only_cities", () => {
        const w = world({units: [silo("s1", 0, 0)], cities: [city("cA", 1, 0, 1)]});
        const t = planTargets(w, {targetTypes: ["city"]}, 0);
        expect(t.every((x) => x.kind === "city")).toBe(true);
        expect(t).toHaveLength(1);
    });

    it("test_solver_strike_category_targets_enemy_missile_platforms", () => {
        // "strike" category → enemy silos/launchers etc., not cities.
        const w = world({units: [silo("s1", 0, 0), enemyUnit("e1", 1, "silo", 0, 1)], cities: [city("cA", 1, 0, 1)]});
        const r = solvePlan(w, plan({targetTypes: ["strike"]}), 0);
        expect(r.assignments.get("s1")).toBe("e1");   // aimed at the enemy silo, not the city
    });

    it("test_targetCategoryOf_maps_types_and_cities", () => {
        expect(targetCategoryOf("city")).toBe("city");
        expect(targetCategoryOf("unit", "silo")).toBe("strike");
        expect(targetCategoryOf("unit", "dome")).toBe("airdef");
        expect(targetCategoryOf("unit", "radar")).toBe("sensors");
    });
});

describe("battle-plan solver — eligibility + auto-build wants", () => {
    it("test_solver_ignores_neutral_and_dead_targets", () => {
        const neutral = city("cN", 3, 0, 1);          // not at war
        const dead = city("cD", 1, 0, 1, {alive: false});
        const w = world({units: [silo("s1", 0, 0)], cities: [neutral, dead]});
        const r = solvePlan(w, plan(), 0);
        expect(r.firing).toBe(0);
    });

    it("test_solver_reports_one_desired_round_per_assigned_warhead_platform", () => {
        const w = world({units: [silo("s1", 0, 0), silo("s2", 0, 0.01)], cities: [city("cA", 1, 0, 1), city("cB", 2, 0, 1)]});
        const r = solvePlan(w, plan(), 0);
        expect(r.ammoWanted.standard).toBe(2);
    });
});

describe("battle-plan solver — target-nation scope", () => {
    // Two at-war enemy cities: nation 1 and nation 2. The scope decides which count.
    const twoEnemies = () => world({units: [silo("s1", 0, 0)], cities: [city("cA", 1, 0, 1), city("cB", 2, 0, 1)]});

    it("test_solver_nation_scope_empty_targets_all_at_war_nations", () => {
        // Empty scope = legacy behavior: every nation you're at war with is eligible.
        const t = planTargets(twoEnemies(), plan({targetNations: []}), 0);
        expect(new Set(t.map((x) => x.slot))).toEqual(new Set([1, 2]));
    });

    it("test_solver_nation_scope_restricts_to_selected_nation", () => {
        const w = twoEnemies();
        const t = planTargets(w, plan({targetNations: [1]}), 0);
        expect(t).toHaveLength(1);
        expect(t[0].slot).toBe(1);
        // And the solve only ever fires at the in-scope nation.
        const r = solvePlan(w, plan({targetNations: [1]}), 0);
        expect(r.assignments.get("s1")).toBe("cA");
    });

    it("test_solver_nation_scope_multi_selection_includes_each", () => {
        const t = planTargets(twoEnemies(), plan({targetNations: [1, 2]}), 0);
        expect(new Set(t.map((x) => x.slot))).toEqual(new Set([1, 2]));
    });

    it("test_solver_nation_scope_at_peace_power_yields_no_targets", () => {
        // Scoping to nation 3 (neutral — never at war) can't manufacture a target: the
        // at-war gate still governs, so nothing fires even though a city of 3 exists.
        const w = world({units: [silo("s1", 0, 0)], cities: [city("cN", 3, 0, 1)]});
        const r = solvePlan(w, plan({targetNations: [3]}), 0);
        expect(r.targetsLive).toBe(0);
        expect(r.firing).toBe(0);
    });
});
