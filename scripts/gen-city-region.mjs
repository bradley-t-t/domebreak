// Precompute which GADM level-1 region (province) each seed city falls inside, by
// point-in-polygon against regions-seed.geojson. Output keys match the engine's
// runtime city ids (`${iso}-${index}`, see src/game/sim/newGame.js) so the map's
// ownership overlay can look up a city's province with zero name-matching (province
// names in cities.json only agree with GADM NAME_1 ~80% of the time, and 0% for
// some countries — geometry is exact where names are not).
//
//   node scripts/gen-city-region.mjs
//
// Writes public/assets/city-region.json: { "US-0": "USA.5_1", ... }.
import {readFileSync, writeFileSync} from "fs";
import {fileURLToPath} from "url";
import {dirname, join} from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cities = JSON.parse(readFileSync(join(root, "public/data/cities.json"), "utf8"));
const seed = JSON.parse(readFileSync(join(root, "public/assets/regions-seed.geojson"), "utf8"));

// ISO2 -> GID_0 (ISO3), parsed straight out of the source table.
const iso3src = readFileSync(join(root, "src/game/data/iso3.js"), "utf8");
const ISO3 = {};
const block = iso3src.match(/export const ISO3 = \{([\s\S]*?)\};/)[1];
for (const p of block.matchAll(/"?([A-Za-z]{2})"?\s*:\s*"([A-Z]{3})"/g)) ISO3[p[1].toUpperCase()] = p[2];

// Index regions by GID_0, each with a flattened list of {ring, bbox} outer rings
// (Polygon + every part of a MultiPolygon) plus a centroid for nearest-fallback.
const byGid = new Map();
for (const f of seed.features) {
    const gid0 = f.properties.gid0, gid1 = f.properties.id;
    if (!gid0 || !gid1) continue;
    const parts = [];
    const g = f.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    let cx = 0, cy = 0, cn = 0;
    for (const poly of polys) {
        const ring = poly[0];
        if (!ring || ring.length < 4) continue;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const [x, y] of ring) {
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
            cx += x; cy += y; cn++;
        }
        parts.push({ring, bbox: [minX, minY, maxX, maxY]});
    }
    if (!parts.length) continue;
    if (!byGid.has(gid0)) byGid.set(gid0, []);
    byGid.get(gid0).push({gid1, parts, cen: [cx / cn, cy / cn]});
}

function inRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
        if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

const out = {};
let total = 0, hit = 0, near = 0, miss = 0;
for (const iso of Object.keys(cities)) {
    const gid0 = ISO3[iso.toUpperCase()];
    const regions = gid0 ? byGid.get(gid0) : null;
    cities[iso].forEach((c, i) => {
        total++;
        const id = `${iso}-${i}`;
        if (!regions) { miss++; return; }
        const x = c.lng, y = c.lat;
        let found = null;
        for (const r of regions) {
            for (const p of r.parts) {
                const b = p.bbox;
                if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
                if (inRing(x, y, p.ring)) { found = r.gid1; break; }
            }
            if (found) break;
        }
        if (found) { out[id] = found; hit++; return; }
        // Fallback: nearest region centroid in the same country (border/coastline slop).
        let best = Infinity, bg = null;
        for (const r of regions) {
            const dx = r.cen[0] - x, dy = r.cen[1] - y, d = dx * dx + dy * dy;
            if (d < best) { best = d; bg = r.gid1; }
        }
        if (bg) { out[id] = bg; near++; } else miss++;
    });
}

writeFileSync(join(root, "public/assets/city-region.json"), JSON.stringify(out));
console.log(`city-region.json: ${Object.keys(out).length} cities mapped`);
console.log(`  contained: ${hit}  nearest-fallback: ${near}  unmapped: ${miss}  (of ${total})`);
