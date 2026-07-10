// Regression: a fast interceptor must resolve at closest approach, not overshoot
// the slower target and whip back around before detonating. Deterministic — fixed
// equatorial geometry, seeded PRNG, no I/O.
import {describe, expect, it} from "vitest";
import {haversine, trackPoint} from "../../../src/game/engine.js";
import {stepInterceptors} from "../../../src/game/sim/tickPhases.js";

// Advance an eastbound equatorial target the way stepCombat would, then hand the
// world to the interceptor guidance phase. Returns the per-tick range readings.
function fly(dt = 0.03, ticks = 400) {
    const dist = haversine(0, 0, 40, 0);
    const p = {
        id: "p1", fromLng: 0, fromLat: 0, toLng: 40, toLat: 0, dist,
        speed: 140, progress: 0.4, altNorm: 0.3, lng: 16, lat: 0, travelled: 0.4 * dist,
    };
    const it = {
        id: "i1", targetId: "p1", hitProb: 1, speed: 520, altNorm: 0,
        launchDist: haversine(12, -5, 16, 0), fromLng: 12, fromLat: -5,
        lng: 12, lat: -5, toLng: 16, toLat: 0,
    };
    const w = {time: 0, _r: 987654321, _id: 1, events: [], projectiles: [p], interceptors: [it]};
    const ranges = [];
    for (let k = 0; k < ticks && !it._dead; k++) {
        // Move the target forward along its own track first (stepCombat's job).
        p.travelled += p.speed * dt;
        p.progress = Math.min(1, p.travelled / p.dist);
        const pos = trackPoint(p, p.progress);
        p.lng = pos[0];
        p.lat = pos[1];
        ranges.push({range: haversine(it.lng, it.lat, p.lng, p.lat), moved: false});
        stepInterceptors(w, dt);
        ranges[ranges.length - 1].moved = !it._dead; // survived => it stepped this tick
    }
    return {it, ranges};
}

describe("interceptor closest-approach resolution", () => {
    it("test_engagement_resolves", () => {
        const {it} = fly();
        expect(it._dead).toBe(true);
    });

    it("test_range_never_reopens_while_pursuing", () => {
        const {ranges} = fly();
        // On every tick the interceptor actually moves, the gap to the target must
        // shrink. A turnaround shows up as a tick that survives yet reads a wider
        // range than the tick before it — exactly what the fix forbids.
        let prev = Infinity;
        for (const {range, moved} of ranges) {
            if (!moved) break; // the resolving tick may read the first reopening; stop there
            expect(range).toBeLessThanOrEqual(prev + 1e-9);
            prev = range;
        }
    });
});
