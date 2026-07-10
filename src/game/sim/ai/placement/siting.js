// Siting primitives: the sampling machinery placement is built on. Every
// candidate must sit inside the nation's own POLITICAL border (inOwnCountry) —
// the same rule the human player is bound to — pass the placement-separation
// gate, and spread from live same-role units. All sampling uses the seeded
// rand(w) so placement is reproducible.
import {COAST_KM, UNITS} from "../../../data/constants.js";
import {haversine} from "../../../geo/geo.js";
import {rand} from "../../worldState.js";
import {defenseRange, inOwnCountry, inTerritory, placementBlocked, radarRangeOf} from "../../queries.js";
import {isSea} from "../../../geo/seaRoute.js";
import {cosLatSafe, offsetKmPolar} from "../../../../lib/geo.js";
import {jitter, randRange} from "../../../../lib/random.js";
import {PLACE} from "../tuning.js";

export function aiRole(def) {
    if (def.kind === "defense") return "defense";
    if (def.kind === "industry") return "industry";
    if (def.kind === "offense") return "offense";
    if (def.detect) return "sensor";
    return "other";
}

// Would a spot crowd a live same-role unit inside spreadKm? Stops the AI
// stacking two radars / two factories / two domes on the same ground.
function crowdsSameRole(role, myUnits, lng, lat) {
    for (const u of myUnits) {
        if (aiRole(UNITS[u.type]) !== role) continue;
        if (haversine(u.lng, u.lat, lng, lat) < PLACE.spreadKm) return true;
    }
    return false;
}

// Is a point already inside a friendly defense's engagement envelope?
export function defenseCovers(w, myUnits, lng, lat) {
    for (const u of myUnits) {
        if (UNITS[u.type].kind !== "defense") continue;
        if (haversine(u.lng, u.lat, lng, lat) <= defenseRange(w, u)) return true;
    }
    return false;
}

// Is a point already inside a friendly radar's coverage?
export function radarCovered(myUnits, lng, lat) {
    for (const u of myUnits) {
        if (u.hp <= 0 || radarRangeOf(u.type) <= 0) continue;
        if (haversine(u.lng, u.lat, lng, lat) <= radarRangeOf(u.type)) return true;
    }
    return false;
}

// Sample a valid build spot around an anchor — biased toward `toward` (a
// {lng, lat}, e.g. the front for sensors/forward offense) or directly away from
// it (industry, command), and spread from same-role units. Falls back to any
// valid in-country spot; null when nothing fits (the caller skips the build).
export function spotAround(w, slot, anchor, toward, role, away, myUnits) {
    const cosLat = cosLatSafe(anchor.lat, 0.2);
    let brng = null;
    if (toward) brng = Math.atan2(toward.lng - anchor.lng, toward.lat - anchor.lat) + (away ? Math.PI : 0);
    for (let ring = 0; ring < 5; ring++) {
        const rDeg = 0.55 + ring * 0.5;
        for (let k = 0; k < 6; k++) {
            const ang = brng != null ? brng + jitter(rand(w), 1.6) : rand(w) * Math.PI * 2;
            const lat = anchor.lat + Math.cos(ang) * rDeg;
            const lng = anchor.lng + (Math.sin(ang) * rDeg) / cosLat;
            if (!inOwnCountry(w, slot, lng, lat)) continue;
            if (placementBlocked(w, lng, lat, null)) continue;
            if (crowdsSameRole(role, myUnits, lng, lat)) continue;
            return {lng, lat};
        }
    }
    // Spread constraint too tight for the room available — take any valid spot.
    for (let k = 0; k < 12; k++) {
        const lng = anchor.lng + jitter(rand(w), 2.2), lat = anchor.lat + jitter(rand(w), 2.2);
        if (inOwnCountry(w, slot, lng, lat) && !placementBlocked(w, lng, lat, null)) return {lng, lat};
    }
    return null;
}

// Coastal-water spot near a city for naval builds — probes outward until it
// finds sea inside the territory. Null when the anchor is landlocked in reach.
export function aiSeaSpot(w, slot, city) {
    for (let k = 0; k < 24; k++) {
        const r = randRange(rand(w), 1.5, 6);
        const a = rand(w) * Math.PI * 2;
        const lng = city.lng + Math.cos(a) * r, lat = city.lat + Math.sin(a) * r;
        if (isSea(lng, lat) && inTerritory(w, slot, lng, lat) && !placementBlocked(w, lng, lat, null)) return {lng, lat};
    }
    return null;
}

// A live land spot with open sea within COAST_KM — the AI's equivalent of the
// human's "click a coastline" gate for seaports.
function nearSea(lng, lat) {
    for (const r of [COAST_KM * 0.55, COAST_KM]) {
        for (let i = 0; i < 10; i++) {
            const p = offsetKmPolar({lng, lat}, r, (i / 10) * Math.PI * 2);
            if (isSea(p.lng, p.lat)) return true;
        }
    }
    return false;
}

export function coastalLandSpot(w, slot, cities, myUnits) {
    // Bounded anchor walk — every candidate pays a world-wide separation check.
    for (const anchor of cities.slice(0, 8)) {
        const cosLat = cosLatSafe(anchor.lat, 0.2);
        for (let ring = 0; ring < 4; ring++) {
            const rDeg = 0.35 + ring * 0.35;
            for (let k = 0; k < 8; k++) {
                const ang = rand(w) * Math.PI * 2;
                const lat = anchor.lat + Math.cos(ang) * rDeg;
                const lng = anchor.lng + (Math.sin(ang) * rDeg) / cosLat;
                if (isSea(lng, lat)) continue;
                if (!inOwnCountry(w, slot, lng, lat)) continue;
                if (placementBlocked(w, lng, lat, null)) continue;
                if (crowdsSameRole("industry", myUnits, lng, lat)) continue;
                if (!nearSea(lng, lat)) continue;
                return {lng, lat};
            }
        }
    }
    return null;
}

// City orderings shared by the role-siting strategies.
export function citiesByDistance(cities, ref, nearestFirst) {
    if (!ref) return cities.slice();
    return cities
        .map((c) => [c, haversine(c.lng, c.lat, ref.lng, ref.lat)])
        .sort((a, b) => nearestFirst ? a[1] - b[1] : b[1] - a[1])
        .map(([c]) => c);
}

export function nearestCity(cities, ref) {
    if (!ref || !cities.length) return cities[0] || null;
    let best = cities[0], bd = Infinity;
    for (const c of cities) {
        const d = haversine(c.lng, c.lat, ref.lng, ref.lat);
        if (d < bd) { bd = d; best = c; }
    }
    return best;
}
