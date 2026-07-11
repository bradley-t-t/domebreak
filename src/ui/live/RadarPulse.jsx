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
import {Layer, Source, useMap} from "react-map-gl/maplibre";
import {circle, geoCircle, GEODESIC_MAX_KM} from "../../game/geo/geo.js";

const PERIOD_MS = 2200;   // one full grow-and-fade cycle
const PULSE_COUNT = 2;    // concurrent, evenly-phased pulses per emitter
const FPS = 30;
// Per-frame tessellation budget: a decorative wavefront doesn't need the static
// coverage ring's full vertex count, and a wall of emitters doesn't need two
// concurrent pulses each — the animation reads identically at a fraction of the
// per-frame setData cost (which lands exactly when the player is placing units,
// since placement auto-enables this layer).
const PULSE_MAX_STEPS = 64;
const SINGLE_PULSE_ABOVE = 10;   // emitters past this each carry one pulse, not two
// Degrees of latitude per km, for the viewport cull's cheap bounding test.
const DEG_PER_KM = 1 / 111.19;

function prefersReducedMotion() {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Ease the pulse outward so it launches fast off the emitter and slows as it
// reaches the coverage edge — a wavefront, not a linear crawl.
const easeOutCubic = (t) => 1 - (1 - t) ** 3;

export default function RadarPulse({emitters, globe}) {
    const [tick, setTick] = useState(0);
    const raf = useRef(0);
    const {current: mapRef} = useMap();
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
    // Viewport cull: only emitters whose coverage circle could intersect the
    // current view get a pulse this frame. Off-screen radars were paying full
    // ring tessellation 30 times a second for geometry nobody could see. The
    // bounds test is a cheap padded box in degrees; on the globe (no meaningful
    // bounds) everything passes, which the vertex/pulse caps still bound.
    let visible = emitters;
    if (!globe && mapRef) {
        try {
            const b = mapRef.getBounds();
            const w = b.getWest(), e2 = b.getEast(), s = b.getSouth(), n = b.getNorth();
            visible = emitters.filter((e) => {
                // circle() draws a disc that is round in MERCATOR space, so its
                // lat/lng footprint stretches by 1/cos(lat) — a linear degree pad
                // under-covers big high-latitude radars (an OTH at 60N bulges 12+
                // degrees past it equatorward) and would cull a pulse whose
                // coverage ring is plainly on screen. Same cos clamp circle() uses.
                const coslat = Math.max(0.05, Math.cos((e.lat * Math.PI) / 180));
                const pad = (e.rKm * DEG_PER_KM) / coslat;
                if (e.lat + pad < s || e.lat - pad > n) return false;
                // Full modular normalization: keyboard pans unwrap the map center
                // without bound (only mouse drags rewrap it), so the offset can
                // exceed one world width — a single +/-360 step can't recover that.
                const dl = (((e.lng - (w + e2) / 2) % 360) + 540) % 360 - 180;
                return Math.abs(dl) <= (e2 - w) / 2 + pad;
            });
        } catch { /* bounds unavailable mid-teardown — pulse everything */
        }
    }
    // Threshold on the TOTAL emitter count, not the culled one: a camera-coupled
    // threshold would pop the second pulse in and out mid-flight on small pans.
    const pulses = emitters.length > SINGLE_PULSE_ABOVE ? 1 : PULSE_COUNT;
    const features = [];
    for (const e of visible) {
        // Match the coverage ring's projection per emitter: geodesic on the globe
        // (below the satellite cutoff), Mercator on the flat map — so the pulse
        // sits exactly inside the ring drawn in useLiveLayers.
        const geo = globe && e.rKm <= GEODESIC_MAX_KM;
        for (let p = 0; p < pulses; p++) {
            // Stagger the concurrent pulses so one is always mid-flight — the
            // ring never fully empties between pings.
            const phase = (base + p / PULSE_COUNT) % 1;
            const grown = easeOutCubic(phase);
            const r = grown * e.rKm;
            if (r < 60) continue; // hide the sub-pixel dot at the very start of a ping
            const ring = (geo ? geoCircle : circle)(e.lng, e.lat, r, 48, 0, PULSE_MAX_STEPS);
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
