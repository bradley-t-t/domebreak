// AI strategic placement (design/quick-specs/ai-strategic-placement-2026-07-06.md)
// The AI sites each unit by role and spreads its forces across its cities rather
// than piling everything onto the capital. All sampling uses the seeded rand(w).
// Split out of aiTick.js — see that file for the build-decision loop that calls
// into this placer.
import {AI_TUNING, UNITS} from "../data/constants.js";
import {haversine} from "../geo/geo.js";
import {rand} from "./worldState.js";
import {defenseRange, inOwnCountry, inTerritory, placementBlocked} from "./queries.js";
import {isSea} from "../geo/seaRoute.js";

// Coastal-water spot near the capital for naval builds — probes outward until it
// finds sea that isn't blocked. Falls back to null (skip the build) if the
// capital is landlocked within reach.
function aiSeaSpot(w, slot, city) {
    for (let k = 0; k < 24; k++) {
        const r = 1.5 + rand(w) * 6;
        const a = rand(w) * Math.PI * 2;
        const lng = city.lng + Math.cos(a) * r, lat = city.lat + Math.sin(a) * r;
        if (isSea(lng, lat) && inTerritory(w, slot, lng, lat) && !placementBlocked(w, lng, lat, null)) return {lng, lat};
    }
    return null;
}

// Capital + population weighting used to rank anchor / protect targets.
function cityValue(c) {
    return (c.pop || 0) * (c.cap ? 1.5 : 1) + (c.cap ? 5e6 : 0);
}

// A nation's alive cities, most valuable first.
export function aiCities(w, slot) {
    const out = [];
    for (const c of w.cities) if (c.slot === slot && c.alive) out.push(c);
    out.sort((a, b) => cityValue(b) - cityValue(a));
    return out;
}

// High-value points a nation wants shielded: its cities plus its command assets
// (leadership bunker, space HQ), which sit away from cities but must not be left
// exposed. Value-sorted so callers take the most valuable uncovered one first.
export function protectPoints(w, slot, myUnits) {
    const pts = [];
    for (const c of w.cities) if (c.slot === slot && c.alive) pts.push({lng: c.lng, lat: c.lat, val: cityValue(c)});
    for (const u of myUnits) if (u.type === "bunker" || u.type === "spacehq") pts.push({lng: u.lng, lat: u.lat, val: 8e6});
    pts.sort((a, b) => b.val - a.val);
    return pts;
}

// Is a point already inside a friendly defense's engagement envelope?
function defenseCovers(w, myUnits, lng, lat) {
    for (const u of myUnits) {
        if (UNITS[u.type].kind !== "defense") continue;
        if (haversine(u.lng, u.lat, lng, lat) <= defenseRange(w, u)) return true;
    }
    return false;
}

// The "front" a nation orients to: the nearest at-war enemy capital, or (in peace)
// the nearest neighbour's capital so outward-facing builds still make sense. Enemy
// capitals weigh closer so an active war wins the tie. null only if truly alone.
export function frontPos(w, n, caps) {
    const a = caps[n.slot];
    if (!a) return null;
    let best = null, bd = Infinity;
    for (const m of w.nations) {
        if (m.slot === n.slot || !m.alive) continue;
        const b = caps[m.slot];
        if (!b) continue;
        const d = haversine(a.lng, a.lat, b.lng, b.lat) * (n.relations[m.slot] === "war" ? 0.5 : 1);
        if (d < bd) { bd = d; best = b; }
    }
    return best;
}

function farthestCity(cities, ref) {
    if (!ref) return cities[0];
    let best = cities[0], bd = -Infinity;
    for (const c of cities) { const d = haversine(c.lng, c.lat, ref.lng, ref.lat); if (d > bd) { bd = d; best = c; } }
    return best;
}

function nearestCity(cities, ref) {
    if (!ref) return cities[0];
    let best = cities[0], bd = Infinity;
    for (const c of cities) { const d = haversine(c.lng, c.lat, ref.lng, ref.lat); if (d < bd) { bd = d; best = c; } }
    return best;
}

function aiRole(def) {
    if (def.kind === "defense") return "defense";
    if (def.kind === "industry") return "industry";
    if (def.kind === "offense") return "offense";
    if (def.detect) return "sensor";
    return "other";
}

// Would a spot crowd a live same-role unit inside spreadKm? Stops the AI stacking
// two radars / two factories / two domes on the same ground.
function crowdsSameRole(role, myUnits, lng, lat) {
    for (const u of myUnits) {
        if (aiRole(UNITS[u.type]) !== role) continue;
        if (haversine(u.lng, u.lat, lng, lat) < AI_TUNING.spreadKm) return true;
    }
    return false;
}

// Sample a valid build spot around an anchor city — biased toward the front (sensors,
// forward offense) or away into the interior (industry, command), and spread from
// same-role units. Every candidate must sit inside the nation's own POLITICAL border
// (inOwnCountry) — the same rule the human player is bound to — so the AI never sites
// a unit on a neighbour's (or the player's) land. Falls back to any valid in-country
// spot; returns null if none is found (the caller simply skips the build this tick).
function spotAround(w, slot, anchor, front, role, toward, away, myUnits) {
    const cosLat = Math.max(0.2, Math.cos((anchor.lat * Math.PI) / 180));
    let brng = null;
    if (front && (toward || away)) {
        brng = Math.atan2(front.lng - anchor.lng, front.lat - anchor.lat) + (away ? Math.PI : 0);
    }
    for (let ring = 0; ring < 5; ring++) {
        const rDeg = 0.55 + ring * 0.5;
        for (let k = 0; k < 6; k++) {
            const ang = brng != null ? brng + (rand(w) - 0.5) * 1.6 : rand(w) * Math.PI * 2;
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
        const lng = anchor.lng + (rand(w) - 0.5) * 2.2, lat = anchor.lat + (rand(w) - 0.5) * 2.2;
        if (inOwnCountry(w, slot, lng, lat) && !placementBlocked(w, lng, lat, null)) return {lng, lat};
    }
    return null;
}

// Site a unit by role: defense over the most valuable uncovered protect-point,
// sensors/forward-offense toward the front, industry/command in the safe interior.
export function aiPlace(w, n, type, myUnits, cities, front) {
    const def = UNITS[type];
    if (!cities.length) return null;
    const role = aiRole(def);
    const forward = role === "sensor" || (role === "offense" && def.range < 12000);
    let anchor;
    if (role === "defense") {
        const pts = protectPoints(w, n.slot, myUnits);
        anchor = pts.find((p) => !defenseCovers(w, myUnits, p.lng, p.lat)) || pts[0] || cities[0];
    } else if (forward) {
        anchor = nearestCity(cities, front);   // frontier — face the threat
    } else if (role === "industry" || def.maxCount) {
        anchor = farthestCity(cities, front);  // safe interior (also bunker / space HQ)
    } else {
        anchor = cities[0];
    }
    if (!anchor) return null;
    if (def.domain === "sea") return aiSeaSpot(w, n.slot, anchor);
    const away = role === "industry" || type === "bunker" || type === "spacehq";
    return spotAround(w, n.slot, anchor, front, role, forward, away, myUnits);
}
