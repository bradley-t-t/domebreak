// Political ownership lookup over the generated 0.25-degree country grid: given a
// point, returns the GID_0 (ISO3) of the nation that politically owns it, or null
// over ocean / unclaimed ground. This is the sim's ground truth for national
// borders — the same boundary the human player is bound to when placing — so the
// AI can be gated on its own country instead of a Voronoi nearest-city disk.
import {COUNTRY_H, COUNTRY_RLE_B64, COUNTRY_W, GIDS} from "./countryGrid.js";
import {clamp} from "../../lib/math.js";

const STEP = 360 / COUNTRY_W;

// Expand the RLE payload (3 bytes/run: value, count-lo, count-hi) into a flat
// per-cell owner-index array, once at module load — same shape as seaRoute's bits.
const owner = (() => {
    const bin = atob(COUNTRY_RLE_B64);
    const cells = new Uint8Array(COUNTRY_W * COUNTRY_H);
    let p = 0;
    for (let i = 0; i + 2 < bin.length; i += 3) {
        const v = bin.charCodeAt(i);
        const n = bin.charCodeAt(i + 1) | (bin.charCodeAt(i + 2) << 8);
        if (v) cells.fill(v, p, p + n);
        p += n;
    }
    return cells;
})();

const colOf = (lng) => (((Math.floor((lng + 180) / STEP)) % COUNTRY_W) + COUNTRY_W) % COUNTRY_W;
const rowOf = (lat) => clamp(Math.floor((lat + 90) / STEP), 0, COUNTRY_H - 1);

// GID_0 (ISO3) of the country under a point, or null if none (ocean / unclaimed).
export function countryGidAt(lng, lat) {
    const idx = owner[rowOf(lat) * COUNTRY_W + colOf(lng)];
    return idx ? GIDS[idx] : null;
}

// Enumerate every grid cell owned by a country, as {lng,lat} centers plus a
// cos(lat) area weight (grid cells shrink toward the poles, so a raw cell count
// over-weights high-latitude land — weighting by cos(lat) makes `area` a true
// relative surface area). Returns {cells, area}; `area` is the summed weight,
// the denominator for any "% of land covered" figure. Scans the full grid once
// per country and caches — used by radar-coverage objective checks, never per
// frame without memoization upstream.
const landCellCache = new Map();

export function countryLandCells(gid) {
    if (!gid) return {cells: [], area: 0};
    const cached = landCellCache.get(gid);
    if (cached) return cached;
    const idx = GIDS.indexOf(gid);
    const cells = [];
    let area = 0;
    if (idx > 0) {
        for (let r = 0; r < COUNTRY_H; r++) {
            const lat = -90 + (r + 0.5) * STEP;
            const wgt = Math.cos((lat * Math.PI) / 180);
            const rowBase = r * COUNTRY_W;
            for (let c = 0; c < COUNTRY_W; c++) {
                if (owner[rowBase + c] === idx) {
                    cells.push({lng: -180 + (c + 0.5) * STEP, lat, w: wgt});
                    area += wgt;
                }
            }
        }
    }
    const out = {cells, area};
    landCellCache.set(gid, out);
    return out;
}
