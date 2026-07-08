import {useEffect, useReducer, useRef} from "react";
import {occludedByGlobe} from "../../game/geo/geo.js";
import {trackPoint, WARHEADS} from "../../game/engine.js";

// Renders missiles/interceptors and their contrails in SCREEN space with a
// ballistic altitude baked into every point, so the trail arcs up off the
// ground track (correct in globe + flat) and the sprite pitches with the arc.
//
// Trails are drawn on a SINGLE <canvas> imperatively — not as per-segment SVG
// <line> nodes — so a sky full of missiles costs a couple of canvas passes per
// frame instead of thousands of React/DOM reconciliations (the old approach
// rebuilt ~SAMPLES line elements per projectile every frame and was the source
// of the in-flight lag). The canvas also lets each contrail be a soft, layered
// vapor stroke — a wide diffuse pass under a bright core, faded tail→head — for
// a realistic dissipating plume instead of a hard animated polyline. Only the
// warhead/interceptor heads stay as DOM sprites (a handful of nodes).
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

export default function SkyLayer({map, projectiles, interceptors, aircraft}) {
    const [, force] = useReducer((x) => x + 1, 0);
    const canvasRef = useRef(null);
    const trailsRef = useRef([]);

    useEffect(() => {
        if (!map) return;
        let raf = null;
        const h = () => { // coalesce MapLibre's many per-frame move events into one render
            if (raf != null) return;
            raf = requestAnimationFrame(() => {
                raf = null;
                force();
            });
        };
        map.on("move", h);
        return () => {
            if (raf != null) cancelAnimationFrame(raf);
            try {
                map.off("move", h);
            } catch { /* map gone */
            }
        };
    }, [map]);

    // Redraw the trail canvas after every commit (tick or map move), sized to the
    // map container in device pixels for crisp strokes. trailsRef is populated in
    // the render pass below from the same projection used for the heads.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !map) return;
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
        for (const t of trailsRef.current) drawTrail(ctx, t.pts, t.color, t.width);
    });

    if (!map) return null;
    const pr = (lng, lat) => {
        const p = map.project([lng, lat]);
        return [p.x, p.y];
    };

    const trails = [], heads = [];
    for (const p of projectiles) {
        const alt = ALT[p.type] || 60;
        // Screen position (with ballistic lift) at flight fraction f, longitudes
        // unwrapped against a running basis so antimeridian crossings stay smooth.
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
            const [x, y] = pr(lng, g[1]);
            return [x, y - lift(f) * alt];
        };
        const pts = [];
        for (let i = 0; i <= SAMPLES; i++) pts.push(screenAt((p.progress * i) / SAMPLES));
        const wh = WARHEADS[p.warhead] || WARHEADS.standard;
        trails.push({id: "p" + p.id, pts, color: wh.trail || "#e3e7ec", width: p.sub ? 1.3 : (wh.trailW || 2.4)});
        // Nose heading from an explicit behind-point on the actual flown track, so
        // the sprite faces its direction of travel in both flat and globe modes
        // even when trail samples are occluded or degenerate.
        const head = pts[pts.length - 1];
        if (head) {
            const back = screenAt(Math.max(0, p.progress - 0.03));
            const fwd = back && Math.hypot(head[0] - back[0], head[1] - back[1]) > 0.4 ? null
                : screenAt(Math.min(1, p.progress + 0.03)); // launch instant: aim at the next step instead
            const ref = fwd || back || head;
            const dx = fwd ? ref[0] - head[0] : head[0] - ref[0];
            const dy = fwd ? ref[1] - head[1] : head[1] - ref[1];
            heads.push({
                id: "p" + p.id,
                x: head[0],
                y: head[1],
                deg: (dx || dy) ? (Math.atan2(dx, -dy) * 180) / Math.PI : 0,
                kind: "missile",
                sub: p.sub,
                warhead: WARHEADS[p.warhead] ? p.warhead : "standard",
                flame: wh.flame
            });
        }
    }
    // Airborne jets leave a short fading contrail at their display altitude.
    for (const a of aircraft || []) {
        const pts = [];
        for (const [lng, lat, al] of [...(a.trail || []), [a.lng, a.lat, a.alt || 0]]) {
            if (occludedByGlobe(map, lng, lat)) {
                pts.push(null);
                continue;
            }
            const [x, y] = pr(lng, lat);
            pts.push([x, y - (al || 0) * 30]);
        }
        if (pts.length > 1) trails.push({id: "a" + a.id, pts, color: "#dfe4ea", width: 1});
    }
    const projById = new Map(projectiles.map((p) => [p.id, p]));
    for (const it of interceptors) {
        let clng = it.lng;
        while (clng - it.fromLng > 180) clng -= 360;
        while (clng - it.fromLng < -180) clng += 360;
        if (occludedByGlobe(map, clng, it.lat)) continue;
        const [xc, yc] = pr(clng, it.lat);
        const head = [xc, yc - (it.altNorm || 0) * 72];
        // Aim the nose at the live target's on-screen position — its actual
        // direction of travel this instant. The old chord back to the launch site
        // diverges from the heading once the globe projection curves the path, so
        // the sprite pointed off-target in globe mode.
        const tgt = projById.get(it.targetId);
        let tlng = it.toLng;
        while (tlng - clng > 180) tlng -= 360;
        while (tlng - clng < -180) tlng += 360;
        const [xt, yt] = pr(tlng, it.toLat);
        const tgtLift = tgt ? (ALT[tgt.type] || 60) * (tgt.altNorm || 0) : (it.altNorm || 0) * 72;
        const dx = xt - head[0], dy = (yt - tgtLift) - head[1];
        heads.push({
            id: "i" + it.id,
            x: head[0],
            y: head[1],
            deg: (dx || dy) ? (Math.atan2(dx, -dy) * 180) / Math.PI : 0,
            kind: "interceptor",
            // THAAD hit-to-kill vehicles get their own cyan sprite + animation.
            variant: it.srcType === "thaad" ? "thaad" : ""
        });
    }
    trailsRef.current = trails;

    return (
        <>
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-2"/>
            {heads.map((h) => (
                <div key={h.id} className={`absolute pointer-events-none z-3 will-change-transform ${h.sub ? "sub" : ""}`} style={{
                    left: h.x,
                    top: h.y,
                    transform: `translate(-50%,-50%) rotate(${h.deg}deg)${h.sub ? " scale(0.6)" : ""}`,
                    ["--flame"]: h.flame
                }}>
                    {h.kind === "missile"
                        ? <div className={`db-missile ${h.warhead || "standard"}`}><span className="db-missile-glow"/><span
                            className="db-missile-body"/><span className="db-missile-flame"/></div>
                        :
                        <div className={`db-interceptor ${h.variant || ""}`}><span className="db-int-body"/><span
                            className="db-int-flame"/>{h.variant === "thaad" &&
                            <span className="db-int-spark"/>}</div>}
                </div>
            ))}
        </>
    );
}
