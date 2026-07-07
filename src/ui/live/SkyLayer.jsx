import {useEffect, useReducer} from "react";
import {occludedByGlobe} from "../../game/geo/geo.js";
import {trackPoint, WARHEADS} from "../../game/engine.js";

// Renders missiles/interceptors and their contrails in SCREEN space with a
// ballistic altitude baked into every point, so the trail arcs up off the
// ground track (correct in globe + flat) and the sprite pitches with the arc.
const ALT = {silo: 92, launcher: 48};
const SAMPLES = 22;

function seg(pts, color, width) {
    const out = [];
    for (let i = 1; i < pts.length; i++) {
        if (!pts[i - 1] || !pts[i]) continue; // gap where the track dips behind the globe
        const o = 0.06 + 0.74 * (i / (pts.length - 1));
        out.push(<line key={i} x1={pts[i - 1][0]} y1={pts[i - 1][1]} x2={pts[i][0]} y2={pts[i][1]} stroke={color}
                       strokeWidth={width} strokeOpacity={o} strokeLinecap="round"/>);
    }
    return out;
}

export default function SkyLayer({map, projectiles, interceptors, aircraft}) {
    const [, force] = useReducer((x) => x + 1, 0);
    useEffect(() => {
        if (!map) return;
        const h = () => force();
        map.on("move", h);
        return () => {
            try {
                map.off("move", h);
            } catch { /* map gone */
            }
        };
    }, [map]);
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
        trails.push({id: "p" + p.id, pts, color: "#e3e7ec", width: p.sub ? 1.3 : 2.4});
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
                flame: (WARHEADS[p.warhead] || WARHEADS.standard).flame
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

    return (
        <>
            <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible z-2">{trails.map((t) => <g key={t.id}>{seg(t.pts, t.color, t.width)}</g>)}</svg>
            {heads.map((h) => (
                <div key={h.id} className={`absolute pointer-events-none z-3 will-change-transform ${h.sub ? "sub" : ""}`} style={{
                    left: h.x,
                    top: h.y,
                    transform: `translate(-50%,-50%) rotate(${h.deg}deg)${h.sub ? " scale(0.6)" : ""}`,
                    ["--flame"]: h.flame
                }}>
                    {h.kind === "missile"
                        ? <div className="db-missile"><span className="db-missile-glow"/><span
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
