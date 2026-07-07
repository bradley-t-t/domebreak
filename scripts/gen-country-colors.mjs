// Fills public/assets/colors.json — the GID_0 (ISO3) -> [r,g,b] table the world
// map uses to tint each nation with its flag color. The map fills any country
// MISSING from this table with a neutral grey, so the invariant here is TOTAL
// COVERAGE: every gid0 present in regions-seed.geojson gets an entry, so no
// country ever renders grey.
//
// Existing on-map entries are preserved byte-for-byte — this only computes colors
// for the countries that were missing (and drops stale keys for polygons the map
// no longer carries). Each new color is the area-weighted average of its flag
// (flag-icons pack), computed from shape bounding boxes — background fields
// dominate, matching the muted national tint washed over the greyscale land.
// Codes with no flag (disputed/placeholder zones) get a deterministic hashed
// color so they, too, are never grey.
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

function flagColor(svg) {
    // Drop <defs> — clip/mask geometry is never painted.
    svg = svg.replace(/<defs[\s\S]*?<\/defs>/gi, "");
    let r = 0, g = 0, b = 0, wsum = 0;
    // Every self-contained element that can carry a fill + geometry.
    for (const m of svg.matchAll(/<(path|rect|circle|ellipse|polygon)\b([^>]*)>/gi)) {
        const kind = m[1].toLowerCase();
        const t = m[2];
        const col = parseColor(attr(t, "fill"));
        if (!col) continue;
        let area = 0;
        if (kind === "rect") {
            area = (parseFloat(attr(t, "width")) || 0) * (parseFloat(attr(t, "height")) || 0);
        } else if (kind === "circle") {
            const rad = parseFloat(attr(t, "r")) || 0;
            area = Math.PI * rad * rad;
        } else if (kind === "ellipse") {
            area = Math.PI * (parseFloat(attr(t, "rx")) || 0) * (parseFloat(attr(t, "ry")) || 0);
        } else if (kind === "path") {
            const bb = pathBBox(attr(t, "d") || "");
            area = bb ? bb.w * bb.h * 0.75 : 0; // paths seldom fill their bbox
        } else if (kind === "polygon") {
            const pts = (attr(t, "points") || "").match(/-?\d*\.?\d+/g);
            if (pts) {
                const xs = [], ys = [];
                for (let k = 0; k < pts.length - 1; k += 2) {
                    xs.push(+pts[k]);
                    ys.push(+pts[k + 1]);
                }
                area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)) * 0.5;
            }
        }
        if (area <= 0) continue;
        r += col[0] * area;
        g += col[1] * area;
        b += col[2] * area;
        wsum += area;
    }
    if (wsum === 0) return null;
    return [Math.round(r / wsum), Math.round(g / wsum), Math.round(b / wsum)];
}

// Deterministic fallback for codes with no flag: FNV-1a hash -> HSL -> RGB.
// Mid saturation/lightness keeps it legible under the muted map tint.
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
    return hslToRgb(hash % 360, 0.5, 0.55);
}

// --- build the table -------------------------------------------------------
// Preserve any existing on-map color; only compute the ones that were missing.
const colorsPath = join(root, "public/assets/colors.json");
const prior = existsSync(colorsPath) ? JSON.parse(readFileSync(colorsPath, "utf8")) : {};
const out = {};
let kept = 0, flagged = 0, fell = 0;
const noFlag = [];
for (const gid of gids) {
    if (Array.isArray(prior[gid]) && prior[gid].length === 3) {
        out[gid] = prior[gid];
        kept++;
        continue;
    }
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
console.log(`colors.json: ${Object.keys(out).length} countries (${kept} kept, ${flagged} new from flags, ${fell} hashed fallbacks; ${dropped} stale keys dropped)`);
if (noFlag.length) console.log(`  fallback codes: ${noFlag.join(" ")}`);
