// AI warhead loadout (orders/rollWarhead, exercised through applyFires): the
// payload a silo flies for a new fire order depends on the target. A target
// sitting in a dense pocket of hostiles draws the cluster bus — its
// submunitions fan across the group for more total yield than a single round —
// while a lone target never wastes cluster on a split payload. Cluster is never
// forced: it's a density-scaled roll, gated on the goal (never for decap), on
// the platform being cleared for cluster, and on the magazine holding it.
// Deterministic given the world seed.
import {describe, expect, it} from "vitest";
import {UNITS, createWorld, declareWar} from "../../../src/game/engine.js";
import {buildFrame, capPositions} from "../../../src/game/sim/ai/perception/perception.js";
import {applyFires} from "../../../src/game/sim/ai/orders/orderQueue.js";

const KANSAS = {lng: -98, lat: 39};
const MOSCOW = {lng: 37.6, lat: 55.75};

// slot 0 = me (US) with one global-reach silo, at war with slot 1 (RU). The RU
// target set is passed in per-test so we can stage a dense pocket or a lone
// target around the aim point. My magazine is stocked with every strategic
// round unless a test empties one.
function fresh({enemyUnits = [], enemyCities = [], ammo = {standard: 6, cluster: 6, thermo: 6, thermomirv: 6}} = {}) {
    const w = createWorld({
        mySlot: 0, seed: 7,
        nations: [
            {slot: 0, name: "Aland", iso: "US", isAi: false, gdp: 5},
            {slot: 1, name: "Bland", iso: "RU", isAi: true, gdp: 5},
        ],
        cities: [
            {id: "a1", slot: 0, name: "A-Cap", state: "KS", cap: 1, pop: 1e6, econ: 1, ...KANSAS},
            {id: "b1", slot: 1, name: "B-Cap", state: "MOW", cap: 1, pop: 1e6, econ: 1, ...MOSCOW},
            ...enemyCities,
        ],
        rules: {playerGraceSec: 0},
    });
    declareWar(w, 0, 1);
    w.units.push({id: "s1", slot: 0, type: "silo", lng: -100, lat: 40, hp: UNITS.silo.hp});
    for (const u of enemyUnits) w.units.push({slot: 1, hp: UNITS[u.type].hp, ...u});
    w.nations[0].ammo = {...ammo};
    return w;
}

function frameFor(w, slot = 0) {
    const unitsBySlot = new Map();
    for (const n of w.nations) unitsBySlot.set(n.slot, []);
    for (const u of w.units) if (u.hp > 0) unitsBySlot.get(u.slot)?.push(u);
    const n = w.nations.find((x) => x.slot === slot);
    return buildFrame(w, n, {unitsBySlot, caps: capPositions(w)});
}

// Task the silo at targetId with the given goal and run the loadout, returning
// the payload it ends up loading.
function loadFor(w, targetId, goal = "attritional") {
    const frame = frameFor(w);
    const solved = {assignments: new Map([["s1", {targetId, foe: 1, goal}]]), holdFoes: new Set()};
    applyFires(w, frame, solved);
    return w.units.find((u) => u.id === "s1").warhead;
}

// A tight knot of RU targets around Moscow — several cities and a unit well
// inside the cluster bus's splash of the aim point.
const POCKET = {
    enemyCities: [
        {id: "b2", slot: 1, name: "B2", state: "MOW", cap: 0, pop: 5e5, econ: 1, lng: 37.6, lat: 55.0},
        {id: "b3", slot: 1, name: "B3", state: "MOW", cap: 0, pop: 5e5, econ: 1, lng: 38.3, lat: 55.9},
        {id: "b4", slot: 1, name: "B4", state: "MOW", cap: 0, pop: 5e5, econ: 1, lng: 37.0, lat: 56.2},
    ],
    enemyUnits: [{id: "ru-silo", type: "silo", lng: 38.0, lat: 55.4}],
};

describe("rollWarhead — cluster is loaded for dense pockets", () => {
    it("test_dense_pocket_draws_cluster", () => {
        const w = fresh(POCKET);
        expect(loadFor(w, "b1", "attritional")).toBe("cluster");
    });

    it("test_lone_target_never_draws_cluster", () => {
        // No neighbors within splash: the bus would land split for nothing, so
        // the loadout falls through to the signature/standard path.
        const w = fresh();
        expect(loadFor(w, "b1", "attritional")).not.toBe("cluster");
    });

    it("test_decap_keeps_massed_yield_not_cluster", () => {
        // A leadership kill wants concentrated yield on one point, even when the
        // capital sits in a crowd — cluster is excluded for the decap goal.
        const w = fresh(POCKET);
        expect(loadFor(w, "b1", "decap")).not.toBe("cluster");
    });

    it("test_no_cluster_when_magazine_is_empty", () => {
        // Same dense pocket, but the cluster magazine is dry — the platform
        // can't load what it doesn't have.
        const w = fresh({...POCKET, ammo: {standard: 6, cluster: 0, thermo: 6, thermomirv: 6}});
        expect(loadFor(w, "b1", "attritional")).not.toBe("cluster");
    });
});
