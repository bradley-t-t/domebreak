// Battle Planning solver — the pure fire-allocation logic behind player-authored
// attack plans. Covers the engagement-range clamp, the no-overkill stacking rule,
// fair spread across enemy nations, and the target-eligibility filters (at-war,
// alive). Deterministic, no RNG, no I/O — the world fixtures carry only the fields
// solvePlan/planTargets touch.
import {describe, expect, it} from "vitest";
import {solvePlan, planTargets} from "../../../src/game/engine.js";
import {BATTLE_PLAN} from "../../../src/game/data/constants.js";

// Minimal world: slot 0 is me, at war with 1 and 2, neutral toward 3. nations[slot]
// ordering matches slot so nationOf hits directly. Every nation carries the mults
// and ammo pool the solver reads.
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

// silo: hardware range 20000 km, damage 55, default warhead = standard (dmgMult 1)
// → 55 dmg/shot, so a 100-hp city needs two silos to fall (no-overkill).
const silo = (id, lng, lat, over = {}) => ({id, slot: 0, type: "silo", hp: 60, lng, lat, ...over});
// launcher: hardware range 8000 km — used to probe the hardware-range ceiling.
const launcher = (id, lng, lat, over = {}) => ({id, slot: 0, type: "launcher", hp: 45, lng, lat, ...over});
// A live, undamaged city (no hp field yet → remaining hp falls back to maxHp).
const city = (id, slot, lng, lat, over = {}) => ({id, slot, lng, lat, alive: true, maxHp: 100, ...over});

// Latitude-only offsets convert cleanly to distance: 1° ≈ 111 km from the equator.
const BIG = BATTLE_PLAN.maxEngagementKm; // dial wide open → hardware range governs

describe("battle-plan solver — range gating", () => {
    it("test_solver_target_within_reach_is_assigned", () => {
        const s = silo("s1", 0, 0);
        const c = city("cA", 1, 0, 1); // ~111 km — well inside a silo's 20000 km reach
        const w = world({units: [s], cities: [c]});
        const r = solvePlan(w, {attackers: ["s1"], targets: ["cA"], engagementKm: BIG}, 0);
        expect(r.assignments.get("s1")).toBe("cA");
        expect(r.firing).toBe(1);
        expect(r.outOfRange).toHaveLength(0);
    });

    it("test_solver_target_beyond_hardware_range_is_out_of_range", () => {
        // launcher reaches 8000 km; a target ~8895 km out (80° lat) is beyond it.
        const l = launcher("l1", 0, 0);
        const c = city("cA", 1, 0, 80);
        const w = world({units: [l], cities: [c]});
        const r = solvePlan(w, {attackers: ["l1"], targets: ["cA"], engagementKm: BIG}, 0);
        expect(r.firing).toBe(0);
        expect(r.outOfRange).toContain("l1");
    });

    it("test_solver_engagement_dial_below_target_distance_holds_fire", () => {
        // Silo hardware reaches the target (~2223 km), but a 1000 km dial won't.
        const s = silo("s1", 0, 0);
        const c = city("cA", 1, 0, 20);
        const w = world({units: [s], cities: [c]});
        const r = solvePlan(w, {attackers: ["s1"], targets: ["cA"], engagementKm: 1000}, 0);
        expect(r.firing).toBe(0);
        expect(r.outOfRange).toContain("s1");
    });

    it("test_solver_engagement_dial_above_target_distance_fires", () => {
        const s = silo("s1", 0, 0);
        const c = city("cA", 1, 0, 20); // ~2223 km
        const w = world({units: [s], cities: [c]});
        const r = solvePlan(w, {attackers: ["s1"], targets: ["cA"], engagementKm: 3000}, 0);
        expect(r.assignments.get("s1")).toBe("cA");
    });
});

describe("battle-plan solver — no-overkill allocation", () => {
    it("test_solver_stacks_just_enough_attackers_to_kill_then_idles_the_rest", () => {
        // 3 silos (55 dmg each), one 100-hp city: two shots (110) cover it, the
        // third has no unsaturated target left and stands idle.
        const s1 = silo("s1", 0, 0), s2 = silo("s2", 0, 0.01), s3 = silo("s3", 0, 0.02);
        const c = city("cA", 1, 0, 1);
        const w = world({units: [s1, s2, s3], cities: [c]});
        const r = solvePlan(w, {attackers: ["s1", "s2", "s3"], targets: ["cA"], engagementKm: BIG}, 0);
        expect(r.firing).toBe(2);
        expect(r.idle).toEqual(["s3"]);
        expect(r.assignments.get("s1")).toBe("cA");
        expect(r.assignments.get("s2")).toBe("cA");
    });

    it("test_solver_overkill_toggle_commits_every_attacker", () => {
        const s1 = silo("s1", 0, 0), s2 = silo("s2", 0, 0.01), s3 = silo("s3", 0, 0.02);
        const c = city("cA", 1, 0, 1);
        const w = world({units: [s1, s2, s3], cities: [c]});
        const r = solvePlan(w, {attackers: ["s1", "s2", "s3"], targets: ["cA"], engagementKm: BIG, overkill: true}, 0);
        expect(r.firing).toBe(3);
        expect(r.idle).toHaveLength(0);
    });
});

describe("battle-plan solver — fair spread across enemy nations", () => {
    it("test_solver_spreads_two_attackers_across_two_enemy_nations", () => {
        // Two silos, one 100-hp city per enemy nation, both reachable. Fair spread
        // sends one silo to each nation rather than dogpiling the nearer city.
        const s1 = silo("s1", 0, 0), s2 = silo("s2", 0, 0.01);
        const cA = city("cA", 1, 0, 1);   // nation 1, ~111 km (nearer)
        const cB = city("cB", 2, 0, 2);   // nation 2, ~222 km
        const w = world({units: [s1, s2], cities: [cA, cB]});
        const r = solvePlan(w, {attackers: ["s1", "s2"], targets: ["cA", "cB"], engagementKm: BIG}, 0);
        expect(r.assignments.get("s1")).toBe("cA"); // first picks nearer (nations tied at 0)
        expect(r.assignments.get("s2")).toBe("cB"); // second favors the untouched nation
        expect(r.targetsCovered).toBe(2);
    });
});

describe("battle-plan solver — target eligibility + auto-build wants", () => {
    it("test_solver_ignores_neutral_and_dead_targets", () => {
        const s = silo("s1", 0, 0);
        const neutral = city("cN", 3, 0, 1);          // not at war
        const dead = city("cD", 1, 0, 1, {alive: false});
        const w = world({units: [s], cities: [neutral, dead]});
        const live = planTargets(w, {targets: ["cN", "cD"]}, 0);
        expect(live).toHaveLength(0);
        const r = solvePlan(w, {attackers: ["s1"], targets: ["cN", "cD"], engagementKm: BIG}, 0);
        expect(r.firing).toBe(0);
    });

    it("test_solver_reports_one_desired_round_per_assigned_warhead_platform", () => {
        const s1 = silo("s1", 0, 0), s2 = silo("s2", 0, 0.01);
        const cA = city("cA", 1, 0, 1), cB = city("cB", 2, 0, 1);
        const w = world({units: [s1, s2], cities: [cA, cB]});
        const r = solvePlan(w, {attackers: ["s1", "s2"], targets: ["cA", "cB"], engagementKm: BIG}, 0);
        // Both silos fire and default to the Standard round → two standard wanted.
        expect(r.ammoWanted.standard).toBe(2);
    });
});
