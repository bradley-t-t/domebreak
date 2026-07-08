import {useEffect, useLayoutEffect, useMemo, useRef} from "react";
import {occludedByGlobe} from "../../game/geo/geo.js";
import {trackPoint, WARHEADS} from "../../game/engine.js";

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
// during a WASD pan — the old code re-rendered React one rAF *behind* the map's
// own render loop, so sprites swam a frame behind the ground and reconciling
// every head div per frame was the lag. A commit-time layout effect covers the
// other case: the sim advancing a missile while the map itself is still.
const ALT = {silo: 92, launcher: 48, hypersonicbty: 26};
const SAMPLES = 20;

// #rgb / #rrggbb -> "rgba(r,g,b,a)". Trail colors in the warhead registry are
// all 6-digit hex; the 3-digit branch is just belt-and-suspenders.
function rgba(hex, a) {
    let h = hex.replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Draw one trail: pts is an array of [x,y] screen points (CSS px) with `null`
// entries marking gaps where the ground track dips behind the globe. Each
// contiguous run is stroked twice — a wide low-alpha vapor body, then a thin
// bright core — under a linear gradient that fades the oldest (tail) end to
// nothing so the plume looks like it's dissipating behind the vehicle.
function drawTrail(ctx, pts, color, width) {
    let run = [];
    const flush = () => {
        if (run.length >= 2) {
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
            ctx.globalAlpha = 0.5;           // wide diffuse vapor
            ctx.lineWidth = width * 2.4;
            ctx.stroke();
            ctx.globalAlpha = 0.92;          // bright core (same path)
            ctx.lineWidth = Math.max(0.8, width * 0.8);
            ctx.stroke();
        }
        run = [];
    };
    for (const p of pts) {
        if (!p) flush(); else run.push(p);
    }
    flush();
}

// Trail points + head pose for one projectile, in screen space with ballistic
// lift. Returns {pts, head:[x,y]|null, deg}. Mirrors the interceptor math below.
function projGeom(map, p, project) {
    const alt = ALT[p.type] || 60;
    const lift = (f) => (p.altStart != null ? p.altStart * (1 - f) : Math.sin(f * Math.PI));
    let prevLng = null;
    const screenAt = (f) => {
        const g = trackPoint(p, f);
        let lng = g[0];
        if (prevLng !== null) {
            while (lng - prevLng > 180) lng -= 360;
            while (lng - prevLng < -180) lng += 360;
        }
        prevLng = lng;
        if (occludedByGlobe(map, lng, g[1])) return null; // far side of the globe
        const [x, y] = project(lng, g[1]);
        return [x, y - lift(f) * alt];
    };
    const pts = [];
    for (let i = 0; i <= SAMPLES; i++) pts.push(screenAt((p.progress * i) / SAMPLES));
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
        deg = (dx || dy) ? (Math.atan2(dx, -dy) * 180) / Math.PI : 0;
    }
    return {pts, head: head || null, deg};
}

function intGeom(map, it, projById, project) {
    let clng = it.lng;
    while (clng - it.fromLng > 180) clng -= 360;
    while (clng - it.fromLng < -180) clng += 360;
    if (occludedByGlobe(map, clng, it.lat)) return {head: null, deg: 0};
    const [xc, yc] = project(clng, it.lat);
    const head = [xc, yc - (it.altNorm || 0) * 72];
    // Aim the nose at the live target's on-screen position — its actual direction
    // of travel this instant (a chord back to the launch site diverges once the
    // globe projection curves the path).
    const tgt = projById.get(it.targetId);
    let tlng = it.toLng;
    while (tlng - clng > 180) tlng -= 360;
    while (tlng - clng < -180) tlng += 360;
    const [xt, yt] = project(tlng, it.toLat);
    const tgtLift = tgt ? (ALT[tgt.type] || 60) * (tgt.altNorm || 0) : (it.altNorm || 0) * 72;
    const dx = xt - head[0], dy = (yt - tgtLift) - head[1];
    const deg = (dx || dy) ? (Math.atan2(dx, -dy) * 180) / Math.PI : 0;
    return {head, deg};
}

function place(el, head, deg, extra) {
    if (!el) return;
    if (!head) {
        el.style.display = "none";
        return;
    }
    el.style.display = "";
    el.style.left = head[0] + "px";
    el.style.top = head[1] + "px";
    el.style.transform = `translate(-50%,-50%) rotate(${deg}deg)${extra}`;
}

// One frame of work: project every live projectile/interceptor, write sprite
// transforms directly, and redraw all contrails on the canvas. Pure imperative —
// no React involved, so it runs at the map's paint rate with no reconciliation.
function update(map, data, canvas, els) {
    if (!map || !data || !canvas) return;
    const {projectiles, interceptors, aircraft} = data;
    const project = (lng, lat) => {
        // Safety net: map.project() throws on |lat|>90 or non-finite input, and a
        // throw here runs inside a layout effect — it would crash the entire match
        // view (the MATCH ERROR boundary). Sanitize so a degenerate coordinate only
        // mis-places one sprite for a frame instead of taking the match down.
        const sLat = Math.max(-90, Math.min(90, lat)) || 0;
        const sLng = Number.isFinite(lng) ? lng : 0;
        const p = map.project([sLng, sLat]);
        return [p.x, p.y];
    };
    const trails = [];
    for (const p of projectiles) {
        const wh = WARHEADS[p.warhead] || WARHEADS.standard;
        const {pts, head, deg} = projGeom(map, p, project);
        trails.push({pts, color: wh.trail || "#e3e7ec", width: p.sub ? 1.3 : (wh.trailW || 2.4)});
        place(els.get("p" + p.id), head, deg, p.sub ? " scale(0.6)" : "");
    }
    for (const a of aircraft || []) {
        const pts = [];
        for (const [lng, lat, al] of [...(a.trail || []), [a.lng, a.lat, a.alt || 0]]) {
            if (occludedByGlobe(map, lng, lat)) {
                pts.push(null);
                continue;
            }
            const [x, y] = project(lng, lat);
            pts.push([x, y - (al || 0) * 30]);
        }
        if (pts.length > 1) trails.push({pts, color: "#dfe4ea", width: 1});
    }
    const projById = new Map(projectiles.map((p) => [p.id, p]));
    for (const it of interceptors) {
        const {head, deg} = intGeom(map, it, projById, project);
        place(els.get("i" + it.id), head, deg, "");
    }

    const c = map.getContainer();
    const w = c.clientWidth, hgt = c.clientHeight, dpr = window.devicePixelRatio || 1;
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
    for (const t of trails) drawTrail(ctx, t.pts, t.color, t.width);
}

export default function SkyLayer({map, projectiles, interceptors, aircraft}) {
    const canvasRef = useRef(null);
    const elsRef = useRef(new Map());        // sprite id -> wrapper <div>
    const dataRef = useRef(null);            // latest committed projectiles/interceptors/aircraft

    // Stable ref-callbacks that register/unregister each sprite's wrapper node as
    // React mounts/unmounts it. Memoized per id so the node isn't detached and
    // re-attached on every commit.
    const refFor = useRef(new Map());
    const setRef = (id) => {
        let cb = refFor.current.get(id);
        if (!cb) {
            cb = (el) => {
                if (el) elsRef.current.set(id, el); else elsRef.current.delete(id);
            };
            refFor.current.set(id, cb);
        }
        return cb;
    };

    // The sprite node set. Rebuilt only when the *signature* (ids + warhead/kind)
    // changes — not when positions change — so ticks that only move existing
    // missiles don't reconcile the whole layer. Positions are written imperatively
    // by update(); nothing position-dependent lives in this JSX.
    const sig = projectiles.map((p) => `p${p.id}:${WARHEADS[p.warhead] ? p.warhead : "standard"}:${p.sub ? 1 : 0}`).join("|")
        + "#" + interceptors.map((it) => `i${it.id}:${it.srcType === "thaad" ? "t" : ""}`).join("|");
    const heads = useMemo(() => {
        const nodes = [];
        for (const p of projectiles) {
            const warhead = WARHEADS[p.warhead] ? p.warhead : "standard";
            nodes.push(
                <div key={"p" + p.id} ref={setRef("p" + p.id)}
                     className={`absolute left-0 top-0 pointer-events-none z-3 will-change-transform ${p.sub ? "sub" : ""}`}
                     style={{["--flame"]: (WARHEADS[warhead] || WARHEADS.standard).flame}}>
                    <div className={`db-missile ${warhead}`}><span className="db-missile-glow"/><span
                        className="db-missile-body"/><span className="db-missile-flame"/></div>
                </div>
            );
        }
        for (const it of interceptors) {
            const variant = it.srcType === "thaad" ? "thaad" : "";
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
        const h = () => update(map, dataRef.current, canvasRef.current, elsRef.current);
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
    useLayoutEffect(() => {
        dataRef.current = {projectiles, interceptors, aircraft};
        update(map, dataRef.current, canvasRef.current, elsRef.current);
    });

    if (!map) return null;
    return (
        <>
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-2"/>
            {heads}
        </>
    );
}
