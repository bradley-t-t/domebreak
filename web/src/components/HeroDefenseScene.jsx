// A pre-made, art-directed "defense of the United States" scene for the hero
// background. This is NOT the game's simulation — it's a hand-authored, seamless
// loop of natural-looking gameplay: waves of incoming ICBMs arc in over the
// Arctic and the Atlantic toward US cities, and layered US batteries (THAAD,
// Patriot, Aegis, silos, early-warning radars) throw interceptors up to kill
// them mid-flight, with the occasional round leaking through to a survivable
// ground burst. It reuses the game's REAL renderers via the `@game` alias — the
// flat MapLibre board (WorldMap), the screen-space missile/contrail layer
// (SkyLayer), and the same detonation sprites the live match uses — so it reads
// as an actual match, but every launch and intercept is scripted off one clock.
//
// Pointer events are disabled: this layer is scenery, never a control surface.
import {useEffect, useMemo, useRef, useState} from "react";
import {Layer, Marker, Source, useMap} from "react-map-gl/maplibre";
import WorldMap from "@game/map/WorldMap.jsx";
import SkyLayer from "@game/ui/live/SkyLayer.jsx";
import CountryLabels from "@game/ui/live/CountryLabels.jsx";
import Explosion from "@game/ui/live/Explosion.jsx";
import UnitIcon from "@game/ui/common/UnitIcon.jsx";
import {UNIT_ICON} from "@game/game/data/units.js";
import {radarRangeOf, UNITS} from "@game/game/engine.js";
import {geoCircle, interpGC} from "@game/game/geo/geo.js";

// One loop of the scene, in scene-seconds. Every scripted launch, intercept and
// impact finishes before this, then the clock wraps and the wave repeats.
const LOOP_SEC = 24;
const SIM_SPEED = 1;          // scene-seconds per wall-second
const STATE_HZ = 30;          // throttle React state churn / camera repaints

// Camera: flat mercator framed on the continental US. A slow drift + zoom breath
// keeps it alive without ever reading as a random simulation. Left padding shifts
// the map clear of the hero's copy rail so the eastern seaboard action stays in
// the open right half of the frame.
const CAM = {lng: -95, lat: 41.2, zoom: 4.05};
const ZOOM_AMP = 0.09, ZOOM_PERIOD_S = 30;
const LNG_AMP = 2.2, LNG_PERIOD_S = 46;
const LAT_AMP = 0.9, LAT_PERIOD_S = 38;

const DEFENDER = "#7fd4ff";   // US units + cities highlight + defense rings
const RADAR_TINT = "#4fd3e0"; // radar coverage rings
const US_TINT = "#2f7fb0";    // homeland wash — light enough that terrain reads through
const US_LINE = "#63c6ff";    // glowing national border
// National tint opacity: the US washed a touch stronger than its neighbors. Flat
// values (not a zoom ramp) because the hero holds a fixed close zoom — and MapLibre
// forbids a zoom expression nested inside the per-nation match anyway.
const US_TINT_OPACITY = 0.34;
const TINT_OPACITY = 0.17;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const easeOut = (t) => 1 - (1 - t) * (1 - t);

// Layered US missile defense — real game unit types across CONUS. `t` is the unit
// type (drives the icon and, via the engine's own stats, the coverage ring); `at`
// is [lng, lat]. Silos in the plains, THAAD/Patriot/Aegis/Golden Dome batteries at
// the cities, Early-Warning Radars on the northern fence, and the two air bases the
// interceptors fly from — an airstrip inland and a carrier on the Atlantic picket.
const SITES = [
    {t: "silo", at: [-111.2, 47.5]},        // Malmstrom, MT
    {t: "silo", at: [-101.3, 48.4]},        // Minot, ND
    {t: "silo", at: [-104.8, 41.1]},        // F.E. Warren, WY
    {t: "radar", at: [-98.3, 48.7]},        // Cavalier, ND (early warning)
    {t: "radar", at: [-119.0, 39.5]},       // Nevada (early warning, west)
    {t: "thaad", at: [-77.0, 38.9]},        // Washington, DC
    {t: "patriot", at: [-74.0, 40.7]},      // New York
    {t: "aegis", at: [-70.9, 42.35]},       // Boston (coastal)
    {t: "patriot", at: [-84.4, 33.75]},     // Atlanta
    {t: "dome", at: [-80.2, 25.8]},         // Miami (Golden Dome)
    {t: "patriot", at: [-87.6, 41.8]},      // Chicago
    {t: "thaad", at: [-95.4, 29.8]},        // Houston
    {t: "thaad", at: [-105.0, 39.7]},       // Denver
    {t: "aegis", at: [-118.2, 34.0]},       // Los Angeles (coastal)
    {t: "dome", at: [-122.3, 47.6]},        // Seattle (Golden Dome)
    {t: "airstrip", at: [-97.5, 38.6]},     // interior air base
    {t: "carrier", at: [-72.5, 38.2]},      // carrier on the Atlantic picket
];

// Belligerent name labels, rendered by the game's own CountryLabels. The US is
// the defender ("mine"); its neighbors are the in-frame combatants. `w` is the
// nation weight the component uses for label size + zoom LOD.
const LABELS = [
    {iso: "US", name: "United States", lng: -99, lat: 39.5, w: 1.8, mine: true, combat: true},
    {iso: "CA", name: "Canada", lng: -101, lat: 55, w: 1.4, combat: true},
    {iso: "MX", name: "Mexico", lng: -102, lat: 23.5, w: 1.2, combat: true},
    {iso: "CU", name: "Cuba", lng: -79, lat: 21.8, w: 0.8, combat: true},
];

// Coverage per site, straight from the engine's own unit stats so it matches the
// live game: defense batteries show their engagement range (with the keep-out inner
// ring THAAD carries), detection units show their radar range. Everything else
// (silos, the airstrip) launches or bases but paints no ring.
const ringOf = (t) => {
    const u = UNITS[t];
    if (u?.kind === "defense") return {kind: "defense", km: u.range, inner: u.minRange || 0};
    const rk = radarRangeOf(t);
    if (rk > 0) return {kind: "radar", km: rk, inner: 0};
    return null;
};

// Authored threat waves. Each ICBM arcs from an off-map origin (over the Arctic,
// the North Atlantic or the Pacific) to a US city. `kill` pairs it with the
// battery that intercepts it and the flight fraction the kill lands at; a threat
// with no `kill` leaks through to a survivable ground burst. `p` is the launch
// platform type feeding the trail's altitude arc (silo = tall ballistic lob,
// launcher = flatter/faster glide). Times are scene-seconds within the loop.
const THREATS = [
    {t0: 0.3, from: [-155, 58], to: [-122.5, 37.7], dur: 7.6, w: "thermo", kill: {bat: [-122.5, 37.7], type: "aegis", at: 0.72, lead: 2.4}},
    {t0: 1.5, from: [-150, 62], to: [-122.3, 47.6], dur: 6.9, w: "standard", kill: {bat: [-122.3, 47.6], type: "dome", at: 0.68, lead: 2.1}},
    {t0: 2.6, from: [-40, 60], to: [-74.0, 40.7], dur: 8.1, w: "hgv", p: "launcher", kill: {bat: [-74.0, 40.7], type: "patriot", at: 0.74, lead: 2.0}},
    {t0: 3.8, from: [-46, 52], to: [-70.9, 42.35], dur: 7.4, w: "standard", kill: {bat: [-70.9, 42.35], type: "aegis", at: 0.66, lead: 2.2}},
    {t0: 5.0, from: [-141, 31], to: [-118.2, 34.0], dur: 6.3, w: "cluster", kill: {bat: [-118.2, 34.0], type: "patriot", at: 0.70, lead: 2.1}},
    {t0: 6.3, from: [-158, 55], to: [-105.0, 39.7], dur: 8.7, w: "thermo", kill: {bat: [-105.0, 39.7], type: "thaad", at: 0.63, lead: 2.5}},
    {t0: 7.6, from: [-41, 55], to: [-77.0, 38.9], dur: 8.0, w: "thermo", kill: {bat: [-77.0, 38.9], type: "thaad", at: 0.73, lead: 2.4}},
    {t0: 8.9, from: [-150, 60], to: [-87.6, 41.8], dur: 8.4, w: "standard", kill: {bat: [-87.6, 41.8], type: "patriot", at: 0.66, lead: 2.1}},
    {t0: 10.3, from: [-135, 29], to: [-95.4, 29.8], dur: 7.0, w: "standard"}, // leaks — survivable burst near Houston
    {t0: 11.4, from: [-43, 58], to: [-84.4, 33.75], dur: 8.1, w: "hgv", p: "launcher", kill: {bat: [-84.4, 33.75], type: "patriot", at: 0.72, lead: 2.0}},
    {t0: 12.7, from: [-160, 56], to: [-80.2, 25.8], dur: 9.1, w: "standard", kill: {bat: [-80.2, 25.8], type: "dome", at: 0.74, lead: 2.2}},
    {t0: 14.0, from: [-48, 50], to: [-74.0, 40.7], dur: 7.9, w: "cluster", kill: {bat: [-74.0, 40.7], type: "patriot", at: 0.64, lead: 2.1}},
    {t0: 15.4, from: [-152, 61], to: [-111.2, 40.8], dur: 8.2, w: "thermo", kill: {bat: [-105.0, 39.7], type: "thaad", at: 0.70, lead: 2.4}},
    {t0: 16.8, from: [-39, 57], to: [-71.1, 42.4], dur: 7.6, w: "standard", kill: {bat: [-70.9, 42.35], type: "aegis", at: 0.68, lead: 2.2}},
].map((th, i) => ({...th, id: i + 1, p: th.p || "silo"}));

// Precomputed intercept / impact geometry and the moment each detonation fires.
const EVENTS = THREATS.map((th) => {
    if (th.kill) {
        const at = interpGC(th.from[0], th.from[1], th.to[0], th.to[1], th.kill.at);
        return {id: th.id, kind: "intercept", time: th.t0 + th.dur * th.kill.at, lng: at[0], lat: at[1]};
    }
    return {id: th.id, kind: "hit", time: th.t0 + th.dur, lng: th.to[0], lat: th.to[1]};
});

// Air Superiority Fighters (the game's `interceptor` — an air unit, not a ground
// battery) flying combat air patrol from their bases: two off the interior airstrip
// and one off the carrier's Atlantic picket. Each traces a slow racetrack around
// its base; the sprite (real interceptor icon) banks to its heading and SkyLayer
// draws the contrail, exactly as a based aircraft reads in the live game.
const PATROLS = [
    {base: [-97.5, 38.6], rx: 8.5, ry: 3.6, period: 33, phase: 0},      // airstrip CAP 1
    {base: [-97.5, 38.6], rx: 4.5, ry: 5.4, period: 26, phase: 2.3},    // airstrip CAP 2
    {base: [-72.5, 38.2], rx: 5.5, ry: 3.0, period: 29, phase: 1.1},    // carrier CAP
];

// Reports the MapLibre instance up as soon as react-map-gl creates it — inside
// the map context, so it never waits on the `load` event that can deadlock when
// the hero mounts at zero size.
function MapReady({onMap}) {
    const maps = useMap();
    useEffect(() => {
        const m = maps?.current?.getMap?.();
        if (m) onMap(m);
    }, [maps, onMap]);
    return null;
}

function Scene({onReady, still}) {
    const mapRef = useRef(null);
    const [mapObj, setMapObj] = useState(null); // render-value handle for SkyLayer
    const [proj, setProj] = useState({projectiles: [], interceptors: [], aircraft: []});
    const [booms, setBooms] = useState([]);
    const [cities, setCities] = useState(null); // all-nation city coords (backdrop + US)
    const [colors, setColors] = useState(null); // per-nation flag tints (GID_0 -> rgb)
    const colorsRef = useRef(null);             // latest colors for the styledata handler

    // Same map furniture the live game carries: every nation's cities as dots and
    // the political flag tints. Loaded once from the site's public data.
    useEffect(() => {
        let alive = true;
        fetch("/data/cities.json").then((r) => r.json()).then((d) => alive && setCities(d)).catch(() => {});
        fetch("/assets/colors.json").then((r) => r.json()).then((d) => alive && setColors(d)).catch(() => {});
        return () => {
            alive = false;
        };
    }, []);
    const startRef = useRef(null);
    const lastStRef = useRef(0);
    const seenRef = useRef(new Set());
    const trailsRef = useRef(PATROLS.map(() => []));
    const initedRef = useRef(false);

    // Paint the political map the way the live game does — every nation washed in
    // its own flag color from colors.json — then lift the US out as the highlighted
    // defender with a brighter wash and a glowing border. Also nudge the terrain
    // relief up a touch so the close-in view reads at full game fidelity. `cols`
    // may be null before colors.json loads; the US emphasis still applies.
    const paintMap = (m, cols) => {
        try {
            const tint = [];
            const line = [];
            if (cols) {
                const mix = (v, g) => Math.round(v * 0.6 + g * 0.4); // borders muted toward neutral
                for (const [gid, c] of Object.entries(cols)) {
                    tint.push(gid, gid === "USA" ? US_TINT : `rgb(${c[0]},${c[1]},${c[2]})`);
                    line.push(gid, gid === "USA" ? US_LINE : `rgb(${mix(c[0], 96)},${mix(c[1], 100)},${mix(c[2], 108)})`);
                }
            } else {
                tint.push("USA", US_TINT);
                line.push("USA", US_LINE);
            }
            m.setPaintProperty("country-tint", "fill-color", ["match", ["get", "GID_0"], ...tint, "#6a6f78"]);
            m.setPaintProperty("country-tint", "fill-opacity", ["match", ["get", "GID_0"], "USA", US_TINT_OPACITY, TINT_OPACITY]);
            m.setPaintProperty("country-line", "line-color", ["match", ["get", "GID_0"], ...line, "#3a3f47"]);
            m.setPaintProperty("country-line", "line-width", ["match", ["get", "GID_0"], "USA", 1.8, 0.6]);
            m.setPaintProperty("country-line", "line-opacity", ["match", ["get", "GID_0"], "USA", 0.95, 0.5]);
            // Terrain shows more at the hero's fixed close zoom than the game's zoom ramp allows.
            m.setPaintProperty("relief", "raster-opacity", ["interpolate", ["linear"], ["zoom"], 3.2, 0, 3.8, 0.35, 5.5, 0.92]);
        } catch { /* style not ready — retried on next styledata */ }
    };

    // One-time map wiring, driven off react-map-gl's useMap() rather than the
    // MapLibre `load` event: when the hero mounts into a still-settling (or briefly
    // zero-sized) container, `load` can deadlock and never fire, so we take the map
    // as soon as react-map-gl creates it and force the first resize/frame ourselves.
    const initMap = (m) => {
        if (!m || initedRef.current) return;
        initedRef.current = true;
        mapRef.current = m;
        setMapObj(m);
        const reframe = () => {
            try {
                m.resize();
                m.jumpTo({center: [CAM.lng, CAM.lat], zoom: CAM.zoom, padding: framePad(m)});
            } catch { /* tearing down */ }
        };
        reframe();
        // MapLibre only tracks WINDOW resizes; keep the canvas synced to its own box.
        try {
            const ro = new ResizeObserver(reframe);
            ro.observe(m.getContainer());
            m.once("remove", () => ro.disconnect());
        } catch { /* no ResizeObserver */ }
        paintMap(m, colors);
        m.on("styledata", () => paintMap(m, colorsRef.current));
        // Tell the host to fade the scene in once real tiles have painted.
        if (onReady) {
            let done = false;
            const check = () => {
                if (done) return;
                try {
                    if (m.areTilesLoaded()) {
                        done = true;
                        onReady();
                        return;
                    }
                } catch { /* tearing down */ }
                setTimeout(check, 120);
            };
            setTimeout(check, 150);
        }
    };

    useEffect(() => {
        colorsRef.current = colors;
    }, [colors]);

    // Re-wash the political map once colors.json arrives after the map is up.
    useEffect(() => {
        const m = mapRef.current;
        if (m && colors) paintMap(m, colors);
    }, [mapObj, colors]);

    // Every nation's cities as faint backdrop dots — the same peppering the live
    // game map carries. Capitals read a touch larger.
    const backdropFC = useMemo(() => {
        if (!cities) return {type: "FeatureCollection", features: []};
        const features = [];
        for (const iso in cities) {
            if (iso === "US") continue; // US drawn brighter below
            for (const c of cities[iso]) {
                features.push({type: "Feature", properties: {cap: c.cap}, geometry: {type: "Point", coordinates: [c.lng, c.lat]}});
            }
        }
        return {type: "FeatureCollection", features};
    }, [cities]);

    // The homeland's cities, drawn like the player's own in-game: defender-colored
    // dots with a white ring, capitals larger — the cities the batteries defend.
    const usCitiesFC = useMemo(() => ({
        type: "FeatureCollection",
        features: (cities?.US || []).map((c) => ({
            type: "Feature", properties: {cap: c.cap}, geometry: {type: "Point", coordinates: [c.lng, c.lat]},
        })),
    }), [cities]);

    // Coverage rings straight from engine stats, as geodesic circles anchored
    // through the camera drift. Two collections drawn with the game's own styling:
    // defense engagement rings (solid, with THAAD's inner keep-out) and radar
    // coverage (dashed). Every battery and every radar shows its footprint — no
    // site with a range is left without a ring.
    const {defenseFC, radarFC} = useMemo(() => {
        const defense = [], radar = [];
        for (const s of SITES) {
            const r = ringOf(s.t);
            if (!r) continue;
            const f = geoCircle(s.at[0], s.at[1], r.km, 72, r.inner);
            (r.kind === "defense" ? defense : radar).push(f);
        }
        return {
            defenseFC: {type: "FeatureCollection", features: defense},
            radarFC: {type: "FeatureCollection", features: radar},
        };
    }, []);

    // One frame of the scene at loop-time `st`: derive the live missiles /
    // interceptors and patrol contrails, fire any detonations we just crossed, and
    // drift the camera.
    const tick = (m, st) => {
        const projectiles = [], interceptors = [];
        for (const th of THREATS) {
            const local = st - th.t0;
            if (local < 0) continue;
            const endP = th.kill ? th.kill.at : 1;
            if (local <= th.dur * endP + 0.05) {
                projectiles.push({
                    id: th.id, type: th.p, warhead: th.w,
                    progress: clamp(local / th.dur, 0.001, endP),
                    fromLng: th.from[0], fromLat: th.from[1], toLng: th.to[0], toLat: th.to[1],
                });
            }
            if (th.kill) {
                const kT = th.dur * th.kill.at, s = kT - th.kill.lead;
                if (local >= s && local <= kT) {
                    const f = clamp((local - s) / th.kill.lead, 0, 1);
                    const kp = interpGC(th.from[0], th.from[1], th.to[0], th.to[1], th.kill.at);
                    const b = th.kill.bat;
                    const cur = interpGC(b[0], b[1], kp[0], kp[1], f);
                    const prev = interpGC(b[0], b[1], kp[0], kp[1], Math.max(0, f - 0.06));
                    interceptors.push({
                        id: th.id, srcType: th.kill.type === "thaad" ? "thaad" : "",
                        fromLng: b[0], fromLat: b[1], toLng: kp[0], toLat: kp[1],
                        lng: cur[0], lat: cur[1], pLng: prev[0], pLat: prev[1],
                        altNorm: easeOut(f) * 0.82,
                    });
                }
            }
        }

        // Interceptors on CAP: position, altitude, banked heading + rolling contrail.
        const aircraft = PATROLS.map((pt, i) => {
            const at = (f) => {
                const a = pt.phase + (f / pt.period) * Math.PI * 2;
                return [pt.base[0] + Math.cos(a) * pt.rx, pt.base[1] + Math.sin(a) * pt.ry];
            };
            const [lng, lat] = at(st);
            const [nlng, nlat] = at(st + 0.15); // a step ahead, for heading
            // Compass bearing of travel; the sprite's nose points north, so rotating
            // by this banks it into the turn (longitudes compressed by latitude).
            const heading = Math.atan2((nlng - lng) * Math.cos(lat * Math.PI / 180), nlat - lat) * 180 / Math.PI;
            const alt = 0.6;
            const trail = trailsRef.current[i];
            trail.push([lng, lat, alt]);
            if (trail.length > 18) trail.shift();
            return {id: `ac${i}`, lng, lat, alt, heading, trail: trail.slice()};
        });

        setProj({projectiles, interceptors, aircraft});

        // Fire detonations we've just passed (deduped per loop).
        const fresh = [];
        for (const e of EVENTS) {
            if (e.time <= st && !seenRef.current.has(e.id)) {
                seenRef.current.add(e.id);
                fresh.push({id: `${e.id}-${Math.round(st * 1000)}`, lng: e.lng, lat: e.lat, kind: e.kind});
            }
        }
        if (fresh.length) {
            setBooms((list) => [...list, ...fresh]);
            for (const e of fresh) setTimeout(() => setBooms((l) => l.filter((x) => x.id !== e.id)), 820);
        }

        // Camera drift + zoom breath.
        const T = (performance.now()) / 1000;
        const zoom = CAM.zoom + ZOOM_AMP * Math.sin(T * (2 * Math.PI / ZOOM_PERIOD_S));
        const lng = CAM.lng + LNG_AMP * Math.sin(T * (2 * Math.PI / LNG_PERIOD_S));
        const lat = CAM.lat + LAT_AMP * Math.sin(T * (2 * Math.PI / LAT_PERIOD_S));
        try {
            m.jumpTo({center: [lng, lat], zoom, padding: framePad(m)});
        } catch { /* tearing down */ }
    };

    // Run the loop off requestAnimationFrame, throttling React state churn to
    // STATE_HZ. Reduced motion holds a single still frame instead.
    useEffect(() => {
        if (still) return;
        let raf, acc = 0, last = 0;
        const step = (ts) => {
            const m = mapRef.current;
            if (m) {
                if (startRef.current == null) startRef.current = last = ts;
                const dt = Math.min((ts - last) / 1000, 0.05);
                last = ts;

                // Perf: stand fully down while off-screen or the tab is hidden.
                const c = m.getContainer();
                const r = c.getBoundingClientRect();
                const vh = window.innerHeight || 0, vw = window.innerWidth || 0;
                const onScreen = document.visibilityState !== "hidden"
                    && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
                if (!onScreen) {
                    raf = requestAnimationFrame(step);
                    return;
                }

                acc += dt;
                if (acc >= 1 / STATE_HZ) {
                    const elapsed = (ts - startRef.current) / 1000;
                    const st = (elapsed * SIM_SPEED) % LOOP_SEC;
                    if (st < lastStRef.current) seenRef.current.clear(); // looped
                    tick(m, st);
                    lastStRef.current = st;
                    acc = 0;
                }
            }
            raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [still]);

    return (
        <>
            <WorldMap globe={false} minZoom={2} onMap={initMap}>
                <MapReady onMap={initMap}/>

                {/* Every nation's cities as faint dots — the live game's backdrop. */}
                <Source id="hero-backdrop" type="geojson" data={backdropFC}>
                    <Layer id="backdrop-cities" type="circle" paint={{
                        "circle-radius": ["case", ["==", ["get", "cap"], 1], 2.3, 1.3],
                        "circle-color": "#6a707a", "circle-opacity": 0.5,
                    }}/>
                </Source>

                {/* Radar coverage — the game's dashed picket (drawn under defense
                    rings so the tighter engagement bubbles read on top). */}
                <Source id="hero-radar" type="geojson" data={radarFC}>
                    <Layer id="radar-fill" type="fill" paint={{"fill-color": RADAR_TINT, "fill-opacity": 0.04}}/>
                    <Layer id="radar-ring" type="line"
                           paint={{"line-color": RADAR_TINT, "line-width": 0.9, "line-opacity": 0.4, "line-dasharray": [3, 3]}}/>
                </Source>

                {/* Defense engagement rings — the game's solid battery footprints. */}
                <Source id="hero-defense" type="geojson" data={defenseFC}>
                    <Layer id="defense-fill" type="fill" paint={{"fill-color": DEFENDER, "fill-opacity": 0.05}}/>
                    <Layer id="defense-ring" type="line"
                           paint={{"line-color": DEFENDER, "line-width": 0.9, "line-opacity": 0.45}}/>
                </Source>

                {/* The homeland's cities, lit like the player's own in-game. */}
                <Source id="hero-us-cities" type="geojson" data={usCitiesFC}>
                    <Layer id="us-cities" type="circle" paint={{
                        "circle-radius": ["case", ["==", ["get", "cap"], 1], 5, 3],
                        "circle-color": DEFENDER,
                        "circle-stroke-color": "#ffffff",
                        "circle-stroke-width": ["case", ["==", ["get", "cap"], 1], 1.4, 0.7],
                        "circle-stroke-opacity": 0.85,
                    }}/>
                </Source>

                {SITES.map((s, i) => (
                    <Marker key={i} longitude={s.at[0]} latitude={s.at[1]} anchor="center" opacityWhenCovered="0">
                        <div className="grid place-items-center [filter:drop-shadow(0_0_5px_rgba(127,212,255,0.65))_drop-shadow(0_1px_2px_#000)]">
                            <UnitIcon name={UNIT_ICON[s.t]} color={DEFENDER} size={s.t === "radar" || s.t === "carrier" ? 20 : 22}/>
                        </div>
                    </Marker>
                ))}

                {/* Interceptors on CAP — real aircraft sprite banked to heading and
                    lifted off the ground by its altitude, as a based jet reads in-game. */}
                {proj.aircraft.map((a) => (
                    <Marker key={a.id} longitude={a.lng} latitude={a.lat} anchor="center"
                            opacityWhenCovered="0" offset={[0, -a.alt * 30]}>
                        <div className="grid place-items-center [filter:drop-shadow(0_0_4px_rgba(127,212,255,0.7))_drop-shadow(0_1px_2px_#000)]">
                            <span className="inline-flex" style={{transform: `rotate(${a.heading}deg) scale(${(0.7 + a.alt * 0.3).toFixed(3)})`}}>
                                <UnitIcon name={UNIT_ICON.interceptor} color={DEFENDER} size={16}/>
                            </span>
                        </div>
                    </Marker>
                ))}

                {booms.map((e) => (
                    <Marker key={e.id} longitude={e.lng} latitude={e.lat} anchor="center" opacityWhenCovered="0">
                        <Explosion kind={e.kind}/>
                    </Marker>
                ))}
            </WorldMap>
            <SkyLayer map={mapObj}
                      projectiles={proj.projectiles}
                      interceptors={proj.interceptors}
                      aircraft={proj.aircraft}/>
            <CountryLabels map={mapObj} labels={LABELS}/>
        </>
    );
}

// Left projection padding so the map biases right of the hero copy rail. Scales
// with viewport width and collapses on narrow screens where the copy stacks above.
function framePad(m) {
    let w = 0;
    try {
        w = m.getContainer().clientWidth || 0;
    } catch { /* tearing down */ }
    const left = w >= 1024 ? Math.min(w * 0.2, 320) : w >= 640 ? w * 0.1 : 0;
    return {top: 0, right: 0, bottom: 0, left};
}

export default function HeroDefenseScene({still = false, onReady}) {
    return (
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden="true">
            <Scene still={still} onReady={onReady}/>
            <div className="absolute inset-0 bg-[rgba(4,6,9,0.08)]"/>
        </div>
    );
}
