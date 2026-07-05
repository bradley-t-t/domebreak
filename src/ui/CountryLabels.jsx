import { useEffect, useReducer } from "react";

// Screen-space country name labels. The map style ships no glyphs, so these are
// projected HTML (works offline in Electron). Level of detail: only the largest
// countries show when zoomed right out; smaller ones fade in as you zoom, and
// all fade away once you zoom in close.
const HIDE_ZOOM = 4.4;

export default function CountryLabels({ map, labels }) {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    if (!map) return;
    const h = () => force();
    map.on("move", h); map.on("zoom", h);
    return () => { try { map.off("move", h); map.off("zoom", h); } catch { /* map gone */ } };
  }, [map]);
  if (!map || !labels?.length) return null;
  const z = map.getZoom();
  if (z >= HIDE_ZOOM) return null;
  const fade = z > HIDE_ZOOM - 0.9 ? Math.max(0, (HIDE_ZOOM - z) / 0.9) : 1;
  const minW = Math.max(0, 1.9 - (z - 1.1) * 0.62); // smaller nations reveal as you zoom in
  const cont = map.getContainer(); const W = cont.clientWidth, H = cont.clientHeight;
  const out = [];
  for (const L of labels) {
    if (L.w < minW) continue;
    const p = map.project([L.lng, L.lat]);
    if (p.x < -80 || p.y < -24 || p.x > W + 80 || p.y > H + 24) continue;
    const size = Math.max(9, Math.min(30, (10 + L.w * 6) * (0.72 + (z - 1) * 0.13)));
    out.push(
      <div key={L.iso} className={`gd-clabel ${L.mine ? "mine" : ""}`}
        style={{ left: p.x, top: p.y, fontSize: size, opacity: fade * (L.mine ? 1 : 0.82) }}>
        {L.name}
      </div>
    );
  }
  return <div className="gd-clabels">{out}</div>;
}
