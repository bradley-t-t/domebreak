// geoCircle: the globe-view geodesic range ring. The tricky case is a cap that
// reaches over a pole (a high-latitude airstrip's wide sortie ring) — its boundary
// sweeps every longitude and can't close as a simple loop, so it's capped across
// the pole instead. Deterministic, no RNG, no I/O.
import {describe, expect, it} from "vitest";
import {geoCircle} from "../../../src/game/geo/geo.js";
import {haversine} from "../../../src/game/geo/geo.js";

// Even-odd ray cast in planar lng/lat space — the same space the polygon lives in.
function pointInRing(ring, [x, y]) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

describe("geoCircle", () => {
    it("test_ordinary_cap_is_a_closed_loop_clear_of_the_poles", () => {
        // A mid-latitude ring well short of the pole stays a simple boundary loop:
        // it closes on itself and never plants a vertex at ±90.
        const ring = geoCircle(0, 20, 2000).geometry.coordinates[0];
        const [first, last] = [ring[0], ring[ring.length - 1]];
        expect(last[0]).toBeCloseTo(first[0], 9);                    // closed (to fp precision)
        expect(last[1]).toBeCloseTo(first[1], 9);
        expect(ring.every(([, lat]) => Math.abs(lat) < 90)).toBe(true);
    });

    it("test_polar_cap_is_bounded_and_reaches_the_pole", () => {
        // Centre at 70N with a 4200 km reach swallows the North Pole, where naive
        // bearing-walk vertices run past ±180. The capped polygon must stay in
        // range and plant vertices at the pole so the fill covers the cap.
        const ring = geoCircle(0, 70, 4200).geometry.coordinates[0];
        expect(ring.every(([lng]) => lng >= -180 && lng <= 180)).toBe(true);
        expect(ring.some(([, lat]) => lat === 90)).toBe(true);
    });

    it("test_polar_cap_fills_the_region_it_should", () => {
        // Truth is haversine reach from the centre. Points well inside the cap fall
        // inside the polygon; points well outside fall outside — including a point on
        // the far side of the pole that a naive Mercator disc would wrongly enclose.
        const c = [0, 70], km = 4200;
        const ring = geoCircle(c[0], c[1], km).geometry.coordinates[0];
        const near = (pt) => haversine(c[0], c[1], pt[0], pt[1]);
        for (const p of [[0, 85], [0, 55], [90, 78]]) {             // inside the reach
            expect(near(p)).toBeLessThan(km);
            expect(pointInRing(ring, p)).toBe(true);
        }
        for (const p of [[0, 20], [180, 68]]) {                     // outside the reach
            expect(near(p)).toBeGreaterThan(km);
            expect(pointInRing(ring, p)).toBe(false);
        }
    });

    it("test_south_polar_cap_reaches_the_south_pole", () => {
        const ring = geoCircle(0, -70, 4200).geometry.coordinates[0];
        expect(ring.some(([, lat]) => lat === -90)).toBe(true);
        expect(pointInRing(ring, [0, -85])).toBe(true);
    });
});
