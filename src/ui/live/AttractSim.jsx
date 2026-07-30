// Attract mode: a real engine world where every nation is AI, fought silently
// on the globe behind the menu and login screens. A small "director" ignites
// staggered wars so missiles, intercepts and strikes keep the sky busy; when a
// war ends, a fresh cast is drafted and the next one begins. The camera slowly
// spins the globe on its axis and breathes in and out over the action, and the
// map carries the same political tints, unit sprites and dying cities the live
// game shows — so the backdrop reads as an actual match in progress. Pointer
// events are disabled — this layer is scenery, never a control surface.
//
// Runs a real engine world mutated in place and re-rendered on its own tick, so
// its effects/memos key off w.time — a trigger exhaustive-deps can't model; off here.
/* eslint-disable react-hooks/exhaustive-deps */
import {useEffect, useMemo, useRef, useState} from "react";
import {Layer, Marker, Source} from "react-map-gl/maplibre";
import WorldMap from "../../map/WorldMap.jsx";
import SkyLayer from "./SkyLayer.jsx";
import Explosion from "./Explosion.jsx";
import KillMark from "./KillMark.jsx";
import FalloutCloud from "./FalloutCloud.jsx";
import UnitIcon from "../common/UnitIcon.jsx";
import {atWar, createWorld, declareWar, falloutIntensity, UNIT_ICON, UNITS, vitalityOf} from "../../game/engine.js";
import {buildSetup} from "../../game/sim/newGame.js";
import {circle, geoCircle, GEODESIC_MAX_KM} from "../../game/geo/geo.js";
import {norm01} from "../../lib/math.js";
import {MAX_SLOTS} from "../../game/data/constants.js";
import {toGid3} from "../../game/data/iso3.js";
import {loadJsonAsset} from "../../lib/fetchJson.js";
import {useEngine} from "../hooks/useEngine.js";
import {vitPaint} from "../lib/status.js";
import {buildPoliticalTint, flagColor} from "../lib/politicalTint.js";

const CAST_SIZE = MAX_SLOTS; // fill every belligerent slot the engine supports (16)
const SIM_SPEED = 4;         // wall-clock drama without the 10× blur
const OPENING_FRONTS = 6;    // wars lit immediately so the whole globe is alight
const ESCALATE_MS = 7000;    // a new front roughly every 7s of wall time
const RAIL_PAD = 340;        // left projection padding (px) that recenters the globe beside the menu rail

// Camera choreography. The globe turns steadily on its axis while the zoom
// breathes in toward the fighting and back out to the full sphere, and the view
// wanders north/south so different theaters roll through frame.
const SPIN_DEG_PER_S = 360 / 90;   // one revolution every ~90s — clearly turning, still calm
const ZOOM_MIN = 1.9;              // pulled all the way out: the whole planet as a war-room globe
const ZOOM_MAX = 3.2;              // pushed in: continents, borders and missile arcs read clearly
const ZOOM_MID = (ZOOM_MIN + ZOOM_MAX) / 2;
const ZOOM_AMP = (ZOOM_MAX - ZOOM_MIN) / 2;
const ZOOM_PERIOD_S = 42;          // one full out→in→out breath
const LAT_BASE = 20;               // centre latitude the wander oscillates around
const LAT_AMP = 16;                // north/south sweep
const LAT_PERIOD_S = 74;
// Unit sprites fade in as the camera pushes past the whole-earth view and fade
// out as it pulls back, so the wide end of the breath stays clean.
const UNIT_FADE = [2.05, 2.75];

// Fallback faction palette, used only for a belligerent whose flag color is
// missing from colors.json. The live map colors every nation by its real flag
// hue (see politicalTint) and so does the attract cast, so a nation's land,
// cities and units all read in one national color — this just backstops a gap.
const FACTION_COLORS = [
    "#e0574f", "#4f9be0", "#57c98a", "#e0b24f", "#b06fe0", "#e0894f", "#4fd3e0", "#e04f97",
    "#88e04f", "#dfe04f", "#5560e0", "#e05f5f", "#4fe0b0", "#c3ccd8", "#a07a4f", "#6f8aa0",
];
const fallbackColor = (slot) => FACTION_COLORS[(((slot | 0) % FACTION_COLORS.length) + FACTION_COLORS.length) % FACTION_COLORS.length];
const ROT_STATIC = {airstrip: 42}; // static sprites read at a fixed cant
const ORBIT_LIFT_PX = 34;           // screen lift per unit of orbitLift, matching the live map

// Stable empty FeatureCollection for "no fallout this tick" — same identity every
// idle tick so the <Source> deep-equal never runs.
const EMPTY_FC = {type: "FeatureCollection", features: []};
// Fallout footprint ring, matching the live map: a geodesic cap on the globe,
// falling back to the Mercator disc past a hemisphere. Attract is always globe.
const falloutRing = (lng, lat, km, steps) =>
    (km <= GEODESIC_MAX_KM ? geoCircle : circle)(lng, lat, km, steps);

// Belligerent pool grouped by region. The engine caps at 16 active nations
// (MAX_SLOTS), so we can't literally arm all ~220 countries — instead we draft
// across every continent so a fresh cast always lights wars worldwide, not just
// among the northern great powers.
const DEMO_REGIONS = {
    americas: ["US", "CA", "BR", "AR", "MX", "CO"],
    europe: ["GB", "FR", "DE", "IT", "ES", "PL", "UA"],
    mideast: ["RU", "TR", "IR", "SA", "EG", "PK"],
    asia: ["CN", "IN", "JP", "KR", "ID", "TH", "VN"],
    africa: ["ZA", "NG", "DZ"],
    oceania: ["AU"],
};

// Round-robin draft: shuffle each region, then pull one per region in rotation
// until the cast is full. Guarantees geographic spread every remount.
function draftCast(data) {
    const shuffle = (a) => [...a].sort(() => Math.random() - 0.5);
    const buckets = Object.values(DEMO_REGIONS)
        .map((r) => shuffle(r.filter((iso) => data.cities[iso]?.length)));
    const cast = [];
    for (let i = 0; cast.length < CAST_SIZE && buckets.some((b) => b.length); i++) {
        const b = buckets[i % buckets.length];
        if (b.length) cast.push(b.shift());
    }
    return cast;
}

function demoWorld(data) {
    // Throwaway spectacle — Math.random is fine here, determinism only matters in real games.
    const cast = draftCast(data);
    const setup = buildSetup(data, cast[0], cast.slice(1), Math.floor(Math.random() * 1e9) || 1);
    setup.nations.forEach((n) => {
        n.isAi = true;
    });
    const w = createWorld(setup);
    w.speed = SIM_SPEED;
    w.paused = false;
    // Attract mode is pure spectacle — the war director ignites fronts at t=0,
    // so bypass the opening-grace ceasefire that would otherwise reject them.
    if (w.rules) w.rules.playerGraceSec = 0;
    return w;
}

function igniteFront(w) {
    const live = w.nations.filter((n) => n.alive);
    const pairs = [];
    for (const a of live) for (const b of live) {
        if (a.slot < b.slot && !atWar(w, a.slot, b.slot)) pairs.push([a.slot, b.slot]);
    }
    if (!pairs.length) return;
    const [a, b] = pairs[(Math.random() * pairs.length) | 0];
    declareWar(w, a, b);
}

function AttractWorld({data, onOver, framed, onReady}) {
    const world = useMemo(() => demoWorld(data), [data]);
    const [w] = useEngine(world);
    const mapRef = useRef(null);
    const [mapReady, setMapReady] = useState(0);
    const [explosions, setExplosions] = useState([]);
    const seen = useRef(new Set());

    // Flag colors (GID_0 -> [r,g,b]), the same table the live map paints from.
    // Loaded once; until it lands the fallback palette stands in so the globe is
    // never colorless.
    const [cols, setCols] = useState(null);
    useEffect(() => {
        let live = true;
        loadJsonAsset("/assets/colors.json", {cache: true}).then((c) => {
            if (live) setCols(c);
        });
        return () => {
            live = false;
        };
    }, []);
    // One national color per slot — the nation's real flag hue — shared by its
    // land tint, its city dots and its unit sprites, so each faction reads in a
    // single color exactly like a live match. Falls back to the palette on a gap.
    const slotColors = useMemo(() => {
        const out = [];
        for (const n of w.nations) out[n.slot] = flagColor(cols, toGid3(n.iso)) || fallbackColor(n.slot);
        return out;
    }, [cols, w.nations]);
    const slotColor = (slot) => slotColors[slot] || fallbackColor(slot);

    // Active vs wiped-out belligerents for the political tint. Recomputed whenever
    // a nation's active/wiped state flips — a routed power is neutralized mid-war,
    // so the sets aren't fixed for the match.
    const nationSig = w.nations.reduce((s, n) => `${s}${n.active === false ? 0 : 1}${n.wipedOut ? 1 : 0}`, "");
    const {activeGids, wipedGids} = useMemo(() => {
        const active = new Set(), wiped = new Set();
        for (const n of w.nations) {
            const gid = toGid3(n.iso);
            if (!gid) continue;
            if (n.wipedOut) wiped.add(gid);
            else if (n.active !== false) active.add(gid);
        }
        return {activeGids: active, wipedGids: wiped};
    }, [nationSig]);

    // War director: open with several fronts, then keep escalating.
    useEffect(() => {
        for (let i = 0; i < OPENING_FRONTS; i++) igniteFront(w);
        const t = setInterval(() => igniteFront(w), ESCALATE_MS);
        return () => clearInterval(t);
    }, [w]);

    // Omniscient explosion feed — same event contract LiveGame consumes, no
    // per-slot visibility filter and no sound.
    useEffect(() => {
        const fresh = [];
        for (const e of w.events) {
            if (seen.current.has(e.id)) continue;
            seen.current.add(e.id);
            if (e.type === "intercept") {
                fresh.push({id: e.id, lng: e.lng, lat: e.lat, kind: "intercept", alt: e.alt || 0});
            } else if (e.type === "hit" || e.type === "destroy" || e.type === "mirv" || e.type === "miss") {
                // Air detonations (a MIRV split, an interceptor miss) carry an
                // altitude so their fireball lifts off the deck like the live map;
                // surface hits and kills sit on the ground.
                const alt = (e.type === "mirv" || e.type === "miss") ? (e.alt || 0) : 0;
                fresh.push({id: e.id, lng: e.lng, lat: e.lat, kind: e.type, alt});
                // Confirmed unit kill: the "target eliminated" reticle over the fireball.
                if (e.type === "destroy" && e.kind === "unit") fresh.push({id: `${e.id}-kill`, lng: e.lng, lat: e.lat, kind: "kill", alt: 0});
            }
        }
        if (seen.current.size > 500) seen.current = new Set(w.events.map((e) => e.id));
        if (w.over) onOver?.();
        if (!fresh.length) return;
        setExplosions((list) => [...list, ...fresh]);
        for (const e of fresh) {
            setTimeout(() => setExplosions((list) => list.filter((x) => x.id !== e.id)), 850);
        }
    }, [w.time]);

    // Political tint, the exact model the live map uses (see politicalTint): only
    // the belligerent cast wears its flag color, nations wiped out in war fade to
    // the scorched wash, and every other country on the globe is neutral scenery
    // grey — so the attract world reads as a real bounded match, not a rainbow of
    // all 200-odd countries. Re-applied when the active/wiped sets shift or the
    // style reloads.
    useEffect(() => {
        if (!cols) return;
        const m = mapRef.current;
        if (!m) return;
        const {tint, line} = buildPoliticalTint(cols, {activeGids, wipedGids});
        try {
            m.setPaintProperty("country-tint", "fill-color", tint);
            // Lift the tint above the gameplay default so factions read as scenery
            // across the whole-earth breath.
            m.setPaintProperty("country-tint", "fill-opacity", ["interpolate", ["linear"], ["zoom"], 1.6, 0.28, 3.2, 0.2, 5, 0.08]);
            m.setPaintProperty("country-line", "line-color", line);
        } catch { /* style not ready yet — retry keyed on mapReady below */
        }
    }, [cols, activeGids, wipedGids, mapReady]);

    // Recenter the globe beside the menu rail: left projection padding shifts the
    // sphere clear of the console. The camera loop below never touches padding.
    useEffect(() => {
        const m = mapRef.current;
        if (!m) return;
        try {
            m.easeTo({padding: {top: 0, right: 0, bottom: 0, left: framed ? RAIL_PAD : 0}, duration: 600});
        } catch { /* map tearing down */
        }
    }, [framed]);

    // Single camera loop: steady axial spin + a slow zoom breath + a north/south
    // wander, plus the zoom-driven unit fade. Time-based so speed is frame-rate
    // independent; jumpTo leaves padding (the rail offset) untouched.
    const cam = useRef({lng: 24, started: null, last: 0, paintAcc: 0});
    useEffect(() => {
        let raf;
        const RENDER_HZ = 30; // throttle MapLibre repaints (was every frame)
        const step = (t) => {
            const m = mapRef.current;
            if (m) {
                const st = cam.current;
                if (st.started == null) st.started = st.last = t;
                const dt = Math.min((t - st.last) / 1000, 0.05); // clamp long frames (tab defocus)
                st.last = t;

                // Perf: when the globe is off screen or the tab is hidden, pause the
                // whole simulation and stop repainting MapLibre — so scrolling the
                // rest of the page (and background tabs) stay smooth. Resumes on return.
                const c = m.getContainer();
                const r = c.getBoundingClientRect();
                const vh = window.innerHeight || 0, vw = window.innerWidth || 0;
                const onScreen = document.visibilityState !== "hidden"
                    && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
                if (!onScreen) {
                    w.paused = true;
                    raf = requestAnimationFrame(step);
                    return;
                }
                if (w.paused) w.paused = false;

                const elapsed = (t - st.started) / 1000;
                st.lng += SPIN_DEG_PER_S * dt;
                st.paintAcc += dt;
                if (st.paintAcc >= 1 / RENDER_HZ) {
                    st.paintAcc = 0;
                    const zoom = ZOOM_MID + ZOOM_AMP * Math.sin(elapsed * (2 * Math.PI / ZOOM_PERIOD_S) - Math.PI / 2);
                    const lat = LAT_BASE + LAT_AMP * Math.sin(elapsed * (2 * Math.PI / LAT_PERIOD_S));
                    try {
                        m.jumpTo({center: [st.lng, lat], zoom});
                        const [lo, hi] = UNIT_FADE;
                        const o = norm01(zoom, lo, hi);
                        c.style.setProperty("--db-unit-opacity", o.toFixed(3));
                        c.classList.toggle("db-units-faded", o < 0.04);
                    } catch { /* map tearing down */
                    }
                }
            }
            raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, []);

    // Per-slot heading from the unit's facing point, projected to screen so ground
    // silhouettes point the right way in both globe and flat. No unwrap memo — at
    // attract scale the occasional short spin is imperceptible.
    const unitHeading = (u) => {
        const m = mapRef.current;
        let deg = ROT_STATIC[u.type] ?? null;
        if (m && u.face) {
            try {
                const a = m.project([u.lng, u.lat]);
                const b = m.project([u.face.lng, u.face.lat]);
                if (Math.hypot(b.x - a.x, b.y - a.y) >= 0.6) deg = (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI;
            } catch { /* projection not ready */
            }
        }
        return deg;
    };

    // Cities as faction-colored dots that scar into craters as they die — the
    // same three-layer treatment (ruin / damage halo / live dot) LiveGame uses.
    const cityFC = useMemo(() => ({
        type: "FeatureCollection",
        features: w.cities.map((c) => ({
            type: "Feature",
            properties: {
                cap: c.cap ? 1 : 0,
                dead: c.alive ? 0 : 1,
                vit: c.alive ? vitalityOf(c) : 1,
                color: c.alive ? slotColor(c.slot) : "#3a3a3a",
            },
            geometry: {type: "Point", coordinates: [c.lng, c.lat]},
        })),
    }), [w.cities, w.time, slotColors]);

    // Radioactive fallout footprints — the glowing contamination haze the live map
    // draws over a nuclear strike. One polygon per active cloud, its opacity
    // tracking the cloud's live intensity; rebuilt each tick as clouds grow,
    // drift and decay. A stable empty FC when there are none costs nothing.
    const falloutFC = useMemo(() => {
        const clouds = (w.effects || []).filter((fx) => fx.type === "fallout");
        if (!clouds.length) return EMPTY_FC;
        return {
            type: "FeatureCollection",
            features: clouds.map((fx) => {
                const c = falloutRing(fx.lng, fx.lat, fx.radiusKm, 48);
                c.properties = {intensity: falloutIntensity(fx.age)};
                return c;
            }),
        };
    }, [w.effects, w.time]);

    return (
        <>
            <WorldMap globe onMap={(m) => {
                mapRef.current = m;
                try {
                    // Correct the canvas if the map initialized before its container
                    // had size (leaves the GL canvas stuck at its 400×300 fallback).
                    m.resize();
                    m.jumpTo({
                        center: [cam.current.lng, LAT_BASE], zoom: ZOOM_MIN,
                        padding: {top: 0, right: 0, bottom: 0, left: framed ? RAIL_PAD : 0},
                    });
                } catch { /* map tearing down */
                }
                setMapReady((x) => x + 1);
                // Signal the host once the first tiles have actually painted, so a
                // consumer (e.g. the marketing site) can fade the globe in only when
                // it's real, not on a blind timer. One-shot; the spin never idles.
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
            }}>
                {/* Radioactive fallout haze, drawn under the cities so ruins and dots
                    stay legible on top — same treatment as the live map. */}
                <Source id="attract-fallout" type="geojson" data={falloutFC}>
                    <Layer id="attract-fallout-haze" type="fill" paint={{
                        "fill-color": "#8cff3a",
                        "fill-opacity": ["*", ["get", "intensity"], 0.17],
                    }}/>
                    <Layer id="attract-fallout-edge" type="line" paint={{
                        "line-color": "#b6ff5c",
                        "line-width": 1,
                        "line-dasharray": [2, 2],
                        "line-opacity": ["*", ["get", "intensity"], 0.55],
                    }}/>
                </Source>

                <Source id="attract-src" type="geojson" data={cityFC}>
                    {/* Destroyed city: a scorched crater with a burnt scar ring. */}
                    <Layer id="attract-city-ruin" type="circle" filter={["==", ["get", "dead"], 1]} paint={{
                        "circle-radius": ["case", ["==", ["get", "cap"], 1], 9, 7],
                        "circle-color": "#160c0a",
                        "circle-opacity": 0.88,
                        "circle-stroke-color": "#c2410c",
                        "circle-stroke-width": 1.8,
                        "circle-stroke-opacity": 0.9,
                    }}/>
                    {/* Damage halo: green→amber→red ring that thickens as a city is hit. */}
                    <Layer id="attract-city-health" type="circle" filter={["<", ["get", "vit"], 0.999]} paint={{
                        "circle-radius": ["case", ["==", ["get", "cap"], 1], 8, 6],
                        "circle-color": "rgba(0,0,0,0)",
                        "circle-stroke-width": ["interpolate", ["linear"], ["get", "vit"], 0, 3, 1, 0.6],
                        "circle-stroke-color": vitPaint(),
                        "circle-stroke-opacity": ["interpolate", ["linear"], ["get", "vit"], 0, 0.95, 0.9, 0.85, 1, 0],
                    }}/>
                    <Layer id="attract-cities" type="circle" paint={{
                        "circle-radius": ["case", ["==", ["get", "cap"], 1], 5, 3],
                        "circle-color": ["get", "color"],
                        "circle-stroke-color": "#05070c",
                        "circle-stroke-width": 0.6,
                    }}/>
                </Source>

                {w.units.filter((u) => u.hp > 0).map((u) => {
                    const def = UNITS[u.type];
                    if (!def) return null;
                    const air = !!(def.airSpeed && u.baseId);
                    if (air && (!u.phase || u.phase === "ground")) return null; // housed in the base — not on the map
                    const orbital = !!def.orbital;
                    const alt = air ? (u.alt || 0) : 0;
                    const heading = unitHeading(u);
                    const iconStyle = {};
                    if (heading != null) iconStyle.transform = `rotate(${heading}deg)`;
                    if (air) {
                        iconStyle.opacity = u.vis ?? 1; // engine drives fade-in on takeoff / out on landing
                        iconStyle.transform = `${iconStyle.transform || ""} scale(${(0.7 + alt * 0.3).toFixed(3)})`.trim();
                    }
                    // Orbital assets float above the surface (like the live map) so a
                    // satellite reads as being in orbit rather than sitting on land.
                    const offset = orbital ? [0, -Math.round((def.orbitLift || 1) * ORBIT_LIFT_PX)]
                        : air ? [0, -alt * 30] : undefined;
                    return (
                        <Marker key={u.id} longitude={u.lng} latitude={u.lat} anchor="center"
                                opacityWhenCovered="0" offset={offset}>
                            <div className="grid place-items-center cursor-pointer [filter:drop-shadow(0_0_4px_currentColor)_drop-shadow(0_1px_2px_#000)] opacity-(--db-unit-opacity,1)">
                                <span className={`inline-flex transition-transform duration-[170ms] ease-linear${orbital ? " db-orbital" : ""}`}
                                      style={Object.keys(iconStyle).length ? iconStyle : undefined}>
                                    <UnitIcon name={UNIT_ICON[u.type]} color={slotColor(u.slot)} size={air ? 16 : orbital ? 18 : 22}/>
                                </span>
                            </div>
                        </Marker>
                    );
                })}

                {/* Animated fallout epicenters: the living trefoil core that sits on
                    top of the haze, matching the live map's centerpiece. */}
                {(w.effects || []).filter((fx) => fx.type === "fallout").map((fx) => (
                    <Marker key={fx.id} longitude={fx.lng} latitude={fx.lat} anchor="center" opacityWhenCovered="0">
                        <FalloutCloud intensity={falloutIntensity(fx.age)}/>
                    </Marker>
                ))}

                {explosions.map((e) => (
                    <Marker key={e.id} longitude={e.lng} latitude={e.lat} anchor="center"
                            opacityWhenCovered="0" offset={[0, -(e.alt || 0) * 70]}>
                        {e.kind === "kill" ? <KillMark/> : <Explosion kind={e.kind}/>}
                    </Marker>
                ))}
            </WorldMap>
            <SkyLayer map={mapRef.current}
                      projectiles={w.projectiles}
                      interceptors={w.interceptors}
                      aircraft={w.units.filter((u) => u.baseId && u.hp > 0 && (u.alt || 0) > 0.02)}
                      tick={w.time}/>
        </>
    );
}

export default function AttractSim({data, framed, onReady}) {
    // Remount with a fresh cast once a war fully resolves.
    const [gen, setGen] = useState(0);
    if (!data) return null;
    return (
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden="true">
            <AttractWorld key={gen} data={data} framed={framed}
                          onReady={gen === 0 ? onReady : undefined}
                          onOver={() => setTimeout(() => setGen((g) => g + 1), 4000)}/>
            <div className="absolute inset-0 bg-[rgba(4,6,9,0.22)]"/>
        </div>
    );
}
