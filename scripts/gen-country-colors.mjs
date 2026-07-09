// Fills public/assets/colors.json — the GID_0 (ISO3) -> [r,g,b] table the world
// map uses to tint each nation. Invariant: every gid0 in regions-seed.geojson
// gets an entry, so no country renders as the map's fallback grey.
//
// Each color is the flag's dominant chromatic field (flag-icons pack) pushed to a
// vivid tone: averaging a flag's colors muddies everything toward grey-beige, so
// instead we pick the dominant hue and normalize saturation/lightness to yield
// distinct hues that read under the map's ~16%-opacity tint. Flagless codes
// (disputed/placeholder zones) get a deterministic hashed hue.
//
//   node scripts/gen-country-colors.mjs
import {readFileSync, writeFileSync, existsSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const flagDir = join(root, "node_modules/flag-icons/flags/4x3");

// --- gid0 universe: exactly the countries the map renders -------------------
const geo = JSON.parse(readFileSync(join(root, "public/assets/regions-seed.geojson"), "utf8"));
const gids = [...new Set(geo.features.map((f) => f.properties.gid0).filter(Boolean))].sort();

// --- GID_0 (alpha-3) -> flag-icons code (alpha-2) --------------------------
// Base map inverted from the project's ISO 3166 bridge, plus territory and
// disputed-region codes GADM carries that the ISO bridge doesn't.
const iso3src = readFileSync(join(root, "src/game/data/iso3.js"), "utf8");
const a3to2 = {};
for (const m of iso3src.matchAll(/"([A-Z]{2})":\s*"([A-Z]{2,3})"/g)) a3to2[m[2]] = m[1].toLowerCase();
Object.assign(a3to2, {
    // ISO codes not in the alpha-2->alpha-3 nation bridge (territories/dependencies)
    AIA: "ai", ATF: "tf", BES: "bq", BLM: "bl", GGY: "gg", JEY: "je", MSR: "ms",
    MYT: "yt", NRU: "nr", SHN: "sh", SPM: "pm", TKL: "tk", UMI: "um", VGB: "vg",
    VIR: "vi", WLF: "wf", NA: "na", NAM: "na",
    // GADM disputed / non-ISO codes with a recognised flag
    XKO: "xk", TWN: "tw", PSE: "ps", ESH: "eh",
});

// --- SVG -> area-weighted average color ------------------------------------
const NAMED = {
    red: [255, 0, 0], white: [255, 255, 255], blue: [0, 0, 255], green: [0, 128, 0],
    black: [0, 0, 0], yellow: [255, 255, 0], gold: [255, 215, 0], gray: [128, 128, 128],
    grey: [128, 128, 128], purple: [128, 0, 128], orange: [255, 165, 0],
};

function parseColor(v) {
    if (!v) return null;
    v = v.trim().toLowerCase();
    if (v === "none") return null;
    if (v[0] === "#") {
        let h = v.slice(1);
        if (h.length === 3) h = h.split("").map((c) => c + c).join("");
        if (h.length !== 6) return null;
        const n = parseInt(h, 16);
        if (Number.isNaN(n)) return null;
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    return NAMED[v] || null;
}

// Bounding box of an SVG path `d`, walking commands so relative coords resolve.
// Curves use their end/control points as extent — exact enough for area weight.
function pathBBox(d) {
    const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g);
    if (!toks) return null;
    let x = 0, y = 0, sx = 0, sy = 0, cmd = "", i = 0;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const ext = (px, py) => {
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
    };
    const num = () => parseFloat(toks[i++]);
    while (i < toks.length) {
        const t = toks[i];
        if (/[a-zA-Z]/.test(t)) {
            cmd = t;
            i++;
            if (cmd === "Z" || cmd === "z") {
                x = sx;
                y = sy;
            }
            continue;
        }
        const rel = cmd === cmd.toLowerCase();
        const c = cmd.toLowerCase();
        if (c === "m" || c === "l" || c === "t") {
            const dx = num(), dy = num();
            x = rel ? x + dx : dx;
            y = rel ? y + dy : dy;
            if (c === "m") {
                sx = x;
                sy = y;
                cmd = rel ? "l" : "L";
            }
            ext(x, y);
        } else if (c === "h") {
            const dx = num();
            x = rel ? x + dx : dx;
            ext(x, y);
        } else if (c === "v") {
            const dy = num();
            y = rel ? y + dy : dy;
            ext(x, y);
        } else if (c === "c") {
            num();
            num();
            num();
            num();
            const ex = num(), ey = num();
            x = rel ? x + ex : ex;
            y = rel ? y + ey : ey;
            ext(x, y);
        } else if (c === "s" || c === "q") {
            num();
            num();
            const ex = num(), ey = num();
            x = rel ? x + ex : ex;
            y = rel ? y + ey : ey;
            ext(x, y);
        } else if (c === "a") {
            num();
            num();
            num();
            num();
            num();
            const ex = num(), ey = num();
            x = rel ? x + ex : ex;
            y = rel ? y + ey : ey;
            ext(x, y);
        } else {
            i++; // unknown token, skip defensively
        }
    }
    if (minX > maxX) return null;
    return {w: Math.max(0, maxX - minX), h: Math.max(0, maxY - minY)};
}

function attr(tag, name) {
    const m = tag.match(new RegExp(`${name}="([^"]*)"`));
    return m ? m[1] : null;
}

function rgbToHsl([r, g, b]) {
    r /= 255;
    g /= 255;
    b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    const l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (d !== 0) {
        s = d / (1 - Math.abs(2 * l - 1));
        if (mx === r) h = ((g - b) / d) % 6;
        else if (mx === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
        if (h < 0) h += 360;
    }
    return [h, s, l];
}

function shapeArea(kind, t) {
    if (kind === "rect") {
        return (parseFloat(attr(t, "width")) || 0) * (parseFloat(attr(t, "height")) || 0);
    } else if (kind === "circle") {
        const rad = parseFloat(attr(t, "r")) || 0;
        return Math.PI * rad * rad;
    } else if (kind === "ellipse") {
        return Math.PI * (parseFloat(attr(t, "rx")) || 0) * (parseFloat(attr(t, "ry")) || 0);
    } else if (kind === "path") {
        const bb = pathBBox(attr(t, "d") || "");
        return bb ? bb.w * bb.h * 0.75 : 0; // paths seldom fill their bbox
    } else if (kind === "polygon") {
        const pts = (attr(t, "points") || "").match(/-?\d*\.?\d+/g);
        if (!pts) return 0;
        const xs = [], ys = [];
        for (let k = 0; k < pts.length - 1; k += 2) {
            xs.push(+pts[k]);
            ys.push(+pts[k + 1]);
        }
        return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)) * 0.5;
    }
    return 0;
}

// The flag's dominant chromatic field, normalized to a vivid tone. Sum area per
// exact fill color, pick the one with the most chromatic coverage (near-white /
// near-black / grey carry no hue and are heavily discounted so they never win),
// then push it to a punchy saturation/lightness.
function flagColor(svg) {
    // Drop <defs> — clip/mask geometry is never painted.
    svg = svg.replace(/<defs[\s\S]*?<\/defs>/gi, "");
    const areaByColor = new Map(); // "r,g,b" -> {col, area}
    for (const m of svg.matchAll(/<(path|rect|circle|ellipse|polygon)\b([^>]*)>/gi)) {
        const col = parseColor(attr(m[2], "fill"));
        if (!col) continue;
        const area = shapeArea(m[1].toLowerCase(), m[2]);
        if (area <= 0) continue;
        const key = col.join(",");
        const e = areaByColor.get(key);
        if (e) e.area += area;
        else areaByColor.set(key, {col, area});
    }
    if (areaByColor.size === 0) return null;
    // Score each color by chromatic coverage: area * saturation, with white and
    // black floored so a flag that is mostly white still surrenders its hue.
    let best = null, bestScore = -1, biggest = null, biggestArea = -1;
    for (const {col, area} of areaByColor.values()) {
        const [, s, l] = rgbToHsl(col);
        const chromatic = s > 0.15 && l > 0.12 && l < 0.9;
        const score = area * (chromatic ? s : 0.02);
        if (score > bestScore) {
            bestScore = score;
            best = col;
        }
        if (area > biggestArea) {
            biggestArea = area;
            biggest = col;
        }
    }
    const pick = best || biggest;
    const [h, s, l] = rgbToHsl(pick);
    // Normalize to a vivid, consistent tone — keep hue, force it to read.
    const vs = Math.max(s, 0.62);
    const vl = Math.min(Math.max(l, 0.42), 0.56);
    return hslToRgb(h, vs, vl);
}

// HSL -> RGB. Used for the vivid normalization and the no-flag fallback.
function hslToRgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
        : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function fallbackColor(gid) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < gid.length; i++) {
        hash ^= gid.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hslToRgb(hash % 360, 0.62, 0.5); // as vivid as the flag-derived colors
}

// --- build the table -------------------------------------------------------
// Every color is regenerated from scratch; prior is read only to report keys
// dropped since the last run.
const colorsPath = join(root, "public/assets/colors.json");
const prior = existsSync(colorsPath) ? JSON.parse(readFileSync(colorsPath, "utf8")) : {};
const out = {};
let flagged = 0, fell = 0;
const noFlag = [];
for (const gid of gids) {
    const a2 = a3to2[gid];
    const svgPath = a2 ? join(flagDir, `${a2}.svg`) : null;
    let color = null;
    if (svgPath && existsSync(svgPath)) color = flagColor(readFileSync(svgPath, "utf8"));
    if (color) {
        out[gid] = color;
        flagged++;
    } else {
        out[gid] = fallbackColor(gid);
        fell++;
        noFlag.push(gid);
    }
}

writeFileSync(colorsPath, JSON.stringify(out, null, 2) + "\n");
const dropped = Object.keys(prior).filter((k) => !(k in out)).length;
console.log(`colors.json: ${Object.keys(out).length} countries (${flagged} from flags, ${fell} hashed fallbacks; ${dropped} stale keys dropped)`);
if (noFlag.length) console.log(`  fallback codes: ${noFlag.join(" ")}`);
