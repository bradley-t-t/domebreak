import { useEffect, useReducer } from "react";
import { interpGC } from "../game/geo.js";

// Renders missiles/interceptors and their contrails in SCREEN space with a
// ballistic altitude baked into every point, so the trail arcs up off the
// ground track (correct in globe + flat) and the sprite pitches with the arc.
const ALT = { silo: 92, launcher: 48 };
const SAMPLES = 22;

function seg(pts, color, width) {
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const o = 0.06 + 0.74 * (i / (pts.length - 1));
    out.push(<line key={i} x1={pts[i - 1][0]} y1={pts[i - 1][1]} x2={pts[i][0]} y2={pts[i][1]} stroke={color} strokeWidth={width} strokeOpacity={o} strokeLinecap="round" />);
  }
  return out;
}

export default function SkyLayer({ map, projectiles, interceptors }) {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    if (!map) return;
    const h = () => force();
    map.on("move", h);
    return () => { try { map.off("move", h); } catch { /* map gone */ } };
  }, [map]);
  if (!map) return null;
  const pr = (lng, lat) => { const p = map.project([lng, lat]); return [p.x, p.y]; };

  const trails = [], heads = [];
  for (const p of projectiles) {
    const alt = ALT[p.type] || 60; const pts = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const f = (p.progress * i) / SAMPLES;
      const g = interpGC(p.fromLng, p.fromLat, p.toLng, p.toLat, f);
      const [x, y] = pr(g[0], g[1]);
      pts.push([x, y - Math.sin(f * Math.PI) * alt]);
    }
    trails.push({ id: "p" + p.id, pts, color: "#d7e6ff", width: 2.4 });
    const n = pts.length, head = pts[n - 1], prev = pts[Math.max(0, n - 2)];
    heads.push({ id: "p" + p.id, x: head[0], y: head[1], deg: (Math.atan2(head[0] - prev[0], -(head[1] - prev[1])) * 180) / Math.PI, kind: "missile" });
  }
  for (const it of interceptors) {
    const [x0, y0] = pr(it.fromLng, it.fromLat);
    const [xc, yc] = pr(it.lng, it.lat);
    const head = [xc, yc - (it.altNorm || 0) * 72];
    heads.push({ id: "i" + it.id, x: head[0], y: head[1], deg: (Math.atan2(head[0] - x0, -(head[1] - y0)) * 180) / Math.PI, kind: "interceptor" });
  }

  return (
    <>
      <svg className="gd-sky">{trails.map((t) => <g key={t.id}>{seg(t.pts, t.color, t.width)}</g>)}</svg>
      {heads.map((h) => (
        <div key={h.id} className="gd-sky-sprite" style={{ left: h.x, top: h.y, transform: `translate(-50%,-50%) rotate(${h.deg}deg)` }}>
          {h.kind === "missile"
            ? <div className="gd-missile"><span className="gd-missile-glow" /><span className="gd-missile-body" /><span className="gd-missile-flame" /></div>
            : <div className="gd-interceptor"><span className="gd-int-body" /><span className="gd-int-flame" /></div>}
        </div>
      ))}
    </>
  );
}
