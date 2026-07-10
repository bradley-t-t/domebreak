// End-to-end sanity over the opponent-AI pipeline (sim/ai/index.js aiTick) driven
// through the real tick engine (step). A small real-geography world — US player,
// RU and CN opponents on their own soil — is stepped for minutes of game time to
// check the properties the pipeline promises: byte-identical determinism from a
// seed, organic building with personality/ledger state, save round-trip fidelity
// (a JSON-revived world keeps running its AI), the opening-grace ceasefire, and
// live fire assignments + projectiles once two AIs are at war.
import {describe, expect, it} from "vitest";
import {UNITS, atWar, createWorld, declareWar, initialWarhead} from "../../../src/game/engine.js";
import {step} from "../../../src/game/sim/tick.js";
import {TRAITS} from "../../../src/game/sim/ai/personality.js";
import {PERSONALITY} from "../../../src/game/sim/ai/tuning.js";

// Real ISO codes with cities on the right soil — AI placement rasterizes actual
// political borders (inOwnCountry), so the geography must be genuine. Moscow and
// Beijing are ~5800 km apart: inside great-power war range and trivially inside
// the silo's global strike reach.
function setup(rules = {}) {
    return {
        mySlot: 0, seed: 11,
        nations: [
            {slot: 0, name: "America", iso: "US", isAi: false, gdp: 5},
            {slot: 1, name: "Russia", iso: "RU", isAi: true, gdp: 5},
            {slot: 2, name: "China", iso: "CN", isAi: true, gdp: 5},
        ],
        cities: [
            {id: "us1", slot: 0, name: "Heartland", state: "KS", cap: 1, pop: 2e6, econ: 2, lng: -98, lat: 39},
            {id: "us2", slot: 0, name: "Denver", state: "CO", cap: 0, pop: 1e6, econ: 1, lng: -104.99, lat: 39.74},
            {id: "ru1", slot: 1, name: "Moscow", state: "MOW", cap: 1, pop: 2e6, econ: 2, lng: 37.6, lat: 55.75},
            {id: "ru2", slot: 1, name: "Yekaterinburg", state: "SVE", cap: 0, pop: 1e6, econ: 1, lng: 60.6, lat: 56.85},
            {id: "ru3", slot: 1, name: "Novosibirsk", state: "NVS", cap: 0, pop: 1e6, econ: 1, lng: 82.93, lat: 55.03},
            {id: "cn1", slot: 2, name: "Beijing", state: "BJ", cap: 1, pop: 2e6, econ: 2, lng: 116.4, lat: 39.9},
            {id: "cn2", slot: 2, name: "Xian", state: "SN", cap: 0, pop: 1e6, econ: 1, lng: 108.94, lat: 34.34},
            {id: "cn3", slot: 2, name: "Chengdu", state: "SC", cap: 0, pop: 1e6, econ: 1, lng: 104.07, lat: 30.66},
        ],
        rules: {playerGraceSec: 0, ...rules},
    };
}

// Fixed-dt stepping — the deterministic drive every test uses.
function run(w, seconds, dt = 0.5) {
    const steps = Math.round(seconds / dt);
    for (let i = 0; i < steps; i++) step(w, dt);
    return w;
}

// Seed a live strategic platform directly (mirrors tickSpawn's unit shape). Ids
// avoid the engine's "u<n>" namespace so later organic spawns can't collide.
function addSilo(w, id, slot, lng, lat) {
    w.units.push({
        id, slot, type: "silo", lng, lat,
        hp: UNITS.silo.hp, cooldown: 0, targetId: null, warhead: initialWarhead("silo"),
    });
}

// Top-level world keys whose serialized value differs — the divergence report a
// failed determinism check needs (which field, not just "worlds differ").
function divergentTopLevelKeys(a, b) {
    const oa = JSON.parse(JSON.stringify(a)), ob = JSON.parse(JSON.stringify(b));
    const keys = [...new Set([...Object.keys(oa), ...Object.keys(ob)])];
    return keys.filter((k) => JSON.stringify(oa[k]) !== JSON.stringify(ob[k]));
}

describe("aiTick through step() — determinism", () => {
    it("test_identical_setups_step_identically_for_180_game_seconds", () => {
        const wa = createWorld(setup());
        const wb = createWorld(setup());
        for (let i = 0; i < 360; i++) {
            step(wa, 0.5);
            step(wb, 0.5);
        }
        expect(divergentTopLevelKeys(wa, wb)).toEqual([]);
        expect(JSON.stringify(wa)).toBe(JSON.stringify(wb));
    });
});

describe("aiTick through step() — organic building", () => {
    it("test_ai_nations_queue_and_field_units_within_minutes", () => {
        const w = run(createWorld(setup()), 300);
        expect(w.time).toBeCloseTo(300, 6);
        // Both AI nations have delivered real units onto the map (the doctrine
        // ladder opens with industry, buildTime <= 30 s, thinks every 20-40 s).
        expect(w.units.some((u) => u.slot === 1 && u.hp > 0)).toBe(true);
        expect(w.units.some((u) => u.slot === 2 && u.hp > 0)).toBe(true);
        // The production line stays fed — building, built, or paying for ammo.
        for (const n of [w.nations[1], w.nations[2]]) {
            const activity = (n.prod.current ? 1 : 0) + n.prod.queue.length
                + w.units.filter((u) => u.slot === n.slot && u.hp > 0).length;
            expect(activity).toBeGreaterThan(0);
        }
    });

    it("test_personality_and_diplo_ledger_seeded_for_ai_nations_only", () => {
        const w = run(createWorld(setup()), 60);
        for (const n of [w.nations[1], w.nations[2]]) {
            expect(n.personality).toBeTruthy();
            for (const t of TRAITS) {
                expect(n.personality[t]).toBeGreaterThanOrEqual(PERSONALITY.floor);
                expect(n.personality[t]).toBeLessThanOrEqual(PERSONALITY.floor + PERSONALITY.span);
            }
            expect(n.diplo).toBeTruthy();
            expect(n.diplo.ledger).toBeTypeOf("object");
        }
        // The human never runs the pipeline, so it never grows a personality.
        expect(w.nations[0].personality).toBeUndefined();
    });
});

describe("aiTick through step() — save round-trip", () => {
    it("test_revived_world_keeps_running_its_ai", () => {
        const w = run(createWorld(setup()), 180);
        const revived = JSON.parse(JSON.stringify(w));
        const unitsAtRevive = revived.units.filter((u) => u.slot !== 0 && u.hp > 0).length;
        let lineActive = false;
        for (let i = 0; i < 120; i++) {
            step(revived, 0.5);
            lineActive ||= revived.nations.some((n) => n.isAi && (n.prod.current != null || n.prod.queue.length > 0));
        }
        expect(revived.time).toBeCloseTo(240, 6);
        const unitsAfter = revived.units.filter((u) => u.slot !== 0 && u.hp > 0).length;
        // The revived AI keeps building: new deliveries landed or the line is busy.
        expect(unitsAfter > unitsAtRevive || lineActive).toBe(true);
    });

    it("test_revived_world_evolves_identically_to_the_original", () => {
        // Everything the sim reads must live in the JSON world — a revived copy
        // stepped in lockstep with the original may never drift.
        const w = run(createWorld(setup()), 180);
        const revived = JSON.parse(JSON.stringify(w));
        for (let i = 0; i < 120; i++) {
            step(w, 0.5);
            step(revived, 0.5);
        }
        expect(divergentTopLevelKeys(w, revived)).toEqual([]);
        expect(JSON.stringify(revived)).toBe(JSON.stringify(w));
    });
});

describe("aiTick through step() — opening grace", () => {
    it("test_no_wars_open_while_the_grace_ceasefire_holds", () => {
        const w = createWorld(setup({playerGraceSec: 3600}));
        // The gate the AIs themselves route through refuses during grace.
        expect(declareWar(w, 1, 2).error).toBeTruthy();
        run(w, 240);
        expect(w.events.some((e) => e.type === "war" || e.type === "callToArms")).toBe(false);
        for (const n of w.nations) {
            for (const s in n.relations) expect(n.relations[s]).not.toBe("war");
        }
        expect(w.pendingPeace).toHaveLength(0);
    });
});

describe("aiTick through step() — prosecuting a war", () => {
    it("test_ais_at_war_assign_targets_and_launch_projectiles", () => {
        const w = createWorld(setup());
        // Standing strategic forces on each side's own soil so the fires stage
        // has platforms to task and "strike"-category targets to hit.
        addSilo(w, "rs1", 1, 35.5, 54.6);
        addSilo(w, "rs2", 1, 61.5, 57.6);
        addSilo(w, "cs1", 2, 114.5, 38.6);
        addSilo(w, "cs2", 2, 110.2, 35.6);
        expect(declareWar(w, 1, 2).ok).toBe(true);
        expect(atWar(w, 1, 2)).toBe(true);
        let sawAssignment = false, sawProjectile = false;
        for (let i = 0; i < 480 && !(sawAssignment && sawProjectile); i++) {
            step(w, 0.5);
            sawAssignment ||= w.units.some((u) => (u.slot === 1 || u.slot === 2)
                && u.hp > 0 && UNITS[u.type].kind === "offense" && u.targetId != null);
            sawProjectile ||= w.projectiles.some((p) => p.slot === 1 || p.slot === 2);
        }
        expect(sawAssignment).toBe(true);
        expect(sawProjectile).toBe(true);
    });
});
