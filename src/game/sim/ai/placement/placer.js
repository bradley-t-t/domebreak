// Role-aware placement, threat-map informed. Same contract as the old aiPlace —
// (type) -> {lng, lat} or null to skip the build — but sited against the frame:
// defense goes to the worst uncovered threat gap its intercept class answers,
// offense points at the priority war axis, industry hides in the quietest
// ground, command maximizes distance from enemy reach, sensors fan out the
// radar picture toward the inbound bearings.
import {UNITS} from "../../../data/constants.js";
import {haversine} from "../../../geo/geo.js";
import {topGaps} from "../perception/threatMap.js";
import {PLACE} from "../tuning.js";
import {
    aiRole,
    aiSeaSpot,
    citiesByDistance,
    coastalLandSpot,
    defenseCovers,
    nearestCity,
    radarCovered,
    spotAround,
} from "./siting.js";

// Threat pressure at a point: nearest grid cell's reading (0 off-map).
function pressureAt(threats, lng, lat) {
    let best = 0, bd = Infinity;
    for (const cell of threats.cells) {
        const d = Math.abs(cell.lng - lng) + Math.abs(cell.lat - lat);
        if (d < bd) { bd = d; best = cell.pressure; }
    }
    return best;
}

// The war front placement orients to: the highest-priority war's foe capital
// (decap outranks capture outranks counter-value outranks attrition — the same
// order the fires layer prosecutes), else the peacetime front.
const FRONT_RANK = {decap: 0, capture: 1, cityStrike: 2, attritional: 3};

function placementFront(frame, warPlans) {
    let best = null, bestRank = Infinity;
    for (const foe in warPlans) {
        const rank = FRONT_RANK[warPlans[foe].goal] ?? 9;
        const f = frame.fronts.find((x) => x.foe === +foe);
        if (f?.pos && rank < bestRank) { bestRank = rank; best = f.pos; }
    }
    return best || frame.front;
}

export function makePlacer(w, frame, warPlans) {
    const {units: myUnits, cities, protect, slot, cap} = frame.me;
    const front = placementFront(frame, warPlans);

    const defenseSpot = (type) => {
        const def = UNITS[type];
        // Mid/high-tier ABM answers ballistic pressure; terminal layers answer
        // total pressure over value. Anchor on the worst matching gap cell that
        // has a protectable point near it, falling back to the most valuable
        // uncovered protect-point (the old rule) when the map is quiet.
        const wantBallistic = !!def.antiBallistic || type === "aegis";
        const gaps = topGaps(frame.threats, PLACE.gapTopK, wantBallistic ? ((c) => c.ballistic > 0) : null);
        for (const cell of gaps) {
            if (defenseCovers(w, myUnits, cell.lng, cell.lat)) continue;
            const spot = spotAround(w, slot, cell, front, "defense", false, myUnits);
            if (spot) return spot;
        }
        const pt = protect.find((p) => !defenseCovers(w, myUnits, p.lng, p.lat)) || protect[0] || cities[0];
        return pt ? spotAround(w, slot, pt, front, "defense", false, myUnits) : null;
    };

    const offenseSpot = (type) => {
        const def = UNITS[type];
        // Short-reach platforms push toward the war axis; global-reach silos sit
        // wherever the interior has room. Walk every candidate anchor so a
        // saturated border city doesn't stall the build.
        const forward = (def.range || 0) < 12000;
        const anchors = forward ? citiesByDistance(cities, front, true) : citiesByDistance(cities, front, false);
        // Bounded anchor walk: each candidate spot pays a world-wide separation
        // check, so a 50-city nation must not exhaust its whole map per build.
        for (const anchor of anchors.slice(0, 6)) {
            const spot = spotAround(w, slot, anchor, forward ? front : null, "offense", false, myUnits);
            if (spot) return spot;
        }
        return null;
    };

    const industrySpot = () => {
        // Quietest ground first: order anchors by live threat pressure, then
        // interior distance — a battered frontier city never anchors a techpark
        // while a calm interior one stands.
        const anchors = cities
            .map((c) => [c, pressureAt(frame.threats, c.lng, c.lat)])
            .sort((a, b) => a[1] - b[1] || 0)
            .map(([c]) => c);
        for (const anchor of anchors.slice(0, 8)) {
            const spot = spotAround(w, slot, anchor, front, "industry", true, myUnits);
            if (spot) return spot;
        }
        return null;
    };

    const commandSpot = () => {
        // Deep interior, low pressure, and existing defense density all count —
        // the bunker hides where enemy reach is thinnest and friends are thick.
        let best = null, bestScore = -Infinity;
        for (const c of cities) {
            const p = pressureAt(frame.threats, c.lng, c.lat);
            const away = front ? haversine(c.lng, c.lat, front.lng, front.lat) : 1000;
            const cover = defenseCovers(w, myUnits, c.lng, c.lat) ? 1.5 : 1;
            const score = (away / (1 + p)) * cover;
            if (score > bestScore) { bestScore = score; best = c; }
        }
        return best ? spotAround(w, slot, best, front, "other", true, myUnits) : null;
    };

    const sensorSpot = () => {
        const anchor = cities.find((c) => !radarCovered(myUnits, c.lng, c.lat)) || nearestCity(cities, front);
        return anchor ? spotAround(w, slot, anchor, front, "sensor", false, myUnits) : null;
    };

    const navalSpot = () => {
        // At war the fleet stages off the coastal city nearest the axis of
        // approach; in peace it homeports near the capital.
        const anchors = frame.world.atWar ? citiesByDistance(cities, front, true) : cities;
        for (const anchor of anchors.slice(0, 4)) {
            const spot = aiSeaSpot(w, slot, anchor);
            if (spot) return spot;
        }
        return null;
    };

    return function place(type) {
        const def = UNITS[type];
        if (!cities.length || !def) return null;
        if (def.coastal) return coastalLandSpot(w, slot, cities, myUnits);
        if (def.orbital) {
            // Orbital assets ignore territory/separation — inject over the
            // capital; the orbit sweeps the parallel from there.
            const c = cap || cities[0];
            return {lng: c.lng, lat: c.lat};
        }
        if (def.domain === "sea") return navalSpot();
        if (type === "bunker" || type === "spacehq") return commandSpot();
        const role = aiRole(def);
        if (role === "defense") return defenseSpot(type);
        if (role === "industry") return industrySpot();
        if (role === "sensor") return sensorSpot();
        if (role === "offense") return offenseSpot(type);
        // Support (airstrip, armybase): behind the line but not buried — second
        // ring of cities by distance from the front.
        const anchors = citiesByDistance(cities, front, false);
        const anchor = anchors[Math.min(1, anchors.length - 1)] || cities[0];
        return spotAround(w, slot, anchor, front, "other", true, myUnits);
    };
}
