// Attract mode: a real engine world where every nation is AI, fought silently
// on the globe behind the menu and login screens. A small "director" ignites
// staggered wars so missiles, intercepts and strikes keep the sky busy; when a
// war ends, a fresh cast is drafted and the next one begins. The camera slowly
// spins the globe on its axis and breathes in and out over the action, and the
// map carries the same political tints, unit sprites and dying cities the live
// game shows — so the backdrop reads as an actual match in progress. Pointer
// events are disabled — this layer is scenery, never a control surface.
import {useEffect, useMemo, useRef, useState} from "react";
import {Layer, Marker, Source} from "react-map-gl/maplibre";
import WorldMap from "../../map/WorldMap.jsx";
import SkyLayer from "./SkyLayer.jsx";
import Explosion from "./Explosion.jsx";
import UnitIcon from "../common/UnitIcon.jsx";
import {atWar, createWorld, declareWar, UNIT_ICON, UNITS, vitalityOf} from "../../game/engine.js";
import {buildSetup} from "../../game/sim/newGame.js";
import {MAX_SLOTS} from "../../game/data/constants.js";
import {useEngine} from "../hooks/useEngine.js";

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

// Distinct faction palette so opposing sides read apart at a glance. Indexed by
// engine slot; wraps if the cast somehow exceeds the palette.
const FACTION_COLORS = [
    "#e0574f", "#4f9be0", "#57c98a", "#e0b24f", "#b06fe0", "#e0894f", "#4fd3e0", "#e04f97",
    "#88e04f", "#dfe04f", "#5560e0", "#e05f5f", "#4fe0b0", "#c3ccd8", "#a07a4f", "#6f8aa0",
];
const factionColor = (slot) => FACTION_COLORS[(((slot | 0) % FACTION_COLORS.length) + FACTION_COLORS.length) % FACTION_COLORS.length];
const ROT_STATIC = {airstrip: 42}; // static sprites read at a fixed cant

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

function AttractWorld({data, onOver, framed}) {
    const world = useMemo(() => demoWorld(data), [data]);
    const [w] = useEngine(world);
    const mapRef = useRef(null);
    const [mapReady, setMapReady] = useState(0);
    const [explosions, setExplosions] = useState([]);
    const [counts, setCounts] = useState({strikes: 0, intercepts: 0});
    const seen = useRef(new Set());

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
        let strikes = 0, intercepts = 0;
        for (const e of w.events) {
            if (seen.current.has(e.id)) continue;
            seen.current.add(e.id);
            if (e.type === "intercept") {
                intercepts++;
                fresh.push({id: e.id, lng: e.lng, lat: e.lat, kind: "intercept"});
            } else if (e.type === "hit" || e.type === "destroy") {
                strikes++;
                fresh.push({id: e.id, lng: e.lng, lat: e.lat, kind: e.type});
            } else if (e.type === "mirv" || e.type === "miss") {
                fresh.push({id: e.id, lng: e.lng, lat: e.lat, kind: e.type});
            }
        }
        if (seen.current.size > 500) seen.current = new Set(w.events.map((e) => e.id));
        if (w.over) onOver?.();
        if (!fresh.length) return;
        if (strikes || intercepts) {
            setCounts((c) => ({strikes: c.strikes + strikes, intercepts: c.intercepts + intercepts}));
        }
        setExplosions((list) => [...list, ...fresh]);
        for (const e of fresh) {
            setTimeout(() => setExplosions((list) => list.filter((x) => x.id !== e.id)), 850);
        }
    }, [w.time]);

    // Political tints: paint each nation's land and border in its flag color so
    // the globe reads as a real theater of factions, exactly like the live map.
    useEffect(() => {
        let cancelled = false;
        fetch("/assets/colors.json").then((r) => r.json()).then((cols) => {
            if (cancelled) return;
            const tintPairs = [];
            const linePairs = [];
            const mix = (v, g) => Math.round(v * 0.6 + g * 0.4); // borders muted toward neutral
            for (const [gid, c] of Object.entries(cols)) {
                tintPairs.push(gid, `rgb(${c[0]},${c[1]},${c[2]})`);
                linePairs.push(gid, `rgb(${mix(c[0], 96)},${mix(c[1], 100)},${mix(c[2], 108)})`);
            }
            const m = mapRef.current;
            if (!m || !tintPairs.length) return;
            try {
                m.setPaintProperty("country-tint", "fill-color", ["match", ["get", "GID_0"], ...tintPairs, "#767b84"]);
                // Lift the tint above the gameplay default so factions read as scenery.
                m.setPaintProperty("country-tint", "fill-opacity", ["interpolate", ["linear"], ["zoom"], 1.6, 0.28, 3.2, 0.2, 5, 0.08]);
                m.setPaintProperty("country-line", "line-color", ["match", ["get", "GID_0"], ...linePairs, "#454b53"]);
            } catch { /* style not ready yet — retry keyed on mapReady below */
            }
        }).catch(() => { /* colors optional */
        });
        return () => {
            cancelled = true;
        };
    }, [mapReady]);

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
    const cam = useRef({lng: 24, started: null, last: 0});
    useEffect(() => {
        let raf;
        const step = (t) => {
            const m = mapRef.current;
            if (m) {
                const st = cam.current;
                if (st.started == null) st.started = st.last = t;
                const dt = Math.min((t - st.last) / 1000, 0.05); // clamp long frames (tab defocus)
                st.last = t;
                const elapsed = (t - st.started) / 1000;
                st.lng += SPIN_DEG_PER_S * dt;
                const zoom = ZOOM_MID + ZOOM_AMP * Math.sin(elapsed * (2 * Math.PI / ZOOM_PERIOD_S) - Math.PI / 2);
                const lat = LAT_BASE + LAT_AMP * Math.sin(elapsed * (2 * Math.PI / LAT_PERIOD_S));
                try {
                    m.jumpTo({center: [st.lng, lat], zoom});
                    const [lo, hi] = UNIT_FADE;
                    const o = Math.max(0, Math.min(1, (zoom - lo) / (hi - lo)));
                    const c = m.getContainer();
                    c.style.setProperty("--gd-unit-opacity", o.toFixed(3));
                    c.classList.toggle("gd-units-faded", o < 0.04);
                } catch { /* map tearing down */
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
                color: c.alive ? factionColor(c.slot) : "#3a3a3a",
            },
            geometry: {type: "Point", coordinates: [c.lng, c.lat]},
        })),
    }), [w.cities, w.time]);

    const wars = new Set();
    for (const n of w.nations) for (const [s, r] of Object.entries(n.relations)) {
        if (r === "war") wars.add(n.slot < +s ? `${n.slot}-${s}` : `${s}-${n.slot}`);
    }

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
            }}>
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
                        "circle-stroke-color": ["interpolate", ["linear"], ["get", "vit"], 0, "#ff3b3b", 0.5, "#ffb020", 1, "#46d38a"],
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
                    const alt = air ? (u.alt || 0) : 0;
                    const heading = unitHeading(u);
                    const iconStyle = {};
                    if (heading != null) iconStyle.transform = `rotate(${heading}deg)`;
                    if (air) {
                        iconStyle.opacity = u.vis ?? 1; // engine drives fade-in on takeoff / out on landing
                        iconStyle.transform = `${iconStyle.transform || ""} scale(${(0.7 + alt * 0.3).toFixed(3)})`.trim();
                    }
                    return (
                        <Marker key={u.id} longitude={u.lng} latitude={u.lat} anchor="center"
                                offset={air ? [0, -alt * 30] : undefined}>
                            <div className="gd-unit enemy">
                                <span className="gd-unit-icon"
                                      style={Object.keys(iconStyle).length ? iconStyle : undefined}>
                                    <UnitIcon name={UNIT_ICON[u.type]} color={factionColor(u.slot)} size={air ? 16 : 22}/>
                                </span>
                            </div>
                        </Marker>
                    );
                })}

                {explosions.map((e) => (
                    <Marker key={e.id} longitude={e.lng} latitude={e.lat} anchor="center">
                        <Explosion kind={e.kind}/>
                    </Marker>
                ))}
            </WorldMap>
            <SkyLayer map={mapRef.current}
                      projectiles={w.projectiles}
                      interceptors={w.interceptors}
                      aircraft={w.units.filter((u) => u.baseId && u.hp > 0 && (u.alt || 0) > 0.02)}
                      tick={w.time}/>
            <div className="gd-attract-ticker">
                LIVE SIMULATION · {wars.size} FRONTS · {counts.strikes} STRIKES · {counts.intercepts} INTERCEPTS
            </div>
        </>
    );
}

export default function AttractSim({data, framed}) {
    // Remount with a fresh cast once a war fully resolves.
    const [gen, setGen] = useState(0);
    if (!data) return null;
    return (
        <div className="gd-attract" aria-hidden="true">
            <AttractWorld key={gen} data={data} framed={framed}
                          onOver={() => setTimeout(() => setGen((g) => g + 1), 4000)}/>
            <div className="gd-attract-shade"/>
        </div>
    );
}
