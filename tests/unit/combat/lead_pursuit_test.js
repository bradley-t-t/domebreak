// Lead pursuit: interceptors steer to where the target will be, not where it is.
// Deterministic — fixed geometry on the equator, no RNG, no I/O.
import {describe, expect, it} from "vitest";
import {haversine, leadInterceptPoint, trackPoint} from "../../../src/game/engine.js";

// Target flying west→east along the equator (lat stays 0), currently at its
// midpoint (lng 10). trackPoint(p, f) => [20f, 0]; lng/lat mirror the live
// projectile's current position as the sim keeps them.
function eastboundTarget(over = {}) {
    return {
        fromLng: 0, fromLat: 0, toLng: 20, toLat: 0, dist: haversine(0, 0, 20, 0),
        progress: 0.5, lng: 10, lat: 0, speed: 60, ...over,
    };
}

describe("leadInterceptPoint", () => {
    it("test_leads_ahead_of_current_position", () => {
        const p = eastboundTarget();
        const it = {lng: 10, lat: -3, speed: 200};   // faster pursuer, south of target
        const aim = leadInterceptPoint(it, p);
        // Pure pursuit would aim at the current spot (lng 10); leading aims east of it.
        expect(aim[0]).toBeGreaterThan(10);
        // Target never leaves the equator, so the aim point shouldn't either.
        expect(Math.abs(aim[1])).toBeLessThan(1e-6);
    });

    it("test_solution_is_self_consistent", () => {
        const p = eastboundTarget();
        const it = {lng: 10, lat: -3, speed: 200};
        const aim = leadInterceptPoint(it, p);
        // The aim point must be exactly where the target is after the time it takes
        // the pursuer to fly there: trackPoint(p, progress + speed*tau/dist) == aim.
        const tau = haversine(it.lng, it.lat, aim[0], aim[1]) / it.speed;
        const back = trackPoint(p, Math.min(1, p.progress + (p.speed * tau) / p.dist));
        expect(Math.hypot(back[0] - aim[0], back[1] - aim[1])).toBeLessThan(1e-4);
    });

    it("test_stationary_target_is_pure_pursuit", () => {
        const p = eastboundTarget({speed: 0});
        const it = {lng: 10, lat: -3, speed: 200};
        const aim = leadInterceptPoint(it, p);
        const now = trackPoint(p, p.progress);
        expect(Math.hypot(aim[0] - now[0], aim[1] - now[1])).toBeLessThan(1e-9);
    });

    it("test_uncatchable_target_falls_back_to_impact_point", () => {
        const p = eastboundTarget();
        const it = {lng: 10, lat: -3, speed: 0.5};   // far too slow to catch up
        const aim = leadInterceptPoint(it, p);
        // Aim settles on the target's endpoint (lng 20), not an impossible lead.
        expect(aim[0]).toBeGreaterThan(19.5);
        expect(aim[0]).toBeLessThanOrEqual(20 + 1e-6);
    });
});
