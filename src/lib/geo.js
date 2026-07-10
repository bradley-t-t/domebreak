// Flat-earth kernel: antimeridian-safe longitude/angle unwrap, pole-safe
// cos(lat), local-tangent km offset, and screen-space heading. Shared by the
// sim's flight/combat kinematics and the map overlays that follow them.

import {KM_PER_DEG} from "../game/data/constants.js";

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

// Shift `lng` by multiples of 360 so it lands within +/-180 of `refLng`
// (default 0). Keeps trails and range rings from streaking across the seam.
export function unwrapLng(lng, refLng = 0) {
    let out = lng;
    while (out - refLng > 180) out -= 360;
    while (out - refLng < -180) out += 360;
    return out;
}

// Fold a radian angle (or angle-delta) into (-PI, PI] so shortest-way-around
// steering never spins the long way.
export function wrapAnglePi(rad) {
    let d = rad;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
}

// cos(lat) with a small floor so equirectangular km/deg scaling stays finite
// near the poles. `latDeg` is expected in degrees.
export function cosLatSafe(latDeg, floor = 0.05) {
    return Math.max(floor, Math.cos(latDeg * RAD));
}

// Offset `origin` by `(km, angRad)` in the local flight frame: math angle
// (east = 0, counterclockwise), equirectangular scaling with a pole-clamped
// cos(lat). This is the polarFrom() primitive used by flight, AI placement,
// combat MIRVs, and placement previews.
export function offsetKmPolar(origin, km, angRad) {
    const cosLat = cosLatSafe(origin.lat);
    return {
        lng: origin.lng + (km / (KM_PER_DEG * cosLat)) * Math.cos(angRad),
        lat: origin.lat + (km / KM_PER_DEG) * Math.sin(angRad),
    };
}

// Compass-style rotation (0 = up, clockwise, degrees) for a screen-space delta.
// Screen Y grows downward, so we negate dy to keep 0 pointing north on screen.
export function screenHeadingDeg(dx, dy) {
    if (!dx && !dy) return 0;
    return Math.atan2(dx, -dy) * DEG;
}
