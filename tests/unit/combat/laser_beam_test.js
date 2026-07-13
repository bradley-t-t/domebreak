// The Laser Defense Grid fires a directed-energy beam, not a flying round: the
// interceptor it spawns is flagged `beam`, holds on the target without travelling,
// and rolls its kill only after LASER_DWELL_SEC of dwell. Deterministic — fixed
// geometry, forced hit probabilities, no RNG dependence for the dwell mechanics.
import {describe, expect, it} from "vitest";
import {haversine} from "../../../src/game/engine.js";
import {stepCombat, stepInterceptors} from "../../../src/game/sim/tickPhases.js";
import {LASER_DWELL_SEC} from "../../../src/game/data/constants.js";

function engage(defenderType) {
    const dist = haversine(30, 0, 0, 0);
    const p = {
        id: "p1", slot: 2, type: "silo", warhead: "standard", evasion: 0, tried: [], targetId: "c1",
        fromLng: 30, fromLat: 0, toLng: 0, toLat: 0, dist,
        speed: 140, progress: 0.5, travelled: 0.5 * dist, lng: 15, lat: 0, altNorm: 0.5,
    };
    const w = {
        time: 0, _r: 12345, _id: 0, events: [],
        cities: [{id: "c1", slot: 1, alive: true, lng: 0, lat: 0}],
        units: [{id: "d1", slot: 1, type: defenderType, hp: 100, cooldown: 0, lng: 15, lat: 0}],
        projectiles: [p], interceptors: [],
    };
    stepCombat(w, 0.03);
    return w.interceptors[0];
}

// A live beam interceptor already in flight, plus its target, in a minimal world.
function beamWorld(hitProb) {
    const tgt = {id: "p1", slot: 2, lng: 15, lat: 0, altNorm: 0.5, _dead: false};
    const it = {
        id: "i1", slot: 1, srcType: "laser", beam: true, targetId: "p1", hitProb,
        fromLng: 20, fromLat: 0, lng: 20, lat: 0, toLng: 15, toLat: 0, altNorm: 0,
    };
    return {time: 0, _r: 1, _id: 0, events: [], projectiles: [tgt], interceptors: [it], _tgt: tgt, _it: it};
}

describe("laser beam spawn", () => {
    it("test_laser_spawns_a_beam_interceptor", () => {
        const shot = engage("laser");
        expect(shot.srcType).toBe("laser");
        expect(shot.beam).toBe(true);
    });
    it("test_kinetic_defense_is_not_a_beam", () => {
        expect(engage("battery").beam).toBeUndefined();
    });
});

describe("laser beam dwell and resolution", () => {
    it("test_beam_holds_without_travelling_then_kills", () => {
        const w = beamWorld(1);
        const dt = 0.05;
        let ticks = 0;
        while (!w._it._dead && ticks < 20) {
            stepInterceptors(w, dt);
            ticks++;
            // The emitter never moves — the beam burns in place, it does not fly.
            expect(w._it.lng).toBe(20);
        }
        // Resolved right after the dwell elapses, not instantly and not never.
        expect(ticks).toBe(Math.ceil(LASER_DWELL_SEC / dt));
        expect(w._tgt._dead).toBe(true);
        expect(w.events.some((e) => e.type === "intercept")).toBe(true);
    });

    it("test_beam_tracks_the_moving_target", () => {
        const w = beamWorld(1);
        w._tgt.lng = 12;
        w._tgt.lat = 3;
        stepInterceptors(w, 0.05);
        expect(w._it.toLng).toBe(12);
        expect(w._it.toLat).toBe(3);
        expect(w._it.tgtAlt).toBe(0.5);
    });

    it("test_beam_miss_spares_the_target", () => {
        const w = beamWorld(0);
        for (let i = 0; i < 10 && !w._it._dead; i++) stepInterceptors(w, 0.05);
        expect(w._it._dead).toBe(true);
        expect(w._tgt._dead).toBe(false);
        expect(w.events.some((e) => e.type === "miss")).toBe(true);
    });
});
