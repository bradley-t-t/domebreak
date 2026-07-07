// Political ownership lookup over the generated 0.25-degree country grid: given a
// point, returns the GID_0 (ISO3) of the nation that politically owns it, or null
// over ocean / unclaimed ground. This is the sim's ground truth for national
// borders — the same boundary the human player is bound to when placing — so the
// AI can be gated on its own country instead of a Voronoi nearest-city disk.
import {COUNTRY_H, COUNTRY_RLE_B64, COUNTRY_W, GIDS} from "./countryGrid.js";

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
const rowOf = (lat) => Math.min(COUNTRY_H - 1, Math.max(0, Math.floor((lat + 90) / STEP)));

// GID_0 (ISO3) of the country under a point, or null if none (ocean / unclaimed).
export function countryGidAt(lng, lat) {
    const idx = owner[rowOf(lat) * COUNTRY_W + colOf(lng)];
    return idx ? GIDS[idx] : null;
}
