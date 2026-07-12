// Terrain-aware routing over the generated 0.25-degree world grid: A* across
// walkable cells (longitude wraps, latitude doesn't), then greedy line-of-sight
// smoothing so a crossing collapses to a handful of waypoints. Two routers share
// the search: seaRoute walks navigable-water cells (naval), landRoute walks the
// complement (ground forces) — so ships path around land and armies path around
// oceans with the same machinery.
import {SEA_B64, SEA_H, SEA_W} from "./seaGrid.js";
import {clamp} from "../../lib/math.js";

const STEP = 360 / SEA_W;
const bits = (() => {
    const bin = atob(SEA_B64);
    const a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a;
})();

const wrapLng = (lng) => ((lng + 540) % 360) - 180;
const colOf = (lng) => (((Math.floor((lng + 180) / STEP)) % SEA_W) + SEA_W) % SEA_W;
const rowOf = (lat) => clamp(Math.floor((lat + 90) / STEP), 0, SEA_H - 1);
const seaCell = (r, c) => (bits[(r * SEA_W + c) >> 3] >> ((r * SEA_W + c) & 7)) & 1;
// Land is everything the water mask doesn't claim (non-navigable inland water
// reads as terrain — armies may cross it, ships may not).
const landCell = (r, c) => !seaCell(r, c);
const cellLng = (c) => -180 + (c + 0.5) * STEP;
const cellLat = (r) => -90 + (r + 0.5) * STEP;

export function isSea(lng, lat) {
    return !!seaCell(rowOf(lat), colOf(lng));
}

const R = 6371, toRad = Math.PI / 180;

function havKm(lng1, lat1, lng2, lat2) {
    const dLa = (lat2 - lat1) * toRad, dLo = (lng2 - lng1) * toRad;
    const a = Math.sin(dLa / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(Math.min(1, a)));
}

// Nearest walkable cell to a point, searched in growing square rings. Coastal
// units often sit in a cell whose center rasterized as the other terrain;
// this recovers them.
function snapTo(lng, lat, ok, maxRing = 8) {
    const r0 = rowOf(lat), c0 = colOf(lng);
    if (ok(r0, c0)) return r0 * SEA_W + c0;
    for (let ring = 1; ring <= maxRing; ring++) {
        let best = -1, bestD = Infinity;
        for (let dr = -ring; dr <= ring; dr++) for (let dc = -ring; dc <= ring; dc++) {
            if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
            const r = r0 + dr;
            if (r < 0 || r >= SEA_H) continue;
            const c = (((c0 + dc) % SEA_W) + SEA_W) % SEA_W;
            if (!ok(r, c)) continue;
            const d = havKm(lng, lat, cellLng(c), cellLat(r));
            if (d < bestD) {
                bestD = d;
                best = r * SEA_W + c;
            }
        }
        if (best >= 0) return best;
    }
    return -1;
}

// Straight segment stays on walkable terrain the whole way (sampled every quarter cell).
function clearPath(lng1, lat1, lng2, lat2, ok) {
    let dLng = wrapLng(lng2 - lng1);
    const dLat = lat2 - lat1;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dLng), Math.abs(dLat)) / (STEP / 2)));
    for (let i = 0; i <= n; i++) {
        const lng = wrapLng(lng1 + (dLng * i) / n), lat = lat1 + (dLat * i) / n;
        if (!ok(rowOf(lat), colOf(lng))) return false;
    }
    return true;
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// Coastal-clearance field (lazy, built once). Chebyshev ring-distance from each
// navigable cell to the nearest land, capped at COAST_PAD; 0 marks land and open
// water alike (neither is charged). Ships pay a soft extra cost for occupying a
// cell close to land so a route stands off the coast when open water is there —
// but the cell is never blocked, so a strait, a port approach, or a start/finish
// pinned against the shore still routes. This is the "try, don't force" padding.
const COAST_PAD = 3;
// Extra km for entering a sea cell this many rings off the coast (index by band;
// band 0 = land/open water = free). Kept under a cell's ~28 km span so the nudge
// bends a course seaward when an open lane runs alongside, without provoking a long
// detour to shave a little clearance — a ship still hugs the shore when that is the
// short way. The band1→band2 gap is what decides how readily a course stands off.
const COAST_COST = [0, 18, 7, 2];
let coastBand = null;

function buildCoastBand() {
    const band = new Uint8Array(SEA_W * SEA_H); // 0 = land seed or open water
    let frontier = [];
    for (let r = 0; r < SEA_H; r++) for (let c = 0; c < SEA_W; c++) {
        if (landCell(r, c)) frontier.push(r * SEA_W + c);
    }
    for (let d = 1; d <= COAST_PAD && frontier.length; d++) {
        const next = [];
        for (const cell of frontier) {
            const r = (cell / SEA_W) | 0, c = cell % SEA_W;
            for (const [dr, dc] of DIRS) {
                const nr = r + dr;
                if (nr < 0 || nr >= SEA_H) continue;
                const nc = (((c + dc) % SEA_W) + SEA_W) % SEA_W;
                const ni = nr * SEA_W + nc;
                if (band[ni] || landCell(nr, nc)) continue; // already banded or land
                band[ni] = d;
                next.push(ni);
            }
        }
        frontier = next;
    }
    return band;
}

function coastBandAt(r, c) {
    if (!coastBand) coastBand = buildCoastBand();
    return coastBand[r * SEA_W + c];
}

function coastCostAt(r, c) {
    return COAST_COST[coastBandAt(r, c)] || 0;
}

// A* from (aLng,aLat) to (bLng,bLat) over cells passing `ok`. Returns smoothed
// waypoints [{lng,lat}, ...] ending at the (possibly snapped) destination, or
// null when either end can't reach walkable terrain or no path connects them.
// `opts.cellCost(r,c)` adds soft extra km for entering a cell (coast/ship berth);
// `opts.clear(...)` is the smoothing straight-line test (defaults to plain
// walkability) so a coast-aware caller keeps its clearance through string-pulling.
function gridRoute(aLng, aLat, bLng, bLat, ok, opts) {
    const cellCost = opts?.cellCost;
    const clear = opts?.clear || ((l1, la1, l2, la2) => clearPath(l1, la1, l2, la2, ok));
    const start = snapTo(aLng, aLat, ok), goal = snapTo(bLng, bLat, ok);
    if (start < 0 || goal < 0) return null;
    // Final waypoint: the exact click when it sits on walkable terrain, else the snapped cell.
    const clickOk = ok(rowOf(bLat), colOf(bLng));
    const endLng = clickOk ? bLng : cellLng(goal % SEA_W);
    const endLat = clickOk ? bLat : cellLat((goal / SEA_W) | 0);
    if (start === goal || clear(aLng, aLat, endLng, endLat)) return [{lng: wrapLng(endLng), lat: endLat}];

    const gLng = cellLng(goal % SEA_W), gLat = cellLat((goal / SEA_W) | 0);
    // Float64 is load-bearing: with float32 storage a double-precision ng can
    // land epsilon-below the rounded stored g, "improve" it by nothing, and
    // re-push the same cells forever.
    const g = new Float64Array(SEA_W * SEA_H).fill(Infinity);
    const from = new Int32Array(SEA_W * SEA_H).fill(-1);
    const done = new Uint8Array(SEA_W * SEA_H);
    const heap = [start], f = new Float64Array(SEA_W * SEA_H);
    g[start] = 0;
    f[start] = havKm(cellLng(start % SEA_W), cellLat((start / SEA_W) | 0), gLng, gLat);
    const up = (i) => {
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (f[heap[p]] <= f[heap[i]]) break;
            [heap[p], heap[i]] = [heap[i], heap[p]];
            i = p;
        }
    };
    const down = () => {
        let i = 0;
        for (; ;) {
            const l = 2 * i + 1, rr = l + 1;
            let m = i;
            if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l;
            if (rr < heap.length && f[heap[rr]] < f[heap[m]]) m = rr;
            if (m === i) break;
            [heap[m], heap[i]] = [heap[i], heap[m]];
            i = m;
        }
    };
    let found = false;
    while (heap.length) {
        const cur = heap[0];
        if (cur === goal) {
            found = true;
            break;
        }
        const last = heap.pop();
        if (heap.length) {
            heap[0] = last;
            down();
        }
        if (done[cur]) continue; // stale duplicate entry
        done[cur] = 1;
        const r = (cur / SEA_W) | 0, c = cur % SEA_W;
        const lng = cellLng(c), lat = cellLat(r);
        for (const [dr, dc] of DIRS) {
            const nr = r + dr;
            if (nr < 0 || nr >= SEA_H) continue;
            const nc = (((c + dc) % SEA_W) + SEA_W) % SEA_W;
            if (!ok(nr, nc)) continue;
            // No slipping diagonally between two touching blocked corners.
            if (dr && dc && !ok(r, nc) && !ok(nr, c)) continue;
            const ni = nr * SEA_W + nc;
            const ng = g[cur] + havKm(lng, lat, cellLng(nc), cellLat(nr)) + (cellCost ? cellCost(nr, nc) : 0);
            if (ng >= g[ni]) continue;
            g[ni] = ng;
            from[ni] = cur;
            f[ni] = ng + havKm(cellLng(nc), cellLat(nr), gLng, gLat);
            heap.push(ni);
            up(heap.length - 1);
        }
    }
    if (!found) return null;

    const cells = [];
    for (let i = goal; i >= 0; i = from[i]) cells.push(i);
    cells.reverse();
    const pts = cells.map((i) => [cellLng(i % SEA_W), cellLat((i / SEA_W) | 0)]);
    pts[pts.length - 1] = [endLng, endLat];

    // Greedy string-pull: from each kept point, jump to the farthest later point
    // still on clear terrain. First hop starts at the unit itself.
    const route = [];
    let curPt = [aLng, aLat], i = 0;
    while (i < pts.length - 1) {
        let j = pts.length - 1;
        while (j > i + 1 && !clear(curPt[0], curPt[1], pts[j][0], pts[j][1])) j--;
        curPt = pts[j];
        route.push({lng: wrapLng(curPt[0]), lat: curPt[1]});
        i = j;
    }
    if (!route.length || route[route.length - 1].lng !== wrapLng(endLng) || route[route.length - 1].lat !== endLat) {
        route.push({lng: wrapLng(endLng), lat: endLat});
    }
    return route;
}

// Soft berth charged for entering another ship's cell / its immediate neighbours,
// so a route threads around a knot of ships instead of ploughing through it. Like
// the coast cost it only nudges — nothing is blocked, so a ship can still close on
// or arrive amid a group when that's where it's headed.
const SHIP_COST = 22, SHIP_COST_ADJ = 9;

// Build a per-cell berth-cost map from the positions to keep clear of. Overlapping
// berths take the max rather than stacking, so a dense cluster stays a gentle nudge.
function berthCosts(avoid) {
    if (!avoid?.length) return null;
    const m = new Map();
    const bump = (r, c, km) => {
        const i = r * SEA_W + c;
        if ((m.get(i) || 0) < km) m.set(i, km);
    };
    for (const p of avoid) {
        const r0 = rowOf(p.lat), c0 = colOf(p.lng);
        bump(r0, c0, SHIP_COST);
        for (const [dr, dc] of DIRS) {
            const nr = r0 + dr;
            if (nr < 0 || nr >= SEA_H) continue;
            bump(nr, (((c0 + dc) % SEA_W) + SEA_W) % SEA_W, SHIP_COST_ADJ);
        }
    }
    return m;
}

// The straight-line test the sea router uses for both the direct-shortcut and the
// smoother: walkable the whole way, never brushing the immediate coast (band 1),
// and never cutting through a ship berth. That keeps string-pulling (and the initial
// shortcut) from yanking a hop back against the shore or straight through a cluster
// that A* deliberately skirted. Where a tight passage or a wall of ships leaves no
// clear straight line the smoother falls back to stepping cell-by-cell — still as
// far off the coast, and around the berths, as A* could manage.
function seaClear(l1, la1, l2, la2, berths) {
    let dLng = wrapLng(l2 - l1);
    const dLat = la2 - la1;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dLng), Math.abs(dLat)) / (STEP / 2)));
    for (let i = 0; i <= n; i++) {
        const lng = wrapLng(l1 + (dLng * i) / n), lat = la1 + (dLat * i) / n;
        const r = rowOf(lat), c = colOf(lng);
        if (!seaCell(r, c) || coastBandAt(r, c) === 1) return false;
        if (berths && berths.has(r * SEA_W + c)) return false;
    }
    return true;
}

// Naval routing over navigable water — ships path around land, prefer to stand off
// the coast, and give a berth to the ships in `opts.avoid` (a list of {lng,lat} to
// route around). Both preferences are soft: a course still hugs the shore or passes
// close aboard other ships when that is the only way through.
export function seaRoute(aLng, aLat, bLng, bLat, opts) {
    const berths = berthCosts(opts?.avoid);
    const cellCost = berths
        ? (r, c) => coastCostAt(r, c) + (berths.get(r * SEA_W + c) || 0)
        : coastCostAt;
    return gridRoute(aLng, aLat, bLng, bLat, seaCell, {cellCost, clear: (l1, la1, l2, la2) => seaClear(l1, la1, l2, la2, berths)});
}

// Ground routing over land — armies path around oceans (and cross non-navigable
// inland water, which the mask reads as terrain).
export function landRoute(aLng, aLat, bLng, bLat) {
    return gridRoute(aLng, aLat, bLng, bLat, landCell);
}
