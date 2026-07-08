// Geodesic helpers shared by the sim engine and the map overlays.

const R_EARTH_KM = 6371;
const TWO_PI = 2 * Math.PI;

// GeoJSON Polygon Feature for a unit's range ring of radius `km`. Drawn in
// Web-Mercator space (X and Y scale identically there) so the ring is round on
// screen and centred on the unit at every latitude — sized to `km` on the
// ground at the unit's latitude.
//
// Why not a true geodesic cap: a geodesic circle is distance-accurate but
// Mercator stretches a large one so badly the unit no longer sits at the visual
// centre — a multi-thousand-km OTH ring pushes it well off centre, and with
// radar research the cap can wrap the pole and leave the unit on the edge.
// This is overlay-only; actual detection stays geodesic (sensorsCover uses
// haversine), so accuracy where it matters is untouched. For small rings the
// two are visually identical.
// Pass innerKm > 0 to punch a concentric keep-out hole (an annulus) — e.g. a
// THAAD battery whose interceptors can't engage inside a minimum range. The hole
// is a second polygon ring, so fill layers leave it empty and line layers outline
// it as an inner boundary.
export function circle(lng, lat, km, steps = 56, innerKm = 0) {
    const rad = Math.PI / 180, deg = 180 / Math.PI;
    const cosLat = Math.max(0.05, Math.cos(lat * rad));   // clamp near the poles
    const x0 = lng / 360 + 0.5;
    const y0 = 0.5 - Math.asinh(Math.tan(lat * rad)) / TWO_PI;
    const ring = (radiusKm) => {
        const rho = (radiusKm / R_EARTH_KM) / (TWO_PI * cosLat);   // normalized Mercator radius
        // Vertex count scales with on-screen size so big rings stay smooth; small
        // rings keep the caller's count.
        const n = Math.min(360, Math.max(steps, Math.ceil(rho * 800)));
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

// Web-Mercator projection shared by the sweep helpers below — the same unit-square
// mapping circle() uses, so a sweep drawn over a coverage ring lines up exactly.
// Screen Y grows downward here, so an angle sweeping 0→360 reads as clockwise.
const RAD = Math.PI / 180, DEG = 180 / Math.PI;
const mercXY = (lng, lat) => [lng / 360 + 0.5, 0.5 - Math.asinh(Math.tan(lat * RAD)) / TWO_PI];
const mercLngLat = (x, y) => [(x - 0.5) * 360, Math.atan(Math.sinh((0.5 - y) * TWO_PI)) * DEG];
const mercRho = (km, lat) => (km / R_EARTH_KM) / (TWO_PI * Math.max(0.05, Math.cos(lat * RAD)));

// Rotating radar-sweep wedge: a filled sector from the emitter out to `km`,
// spanning `arcDeg` of trailing arc behind the leading edge at `headDeg`. Drawn
// in the same Mercator space as circle() so it tracks the coverage ring. This is
// the fading "afterglow" behind the sweep line; pair with sweepLine() for the
// bright leading edge. Overlay-only, like circle().
export function sweepSector(lng, lat, km, headDeg, arcDeg = 42, steps = 16) {
    const [x0, y0] = mercXY(lng, lat);
    const rho = mercRho(km, lat);
    const head = headDeg * RAD, span = arcDeg * RAD;
    const coords = [mercLngLat(x0, y0)];
    for (let i = 0; i <= steps; i++) {
        const a = head - span * (i / steps);
        coords.push(mercLngLat(x0 + rho * Math.cos(a), y0 + rho * Math.sin(a)));
    }
    coords.push(mercLngLat(x0, y0));   // close the wedge back at the emitter
    return {type: "Feature", properties: {}, geometry: {type: "Polygon", coordinates: [coords]}};
}

// The bright leading edge of the radar sweep: a line from the emitter to the ring
// edge at `headDeg`, in the same Mercator space as circle()/sweepSector().
export function sweepLine(lng, lat, km, headDeg) {
    const [x0, y0] = mercXY(lng, lat);
    const rho = mercRho(km, lat);
    const a = headDeg * RAD;
    return {
        type: "Feature", properties: {},
        geometry: {type: "LineString", coordinates: [mercLngLat(x0, y0), mercLngLat(x0 + rho * Math.cos(a), y0 + rho * Math.sin(a))]}
    };
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
        if (prev) {
            while (p[0] - prev[0] > 180) p[0] -= 360;
            while (p[0] - prev[0] < -180) p[0] += 360;
        }
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
