// Rasterizes the depth-0 ocean polygons from public/assets/bathymetry.geojson
// into a 0.25-degree packed water bitmask, carves the straits and canals that
// are too narrow to survive rasterization, flood-checks that every major sea
// stays connected to the world ocean, and emits src/game/geo/seaGrid.js.
//
//   node scripts/gen-seagrid.mjs
import {readFileSync, writeFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const W = 1440, H = 720, STEP = 360 / W; // 0.25 degrees per cell
const colOf = (lng) => Math.min(W - 1, Math.max(0, Math.floor((lng + 180) / STEP)));
const rowOf = (lat) => Math.min(H - 1, Math.max(0, Math.floor((lat + 90) / STEP)));

const geo = JSON.parse(readFileSync(join(root, "public/assets/bathymetry.geojson"), "utf8"));
const ocean = geo.features.filter((f) => f.properties.depth === 0);
const rings = [];
for (const f of ocean) {
    const polys = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates];
    for (const poly of polys) for (const ring of poly) rings.push(ring);
}
console.log(`depth-0 features: ${ocean.length}, rings: ${rings.length}`);

// Even-odd scanline fill across every ring at once: outer boundaries turn water
// on, island holes turn it back off, no ring classification needed.
const water = new Uint8Array(W * H);
const rowHits = Array.from({length: H}, () => []);
for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
        const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length];
        if (y1 === y2) continue;
        const lo = Math.min(y1, y2), hi = Math.max(y1, y2);
        const r0 = Math.max(0, Math.ceil((lo + 90) / STEP - 0.5));
        const r1 = Math.min(H - 1, Math.floor((hi + 90) / STEP - 0.5));
        for (let r = r0; r <= r1; r++) {
            const lat = -90 + (r + 0.5) * STEP;
            if ((y1 <= lat) === (y2 <= lat)) continue;
            rowHits[r].push(x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1));
        }
    }
}
for (let r = 0; r < H; r++) {
    const xs = rowHits[r].sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
        const c0 = Math.max(0, Math.ceil((xs[i] + 180) / STEP - 0.5));
        const c1 = Math.min(W - 1, Math.floor((xs[i + 1] + 180) / STEP - 0.5));
        for (let c = c0; c <= c1; c++) water[r * W + c] = 1;
    }
}
console.log(`water fraction after rasterize: ${(water.reduce((a, b) => a + b, 0) / (W * H) * 100).toFixed(1)}%`);

// Channels narrower than a cell vanish when rasterized; carve them back open.
// Each entry is a polyline through the strait; a 1-cell brush follows it.
const STRAITS = [
    ["Gibraltar", [[-6.5, 35.95], [-4.8, 36.05]]],
    ["Dardanelles-Bosphorus", [[25.7, 39.95], [26.7, 40.35], [27.6, 40.75], [28.9, 41.0], [29.2, 41.45]]],
    ["Suez Canal", [[32.55, 29.8], [32.35, 31.4]]],
    ["Panama Canal", [[-79.95, 9.4], [-79.55, 8.85]]],
    ["Hormuz", [[55.6, 26.9], [56.7, 26.35]]],
    ["Bab-el-Mandeb", [[43.2, 12.9], [43.65, 12.25]]],
    ["Malacca-Singapore", [[98.4, 4.6], [100.3, 2.9], [102.2, 1.9], [103.6, 1.25], [104.4, 1.35]]],
    ["Dover", [[0.9, 50.75], [1.9, 51.35]]],
    ["Bering", [[-170.5, 65.5], [-168.3, 66.1]]],
    ["Danish Straits", [[10.5, 57.9], [11.2, 56.8], [12.6, 56.05], [12.85, 55.3], [13.9, 55.0]]],
    ["Messina", [[15.5, 37.95], [15.75, 38.4]]],
    ["Tsugaru", [[140.1, 41.45], [141.3, 41.6]]],
    ["La Perouse", [[141.4, 45.65], [142.4, 45.95]]],
    ["Sunda", [[105.5, -6.35], [106.1, -5.55]]],
];
const carve = (pts) => {
    for (let i = 0; i + 1 < pts.length; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
        const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (STEP / 4));
        for (let s = 0; s <= n; s++) {
            const lng = x1 + ((x2 - x1) * s) / n, lat = y1 + ((y2 - y1) * s) / n;
            const c = colOf(lng), r = rowOf(lat);
            for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
                const rr = r + dr, cc = ((c + dc) % W + W) % W;
                if (rr >= 0 && rr < H) water[rr * W + cc] = 1;
            }
        }
    }
};
for (const [, pts] of STRAITS) carve(pts);

// Flood from the mid-Atlantic and make sure every sea a ship can start in or
// be sent to reaches the world ocean. Fails the build if one is cut off.
const CHECKS = [
    ["Mediterranean", 18, 34.5], ["Black Sea", 34, 43], ["Baltic", 19, 57],
    ["Red Sea", 38, 20], ["Persian Gulf", 51, 27], ["Sea of Japan", 134, 40],
    ["Java Sea", 110, -5], ["Caribbean", -75, 15], ["Mid-Pacific", -150, 0],
    ["Hudson Bay", -85, 60], ["Sea of Okhotsk", 150, 55], ["North Sea", 3, 56],
    ["Gulf of Mexico", -90, 25], ["Arabian Sea", 65, 15], ["South China Sea", 114, 12],
];
const reach = new Uint8Array(W * H);
const stack = [rowOf(30) * W + colOf(-30)];
if (!water[stack[0]]) throw new Error("flood seed is not water");
reach[stack[0]] = 1;
while (stack.length) {
    const i = stack.pop(), r = (i / W) | 0, c = i % W;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const rr = r + dr;
        if (rr < 0 || rr >= H) continue;
        const j = rr * W + (((c + dc) % W + W) % W);
        if (water[j] && !reach[j]) {
            reach[j] = 1;
            stack.push(j);
        }
    }
}
let bad = 0;
for (const [name, lng, lat] of CHECKS) {
    const ok = reach[rowOf(lat) * W + colOf(lng)];
    console.log(`${ok ? "ok " : "CUT"} ${name}`);
    if (!ok) bad++;
}
if (bad) throw new Error(`${bad} sea(s) unreachable — adjust STRAITS or check points`);

// Everything unreachable from the ocean (inland lakes, Caspian) is closed off
// so the router can never plot a course into a lake.
for (let i = 0; i < W * H; i++) water[i] = reach[i];

const packed = new Uint8Array(Math.ceil((W * H) / 8));
for (let i = 0; i < W * H; i++) if (water[i]) packed[i >> 3] |= 1 << (i & 7);
const b64 = Buffer.from(packed).toString("base64");
writeFileSync(join(root, "src/game/geo/seaGrid.js"),
    `// Generated by scripts/gen-seagrid.mjs — do not edit by hand.
// 0.25-degree world water mask: bathymetry depth-0 ocean polygons with the
// straits and canals carved open and landlocked water removed. Bit i covers
// cell (row i/W from lat -90, col i%W from lng -180); 1 = navigable water.
export const SEA_W = ${W};
export const SEA_H = ${H};
export const SEA_B64 = "${b64}";
`);
console.log(`wrote src/game/geo/seaGrid.js (${(b64.length / 1024).toFixed(0)}KB base64)`);
