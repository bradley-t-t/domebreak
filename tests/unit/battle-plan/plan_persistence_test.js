// Battle Planning persistence — plans ride on the world so they serialize with the
// save and survive load. Covers the readBattlePlans / writeBattlePlans round-trip, the
// deliberate fireNonce reset (a loaded one-shot must NOT auto-fire), and that `armed`
// round-trips (a plan armed in peacetime stays armed across load).
// Deterministic, no RNG, no I/O.
import {describe, expect, it} from "vitest";
import {createWorld, readBattlePlans, writeBattlePlans} from "../../../src/game/engine.js";

// Minimal setup for createWorld — one nation, no cities.
const setup = () => ({
    mySlot: 0,
    seed: 1,
    nations: [{slot: 0, iso: "USA", name: "USA", isAi: false, gdp: 1}],
    cities: [],
});

const plan = (over = {}) => ({
    id: "plan-1", name: "Decapitation", color: "#fff",
    attackerTypes: ["silo"], targetTypes: ["command"], targetNations: [],
    engagementKm: 12000,
    mode: "standing", armed: false, overkill: false, autoBuild: false, fireNonce: 0,
    ...over,
});

describe("battle-plan persistence", () => {
    it("test_new_world_starts_with_empty_plans", () => {
        const w = createWorld(setup());
        const {plans, activeId} = readBattlePlans(w);
        expect(plans).toEqual([]);
        expect(activeId).toBeNull();
    });

    it("test_write_then_read_round_trips_plans_and_activeId", () => {
        const w = createWorld(setup());
        const p = plan({attackerTypes: ["silo", "launcher"], engagementKm: 8000});
        writeBattlePlans(w, [p], "plan-1");
        const back = readBattlePlans(w);
        expect(back.activeId).toBe("plan-1");
        expect(back.plans).toHaveLength(1);
        expect(back.plans[0].attackerTypes).toEqual(["silo", "launcher"]);
        expect(back.plans[0].engagementKm).toBe(8000);
    });

    it("test_armed_flag_survives_the_round_trip", () => {
        const w = createWorld(setup());
        writeBattlePlans(w, [plan({armed: true})], "plan-1");
        expect(readBattlePlans(w).plans[0].armed).toBe(true);
    });

    it("test_target_nations_scope_survives_the_round_trip", () => {
        const w = createWorld(setup());
        writeBattlePlans(w, [plan({targetNations: [2, 5]})], "plan-1");
        // Through the same JSON trip the save system takes.
        const back = readBattlePlans(JSON.parse(JSON.stringify(w)));
        expect(back.plans[0].targetNations).toEqual([2, 5]);
    });

    it("test_read_resets_fireNonce_so_a_loaded_oneshot_does_not_refire", () => {
        const w = createWorld(setup());
        writeBattlePlans(w, [plan({mode: "oneshot", fireNonce: 5})], "plan-1");
        expect(readBattlePlans(w).plans[0].fireNonce).toBe(0);
    });

    it("test_plans_serialize_with_the_world_via_json", () => {
        const w = createWorld(setup());
        writeBattlePlans(w, [plan({armed: true})], "plan-1");
        // The save system JSON-stringifies the whole world; simulate that trip.
        const revived = JSON.parse(JSON.stringify(w));
        const back = readBattlePlans(revived);
        expect(back.plans).toHaveLength(1);
        expect(back.plans[0].name).toBe("Decapitation");
        expect(back.plans[0].armed).toBe(true);
        expect(back.activeId).toBe("plan-1");
    });

    it("test_write_tolerates_null_or_missing_inputs", () => {
        const w = createWorld(setup());
        writeBattlePlans(w, null, null);
        expect(readBattlePlans(w).plans).toEqual([]);
        // A world with no battlePlans slot reads as empty rather than throwing.
        expect(readBattlePlans({}).plans).toEqual([]);
        expect(readBattlePlans(null).plans).toEqual([]);
    });
});
