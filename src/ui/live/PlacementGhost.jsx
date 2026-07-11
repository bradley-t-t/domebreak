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
import {forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState} from "react";
import {Layer, Source} from "react-map-gl/maplibre";
import {COAST_KM, radarRangeOf, UNITS} from "../../game/engine.js";
import {circle, geoCircle, GEODESIC_MAX_KM} from "../../game/geo/geo.js";

// Every ghost update regenerates the ring polygon and pushes it through the
// GeoJSON source (worker re-tessellation + buffer upload), so the refresh is
// throttled to this interval with a trailing update — the ring settles on the
// exact final cursor spot, it just doesn't re-tessellate at a 120Hz trackpad's
// pointer rate. Matches the sim's own 30fps render cadence.
const GHOST_MS = 33;
// Vertex ceiling for the ghost ring. circle() scales vertices up with on-screen
// size (to 360) — smoothness a translucent aiming aid doesn't need at the price
// of per-mousemove tessellation, exactly for the big radar-range previews.
const GHOST_MAX_STEPS = 112;

// Match the coverage-ring behavior in useLiveLayers: a true geodesic cap on the
// globe, the Mercator disc on the flat map (and for rings too wide to read as a
// cap), so the being-placed ring looks the same as a selected unit's ring.
const coverageRing = (globe, lng, lat, km, steps, innerKm = 0) =>
    (globe && km <= GEODESIC_MAX_KM ? geoCircle : circle)(lng, lat, km, steps, innerKm, GHOST_MAX_STEPS);

const PlacementGhost = forwardRef(function PlacementGhost({placing, moving, w, globe}, ref) {
    // { lng, lat, valid } | null — the live cursor probe pushed in from LiveGame.
    const [cur, setCur] = useState(null);
    const throttleRef = useRef({last: 0, timer: 0, pending: null});

    // Cancel any queued trailing update and drop the pending probe — shared by
    // clear(), the leading-edge commit (a straggling timer must not move the
    // ring BACK to an older probe), and placement end (a surviving timer would
    // resurrect a stale cursor and re-introduce the stale-ring flash the
    // end-of-placement effect below exists to prevent).
    const cancelPending = () => {
        const t = throttleRef.current;
        if (t.timer) {
            clearTimeout(t.timer);
            t.timer = 0;
        }
        t.pending = null;
    };

    useImperativeHandle(ref, () => ({
        update: (lng, lat, valid) => {
            const t = throttleRef.current;
            const now = performance.now();
            if (now - t.last >= GHOST_MS) {
                cancelPending();
                t.last = now;
                setCur({lng, lat, valid});
                return;
            }
            // Inside the window: remember the newest probe and commit it once the
            // window closes, so the ring never sticks short of the cursor.
            t.pending = {lng, lat, valid};
            if (!t.timer) {
                t.timer = setTimeout(() => {
                    t.timer = 0;
                    t.last = performance.now();
                    if (t.pending) {
                        setCur(t.pending);
                        t.pending = null;
                    }
                }, GHOST_MS - (now - t.last));
            }
        },
        clear: () => {
            cancelPending();
            setCur(null);
        }
    }), []);
    useEffect(() => () => {
        if (throttleRef.current.timer) clearTimeout(throttleRef.current.timer);
    }, []);

    // Drop the ghost the moment placement/relocation ends, so re-entering never
    // flashes a stale ring at the last cursor spot before the first mousemove.
    // Includes the throttle's queued probe — a trailing timer that fired after
    // this effect would otherwise resurrect the stale ring.
    useEffect(() => {
        if (!placing && !moving) {
            cancelPending();
            setCur(null);
        }
    }, [placing, moving]);

    const data = useMemo(() => {
        const f = [];
        if ((placing || moving) && cur) {
            const type = placing || w.units.find((u) => u.id === moving)?.type;
            const t = type ? UNITS[type] : null;
            const rad = t?.coastal ? COAST_KM
                : t?.detect ? radarRangeOf(type)
                    : t?.orbital ? t.range
                        : t?.kind === "offense" ? t.range   // strike reach — show where a silo/TEL/hypersonic can hit
                            : (t && t.range <= 4000) ? t.range : 160;
            const c = coverageRing(globe, cur.lng, cur.lat, rad, 56, (t && t.kind === "defense") ? (t.minRange || 0) : 0);
            c.properties = {
                color: cur.valid ? "#46d38a" : "#ff5d5d",
                sel: 1,
                radar: (t && t.kind === "support") ? 1 : 0
            };
            f.push(c);
        }
        return {type: "FeatureCollection", features: f};
    }, [placing, moving, w, cur, globe]);

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
