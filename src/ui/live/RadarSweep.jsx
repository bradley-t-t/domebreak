// Animated radar overlay on top of the static coverage rings.
//
// Two motion modes, chosen per emitter:
//   * Sweep — a rotating PPI "hand" with a long, quadratically-fading afterglow
//     trail behind the leading edge, the classic ground/airborne dish look. Broken
//     into several thin wedge slices so the trail reads as a smooth gradient
//     (MapLibre fill layers can't gradient a single polygon), plus a soft glow
//     on the leading edge line.
//   * Pulse — expanding "ping" rings that grow from the emitter out to the
//     coverage edge and fade as they grow. Orbital sensors sweep a wide ground
//     footprint under their track rather than rotating a dish, so the PPI hand
//     reads wrong on them; the pulse reads as detection, not rotation.
//
// Self-contained so its per-frame re-renders stay isolated to this subtree
// (never the whole map): it owns a requestAnimationFrame loop that advances the
// time cursor in local state, and rebuilds the geometry from the emitter list
// each frame. Honors reduced-motion and pauses while the tab is hidden, matching
// the ocean shimmer (map/water.js).
import {useEffect, useRef, useState} from "react";
import {Layer, Source} from "react-map-gl/maplibre";
import {circle, geoCircle, geoSweepLine, geoSweepSector, GEODESIC_MAX_KM, sweepLine, sweepSector} from "../../game/geo/geo.js";

const SWEEP_PERIOD_MS = 4200;   // one full revolution
const SWEEP_TRAIL_DEG = 96;     // length of the fading afterglow behind the hand
const SWEEP_SLICES = 6;         // trail resolution — more slices = smoother fade
const PULSE_PERIOD_MS = 2200;   // one full grow-and-fade cycle
const PULSE_COUNT = 2;          // concurrent, evenly-phased pulses per emitter
const FPS = 30;

function prefersReducedMotion() {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Ease the pulse outward so it launches fast off the emitter and slows as it
// reaches the coverage edge — a wavefront, not a linear crawl.
const easeOutCubic = (t) => 1 - (1 - t) ** 3;

export default function RadarSweep({emitters, globe}) {
    const [tick, setTick] = useState(0);
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
            setTick(t);
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

    const headDeg = ((tick % SWEEP_PERIOD_MS) / SWEEP_PERIOD_MS) * 360;
    const pulseBase = (tick % PULSE_PERIOD_MS) / PULSE_PERIOD_MS;
    const sliceDeg = SWEEP_TRAIL_DEG / SWEEP_SLICES;

    const features = [];
    for (const e of emitters) {
        // Match the coverage ring's projection per emitter: geodesic on the globe
        // (below the satellite cutoff), Mercator on the flat map — so the overlay
        // sits exactly inside the ring drawn in useLiveLayers.
        const geo = globe && e.rKm <= GEODESIC_MAX_KM;
        if (e.orbital) {
            for (let p = 0; p < PULSE_COUNT; p++) {
                // Stagger the concurrent pulses so one is always mid-flight — the
                // ring never fully empties between pings.
                const phase = (pulseBase + p / PULSE_COUNT) % 1;
                const grown = easeOutCubic(phase);
                const r = grown * e.rKm;
                if (r < 60) continue; // hide the sub-pixel dot at the very start of a ping
                const ring = (geo ? geoCircle : circle)(e.lng, e.lat, r, 48);
                // Quadratic fade so the ring is bright when small and vanishes into
                // the static coverage ring at full extent.
                const alpha = 0.55 * (1 - phase) ** 2;
                ring.properties = {
                    color: e.color,
                    kind: "pulse",
                    alpha,
                    // Thinner at the edge — the wavefront weakens as it spreads.
                    width: 1.8 * (1 - phase * 0.55)
                };
                features.push(ring);
            }
            continue;
        }
        // Build the trail from the leading edge backward as a stack of thin
        // wedges, each carrying its own alpha so the fill layer paints a smooth
        // quadratic falloff instead of a flat wash.
        for (let i = 0; i < SWEEP_SLICES; i++) {
            const h = headDeg - sliceDeg * i;
            const wedge = (geo ? geoSweepSector : sweepSector)(e.lng, e.lat, e.rKm, h, sliceDeg);
            const t = i / (SWEEP_SLICES - 1);
            wedge.properties = {color: e.color, kind: "wedge", alpha: 0.3 * (1 - t) ** 2};
            features.push(wedge);
        }
        const line = (geo ? geoSweepLine : sweepLine)(e.lng, e.lat, e.rKm, headDeg);
        line.properties = {color: e.color, kind: "line"};
        features.push(line);
    }

    const fc = {type: "FeatureCollection", features};

    return (
        <Source id="radar-sweep-src" type="geojson" data={fc}>
            {/* Fading afterglow trail behind the sweep hand — per-slice alpha. */}
            <Layer id="radar-sweep-fill" type="fill" filter={["==", ["get", "kind"], "wedge"]}
                   paint={{"fill-color": ["get", "color"], "fill-opacity": ["get", "alpha"]}}/>
            {/* Bright, softly-glowing leading edge — the sweep hand itself. */}
            <Layer id="radar-sweep-line" type="line" filter={["==", ["get", "kind"], "line"]}
                   paint={{
                       "line-color": ["get", "color"],
                       "line-opacity": 0.9,
                       "line-width": 1.6,
                       "line-blur": 1.5
                   }}/>
            {/* Orbital "ping" — an expanding ring that fades as it grows. */}
            <Layer id="radar-pulse-line" type="line" filter={["==", ["get", "kind"], "pulse"]}
                   paint={{
                       "line-color": ["get", "color"],
                       "line-opacity": ["get", "alpha"],
                       "line-width": ["get", "width"],
                       "line-blur": 0.8
                   }}/>
        </Source>
    );
}
