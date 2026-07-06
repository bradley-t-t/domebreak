// Attract mode: a real engine world where every nation is AI, fought silently
// on the globe behind the menu and login screens. A small "director" ignites
// staggered wars so missiles, intercepts and strikes keep the sky busy; when a
// war ends, a fresh cast is drafted and the next one begins. Pointer events
// are disabled — this layer is scenery, never a control surface.
import {useEffect, useMemo, useRef, useState} from "react";
import {Marker} from "react-map-gl/maplibre";
import WorldMap from "../../map/WorldMap.jsx";
import SkyLayer from "./SkyLayer.jsx";
import Explosion from "./Explosion.jsx";
import {atWar, createWorld, declareWar} from "../../game/engine.js";
import {buildSetup, GREAT_POWERS} from "../../game/sim/newGame.js";
import {useEngine} from "../hooks/useEngine.js";

const CAST_SIZE = 8;
const SIM_SPEED = 4;         // wall-clock drama without the 10× blur
const OPENING_FRONTS = 3;    // wars lit immediately so the sky is never empty
const ESCALATE_MS = 12000;   // a new front roughly every 12s of wall time
const DRIFT_LNG_PER_FRAME = 0.0045; // ~16 min per revolution — barely perceptible
const RAIL_PAD = 340;        // left projection padding (px) that recenters the globe beside the menu rail

function demoWorld(data) {
    // Throwaway spectacle — Math.random is fine here, determinism only matters in real games.
    const pool = GREAT_POWERS.filter((iso) => data.cities[iso]?.length);
    const cast = [...pool].sort(() => Math.random() - 0.5).slice(0, CAST_SIZE);
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
    const [, setMapReady] = useState(0);
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

    // Recenter the globe beside the menu rail: left projection padding shifts the
    // sphere clear of the console. Drift keeps working — jumpTo doesn't touch padding.
    useEffect(() => {
        const m = mapRef.current;
        if (!m) return;
        try {
            m.easeTo({padding: {top: 0, right: 0, bottom: 0, left: framed ? RAIL_PAD : 0}, duration: 600});
        } catch { /* map tearing down */
        }
    }, [framed]);

    // Slow eastward camera drift — the globe turns under the war.
    useEffect(() => {
        let raf;
        const spin = () => {
            const m = mapRef.current;
            if (m) {
                try {
                    const c = m.getCenter();
                    m.jumpTo({center: [c.lng + DRIFT_LNG_PER_FRAME, c.lat]});
                } catch { /* map tearing down */
                }
            }
            raf = requestAnimationFrame(spin);
        };
        raf = requestAnimationFrame(spin);
        return () => cancelAnimationFrame(raf);
    }, []);

    const wars = new Set();
    for (const n of w.nations) for (const [s, r] of Object.entries(n.relations)) {
        if (r === "war") wars.add(n.slot < +s ? `${n.slot}-${s}` : `${s}-${n.slot}`);
    }

    return (
        <>
            <WorldMap globe onMap={(m) => {
                mapRef.current = m;
                // Pull back so the whole globe reads as a war-room backdrop, and
                // offset it past the rail from the first frame (no visible slide).
                try {
                    // Correct the canvas if the map initialized before its container
                    // had size (leaves the GL canvas stuck at its 400×300 fallback).
                    m.resize();
                    m.jumpTo({center: [24, 24], zoom: 1.45, padding: {top: 0, right: 0, bottom: 0, left: framed ? RAIL_PAD : 0}});
                } catch { /* map tearing down */
                }
                setMapReady((x) => x + 1);
            }}>
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
