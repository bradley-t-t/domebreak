// AI fires: buildFirePlans shapes one solver-ready plan per active war — the
// war goal picks the target categories (decap hunts command with overkill on,
// attritional grinds shooters), only my non-ground offense types are tasked,
// and a war we are actively suing out of holds fire — with plans ranked decap
// first. solveFires then merges the staged per-war solves: the highest-priority
// war claims a shared launcher, held foes draw no shots, and ammoWanted counts
// one round per assigned warhead-capable attacker across all plans, keyed by
// its loaded payload. Deterministic — both stages are pure functions of the
// world and frame.
import {describe, expect, it} from "vitest";
import {UNITS, createWorld, declareWar} from "../../../src/game/engine.js";
import {buildFrame, capPositions} from "../../../src/game/sim/ai/perception/perception.js";
import {buildFirePlans} from "../../../src/game/sim/ai/fires/plans.js";
import {solveFires} from "../../../src/game/sim/ai/fires/solver.js";
import {PEACE} from "../../../src/game/sim/ai/tuning.js";

const KANSAS = {lng: -98, lat: 39};
const MOSCOW = {lng: 37.6, lat: 55.75};
const BEIJING = {lng: 116.4, lat: 39.9};

// slot 0 = me (US), at war with both slot 1 (RU, fields a command bunker — the
// decap target set) and slot 2 (CN, fields a silo — the attritional target set).
// My default force is one global-reach silo ("s1") both wars will compete for.
function fresh({myUnits = [{id: "s1", type: "silo", lng: -100, lat: 40}], time = 0} = {}) {
    const w = createWorld({
        mySlot: 0, seed: 7,
        nations: [
            {slot: 0, name: "Aland", iso: "US", isAi: false, gdp: 5},
            {slot: 1, name: "Bland", iso: "RU", isAi: true, gdp: 5},
            {slot: 2, name: "Cland", iso: "CN", isAi: true, gdp: 5},
        ],
        cities: [
            {id: "a1", slot: 0, name: "A-Cap", state: "KS", cap: 1, pop: 1e6, econ: 1, ...KANSAS},
            {id: "b1", slot: 1, name: "B-Cap", state: "MOW", cap: 1, pop: 1e6, econ: 1, ...MOSCOW},
            {id: "c1", slot: 2, name: "C-Cap", state: "BJ", cap: 1, pop: 1e6, econ: 1, ...BEIJING},
        ],
        rules: {playerGraceSec: 0},
    });
    declareWar(w, 0, 1);
    declareWar(w, 0, 2);
    for (const u of myUnits) w.units.push({slot: 0, hp: UNITS[u.type].hp, ...u});
    w.units.push({id: "rb1", slot: 1, type: "bunker", lng: 39.0, lat: 56.3, hp: UNITS.bunker.hp});
    w.units.push({id: "cs1", slot: 2, type: "silo", lng: 117.5, lat: 40.6, hp: UNITS.silo.hp});
    w.time = time;
    return w;
}

function frameFor(w, slot = 0) {
    const unitsBySlot = new Map();
    for (const n of w.nations) unitsBySlot.set(n.slot, []);
    for (const u of w.units) if (u.hp > 0) unitsBySlot.get(u.slot)?.push(u);
    const n = w.nations.find((x) => x.slot === slot);
    return buildFrame(w, n, {unitsBySlot, caps: capPositions(w)});
}

// War-plan stubs shaped like assessWarPlans output (goal -> target categories).
const GOAL_TARGETS = {
    decap: ["command", "sensors", "airdef"],
    attritional: ["strike", "airdef", "sensors", "airbases"],
};
const wp = (foe, goal, state = "opening") => ({foe, goal, targets: GOAL_TARGETS[goal], phase: "opening", state});

describe("buildFirePlans — plan shape", () => {
    it("test_one_plan_per_war_with_goal_matched_target_types", () => {
        const frame = frameFor(fresh());
        const plans = buildFirePlans(frame, {1: wp(1, "decap"), 2: wp(2, "attritional")});
        expect(plans).toHaveLength(2);
        const decap = plans.find((p) => p.foe === 1);
        expect(decap.plan.targetTypes[0]).toBe("command");     // decapitation hunts leadership first
        expect(decap.plan.overkill).toBe(true);                // saturate the bunker, waste be damned
        expect(decap.plan.targetNations).toEqual([1]);         // scoped to this war only
        const attr = plans.find((p) => p.foe === 2);
        expect(attr.plan.targetTypes).toContain("strike");
        expect(attr.plan.targetTypes).toContain("airdef");
        expect(attr.plan.overkill).toBe(false);
    });

    it("test_plans_sorted_decap_before_attritional", () => {
        const frame = frameFor(fresh());
        const plans = buildFirePlans(frame, {1: wp(1, "attritional"), 2: wp(2, "decap")});
        expect(plans.map((p) => p.goal)).toEqual(["decap", "attritional"]);
        expect(plans[0].foe).toBe(2);
    });

    it("test_attacker_types_are_my_non_ground_offense_only", () => {
        const w = fresh({
            myUnits: [
                {id: "s1", type: "silo", lng: -100, lat: 40},
                {id: "i1", type: "infantry", lng: -99, lat: 38},   // ground war — maneuvers, never solver-tasked
                {id: "d1", type: "battery", lng: -97, lat: 40},    // defense — not an attacker
            ],
        });
        const plans = buildFirePlans(frameFor(w), {1: wp(1, "attritional")});
        expect(plans[0].plan.attackerTypes).toEqual(["silo"]);
    });

    it("test_no_plans_without_a_strategic_attacker", () => {
        const w = fresh({myUnits: [{id: "i1", type: "infantry", lng: -99, lat: 38}]});
        expect(buildFirePlans(frameFor(w), {1: wp(1, "attritional")})).toEqual([]);
    });
});

describe("buildFirePlans — holdFire while suing for peace", () => {
    it("test_holdfire_when_suing_recently_and_war_going_badly", () => {
        const frame = frameFor(fresh({time: 100}));
        frame.diplo.suing[1] = 100 - (PEACE.losingRetrySec - 5);   // offer still pending
        for (const state of ["losing", "stall", "routed"]) {
            const plans = buildFirePlans(frame, {1: wp(1, "attritional", state)});
            expect(plans[0].holdFire).toBe(true);
        }
    });

    it("test_holdfire_covers_any_pending_offer_but_lapses", () => {
        const frame = frameFor(fresh({time: 100}));
        frame.diplo.suing[1] = 100 - (PEACE.losingRetrySec - 5);
        // ANY war we just sued out of holds fire while the offer is pending —
        // the two-front-relief sue fires from "prosecute" and must not keep
        // launching mid-offer either.
        expect(buildFirePlans(frame, {1: wp(1, "attritional", "prosecute")})[0].holdFire).toBe(true);
        // The war resumes fire once the offer window lapses.
        frame.diplo.suing[1] = 100 - (PEACE.losingRetrySec + 1);
        expect(buildFirePlans(frame, {1: wp(1, "attritional", "losing")})[0].holdFire).toBe(false);
        // No offer pending at all: shoot.
        delete frame.diplo.suing[1];
        expect(buildFirePlans(frame, {1: wp(1, "attritional", "losing")})[0].holdFire).toBe(false);
    });
});

describe("solveFires — merged per-war solve", () => {
    it("test_higher_priority_plan_claims_the_shared_attacker", () => {
        const w = fresh();
        const frame = frameFor(w);
        // Sanity: the attritional war alone would task the silo on CN's launcher.
        const alone = solveFires(w, frame, buildFirePlans(frame, {2: wp(2, "attritional")}));
        expect(alone.assignments.get("s1").targetId).toBe("cs1");
        // With a decap war in the mix, the decap plan solves first and wins it.
        const plans = buildFirePlans(frame, {1: wp(1, "decap"), 2: wp(2, "attritional")});
        const res = solveFires(w, frame, plans);
        expect(res.assignments.get("s1")).toEqual({targetId: "rb1", foe: 1, goal: "decap"});
        expect(res.holdFoes.size).toBe(0);
    });

    it("test_holdfire_foe_is_flagged_and_draws_no_shots", () => {
        const w = fresh({time: 100});
        const frame = frameFor(w);
        frame.diplo.suing[1] = 100 - 1;      // just sued RU while losing
        const plans = buildFirePlans(frame, {1: wp(1, "attritional", "losing"), 2: wp(2, "attritional")});
        const res = solveFires(w, frame, plans);
        expect(res.holdFoes.has(1)).toBe(true);
        for (const a of res.assignments.values()) expect(a.foe).not.toBe(1);
        expect(res.assignments.get("s1").foe).toBe(2);         // the silo still fights the other war
        expect(res.ammoWanted).toEqual({standard: 1});          // held plans add no magazine demand
    });

    it("test_ammo_wanted_aggregates_loaded_warheads_across_plans", () => {
        // Two wars, two attackers. The east-coast TEL only reaches RU and its
        // one SICBM shot saturates the RU radar, so the silo is left idle by
        // the first war and claimed by the second — the merged magazine demand
        // spans both plans, one round per attacker, keyed by loaded payload.
        const w = fresh({
            myUnits: [
                {id: "l1", type: "launcher", lng: -74.0, lat: 40.7},
                {id: "s1", type: "silo", lng: -100, lat: 40, warhead: "thermo"},
            ],
        });
        w.units.push({id: "rr1", slot: 1, type: "radar", lng: 37.0, lat: 55.2, hp: UNITS.radar.hp});
        const frame = frameFor(w);
        const plans = buildFirePlans(frame, {1: wp(1, "attritional"), 2: wp(2, "attritional")});
        const res = solveFires(w, frame, plans);
        expect(res.assignments.get("l1")).toEqual({targetId: "rr1", foe: 1, goal: "attritional"});
        expect(res.assignments.get("s1")).toEqual({targetId: "cs1", foe: 2, goal: "attritional"});
        expect(res.ammoWanted).toEqual({sicbm: 1, thermo: 1});
    });
});
