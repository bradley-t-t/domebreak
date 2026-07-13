import {useEffect, useLayoutEffect, useMemo, useRef} from "react";
import {trackPoint, WARHEADS} from "../../game/engine.js";
import {screenHeadingDeg, unwrapLng} from "../../lib/geo.js";
import {clamp, clamp01} from "../../lib/math.js";

// Renders missiles/interceptors and their contrails in SCREEN space with a
// ballistic altitude baked into every point, so the trail arcs up off the
// ground track (correct in globe + flat) and the sprite pitches with the arc.
//
// Positioning is IMPERATIVE and frame-locked to the map. React only owns the
// *set* of sprites (a keyed <div> per projectile/interceptor, mounted/unmounted
// as they spawn and die at sim-tick rate); it never repositions them. Every
// frame the map paints, MapLibre's `render` event drives update(), which
// re-projects each sprite and writes its transform directly, and redraws all
// contrails on a single <canvas>. That keeps the sprites glued to the terrain
// during a WASD pan — repositioning through React would land one rAF behind the
// map's own render loop, and reconciling every head div per frame is the lag.
// A commit-time layout effect covers the other case: the sim advancing a
// missile while the map itself is still — but it stands down whenever a map
// render already painted this frame, so pan + tick never run update() twice
// per frame (see PAINT_FRESH_MS).
//
// The other frame-rate battle is the geometry itself. A projectile's ground
// track is FIXED at launch (from → to, spread lane included), so its
// great-circle math is computed ONCE into a cached polyline and every frame
// just lerps + projects cached points — recomputing ~21 trackPoint calls per
// missile per frame (each a chain of spherical trig) was the bulk of the
// camera-move lag in a saturation attack.

// Peak sprite lift per launch-platform type: how tall the trail's altitude arc
// reads on screen. Orbital-strike rounds fall out of the sky — their platform is
// literally in orbit — so they read biggest here.
const ALT = {silo: 92, launcher: 48, hypersonicbty: 26, orbitalstrike: 140, "sub-ssbn": 88, "sub-ssn": 60};
const SAMPLES = 20;
const SUB_SAMPLES = 8;               // MIRV sub-warheads dive short lanes — fewer points
const INT_SAMPLES = 10;              // interceptor trails are short — fewer points
// Cached ground-track resolution: the fixed great circle is sampled once at
// this many segments and every frame interpolates between neighbours. 1/32 of
// a flight leg is far below a pixel of curvature error at any playable zoom.
const TRACK_N = 32;
// A commit-time update is skipped when a map render painted within this window
// (the map is animating and will repaint with fresh data shortly anyway).
// Sized above the slowest continuous paint source — the ocean shimmer's 28fps
// (~36ms) repaint loop — so during normal play the render path alone drives the
// sky and commits stand down; below the ~66ms of two missed sim commits, so if
// painting ever stops (reduced-motion, hidden tab) commits take over within a
// frame or two.
const PAINT_FRESH_MS = 40;
// Past this many live trails the wide vapor pass is dropped (bright core keeps
// full fidelity) — halves canvas raster work exactly when a saturation salvo
// needs it, invisibly below it.
const VAPOR_LOD_TRAILS = 140;
// Interceptor contrail tint per firing battery. Same plume treatment as the
// missiles (see drawTrail), just thinner and in the battery's own colour so a
// defender's shots read apart from the ICBMs they chase.
const INT_TRAIL = {thaad: "#a9ecff", cram: "#ffd24a", "": "#8dffbf"};
const INT_TRAIL_W = 1.6;
// Sprite/trail variant per firing battery type. Most defenses share the default
// green dart; these read apart — THAAD's cyan exo-dart, the C-RAM's amber gun
// tracer, and the laser (drawn as a beam below, so it gets no dart sprite).
const INT_VARIANT = {thaad: "thaad", cram: "cram", laser: "laser"};
const intVariant = (t) => INT_VARIANT[t] || "";
// Directed-energy beam palette: a white-hot core inside a searing red-orange
// bolt, unmistakable against the green/cyan interceptors.
const BEAM_CORE = "#fff2ec";
const BEAM_GLOW = "#ff4d2e";

// #rgb / #rrggbb -> "rgba(r,g,b,a)". Trail colors in the warhead registry are
// all 6-digit hex; the 3-digit branch is just belt-and-suspenders.
function rgba(hex, a) {
    let h = hex.replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// One projectile's full ground track as an unwrapped polyline, sampled at
// TRACK_N+1 fixed fractions. Longitudes are unwrapped against their neighbour
// as they're generated, so a pole- or dateline-crossing track stays continuous
// and per-frame consumers never re-derive continuity. The entry carries the
// geometry inputs it was built from: in an ONLINE match the client's prediction
// ticks can mint a projectile id (a locally-simulated MIRV split) that the next
// authoritative snapshot reassigns to a different-geometry projectile — an
// id-only cache would then draw the stale lane for the rest of the flight, so
// trackFor revalidates five fields per lookup (cheap) and rebuilds on mismatch.
function buildTrack(p) {
    const arr = new Float64Array((TRACK_N + 1) * 2);
    let prev = null;
    for (let i = 0; i <= TRACK_N; i++) {
        const g = trackPoint(p, i / TRACK_N);
        const lng = prev == null ? g[0] : unwrapLng(g[0], prev);
        prev = lng;
        arr[i * 2] = lng;
        arr[i * 2 + 1] = g[1];
    }
    return {fromLng: p.fromLng, fromLat: p.fromLat, toLng: p.toLng, toLat: p.toLat, spreadKm: p.spreadKm || 0, arr};
}

function trackFor(tracks, p) {
    let t = tracks.get(p.id);
    if (!t || t.fromLng !== p.fromLng || t.fromLat !== p.fromLat || t.toLng !== p.toLng
        || t.toLat !== p.toLat || t.spreadKm !== (p.spreadKm || 0)) {
        tracks.set(p.id, t = buildTrack(p));
    }
    return t.arr;
}

// Ground point at flight fraction f from a cached track: linear interpolation
// between the two neighbouring samples.
function sampleTrack(track, f) {
    const t = clamp01(f) * TRACK_N;
    const i = Math.min(TRACK_N - 1, Math.floor(t));
    const r = t - i;
    const j = i * 2;
    return [track[j] + (track[j + 2] - track[j]) * r, track[j + 1] + (track[j + 3] - track[j + 1]) * r];
}

// Draw one trail: pts is an array of [x,y] screen points (CSS px) with `null`
// entries marking gaps where the ground track dips behind the globe. Each
// contiguous run is stroked twice — a wide low-alpha vapor body, then a thin
// bright core — under a linear gradient that fades the oldest (tail) end to
// nothing so the plume looks like it's dissipating behind the vehicle.
// Runs that never enter the (padded) canvas rect are skipped — the projection
// work is already done, but the raster fill is the expensive half at Retina
// pixel densities. `vapor` toggles the wide pass (see VAPOR_LOD_TRAILS).
function drawTrail(ctx, pts, color, width, cw, ch, vapor) {
    let run = [];
    let visible = false;
    const flush = () => {
        if (run.length >= 2 && visible) {
            const a = run[0], b = run[run.length - 1];
            const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
            g.addColorStop(0, rgba(color, 0));
            g.addColorStop(0.55, rgba(color, 0.2));
            g.addColorStop(1, rgba(color, 0.82));
            ctx.strokeStyle = g;
            ctx.lineJoin = "round";
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(run[0][0], run[0][1]);
            for (let i = 1; i < run.length; i++) ctx.lineTo(run[i][0], run[i][1]);
            if (vapor) {
                ctx.globalAlpha = 0.5;           // wide diffuse vapor
                ctx.lineWidth = width * 2.4;
                ctx.stroke();
            }
            ctx.globalAlpha = 0.92;          // bright core (same path)
            ctx.lineWidth = Math.max(0.8, width * 0.8);
            ctx.stroke();
        }
        run = [];
        visible = false;
    };
    // Visibility is judged per SEGMENT (AABB overlap with the padded rect), not
    // per point: at max zoom a long trail's samples can be >1600px apart, so a
    // segment can cross the whole viewport with both endpoints outside it — a
    // point-only test blanked exactly those trails.
    let prev = null;
    for (const p of pts) {
        if (!p) {
            flush();
            prev = null;
            continue;
        }
        if (!visible && prev) {
            if (Math.min(prev[0], p[0]) < cw + 60 && Math.max(prev[0], p[0]) > -60
                && Math.min(prev[1], p[1]) < ch + 60 && Math.max(prev[1], p[1]) > -60) visible = true;
        } else if (!visible && p[0] > -60 && p[0] < cw + 60 && p[1] > -60 && p[1] < ch + 60) visible = true;
        run.push(p);
        prev = p;
    }
    flush();
}

// Trail points + head pose for one projectile, in screen space with ballistic
// lift, sampled from the projectile's cached ground track. Mirrors the
// interceptor math below. Fresh short trails (and MIRV subs, whose dive lanes
// are short) carry fewer samples — the arc they describe can't use more.
// `refLng` anchors the whole (internally continuous) track to the viewport's
// world copy: a trans-dateline strike unwrapped from its LAUNCH side projects a
// full 360° of mercator to the side of the defender's view — the missile and
// its contrail simply invisible to the player being hit.
function projGeom(p, track, project, occluded, refLng) {
    const alt = ALT[p.type] || 60;
    const lift = (f) => (p.altStart != null ? p.altStart * (1 - f) : Math.sin(f * Math.PI));
    const shift = 360 * Math.round((refLng - sampleTrack(track, p.progress)[0]) / 360);
    // `exact` computes the true trackPoint instead of the cached lerp. The head
    // uses it: the cached polyline can drift ~30 km off the great circle near a
    // polar apex, and the engine resolves intercepts/impacts against the TRUE
    // p.lng/p.lat — an interceptor must not visibly detonate beside the sprite
    // it killed. One exact call per projectile per frame; the trail keeps the
    // cheap cache (its sub-pixel-to-few-px sag is invisible in a fading plume).
    const screenAt = (f, exact) => {
        let lng, lat;
        if (exact) {
            const g = trackPoint(p, f);
            lng = unwrapLng(g[0], sampleTrack(track, f)[0]) + shift; // pin to the cached frame's world copy
            lat = g[1];
        } else {
            const g = sampleTrack(track, f);
            lng = g[0] + shift;
            lat = g[1];
        }
        if (occluded(lng, lat)) return null; // far side of the globe
        const [x, y] = project(lng, lat);
        return [x, y - lift(f) * alt];
    };
    const cap = p.sub ? SUB_SAMPLES : SAMPLES;
    const n = clamp(Math.round(SAMPLES * p.progress * 2), 5, cap);
    const pts = [];
    for (let i = 0; i < n; i++) pts.push(screenAt((p.progress * i) / n));
    pts.push(screenAt(p.progress, true)); // trail tip joins the exact head
    const head = pts[pts.length - 1];
    let deg = 0;
    if (head) {
        // Nose heading from an explicit behind-point on the actual flown track, so
        // the sprite faces its direction of travel in both flat and globe modes.
        const back = screenAt(Math.max(0, p.progress - 0.03));
        const fwd = back && Math.hypot(head[0] - back[0], head[1] - back[1]) > 0.4 ? null
            : screenAt(Math.min(1, p.progress + 0.03)); // launch instant: aim at the next step instead
        const ref = fwd || back || head;
        const dx = fwd ? ref[0] - head[0] : head[0] - ref[0];
        const dy = fwd ? ref[1] - head[1] : head[1] - ref[1];
        deg = screenHeadingDeg(dx, dy);
    }
    return {pts, head: head || null, deg};
}

// Trail points + head pose for one interceptor, mirroring projGeom's screen-space
// treatment. Unlike a ballistic round (which arcs up and back down), the
// interceptor climbs from its battery on the ground toward the target's altitude,
// so its contrail lifts monotonically to the nose. The straight lng/lat chord
// matches the engine's own linear stepping (stepInterceptors), so the drawn
// plume is the flown path. Heading comes from the round's own last step
// (it.pLng/pLat), so the nose faces its true direction of travel and never
// snaps 180 at the terminal merge the way aiming at a stale lead point did.
function intGeom(it, project, occluded, refLng) {
    const clng = unwrapLng(it.lng, it.fromLng);
    // Anchor the whole leg (continuous in the launch battery's frame) to the
    // viewport's world copy — see projGeom's refLng note.
    const shift = 360 * Math.round((refLng - clng) / 360);
    const lift = (it.altNorm || 0) * 72;
    const screenAt = (f) => {
        const lng = it.fromLng + (clng - it.fromLng) * f + shift;
        const lat = it.fromLat + (it.lat - it.fromLat) * f;
        if (occluded(lng, lat)) return null; // far side of the globe
        const [x, y] = project(lng, lat);
        return [x, y - lift * f];
    };
    const pts = [];
    for (let i = 0; i <= INT_SAMPLES; i++) pts.push(screenAt(i / INT_SAMPLES));
    const head = pts[pts.length - 1];
    let deg = 0;
    if (head) {
        if (it.pLng != null) {
            // Face the direction actually flown this tick. Subtracting the same lift
            // from the back point cancels it, so the nose tracks the ground heading.
            const plng = unwrapLng(it.pLng, it.fromLng) + shift;
            const [bx, by] = project(plng, it.pLat);
            deg = screenHeadingDeg(head[0] - bx, head[1] - (by - lift));
        } else {
            // Launch instant, before any previous fix: aim at the lead point ahead.
            const tlng = unwrapLng(it.toLng, it.fromLng) + shift;
            const [tx, ty] = project(tlng, it.toLat);
            deg = screenHeadingDeg(tx - head[0], (ty - lift) - head[1]);
        }
    }
    return {pts, head: head || null, deg};
}

// The two screen endpoints of a laser beam: the emitter on the ground and the
// point it's burning, lifted to the target's altitude. Mirrors intGeom's
// unwrap/shift so a dateline- or pole-crossing shot pins to the right world copy.
function beamGeom(it, project, occluded, refLng) {
    const tlng0 = unwrapLng(it.toLng, it.fromLng);
    const shift = 360 * Math.round((refLng - tlng0) / 360);
    const flng = it.fromLng + shift;
    const tlng = tlng0 + shift;
    if (occluded(flng, it.fromLat) || occluded(tlng, it.toLat)) return null; // over the horizon
    const [ax, ay] = project(flng, it.fromLat);
    const [bx, by] = project(tlng, it.toLat);
    return {a: [ax, ay], b: [bx, by - (it.tgtAlt || 0) * 72]};
}

// A laser bolt: three stacked strokes (wide glow, mid bolt, white-hot core) plus
// an emitter flare at the battery, with a gentle energy flicker. Cosmetic layer,
// so wall-clock time for the flicker is fine.
function drawBeam(ctx, a, b, now) {
    const flick = 0.82 + 0.18 * Math.sin(now * 0.05);
    ctx.save();
    ctx.setLineDash([]);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.strokeStyle = rgba(BEAM_GLOW, 0.26 * flick);
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.strokeStyle = rgba(BEAM_GLOW, 0.85 * flick);
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = rgba(BEAM_CORE, 0.95);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(a[0], a[1], 4.5 * flick, 0, Math.PI * 2);
    ctx.fillStyle = rgba(BEAM_GLOW, 0.5);
    ctx.fill();
    ctx.restore();
}

// A C-RAM gun tracer: bright amber dashes streaming along the flight path, the
// dash offset scrolling toward the target so the stream reads as a burst of
// rounds. `pts` may carry null gaps where the track dips behind the globe.
function drawTracer(ctx, pts, now) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.setLineDash([3.5, 5]);
    ctx.lineDashOffset = -(now * 0.35) % 12;
    let run = [];
    const flush = () => {
        if (run.length >= 2) {
            ctx.beginPath();
            ctx.moveTo(run[0][0], run[0][1]);
            for (let i = 1; i < run.length; i++) ctx.lineTo(run[i][0], run[i][1]);
            ctx.strokeStyle = rgba(INT_TRAIL.cram, 0.32);
            ctx.lineWidth = 3.4;
            ctx.stroke();
            ctx.strokeStyle = rgba("#fff3c4", 0.95);
            ctx.lineWidth = 1.3;
            ctx.stroke();
        }
        run = [];
    };
    for (const p of pts) {
        if (!p) flush();
        else run.push(p);
    }
    flush();
    ctx.restore();
}

// Sprite placement is transform-only: writing left/top would invalidate layout
// for every sprite every frame (hundreds of reflows at 60fps in a salvo);
// translate() rides the compositor with the will-change hint instead. Writes
// are deduped against the element's last-applied values so a static scene
// costs zero style mutations.
function place(el, head, deg, extra) {
    if (!el) return;
    if (!head) {
        if (el._skyShown !== false) {
            el._skyShown = false;
            el.style.display = "none";
        }
        return;
    }
    if (el._skyShown !== true) {
        el._skyShown = true;
        el.style.display = "";
    }
    const t = `translate(${head[0]}px,${head[1]}px) translate(-50%,-50%) rotate(${deg}deg)${extra}`;
    if (el._skyT !== t) {
        el._skyT = t;
        el.style.transform = t;
    }
}

// One frame of work: project every live projectile/interceptor, write sprite
// transforms directly, and redraw all contrails on the canvas. Pure imperative —
// no React involved, so it runs at the map's paint rate with no reconciliation.
function update(map, data, canvas, els, tracks) {
    if (!map || !data || !canvas) return;
    const {projectiles, interceptors, aircraft} = data;
    // Read the container size BEFORE any style writes: reading clientWidth after
    // writing sprite styles forced a synchronous reflow inside every frame.
    const c = map.getContainer();
    const w = c.clientWidth, hgt = c.clientHeight, dpr = window.devicePixelRatio || 1;
    // Anchor longitude unwrapping to the camera's world copy (see projGeom).
    const refLng = map.getCenter().lng;
    const project = (lng, lat) => {
        // Safety net: map.project() throws on |lat|>90 or non-finite input, and a
        // throw here runs inside a layout effect — it would crash the entire match
        // view (the MATCH ERROR boundary). Sanitize so a degenerate coordinate only
        // mis-places one sprite for a frame instead of taking the match down.
        const sLat = clamp(lat, -90, 90) || 0;
        const sLng = Number.isFinite(lng) ? lng : 0;
        const p = map.project([sLng, sLat]);
        return [p.x, p.y];
    };
    // Occlusion only exists on the globe: hoist the capability test out of the
    // per-point path so flat view pays nothing, and one try/catch guards the
    // whole frame instead of every sample.
    const t = map.transform;
    const canOcclude = !!t && typeof t.isLocationOccluded === "function";
    const occluded = canOcclude
        ? (lng, lat) => {
            try {
                return t.isLocationOccluded({lng, lat});
            } catch {
                return false;
            }
        }
        : () => false;

    const trails = [];
    for (const p of projectiles) {
        const wh = WARHEADS[p.warhead] || WARHEADS.standard;
        // Ground track is immutable per projectile id in solo play; trackFor
        // revalidates the geometry for the online prediction/snapshot case.
        const track = trackFor(tracks, p);
        const {pts, head, deg} = projGeom(p, track, project, occluded, refLng);
        // Aircraft-launched ordnance reads apart from strategic missiles: a lean
        // pale-blue streak for an air-to-air missile, a short amber arc for a bomb.
        const muniTrail = p.muni === "a2a" ? {color: "#bfe6ff", width: 1.5}
            : p.muni === "bomb" ? {color: "#ffb454", width: 2} : null;
        trails.push({
            pts,
            color: muniTrail?.color ?? wh.trail ?? "#e3e7ec",
            width: muniTrail?.width ?? (p.sub ? 1.3 : (wh.trailW || 2.4))
        });
        place(els.get("p" + p.id), head, deg, p.sub ? " scale(0.6)" : (p.muni ? " scale(0.8)" : ""));
    }
    // Evict tracks for projectiles that no longer exist. Sized checks keep this
    // O(1) until the cache actually outgrows the live set.
    if (tracks.size > projectiles.length * 2 + 64) {
        const live = new Set();
        for (const p of projectiles) live.add(p.id);
        for (const id of tracks.keys()) if (!live.has(id)) tracks.delete(id);
    }
    for (const a of aircraft || []) {
        const pts = [];
        // Unwrap the recorded trail against its neighbours: a raw dateline
        // crossing (+179 -> -179) would otherwise project a screen-wide streak.
        // The first point anchors to the viewport's world copy (refLng).
        let prev = refLng;
        for (const [lng0, lat, al] of [...(a.trail || []), [a.lng, a.lat, a.alt || 0]]) {
            const lng = unwrapLng(lng0, prev);
            prev = lng;
            if (occluded(lng, lat)) {
                pts.push(null);
                continue;
            }
            const [x, y] = project(lng, lat);
            pts.push([x, y - (al || 0) * 30]);
        }
        if (pts.length > 1) trails.push({pts, color: "#dfe4ea", width: 1});
    }
    const beams = [], tracers = [];
    for (const it of interceptors) {
        const variant = intVariant(it.srcType);
        if (variant === "laser") {
            const seg = beamGeom(it, project, occluded, refLng);
            if (seg) beams.push(seg);
            continue; // the beam is the whole visual — no dart, no contrail
        }
        const {pts, head, deg} = intGeom(it, project, occluded, refLng);
        if (variant === "cram") tracers.push(pts);
        else trails.push({pts, color: INT_TRAIL[variant] || INT_TRAIL[""], width: INT_TRAIL_W});
        place(els.get("i" + it.id), head, deg, "");
    }

    const pw = Math.round(w * dpr), ph = Math.round(hgt * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
        canvas.style.width = w + "px";
        canvas.style.height = hgt + "px";
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pw, ph);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS px; widths in CSS px
    const vapor = trails.length <= VAPOR_LOD_TRAILS;
    for (const tr of trails) drawTrail(ctx, tr.pts, tr.color, tr.width, w, hgt, vapor);
    const now = performance.now();
    for (const pts of tracers) drawTracer(ctx, pts, now);
    for (const b of beams) drawBeam(ctx, b.a, b.b, now); // beams sit on top of the plumes
}

export default function SkyLayer({map, projectiles, interceptors, aircraft}) {
    const canvasRef = useRef(null);
    const elsRef = useRef(new Map());        // sprite id -> wrapper <div>
    const dataRef = useRef(null);            // latest committed projectiles/interceptors/aircraft
    const tracksRef = useRef(new Map());     // projectile id -> cached ground-track polyline
    const lastPaintRef = useRef(0);          // when a map-render-driven update last ran

    // Stable ref-callbacks that register/unregister each sprite's wrapper node as
    // React mounts/unmounts it. Memoized per id so the node isn't detached and
    // re-attached on every commit.
    const refFor = useRef(new Map());
    const setRef = (id) => {
        let cb = refFor.current.get(id);
        if (!cb) {
            cb = (el) => {
                if (el) elsRef.current.set(id, el);
                else {
                    // Sprite ids are monotonic and never remount after death, so
                    // the memoized callback can go with the node — otherwise a
                    // long match accretes one closure per sprite ever flown.
                    elsRef.current.delete(id);
                    refFor.current.delete(id);
                }
            };
            refFor.current.set(id, cb);
        }
        return cb;
    };

    // The sprite node set. Rebuilt only when the *signature* (ids + warhead/kind)
    // changes — not when positions change — so ticks that only move existing
    // missiles don't reconcile the whole layer. Positions are written imperatively
    // by update(); nothing position-dependent lives in this JSX.
    const sig = projectiles.map((p) => `p${p.id}:${WARHEADS[p.warhead] ? p.warhead : "standard"}:${p.sub ? 1 : 0}:${p.muni || ""}`).join("|")
        + "#" + interceptors.map((it) => `i${it.id}:${intVariant(it.srcType)}`).join("|");
    const heads = useMemo(() => {
        const nodes = [];
        for (const p of projectiles) {
            const warhead = WARHEADS[p.warhead] ? p.warhead : "standard";
            nodes.push(
                <div key={"p" + p.id} ref={setRef("p" + p.id)}
                     className={`absolute left-0 top-0 pointer-events-none z-3 will-change-transform ${p.sub ? "sub" : ""}`}
                     style={{["--flame"]: (WARHEADS[warhead] || WARHEADS.standard).flame}}>
                    <div className={`db-missile ${warhead}${p.muni ? " db-muni-" + p.muni : ""}`}><span className="db-missile-glow"/><span
                        className="db-missile-body"/><span className="db-missile-flame"/></div>
                </div>
            );
        }
        for (const it of interceptors) {
            const variant = intVariant(it.srcType);
            if (variant === "laser") continue; // the beam is canvas-drawn — no dart sprite
            nodes.push(
                <div key={"i" + it.id} ref={setRef("i" + it.id)}
                     className="absolute left-0 top-0 pointer-events-none z-3 will-change-transform">
                    <div className={`db-interceptor ${variant}`}><span className="db-int-body"/><span
                        className="db-int-flame"/>{variant === "thaad" && <span className="db-int-spark"/>}</div>
                </div>
            );
        }
        return nodes;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sig]);

    // Frame-lock the imperative update to the map's own paint loop.
    useEffect(() => {
        if (!map) return;
        const h = () => {
            lastPaintRef.current = performance.now();
            update(map, dataRef.current, canvasRef.current, elsRef.current, tracksRef.current);
        };
        map.on("render", h);
        return () => {
            try {
                map.off("render", h);
            } catch { /* map gone */
            }
        };
    }, [map]);

    // Reposition on every commit too, so a sim tick that moves a missile while the
    // map is static still updates the sprites (the map fires no `render` then).
    // Skipped while the map is actively painting: the render handler above already
    // ran this frame and will run again next frame with the data set here —
    // running both doubled every cost exactly when the camera was moving.
    useLayoutEffect(() => {
        dataRef.current = {projectiles, interceptors, aircraft};
        if (performance.now() - lastPaintRef.current > PAINT_FRESH_MS) {
            update(map, dataRef.current, canvasRef.current, elsRef.current, tracksRef.current);
        }
    });

    if (!map) return null;
    return (
        <>
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-2"/>
            {heads}
        </>
    );
}
