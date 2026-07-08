// Online prediction tick: step(w, dt, predict=true) smooths motion between server
// snapshots but must NOT advance the discrete, server-authoritative economy —
// otherwise the client keeps completing then reverting production against the next
// snapshot (the online production-queue stutter/stall bug). The full tick
// (predict=false, used solo and by the server) advances everything. Deterministic.
import {describe, expect, it} from "vitest";
import {createWorld} from "../../../src/game/engine.js";
import {step} from "../../../src/game/sim/tick.js";
import {WARHEADS} from "../../../src/game/data/constants.js";

const ammoType = Object.keys(WARHEADS).find((t) => WARHEADS[t].prodTime > 0);
const prodTime = WARHEADS[ammoType].prodTime;

function worldWithBuild() {
    const w = createWorld({
        mySlot: 0, seed: 3,
        nations: [{slot: 0, name: "A", iso: "USA", isAi: false, gdp: 5}],
        cities: [{id: "c", slot: 0, name: "Cap", cap: 1, pop: 100, econ: 1, lng: 0, lat: 0}],
    });
    w.paused = false;
    const n = w.nations[0];
    n.points = 1000;
    n.ammo = {[ammoType]: 0};
    // A build already half-done on the shared production line.
    n.prod = {queue: [], current: {item: {kind: "ammo", type: ammoType}, progress: 0.5}};
    return w;
}

describe("step predict mode — economy is server-authoritative", () => {
    it("test_predict_tick_does_not_advance_production", () => {
        const w = worldWithBuild();
        const before = w.nations[0].prod.current.progress;
        step(w, prodTime, true); // a full prodTime of prediction
        expect(w.nations[0].prod.current.progress).toBe(before); // frozen
        expect(w.nations[0].ammo[ammoType]).toBe(0);             // nothing produced
    });

    it("test_predict_tick_does_not_complete_or_revert_a_build", () => {
        const w = worldWithBuild();
        step(w, prodTime * 2, true); // long enough to finish twice over — but predicted
        expect(w.nations[0].prod.current).not.toBeNull();        // still building, no phantom completion
        expect(w.nations[0].ammo[ammoType]).toBe(0);
    });

    it("test_predict_tick_leaves_points_untouched", () => {
        const w = worldWithBuild();
        const pts = w.nations[0].points;
        step(w, 5, true);
        expect(w.nations[0].points).toBe(pts); // no local income prediction
    });

    it("test_predict_tick_still_advances_the_clock_for_motion", () => {
        const w = worldWithBuild();
        const t0 = w.time;
        step(w, 0.1, true);
        expect(w.time).toBeCloseTo(t0 + 0.1, 6); // motion phases still run
    });

    it("test_full_tick_advances_and_completes_production", () => {
        const w = worldWithBuild();
        step(w, prodTime, false); // authoritative / solo path
        expect(w.nations[0].prod.current).toBeNull();       // completed
        expect(w.nations[0].ammo[ammoType]).toBe(1);         // one round produced
    });
});
