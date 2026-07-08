import {useEffect, useReducer} from "react";
import {occludedByGlobe} from "../../game/geo/geo.js";

// Screen-space country name labels. The map style ships no glyphs, so these are
// projected HTML (works offline in Electron). Only belligerents are labeled —
// neutral/unplayed nations are unnamed background geography. Level of detail:
// only the largest belligerents show when zoomed right out; smaller ones fade in
// as you zoom, and all fade away once you zoom in close.
const HIDE_ZOOM = 4.4;

export default function CountryLabels({map, labels}) {
    const [, force] = useReducer((x) => x + 1, 0);
    useEffect(() => {
        if (!map) return;
        let raf = null;
        const h = () => { // coalesce MapLibre's many per-frame move/zoom events into one render
            if (raf != null) return;
            raf = requestAnimationFrame(() => { raf = null; force(); });
        };
        map.on("move", h);
        map.on("zoom", h);
        return () => {
            if (raf != null) cancelAnimationFrame(raf);
            try {
                map.off("move", h);
                map.off("zoom", h);
            } catch { /* map gone */
            }
        };
    }, [map]);
    if (!map || !labels?.length) return null;
    const z = map.getZoom();
    if (z >= HIDE_ZOOM) return null;
    const fade = z > HIDE_ZOOM - 0.9 ? Math.max(0, (HIDE_ZOOM - z) / 0.9) : 1;
    const minW = Math.max(0, 1.9 - (z - 1.1) * 0.62); // smaller nations reveal as you zoom in
    const cont = map.getContainer();
    const W = cont.clientWidth, H = cont.clientHeight;
    const out = [];
    for (const L of labels) {
        // Only belligerents are labeled — neutral/unplayed nations stay unnamed.
        if (!L.combat) continue;
        if (L.w < minW) continue;
        if (occludedByGlobe(map, L.lng, L.lat)) continue;
        const p = map.project([L.lng, L.lat]);
        if (p.x < -80 || p.y < -24 || p.x > W + 80 || p.y > H + 24) continue;
        const size = Math.max(9, Math.min(30, (10 + L.w * 6) * (0.72 + (z - 1) * 0.13)));
        out.push(
            <div key={L.iso}
                 className={`absolute -translate-x-1/2 -translate-y-1/2 font-display font-bold tracking-[0.5px] whitespace-nowrap [text-shadow:0_0_6px_#060708,0_0_3px_#060708,0_1px_2px_#000] ${L.mine ? "text-gold" : "text-[#f2f4f6]"}`}
                 style={{left: p.x, top: p.y, fontSize: size, opacity: fade * (L.mine ? 1 : 0.85)}}>
                {L.name}
            </div>
        );
    }
    return <div className="absolute inset-0 pointer-events-none z-2">{out}</div>;
}
