// The placement/relocation ghost ring that tracks the cursor while you're siting
// a new unit or relocating one. Isolated from LiveGame on purpose: the cursor
// position lives in THIS component's own state, so a mousemove updates only this
// tiny GeoJSON source instead of re-rendering LiveGame and its unit-marker
// fan-out (MapMarkers) on every pixel — that full-tree rebuild was the source of
// placement lag. LiveGame drives it imperatively through the ref: update() on
// each (rAF-coalesced) mousemove, clear() when placement ends.
//
// The paint below is a verbatim copy of the selection-ring layers in MapLayers
// (the "ranges" source) so a being-placed unit's ring reads identically to a
// selected one; only its own source keeps it off LiveGame's render path.
import {forwardRef, useEffect, useImperativeHandle, useMemo, useState} from "react";
import {Layer, Source} from "react-map-gl/maplibre";
import {COAST_KM, radarRangeOf, UNITS} from "../../game/engine.js";
import {circle} from "../../game/geo/geo.js";

const PlacementGhost = forwardRef(function PlacementGhost({placing, moving, w, myNation}, ref) {
    // { lng, lat, valid } | null — the live cursor probe pushed in from LiveGame.
    const [cur, setCur] = useState(null);

    useImperativeHandle(ref, () => ({
        update: (lng, lat, valid) => setCur({lng, lat, valid}),
        clear: () => setCur(null)
    }), []);

    // Drop the ghost the moment placement/relocation ends, so re-entering never
    // flashes a stale ring at the last cursor spot before the first mousemove.
    useEffect(() => {
        if (!placing && !moving) setCur(null);
    }, [placing, moving]);

    const data = useMemo(() => {
        const f = [];
        if ((placing || moving) && cur) {
            const type = placing || w.units.find((u) => u.id === moving)?.type;
            const t = type ? UNITS[type] : null;
            const rad = t?.coastal ? COAST_KM
                : t?.detect ? radarRangeOf(type) * (myNation?.radarMult ?? 1)
                    : (t && t.kind !== "offense" && t.range <= 4000) ? t.range : 160;
            const c = circle(cur.lng, cur.lat, rad, 56, (t && t.kind === "defense") ? (t.minRange || 0) : 0);
            c.properties = {
                color: cur.valid ? "#46d38a" : "#ff5d5d",
                sel: 1,
                radar: (t && t.kind === "support") ? 1 : 0
            };
            f.push(c);
        }
        return {type: "FeatureCollection", features: f};
    }, [placing, moving, w, myNation, cur]);

    return (
        <Source id="ranges-ghost" type="geojson" data={data}>
            <Layer id="ghost-range-fill" type="fill" filter={["!=", ["get", "radar"], 1]} paint={{
                "fill-color": ["get", "color"],
                "fill-opacity": ["case", ["==", ["get", "sel"], 1], 0.14, 0.05]
            }}/>
            <Layer id="ghost-range-line" type="line" filter={["!=", ["get", "radar"], 1]} paint={{
                "line-color": ["get", "color"],
                "line-width": ["case", ["==", ["get", "sel"], 1], 1.6, 0.7],
                "line-opacity": 0.6
            }}/>
            <Layer id="ghost-radar-sel-fill" type="fill" filter={["==", ["get", "radar"], 1]} paint={{
                "fill-color": ["get", "color"],
                "fill-opacity": 0.07
            }}/>
            <Layer id="ghost-radar-ring" type="line" filter={["==", ["get", "radar"], 1]} paint={{
                "line-color": ["get", "color"],
                "line-width": 0.9,
                "line-opacity": 0.5,
                "line-dasharray": [3, 3]
            }}/>
        </Source>
    );
});

export default PlacementGhost;
