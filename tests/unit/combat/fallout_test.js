// Radioactive fallout: warhead trigger, the intensity/proximity dose curves, and
// the damage-over-time integration through the tick. Deterministic, no RNG, no I/O.
import {describe, expect, it} from "vitest";
import {createWorld, falloutDoseAt, falloutIntensity, falloutProximity, step} from "../../../src/game/engine.js";
import {resolveHit, spawnFallout} from "../../../src/game/sim/combat.js";
import {FALLOUT} from "../../../src/game/data/constants.js";

// Minimal world with a couple of cities/units and the fields resolveHit touches.
function miniWorld(cities = [], units = []) {
    return {time: 0, _id: 0, cities, units, effects: [], events: []};
}

function proj(over = {}) {
    return {warhead: "standard", targetId: "c", damage: 50, slot: 0, toLng: 5, toLat: 6, ...over};
}

describe("falloutIntensity", () => {
    it("test_zero_at_and_before_birth", () => {
        expect(falloutIntensity(0)).toBe(0);
        expect(falloutIntensity(-1)).toBe(0);
    });
    it("test_ramps_linearly_to_peak_over_riseSec", () => {
        expect(falloutIntensity(FALLOUT.riseSec / 2)).toBeCloseTo(0.5, 6);
        expect(falloutIntensity(FALLOUT.riseSec)).toBe(1);
    });
    it("test_holds_at_peak_through_fade_start", () => {
        expect(falloutIntensity(FALLOUT.lifeSec * FALLOUT.fadeFrac)).toBe(1);
    });
    it("test_decays_to_zero_at_life_end", () => {
        const mid = FALLOUT.lifeSec * FALLOUT.fadeFrac + (FALLOUT.lifeSec * (1 - FALLOUT.fadeFrac)) / 2;
        expect(falloutIntensity(mid)).toBeCloseTo(0.5, 6);
        expect(falloutIntensity(FALLOUT.lifeSec)).toBe(0);
        expect(falloutIntensity(FALLOUT.lifeSec + 5)).toBe(0);
    });
});

describe("falloutProximity", () => {
    it("test_full_dose_at_center", () => {
        expect(falloutProximity(0, FALLOUT.radiusKm)).toBe(1);
    });
    it("test_edge_dose_is_edgeFalloff", () => {
        expect(falloutProximity(FALLOUT.radiusKm, FALLOUT.radiusKm)).toBe(0);
        expect(falloutProximity(FALLOUT.radiusKm - 1e-9, FALLOUT.radiusKm)).toBeCloseTo(FALLOUT.edgeFalloff, 6);
    });
    it("test_zero_beyond_radius", () => {
        expect(falloutProximity(FALLOUT.radiusKm * 2, FALLOUT.radiusKm)).toBe(0);
    });
    it("test_monotonic_decreasing_with_distance", () => {
        const a = falloutProximity(FALLOUT.radiusKm * 0.25, FALLOUT.radiusKm);
        const b = falloutProximity(FALLOUT.radiusKm * 0.75, FALLOUT.radiusKm);
        expect(a).toBeGreaterThan(b);
    });
});

describe("warhead trigger on impact", () => {
    it("test_thermo_spawns_one_cloud_at_target", () => {
        const w = miniWorld([{id: "c", slot: 1, hp: 100, maxHp: 100, alive: true, lng: 5, lat: 6}]);
        resolveHit(w, proj({warhead: "thermo"}));
        const clouds = w.effects.filter((fx) => fx.type === "fallout");
        expect(clouds.length).toBe(1);
        expect(clouds[0].lng).toBe(5);
        expect(clouds[0].lat).toBe(6);
        expect(clouds[0].radiusKm).toBe(FALLOUT.radiusKm);
    });
    it("test_standard_and_cluster_spawn_no_cloud", () => {
        const mk = () => miniWorld([{id: "c", slot: 1, hp: 100, maxHp: 100, alive: true, lng: 5, lat: 6}]);
        const a = mk();
        resolveHit(a, proj({warhead: "standard"}));
        const b = mk();
        resolveHit(b, proj({warhead: "cluster"}));
        expect(a.effects.length).toBe(0);
        expect(b.effects.length).toBe(0);
    });
    it("test_fizzle_on_vanished_target_contaminates_the_aim_point", () => {
        // Target no longer exists (e.g. a unit already destroyed) → fizzle, but the
        // warhead still detonates at its aim point and contaminates the ground.
        const w = miniWorld([]);
        resolveHit(w, proj({warhead: "thermo", targetId: "gone", toLng: 9, toLat: 3}));
        const clouds = w.effects.filter((fx) => fx.type === "fallout");
        expect(clouds.length).toBe(1);
        expect(clouds[0].lng).toBe(9);
        expect(clouds[0].lat).toBe(3);
        expect(w.events.some((e) => e.type === "fizzle")).toBe(true);
    });
});

describe("damage over time through the tick", () => {
    // Two nations, each with a ground-zero-region city and a safe far-away city so
    // neither is eliminated mid-run (which would end the match and stop the tick).
    // radius ≈ 480 km ≈ 4.32° at the equator.
    function falloutWorld() {
        const w = createWorld({
            mySlot: 0,
            seed: 1,
            nations: [{slot: 0, name: "A", iso: "AAA", gdp: 10}, {slot: 1, name: "B", iso: "BBB", gdp: 10}],
            cities: [
                {id: "core", slot: 0, name: "Core", cap: 0, pop: 1e6, econ: 0.5, lng: 0, lat: 0},
                {id: "home", slot: 0, name: "Home", cap: 0, pop: 1e6, econ: 0.5, lng: 40, lat: 0},
                {id: "edge", slot: 1, name: "Edge", cap: 0, pop: 1e6, econ: 0.5, lng: 4.2, lat: 0},
                {id: "far", slot: 1, name: "Far", cap: 0, pop: 1e6, econ: 0.5, lng: -40, lat: 0},
            ],
        });
        // An offensive unit of the attacker sitting on ground zero — fallout is
        // indiscriminate, so its own forces are irradiated too.
        w.units.push({id: "u", slot: 0, type: "silo", hp: 100, cooldown: 0, targetId: null, lng: 0, lat: 0});
        return w;
    }

    function run(w, seconds, dt = 1) {
        for (let t = 0; t < seconds; t++) step(w, dt);
    }

    it("test_core_city_takes_damage_early", () => {
        const w = falloutWorld();
        spawnFallout(w, 0, 0, 0);
        run(w, 20);
        const core = w.cities.find((c) => c.id === "core");
        expect(core.hp).toBeLessThan(100);
        expect(core.alive).toBe(true); // not dead this early
    });

    it("test_core_city_is_destroyed_over_full_life", () => {
        const w = falloutWorld();
        spawnFallout(w, 0, 0, 0);
        run(w, FALLOUT.lifeSec + 2);
        const core = w.cities.find((c) => c.id === "core");
        expect(core.alive).toBe(false);
        expect(core.hp).toBe(0);
        expect(w.events.some((e) => e.type === "destroy" && e.cityId === "core" && e.fallout)).toBe(true);
    });

    it("test_edge_city_is_damaged_but_survives", () => {
        const w = falloutWorld();
        spawnFallout(w, 0, 0, 0);
        run(w, FALLOUT.lifeSec + 2);
        const edge = w.cities.find((c) => c.id === "edge");
        expect(edge.hp).toBeLessThan(100);
        expect(edge.alive).toBe(true);
    });

    it("test_far_cities_are_untouched", () => {
        const w = falloutWorld();
        spawnFallout(w, 0, 0, 0);
        run(w, FALLOUT.lifeSec + 2);
        expect(w.cities.find((c) => c.id === "home").hp).toBe(100);
        expect(w.cities.find((c) => c.id === "far").hp).toBe(100);
    });

    it("test_own_unit_at_ground_zero_is_irradiated", () => {
        const w = falloutWorld();
        const u0 = w.units.find((u) => u.id === "u").hp;
        spawnFallout(w, 0, 0, 0);
        run(w, 20);
        const u = w.units.find((x) => x.id === "u");
        // Either damaged, or already attritted out of the unit list.
        expect(!u || u.hp < u0).toBe(true);
    });

    it("test_cloud_is_removed_after_its_life", () => {
        const w = falloutWorld();
        spawnFallout(w, 0, 0, 0);
        run(w, FALLOUT.lifeSec + 3);
        expect(w.effects.filter((fx) => fx.type === "fallout").length).toBe(0);
    });
});

describe("falloutDoseAt (UI readout query)", () => {
    // One peaked cloud (age past riseSec, before decay) centered at the origin.
    function withCloud(age = FALLOUT.riseSec + 1) {
        return {effects: [{type: "fallout", lng: 0, lat: 0, radiusKm: FALLOUT.radiusKm, age}]};
    }

    it("test_clean_ground_reads_zero", () => {
        expect(falloutDoseAt({effects: []}, 0, 0)).toEqual({dose: 0, remain: 0});
        expect(falloutDoseAt({}, 0, 0)).toEqual({dose: 0, remain: 0}); // no effects array at all
    });
    it("test_full_dose_and_remaining_life_at_core", () => {
        const age = FALLOUT.riseSec + 1;
        const fo = falloutDoseAt(withCloud(age), 0, 0);
        expect(fo.dose).toBeCloseTo(1, 6); // peak intensity × center proximity
        expect(fo.remain).toBeCloseTo(FALLOUT.lifeSec - age, 6);
    });
    it("test_zero_outside_the_radius", () => {
        // ~10° east ≈ 1100 km, well beyond the ~480 km radius.
        expect(falloutDoseAt(withCloud(), 10, 0)).toEqual({dose: 0, remain: 0});
    });
    it("test_takes_worst_dose_and_longest_life_across_clouds", () => {
        const w = {
            effects: [
                {type: "fallout", lng: 0, lat: 0, radiusKm: FALLOUT.radiusKm, age: FALLOUT.lifeSec - 5},   // near center, almost spent
                {type: "fallout", lng: 3, lat: 0, radiusKm: FALLOUT.radiusKm, age: FALLOUT.riseSec + 1},   // offset, peaked, fresh
            ],
        };
        const fo = falloutDoseAt(w, 0, 0);
        // Longest remaining life comes from the fresh second cloud.
        expect(fo.remain).toBeCloseTo(FALLOUT.lifeSec - (FALLOUT.riseSec + 1), 6);
        expect(fo.dose).toBeGreaterThan(0);
    });
});
