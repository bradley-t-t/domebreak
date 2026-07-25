// Geodesic helpers shared by the sim engine and the map overlays.

import {unwrapLng} from "../../lib/geo.js";
import {clamp, clampSym} from "../../lib/math.js";

const R_EARTH_KM = 6371;
const TWO_PI = 2 * Math.PI;

// GeoJSON Polygon Feature for a unit's range ring of radius `km`, drawn in
// Web-Mercator space (X and Y scale identically there) so the ring is round on
// screen and centred on the unit at every latitude — sized to `km` on the
// ground at the unit's latitude.
//
// THIS IS THE FLAT-VIEW ring. On the globe use geoCircle() instead: the Mercator
// disc, when the globe projection wraps its lng/lat onto the sphere, stretches
// into an off-centre egg (worse the bigger the ring and the higher the latitude),
// so globe coverage overlays would read wrong. A true geodesic cap renders
// round on the globe but stretches on the flat map — so each projection uses the
// ring that is round in it. This is overlay-only; detection stays geodesic
// (sensorsCover uses haversine), so accuracy where it matters is untouched.
// Pass innerKm > 0 to punch a concentric keep-out hole (an annulus) — e.g. a
// THAAD battery whose interceptors can't engage inside a minimum range. The hole
// is a second polygon ring, so fill layers leave it empty and line layers outline
// it as an inner boundary.
export function circle(lng, lat, km, steps = 56, innerKm = 0, maxSteps = 360) {
    const rad = Math.PI / 180, deg = 180 / Math.PI;
    const cosLat = Math.max(0.05, Math.cos(lat * rad));   // clamp near the poles
    const x0 = lng / 360 + 0.5;
    const y0 = 0.5 - Math.asinh(Math.tan(lat * rad)) / TWO_PI;
    const ring = (radiusKm) => {
        const rho = (radiusKm / R_EARTH_KM) / (TWO_PI * cosLat);   // normalized Mercator radius
        // Vertex count scales with on-screen size so big rings stay smooth; small
        // rings keep the caller's count. Callers that regenerate rings every
        // frame (the radar ping, the placement ghost) pass a lower maxSteps —
        // per-frame tessellation cost scales with vertex count and a decorative
        // ring doesn't need 360 of them.
        const n = clamp(Math.ceil(rho * 800), steps, maxSteps);
        const coords = [];
        for (let i = 0; i <= n; i++) {
            const a = (TWO_PI * i) / n;
            const x = x0 + rho * Math.cos(a);
            const y = y0 + rho * Math.sin(a);
            const clng = (x - 0.5) * 360;                     // continuous across ±180°
            const clat = Math.atan(Math.sinh((0.5 - y) * TWO_PI)) * deg;  // clamps to ±90°
            coords.push([clng, clat]);
        }
        return coords;
    };
    const rings = [ring(km)];
    if (innerKm > 0 && innerKm < km) rings.push(ring(innerKm));
    return {type: "Feature", properties: {}, geometry: {type: "Polygon", coordinates: rings}};
}

const RAD = Math.PI / 180, DEG = 180 / Math.PI;

// Globe-view coverage geometry (true geodesic)
// On the globe the Mercator disc above stretches into an off-centre egg, so this
// draws the ring as a great-circle cap: vertices at a constant SURFACE
// distance `km` from the centre, which the globe projection renders as a proper
// round cap centred on the unit. The catch is a cap wider than a hemisphere folds
// back toward the antipode and stops reading as a ring — so callers keep the
// Mercator disc above GEODESIC_MAX_KM (satellites), and use geoCircle below it.
export const GEODESIC_MAX_KM = 6000;

// Destination [lng,lat] (deg) a great-circle distance `km` from (lng,lat) on
// compass bearing `brngDeg` (0 = due north, increasing clockwise). Pole-safe:
// the spherical formulas never yield |lat| > 90 or a discontinuous jump, which
// is why trackPoint's MIRV lane offset routes through here.
export function geoDest(lng, lat, km, brngDeg) {
    const la1 = lat * RAD, dr = km / R_EARTH_KM, brng = brngDeg * RAD;
    const sinLa1 = Math.sin(la1), cosLa1 = Math.cos(la1), sinDr = Math.sin(dr), cosDr = Math.cos(dr);
    const sinLa2 = sinLa1 * cosDr + cosLa1 * sinDr * Math.cos(brng);
    const la2 = Math.asin(clampSym(sinLa2, 1));
    const lo2 = lng * RAD + Math.atan2(Math.sin(brng) * sinDr * cosLa1, cosDr - sinLa1 * sinLa2);
    return [lo2 * DEG, la2 * DEG];
}

// True geodesic range ring — the globe-view counterpart of circle(); same Feature
// shape and innerKm annulus. maxSteps as in circle().
//
// A cap that reaches over a pole is the tricky case: its boundary sweeps through
// every longitude and never closes on itself, so a naive boundary loop spirals
// (which is why a high-latitude airstrip's reach ring drew wrong on the globe).
// When the cap swallows a pole, trace the boundary ordered by longitude and close
// the polygon across the top of the world at that pole — the fill then covers the
// whole polar cap correctly in every projection.
export function geoCircle(lng, lat, km, steps = 56, innerKm = 0, maxSteps = 480) {
    const latRad = lat * RAD;
    // Meridian distance from the centre to each pole; the cap reaches that pole
    // once its radius exceeds it.
    const northKm = R_EARTH_KM * (Math.PI / 2 - latRad);
    const southKm = R_EARTH_KM * (Math.PI / 2 + latRad);
    const stepCount = (radiusKm) => clamp(Math.ceil(radiusKm / 40), steps, maxSteps);

    // Cap clear of both poles: a simple closed boundary loop, longitudes unwrapped
    // so an antimeridian crossing doesn't jump ±360.
    const loopRing = (radiusKm) => {
        const n = stepCount(radiusKm);
        const coords = [];
        let prev = lng;
        for (let i = 0; i <= n; i++) {
            const [clng, clat] = geoDest(lng, lat, radiusKm, (360 * i) / n);
            const x = unwrapLng(clng, prev);
            prev = x;
            coords.push([x, clat]);
        }
        return coords;
    };

    // Cap reaching over `poleLat` (±90): every meridian crosses the boundary once,
    // so sort the boundary vertices west→east and cap the polygon off across the
    // pole so the fill covers the full polar cap.
    const capRing = (radiusKm, poleLat) => {
        const n = stepCount(radiusKm);
        const pts = [];
        for (let i = 0; i < n; i++) {
            const [clng, clat] = geoDest(lng, lat, radiusKm, (360 * i) / n);
            pts.push([((clng + 540) % 360) - 180, clat]);
        }
        pts.sort((a, b) => a[0] - b[0]);
        return [[-180, poleLat], ...pts, [180, poleLat], [-180, poleLat]];
    };

    const ringFor = (radiusKm) =>
        radiusKm >= northKm ? capRing(radiusKm, 90)
            : radiusKm >= southKm ? capRing(radiusKm, -90)
                : loopRing(radiusKm);

    const rings = [ringFor(km)];
    if (innerKm > 0 && innerKm < km) rings.push(ringFor(innerKm));
    return {type: "Feature", properties: {}, geometry: {type: "Polygon", coordinates: rings}};
}

// Initial great-circle bearing from point 1 to point 2, compass degrees
// (0 = north, clockwise 0–360).
export function bearing(lng1, lat1, lng2, lat2) {
    const toRad = (d) => (d * Math.PI) / 180, toDeg = (r) => (r * 180) / Math.PI;
    const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
        Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Great-circle intermediate point at fraction f (0..1). Correct geodesic path on
// both the globe and mercator, unlike naive lng/lat interpolation.
export function interpGC(lng1, lat1, lng2, lat2, f) {
    const toRad = (d) => (d * Math.PI) / 180, toDeg = (r) => (r * 180) / Math.PI;
    const la1 = toRad(lat1), lo1 = toRad(lng1), la2 = toRad(lat2), lo2 = toRad(lng2);
    const d = 2 * Math.asin(Math.min(1, Math.sqrt(
        Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2)));
    if (d < 1e-9) return [lng1, lat1];
    const a = Math.sin((1 - f) * d) / Math.sin(d);
    const b = Math.sin(f * d) / Math.sin(d);
    const x = a * Math.cos(la1) * Math.cos(lo1) + b * Math.cos(la2) * Math.cos(lo2);
    const y = a * Math.cos(la1) * Math.sin(lo1) + b * Math.cos(la2) * Math.sin(lo2);
    const z = a * Math.sin(la1) + b * Math.sin(la2);
    return [toDeg(Math.atan2(y, x)), toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)))];
}

// Polyline of great-circle points from 0..progress, so trails curve correctly.
export function gcTrail(lng1, lat1, lng2, lat2, progress, steps = 24) {
    const pts = [];
    let prev = null;
    for (let i = 0; i <= steps; i++) {
        const p = interpGC(lng1, lat1, lng2, lat2, (progress * i) / steps);
        // Unwrap longitude so a pole-crossing path never jumps +/-360 (which would
        // otherwise draw a stray loop/line across the map near the poles).
        if (prev) p[0] = unwrapLng(p[0], prev[0]);
        pts.push(p);
        prev = p;
    }
    return pts;
}

// True when a surface point sits on the far side of the globe from the camera.
// Flat (mercator) projection never occludes, so overlays can call this blindly.
export function occludedByGlobe(map, lng, lat) {
    const t = map?.transform;
    if (!t || typeof t.isLocationOccluded !== "function") return false;
    try {
        return t.isLocationOccluded({lng, lat});
    } catch {
        return false;
    }
}

// Great-circle surface distance in km between two lng/lat points.
export function haversine(aLng, aLat, bLng, bLat) {
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
}

// One degree of latitude along a meridian, in km (2*pi*R/360).
const KM_PER_LAT_DEG = 111.19;

// Radius test with a cheap latitude reject before the trig. The meridian arc
// |dLat| is a strict lower bound on great-circle distance everywhere on the
// sphere (no pole or antimeridian caveats), so the reject can never discard a
// true hit — it just spares the sin/cos/asin for the vast majority of pairs in
// the tick's proximity scans, which compare against radii far smaller than the
// map. Exact same verdict as haversine(...) <= km.
export function withinKm(aLng, aLat, bLng, bLat, km) {
    if (Math.abs(bLat - aLat) * KM_PER_LAT_DEG > km) return false;
    return haversine(aLng, aLat, bLng, bLat) <= km;
}
