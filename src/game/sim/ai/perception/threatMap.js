// Threat map: a coarse grid over a nation's ground scoring where enemy fire can
// actually land. Each cell carries inbound-fire pressure (what can range it, how
// hard it hits), the value sitting under it (population, leadership, industry),
// and the friendly defense coverage already over it. gap = pressure x value /
// (1 + coverage) — placement pulls the top-gap cells directly, so a THAAD goes
// where ballistic fire threatens something valuable and uncovered, not just
// "near the front". Pure: reads the world, allocates its own output.
import {UNITS, WARHEADS} from "../../../data/constants.js";
import {haversine} from "../../../geo/geo.js";
import {defenseRange} from "../../queries.js";
import {loadedWarhead} from "../../battlePlan.js";
import {THREAT} from "../tuning.js";

// One shot's worth of damage an enemy platform projects, by its loaded payload.
function platformThreat(u) {
    const def = UNITS[u.type];
    if (def.kind !== "offense" || !def.damage) return 0;
    const wh = WARHEADS[loadedWarhead(u)] || WARHEADS.standard;
    return def.damage * (wh.dmgMult ?? 1);
}

// Grid geometry: cover the nation's cities (plus command units) with a buffer,
// at a cell size that keeps the cell count under THREAT.maxCells.
function gridFor(cities, myUnits) {
    const pts = cities.map((c) => [c.lng, c.lat]);
    for (const u of myUnits) if (u.type === "bunker" || u.type === "spacehq") pts.push([u.lng, u.lat]);
    if (!pts.length) return null;
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const [lng, lat] of pts) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
    }
    minLng -= THREAT.bufferDeg;
    maxLng += THREAT.bufferDeg;
    minLat -= THREAT.bufferDeg;
    maxLat += THREAT.bufferDeg;
    let cell = 1.5;
    const cellsAt = (s) => Math.ceil((maxLng - minLng) / s) * Math.ceil((maxLat - minLat) / s);
    while (cellsAt(cell) > THREAT.maxCells) cell *= 1.4;
    return {minLng, minLat, cols: Math.max(1, Math.ceil((maxLng - minLng) / cell)), rows: Math.max(1, Math.ceil((maxLat - minLat) / cell)), cell};
}

// Build the map for nation `n`. `enemies`/`rivals` are nation lists (at-war and
// reachable-peacetime respectively); `unitsBySlot` is the per-tick roster index.
export function buildThreatMap(w, n, {cities, myUnits, enemies, rivals, unitsBySlot}) {
    const g = gridFor(cities, myUnits);
    if (!g) return {cells: [], grid: null};
    const cells = [];
    for (let r = 0; r < g.rows; r++) {
        for (let c = 0; c < g.cols; c++) {
            cells.push({
                lng: g.minLng + (c + 0.5) * g.cell,
                lat: g.minLat + (r + 0.5) * g.cell,
                pressure: 0,          // total inbound one-shot damage that can range this cell
                ballistic: 0,         // the ballistic share of it (what THAAD/Aegis answer)
                value: 0,             // what's worth protecting here
                coverage: 0,          // friendly interceptor weight already over it
                gap: 0,
            });
        }
    }

    // Inbound fire pressure: every hostile offensive platform that can range a
    // cell projects its shot damage onto it, discounted by distance. Peacetime
    // rivals project a fraction — the AI pre-positions against neighbours it may
    // fight, without treating the whole world as inbound.
    const sources = [];
    for (const e of enemies) for (const u of (unitsBySlot.get(e.slot) || [])) sources.push([u, 1]);
    for (const m of rivals) for (const u of (unitsBySlot.get(m.slot) || [])) sources.push([u, THREAT.peacetimeRivalW]);
    for (const [u, weight] of sources) {
        const dmg = platformThreat(u) * weight;
        if (dmg <= 0) continue;
        const range = UNITS[u.type].range || 0;
        const ballistic = !!UNITS[u.type].ballistic;
        for (const cell of cells) {
            const d = haversine(u.lng, u.lat, cell.lng, cell.lat);
            if (d > range) continue;
            const p = dmg / (1 + d / THREAT.distScaleKm);
            cell.pressure += p;
            if (ballistic) cell.ballistic += p;
        }
    }

    // Value at risk: population under the cell, leadership tokens, industry.
    const half = g.cell * 0.75; // generous catchment so border assets aren't orphaned
    const inCell = (cell, lng, lat) => Math.abs(lng - cell.lng) <= half && Math.abs(lat - cell.lat) <= half;
    for (const cell of cells) {
        for (const c of cities) {
            if (!inCell(cell, c.lng, c.lat)) continue;
            cell.value += (c.pop || 0) * (c.cap ? 1.6 : 1) + (c.leaders || 0) * THREAT.leaderValue;
        }
        for (const u of myUnits) {
            if (!inCell(cell, u.lng, u.lat)) continue;
            if (UNITS[u.type].kind === "industry") cell.value += THREAT.industryValue;
            if (u.type === "bunker" || u.type === "spacehq") cell.value += THREAT.leaderValue * 2;
        }
    }

    // Friendly coverage: each defense envelope over the cell adds its intercept
    // probability — two Patriots over a city count roughly like one Aegis.
    for (const u of myUnits) {
        const def = UNITS[u.type];
        if (def.kind !== "defense") continue;
        const range = defenseRange(w, u);
        for (const cell of cells) {
            if (haversine(u.lng, u.lat, cell.lng, cell.lat) <= range) {
                cell.coverage += (def.intercept || 0.5) * THREAT.coverageIntercept;
            }
        }
    }

    for (const cell of cells) cell.gap = (cell.pressure * cell.value) / (1 + cell.coverage);
    return {cells, grid: g};
}

// The K worst uncovered cells, optionally filtered (e.g. ballistic-only for a
// THAAD siting query). Value-bearing cells only — empty steppe never wins.
export function topGaps(map, k, pred) {
    const pool = map.cells.filter((c) => c.value > 0 && c.gap > 0 && (!pred || pred(c)));
    pool.sort((a, b) => b.gap - a.gap);
    return pool.slice(0, k);
}

// Mean pressure across value-bearing cells — the "how hot is my ground" scalar
// posture and focus read.
export function meanPressure(map) {
    let sum = 0, k = 0;
    for (const c of map.cells) {
        if (c.value <= 0) continue;
        sum += c.pressure;
        k++;
    }
    return k ? sum / k : 0;
}
