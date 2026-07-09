// Animated PPI radar sweep: a rotating "hand" that circles each of my radar
// emitters, trailing a fading afterglow wedge — the classic old-radar look on
// top of the static coverage ring. Self-contained so its per-frame re-renders
// stay isolated to this subtree (never the whole map): it owns a requestAnimation
// Frame loop that advances the sweep heading in local state, and rebuilds the
// wedge/line geometry from the emitter list each frame. Honors reduced-motion and
// pauses while the tab is hidden, matching the ocean shimmer (map/water.js).
import {useEffect, useRef, useState} from "react";
import {Layer, Source} from "react-map-gl/maplibre";
import {sweepSector, sweepLine, geoSweepSector, geoSweepLine, GEODESIC_MAX_KM} from "../../game/geo/geo.js";

const PERIOD_MS = 3800;   // one full revolution
const ARC_DEG = 42;       // trailing afterglow width behind the leading edge
const FPS = 30;

function prefersReducedMotion() {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function RadarSweep({emitters, globe}) {
    const [head, setHead] = useState(0);
    const raf = useRef(0);
    const active = emitters.length > 0 && !prefersReducedMotion();

    useEffect(() => {
        if (!active) return undefined;
        let running = true, last = 0;
        const frame = (t) => {
            if (!running) return;
            raf.current = requestAnimationFrame(frame);
            if (t - last < 1000 / FPS) return;
            last = t;
            setHead(((t % PERIOD_MS) / PERIOD_MS) * 360);
        };
        const onVisibility = () => {
            if (document.hidden) {
                running = false;
                cancelAnimationFrame(raf.current);
            } else if (!running) {
                running = true;
                last = 0;
                raf.current = requestAnimationFrame(frame);
            }
        };
        raf.current = requestAnimationFrame(frame);
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            running = false;
            cancelAnimationFrame(raf.current);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, [active]);

    if (!active) return null;

    const fc = {
        type: "FeatureCollection",
        // Match the coverage ring's projection per emitter: geodesic on the globe
        // (below the satellite cutoff), Mercator on the flat map — so the hand
        // sweeps exactly inside the ring drawn in useLiveLayers.
        features: emitters.flatMap((e) => {
            const geo = globe && e.rKm <= GEODESIC_MAX_KM;
            const wedge = (geo ? geoSweepSector : sweepSector)(e.lng, e.lat, e.rKm, head, ARC_DEG);
            wedge.properties = {color: e.color, kind: "wedge"};
            const line = (geo ? geoSweepLine : sweepLine)(e.lng, e.lat, e.rKm, head);
            line.properties = {color: e.color, kind: "line"};
            return [wedge, line];
        })
    };

    return (
        <Source id="radar-sweep-src" type="geojson" data={fc}>
            {/* Fading afterglow behind the sweep. */}
            <Layer id="radar-sweep-fill" type="fill" filter={["==", ["get", "kind"], "wedge"]}
                   paint={{"fill-color": ["get", "color"], "fill-opacity": 0.1}}/>
            {/* Bright leading edge — the sweep hand itself. */}
            <Layer id="radar-sweep-line" type="line" filter={["==", ["get", "kind"], "line"]}
                   paint={{"line-color": ["get", "color"], "line-opacity": 0.8, "line-width": 1.4}}/>
        </Source>
    );
}
