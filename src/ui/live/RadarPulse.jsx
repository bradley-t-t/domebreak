// Animated radar "ping" over each of my coverage rings: staggered pulses that
// grow from the emitter out to the coverage edge and fade quadratically as they
// spread. Reads as a live sensor return without pretending any of these emitters
// is a rotating dish — most aren't, and the sats certainly aren't. Self-contained
// so its per-frame re-renders stay isolated to this subtree (never the whole
// map): it owns a requestAnimationFrame loop that advances the time cursor in
// local state, and rebuilds the ring geometry from the emitter list each frame.
// Honors reduced-motion and pauses while the tab is hidden, matching the ocean
// shimmer (map/lib/water.js).
import {useEffect, useRef, useState} from "react";
import {Layer, Source} from "react-map-gl/maplibre";
import {circle, geoCircle, GEODESIC_MAX_KM} from "../../game/geo/geo.js";

const PERIOD_MS = 2200;   // one full grow-and-fade cycle
const PULSE_COUNT = 2;    // concurrent, evenly-phased pulses per emitter
const FPS = 30;

function prefersReducedMotion() {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Ease the pulse outward so it launches fast off the emitter and slows as it
// reaches the coverage edge — a wavefront, not a linear crawl.
const easeOutCubic = (t) => 1 - (1 - t) ** 3;

export default function RadarPulse({emitters, globe}) {
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

    const base = (tick % PERIOD_MS) / PERIOD_MS;
    const features = [];
    for (const e of emitters) {
        // Match the coverage ring's projection per emitter: geodesic on the globe
        // (below the satellite cutoff), Mercator on the flat map — so the pulse
        // sits exactly inside the ring drawn in useLiveLayers.
        const geo = globe && e.rKm <= GEODESIC_MAX_KM;
        for (let p = 0; p < PULSE_COUNT; p++) {
            // Stagger the concurrent pulses so one is always mid-flight — the
            // ring never fully empties between pings.
            const phase = (base + p / PULSE_COUNT) % 1;
            const grown = easeOutCubic(phase);
            const r = grown * e.rKm;
            if (r < 60) continue; // hide the sub-pixel dot at the very start of a ping
            const ring = (geo ? geoCircle : circle)(e.lng, e.lat, r, 48);
            // Quadratic fade so the ring is bright when small and vanishes into
            // the static coverage ring at full extent.
            ring.properties = {
                color: e.color,
                alpha: 0.55 * (1 - phase) ** 2,
                // Thinner at the edge — the wavefront weakens as it spreads.
                width: 1.8 * (1 - phase * 0.55)
            };
            features.push(ring);
        }
    }

    const fc = {type: "FeatureCollection", features};

    return (
        <Source id="radar-pulse-src" type="geojson" data={fc}>
            <Layer id="radar-pulse-line" type="line" paint={{
                "line-color": ["get", "color"],
                "line-opacity": ["get", "alpha"],
                "line-width": ["get", "width"],
                "line-blur": 0.8
            }}/>
        </Source>
    );
}
