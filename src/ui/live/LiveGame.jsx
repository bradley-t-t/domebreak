import {useEffect, useMemo, useRef, useState} from "react";
import WorldMap, {COUNTRY_FILL_OPACITY} from "../../map/WorldMap.jsx";
import LiveHud from "../hud/LiveHud.jsx";
import LayerBar from "../hud/LayerBar.jsx";
import ProductionBar from "../hud/ProductionBar.jsx";
import NationPanel from "../hud/NationPanel.jsx";
import NewsTicker from "../hud/NewsTicker.jsx";
import LeadershipAlert from "../hud/LeadershipAlert.jsx";
import UnitIcon from "../common/UnitIcon.jsx";
import SkyLayer from "./SkyLayer.jsx";
import CountryLabels from "./CountryLabels.jsx";
import Explosion from "./Explosion.jsx";
import FalloutCloud from "./FalloutCloud.jsx";
import ContextMenu from "../hud/ContextMenu.jsx";
import PinnedBar from "../hud/PinnedBar.jsx";
import Flag from "../common/Flag.jsx";
import Meter from "../common/Meter.jsx";
import {Layer, Marker, Source} from "react-map-gl/maplibre";
import {useGameSession} from "../hooks/useGameSession.js";
import {useEventEffects} from "../hooks/useEventEffects.js";
import {useKeyboardControls} from "../hooks/useKeyboardControls.js";
import {usePanControls} from "../hooks/usePanControls.js";
import {button, miniButton, overlay, card, sub} from "../lib/variants.js";
import {vitPaint} from "../common/status.js";
import {cn} from "../lib/cn.js";
import TechTree from "../screens/TechTree.jsx";
import ProductionScreen from "../screens/ProductionScreen.jsx";
import DiplomacyScreen from "../screens/DiplomacyScreen.jsx";
import ControlsOverlay from "../screens/ControlsOverlay.jsx";
import HoverReadout from "./HoverReadout.jsx";
import {
    armamentOf,
    COAST_KM,
    defenseMinRange,
    defenseRange,
    falloutIntensity,
    falloutDoseAt,
    FALLOUT,
    gdpOf,
    hangarCapOf,
    hangarCount,
    haversine,
    INTERCEPT_CAP,
    inTerritory,
    placementBlocked,
    populationOf,
    PATROL_FIGHTER,
    RADAR_RANGE_MULT,
    radarLinked,
    radarRangeOf,
    SCRAP_REFUND_FRAC,
    sensorsCover,
    UNIT_ICON,
    unitLabel,
    UNITS,
    vitalityOf
} from "../../game/engine.js";
import {toGid3} from "../../game/data/iso3.js";
import {START_CAM, WORLD_ZOOM} from "../../game/data/constants.js";
import {resolveKeys} from "../../game/platform/keybindings.js";
import {sfx} from "../../game/platform/audio.js";
import {useLiveLayers} from "./useLiveLayers.js";
import {useOwnershipLayer} from "./useOwnershipLayer.js";
import SelectionPanel from "./SelectionPanel.jsx";
import {fmtPop} from "../common/format.js";

const CITY_LAYERS = ["live-cities"];
// Fixed sprite cant for static assets on the map (airstrip reads as a diagonal
// runway — angled the opposite way from the naval hulls in the arsenal).
const ROT_STATIC = {airstrip: 42};
// Side-view silhouettes (the marching infantryman, the TEL launch vehicle) read
// wrong if they rotate to heading — they'd tip over or drive head-down. These stay
// fixed upright while every other ground unit (a top-down silhouette) still turns to
// its bearing.
const ROT_UPRIGHT = new Set(["infantry", "launcher"]);
// Below this zoom, hovering a country shows a whole-country readout instead of a city.
const COUNTRY_ZOOM = 4.2;
// Units dissolve as the camera pulls back toward the whole-earth view: fully
// visible at/above UNIT_FADE_ZOOM[1], gone by UNIT_FADE_ZOOM[0] (min zoom is 1.1,
// so by the time the entire globe is in frame the map reads clean). Tuning knob.
const UNIT_FADE_ZOOM = [1.8, 3.0];
const REGIONS_URL = `pmtiles://${typeof window !== "undefined" ? window.location.origin : ""}/assets/regions.pmtiles`;
// Controlled-territory tint: strong enough to read the owner color at the whole-earth
// view, easing off as you zoom in and the real relief takes over.
const REGION_OWNER_OPACITY = ["interpolate", ["linear"], ["zoom"], 2, 0.7, 4, 0.52, 5.5, 0.32];
const REGION_OWNER_LINE_WIDTH = ["interpolate", ["linear"], ["zoom"], 2, 0.6, 6, 1.4];
const DEFAULT_LAYERS = {countries: true, states: false, defense: false, radar: false, pop: false, backdrop: true};
// Client-side amphibious lift radius — mirrors AMPHIB_LIFT_KM in production.js so
// the context menu only offers embark on ground units the engine will accept.
const AMPHIB_LIFT_KM = 120;

export default function LiveGame({
                                     world,
                                     net,
                                     globe,
                                     keys,
                                     onToggleGlobe,
                                     onPause,
                                     backdrop,
                                     overlayOpen,
                                     labels,
                                     onGameEnd,
                                     meBadge
                                 }) {
    // Resolved control bindings — falls back to defaults if a caller omits them.
    const K = resolveKeys(keys);
    const [w, api] = useGameSession(world, net);
    const mySlot = w.mySlot;
    const myNation = w.nations.find((n) => n.slot === mySlot);
    const myGid = useMemo(() => toGid3(myNation?.iso), [myNation?.iso]);
    const mapRef = useRef(null);

    // null | "production" | "research" | "diplomacy" — the top-bar command screens.
    const [panel, setPanel] = useState(null);
    const [placing, setPlacing] = useState(null);
    const [moving, setMoving] = useState(null);
    const [selUnit, setSelUnit] = useState(null);
    const [selCity, setSelCity] = useState(null);
    const [attackMode, setAttackMode] = useState(false);
    const [cursor, setCursor] = useState(null);
    const [placeValid, setPlaceValid] = useState(true);
    const [hoveredGid, setHoveredGid] = useState(null);
    const [layers, setLayers] = useState(DEFAULT_LAYERS);
    const [mapReady, setMapReady] = useState(0);
    const [explosions, setExplosions] = useState([]);
    const [menu, setMenu] = useState(null);
    // Amphibious landing: the transport id whose cargo the next map click lands.
    const [disembarkId, setDisembarkId] = useState(null);
    const [hover, setHover] = useState(null);
    const [pins, setPins] = useState([]);
    // In-game controls reference (toggled with ? / F1, or the corner button).
    const [helpOpen, setHelpOpen] = useState(false);
    const [err, setErr] = useState(null);
    // Loading veil: covers the map from mount until the style + tiles finish
    // (map "idle"), so the player only sees the world once it's fully drawn and
    // already framed on their capital. Failsafe timer lifts it regardless.
    const [booting, setBooting] = useState(true);
    // Failsafe: never let the loading veil stick, even if the map's onLoad never
    // fires (a WebGL/style hiccup on the lobby->match handoff would otherwise leave
    // a permanent black screen). handleMap also lifts it on the map's first idle;
    // whichever fires first wins. Mount-scoped so it's independent of the map.
    useEffect(() => {
        const t = setTimeout(() => setBooting(false), START_CAM.bootMs);
        return () => clearTimeout(t);
    }, []);

    const relation = (slot) => (myNation?.relations[slot] === "war" ? "war" : "peace");
    // Tactical allegiance color for anything drawn on the map: you = white,
    // hostile (at war) = red, everyone else = neutral grey.
    const teamColor = (slot) => (slot === mySlot ? "#f0f3f7" : relation(slot) === "war" ? "#f0556a" : "#8b94a1");
    // Your leadership airlift stands out from your white forces: a transport
    // ferry reads BLUE while it's carrying leaders and YELLOW when flying empty
    // (outbound to a pickup or back home), so a glance tells you which planes are
    // actually moving command. Its fighter escorts read green — a distinct guard.
    const unitColor = (u) => {
        if (u.slot !== mySlot) return teamColor(u.slot);
        if (u.mission?.role === "leadershipFerry") return u.mission.cargo > 0 ? "#3d9bff" : "#f4c02a";
        if (u.mission?.role === "leadershipEscort") return "#46d38a";
        return teamColor(u.slot);
    };
    const nationName = (slot) => w.nations.find((n) => n.slot === slot)?.name || `Nation ${slot}`;
    const labelOf = (type, slot) => unitLabel(type, w.nations.find((n) => n.slot === slot)?.iso);
    const armOf = (type, slot) => armamentOf(type, w.nations.find((n) => n.slot === slot)?.iso);
    // Selection-panel stat sheet: research-aware numbers per unit class, as
    // label/value rows the detail grid renders directly.
    const unitStats = (u) => {
        const def = UNITS[u.type];
        const km = (v) => `${Math.round(v).toLocaleString()} km`;
        const rows = [];
        if (def.kind === "defense") {
            rows.push(["Intercept", `${Math.round(Math.min(INTERCEPT_CAP, def.intercept + (myNation?.interceptAdd ?? 0)) * 100)}%`]);
            rows.push(["Engage Range", km(defenseRange(w, u))]);
            if (defenseMinRange(w, u) > 0) rows.push(["Min Range", km(defenseMinRange(w, u))]);
            rows.push(["Radar Link", radarLinked(w, u) ? `Linked ×${RADAR_RANGE_MULT}` : "No Link"]);
            rows.push(["Reload", `${def.reload}s`]);
            rows.push(["Shot Cost", `◆ ${def.fireCost}`]);
        }
        if (def.kind === "offense") {
            rows.push(["Damage", `${Math.round(def.damage * (myNation?.dmgMult ?? 1))}`]);
            rows.push(["Strike Range", km(def.range * (myNation?.rangeMult ?? 1))]);
            rows.push(["Reload", `${(def.reload * (myNation?.reloadMult ?? 1)).toFixed(1)}s`]);
            rows.push(["Shot Cost", `◆ ${def.fireCost}`]);
            if (def.speed) rows.push(["Missile Spd", `${def.speed} km/s`]);
        }
        if (def.detect) {
            rows.push(["Detection", km(radarRangeOf(u.type) * (myNation?.radarMult ?? 1))]);
            rows.push(["Track Grade", def.warnOnly ? "Warning Only" : "Fire Control"]);
        } else if (def.radarKm) rows.push(["Radar", km(def.radarKm * (myNation?.radarMult ?? 1))]);
        if (def.kind === "industry") {
            rows.push(["Output", `+${def.output}/s`]);
            rows.push(["GDP", `+$${def.gdpAdd}T`]);
        }
        if (def.navalSpeed) {
            rows.push(["Speed", `${def.navalSpeed} kn`]);
            rows.push(["Status", u.dest ? "Under Way" : "On Station"]);
        }
        if (def.landSpeed) {
            rows.push(["Speed", `${def.landSpeed} km/h`]);
            rows.push(["Status", u.dest ? "On the March" : "Holding"]);
        }
        if (def.airSpeed) rows.push(["Air Speed", `${def.airSpeed} kn`]);
        // Your own warhead platforms surface their loadout through the PAYLOAD picker
        // (the source of truth), so don't also print a fixed one-round "Armament" line
        // that would contradict it. Enemy platforms keep the flavor readout.
        const arm = def.warheads && u.slot === mySlot ? null : armOf(u.type, u.slot);
        if (arm) rows.push(["Armament", arm]);
        rows.push(["Upkeep", `${def.upkeep}/s`]);
        return rows;
    };
    // Screen-space heading (deg, 0 = north/up) for a unit under way — projected the
    // same way the missile sprites are, so it reads correctly in globe and flat.
    // Falls back to a fixed cant for static assets (the airstrip reads as angled).
    const rotMemo = useRef({});
    const unitHeading = (u) => {
        if (ROT_UPRIGHT.has(u.type)) return null; // fixed-orientation icon — never rotate to heading
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
        if (deg == null) {
            delete rotMemo.current[u.id];
            return null;
        }
        // Unwrap: pick the representation nearest the last shown angle so the
        // 170ms CSS rotation transition never takes the long way around.
        const prev = rotMemo.current[u.id];
        if (prev != null) {
            while (deg - prev > 180) deg -= 360;
            while (deg - prev < -180) deg += 360;
        }
        rotMemo.current[u.id] = deg;
        if (Object.keys(rotMemo.current).length > 600) rotMemo.current = {[u.id]: deg};
        return deg;
    };
    const flash = (m, kind = "err") => {
        sfx(kind === "err" ? "error" : "confirm");
        setErr({msg: m, kind});
        setTimeout(() => setErr(null), 1800);
    };
    const toggleLayer = (id) => setLayers((L) => ({...L, [id]: !L[id]}));
    const featsAt = (e) => {
        const m = mapRef.current;
        return m ? m.queryRenderedFeatures(e.point, {layers: ["country-fill"]}) : [];
    };
    const onLand = (e) => featsAt(e).length > 0;
    const inMyLand = (e) => {
        const fs = featsAt(e);
        return myGid ? fs.some((f) => f.properties?.GID_0 === myGid) : (fs.length > 0 && inTerritory(w, mySlot, e.lngLat.lng, e.lngLat.lat));
    };
    const isSea = (type) => UNITS[type]?.domain === "sea";
    // Water within a small ring of the point? Samples two rings and checks for
    // spots with no land polygon under them — cheap coastline detection.
    const nearWater = (e) => {
        const m = mapRef.current;
        if (!m) return false;
        const cosLat = Math.max(0.05, Math.cos((e.lngLat.lat * Math.PI) / 180));
        for (const r of [COAST_KM * 0.55, COAST_KM]) {
            for (let i = 0; i < 10; i++) {
                const a = (i / 10) * Math.PI * 2;
                const lng = e.lngLat.lng + (r / (111 * cosLat)) * Math.cos(a);
                const lat = e.lngLat.lat + (r / 111) * Math.sin(a);
                const p = m.project([lng, lat]);
                if (m.queryRenderedFeatures(p, {layers: ["country-fill"]}).length === 0) return true;
            }
        }
        return false;
    };
    // Naval goes in coastal water; coastal industry sits on land beside the sea;
    // everything else on your land.
    const placeError = (type, e) => {
        if (UNITS[type]?.coastal) {
            if (!onLand(e)) return "Seaports must be built on land.";
            if (!inMyLand(e)) return "That's outside your territory.";
            if (!nearWater(e)) return "Seaports must be built near the coast.";
            return null;
        }
        if (isSea(type)) {
            if (onLand(e)) return "Naval units deploy in the ocean.";
            if (!inTerritory(w, mySlot, e.lngLat.lng, e.lngLat.lat)) return "Naval units must stay within your coastal waters.";
        } else {
            if (!onLand(e)) return "You can't build in the ocean.";
            if (!inMyLand(e)) return "That's outside your territory.";
        }
        return null;
    };

    // Battle audio + toast/explosion pipeline for fresh world.events — see
    // useEventEffects (same [w.time]-keyed effect, moved out verbatim).
    useEventEffects({w, mySlot, mapRef, setErr, setExplosions, onGameEnd});

    // Escape cascade, command-screen hotkeys, controls-reference toggle, game
    // speed hotkeys and keyboard zoom — see useKeyboardControls (same handlers,
    // same dependency arrays per effect, moved out verbatim).
    useKeyboardControls({
        menu, setMenu,
        disembarkId, setDisembarkId,
        moving, setMoving,
        placing, setPlacing,
        attackMode, setAttackMode,
        panel, setPanel,
        onPause,
        overlayOpen,
        w,
        api,
        K,
        setHelpOpen,
        mapRef,
    });

    // Camera pan (WASD) — see usePanControls (same ease-segment chain, same
    // [globe, overlayOpen, K.panUp, K.panLeft, K.panDown, K.panRight] deps).
    usePanControls({globe, overlayOpen, K, mapRef});

    // Countries layer visibility (keep fill queryable at opacity 0 so land/water tests still work).
    useEffect(() => {
        const m = mapRef.current;
        if (!m) return;
        try {
            m.setPaintProperty("country-fill", "fill-opacity", layers.countries ? COUNTRY_FILL_OPACITY : 0);
            m.setLayoutProperty("country-line", "visibility", layers.countries ? "visible" : "none");
            m.setLayoutProperty("country-tint", "visibility", layers.countries ? "visible" : "none");
        } catch { /* style not ready */
        }
    }, [layers.countries, mapReady]);

    // Subtle per-country border tint derived from each flag's primary color (muted
    // toward neutral so the mono map keeps its tactical feel). GID_0 → rgb from colors.json.
    const [borderExpr, setBorderExpr] = useState(null);
    useEffect(() => {
        fetch("/assets/colors.json").then((r) => r.json()).then((cols) => {
            const pairs = [];
            for (const [gid, c] of Object.entries(cols)) {
                const mix = (v, g) => Math.round(v * 0.6 + g * 0.4); // blend toward neutral grey
                pairs.push(gid, `rgb(${mix(c[0], 96)},${mix(c[1], 100)},${mix(c[2], 108)})`);
            }
            const tintPairs = [];
            for (const [gid, c] of Object.entries(cols)) tintPairs.push(gid, `rgb(${c[0]},${c[1]},${c[2]})`);
            if (pairs.length) setBorderExpr({
                line: ["match", ["get", "GID_0"], ...pairs, "#454b53"],
                tint: ["match", ["get", "GID_0"], ...tintPairs, "#767b84"],
            });
        }).catch(() => { /* colors optional */
        });
    }, []);
    useEffect(() => {
        const m = mapRef.current;
        if (!m || !borderExpr) return;
        try {
            m.setPaintProperty("country-line", "line-color", borderExpr.line);
            m.setPaintProperty("country-tint", "fill-color", borderExpr.tint);
        } catch { /* style not ready */
        }
    }, [borderExpr, mapReady]);

    // Fade unit markers out as the camera zooms toward the whole-earth view. The
    // opacity is pushed to a CSS var on the map container (not React state) so it
    // updates every zoom frame without re-rendering the marker list; .db-unit
    // multiplies it in, composing with the engine-driven aircraft takeoff fade.
    useEffect(() => {
        const m = mapRef.current;
        if (!m) return;
        const container = m.getContainer();
        const [lo, hi] = UNIT_FADE_ZOOM;
        const apply = () => {
            const o = Math.max(0, Math.min(1, (m.getZoom() - lo) / (hi - lo)));
            container.style.setProperty("--db-unit-opacity", o.toFixed(3));
            container.classList.toggle("db-units-faded", o < 0.04);
        };
        apply();
        m.on("zoom", apply);
        return () => {
            m.off("zoom", apply);
            container.style.removeProperty("--db-unit-opacity");
            container.classList.remove("db-units-faded");
        };
    }, [mapReady]);

    // GID_0 (ISO3) → country label, for the zoomed-out country hover readout.
    const countryByGid = useMemo(() => {
        const o = {};
        for (const l of labels || []) {
            const g = toGid3(l.iso);
            if (g) o[g] = l;
        }
        return o;
    }, [labels]);

    // Memoized map-layer FeatureCollections (backdrop/live cities, fog-of-war
    // visibility, radar/defense/pop overlays, selection+placement rings, and
    // the command/sail line traces) — extracted to keep the same useMemo
    // sequence and dep arrays outside this component's own render body.
    const {
        backdropFC,
        liveFC,
        falloutFC,
        captureFC,
        mySensors,
        visUnits,
        radarFC,
        defenseFC,
        popFC,
        ranges,
        cmdLines,
        sailLines
    } = useLiveLayers({
        w, mySlot, myNation, backdrop, layers, placing, moving, cursor, selUnit, placeValid, teamColor, COAST_KM
    });
    // Territory recolor for conquered / broken-away provinces (see useOwnershipLayer).
    const ownership = useOwnershipLayer(w);

    const onMove = (e) => {
        const m = mapRef.current;
        if (!m) return;
        const feats = m.queryRenderedFeatures(e.point, {layers: ["country-fill"]});
        const gid = feats[0]?.properties?.GID_0 || null;
        const activeType = placing || (moving && w.units.find((u) => u.id === moving)?.type);
        if (activeType) {
            setCursor(e.lngLat);
            const onLandHere = feats.length > 0, inTerr = inTerritory(w, mySlot, e.lngLat.lng, e.lngLat.lat);
            const myLandHere = myGid ? feats.some((f) => f.properties?.GID_0 === myGid) : (onLandHere && inTerr);
            // A marching ground unit may head anywhere on land (same freedom ships
            // have at sea); placement and paid relocation stay territory-bound.
            const marching = moving && UNITS[activeType]?.landSpeed;
            const terrainOk = marching ? onLandHere
                : UNITS[activeType]?.coastal ? (myLandHere && nearWater(e))
                    : isSea(activeType) ? (!onLandHere && inTerr) : myLandHere;
            setPlaceValid(terrainOk && !placementBlocked(w, e.lngLat.lng, e.lngLat.lat, moving || null));
        }
        if (gid !== hoveredGid) setHoveredGid(gid);
        // Localized hover probe: zoomed out → whole-country readout; zoomed in → the
        // city under the cursor. (Units carry their own hover via their markers.)
        if (!placing && !moving) {
            const ex = e.originalEvent.clientX, ey = e.originalEvent.clientY;
            if (m.getZoom() < COUNTRY_ZOOM) {
                if (gid) setHover({kind: "country", gid, x: ex, y: ey});
                else setHover((h) => (h && h.kind === "country" ? null : h));
            } else {
                const cf = m.queryRenderedFeatures(e.point, {layers: ["live-cities"]})[0];
                if (cf) setHover({kind: "city", id: cf.properties.id, x: ex, y: ey});
                else setHover((h) => (h && (h.kind === "city" || h.kind === "country") ? null : h));
            }
        }
    };
    const onMapClick = (e) => {
        if (disembarkId) {
            const r = api.disembark(disembarkId, e.lngLat.lng, e.lngLat.lat);
            if (r.error) flash(r.error);
            else {
                setDisembarkId(null);
                flash(`Landed ${r.landed} ashore.`, "info");
            }
            return;
        }
        if (moving) {
            const mu = w.units.find((u) => u.id === moving);
            if (mu && UNITS[mu.type].navalSpeed) { // ships: sail to any open-ocean waypoint, no territory limit
                if (onLand(e)) return flash("Ships can't sail onto land.");
                const r = api.setSail(moving, e.lngLat.lng, e.lngLat.lat);
                if (r.error) flash(r.error); else {
                    setMoving(null);
                    flash("Under way.", "info");
                }
                return;
            }
            if (mu && UNITS[mu.type].landSpeed) { // ground forces: march to any land waypoint, no territory limit
                if (!onLand(e)) return flash("Ground forces can't march into the sea.");
                const r = api.march(moving, e.lngLat.lng, e.lngLat.lat);
                if (r.error) flash(r.error); else {
                    setMoving(null);
                    flash("On the march.", "info");
                }
                return;
            }
            const bad = mu?.type && placeError(mu.type, e);
            if (bad) return flash(bad);
            const r = api.move(moving, e.lngLat.lng, e.lngLat.lat, true);
            if (r.error) flash(r.error); else setMoving(null);
            return;
        }
        if (placing) {
            const bad = placeError(placing, e);
            if (bad) return flash(bad);
            const r = api.buyPlace(placing, e.lngLat.lng, e.lngLat.lat, true);
            if (r.error) {
                flash(r.error);
                return;
            } // keep placing on a bad spot so they can retry
            flash(`${labelOf(placing, mySlot)} added to the production queue.`, "info");
            if (!e.originalEvent?.shiftKey) setPlacing(null); // close after one unless Shift is held to place more
            return;
        }
        const feat = e.features?.find((f) => f.layer.id === "live-cities");
        if (feat) return onCityClick(feat.properties.id);
        setSelUnit(null);
        setSelCity(null);
        setAttackMode(false);
        setMenu(null);
    };
    const onCityClick = (id) => {
        const c = w.cities.find((x) => x.id === id);
        if (!c) return;
        if (attackMode && selUnit && c.slot !== mySlot) {
            const r = api.commandAttack(selUnit, c.id);
            if (r.error) flash(r.error); else setAttackMode(false);
            return;
        }
        setSelCity(id);
        setSelUnit(null);
    };
    const onCtx = (e) => {
        if (e.originalEvent?.target?.closest?.(".db-unit")) return; // unit markers run their own menu
        // Right-click cancels any active targeting mode (place / move / attack / land) first.
        if (disembarkId) {
            setDisembarkId(null);
            return;
        }
        if (placing) {
            setPlacing(null);
            return;
        }
        if (moving) {
            setMoving(null);
            return;
        }
        if (attackMode) {
            setAttackMode(false);
            return;
        }
        const feat = e.features?.find((f) => f.layer.id === "live-cities");
        if (feat) return openCityMenu(feat.properties.id, e.originalEvent);
        // Selected friendly ship + right-click on open water = sail there directly.
        const sel = w.units.find((u) => u.id === selUnit);
        if (sel && sel.slot === mySlot && UNITS[sel.type].navalSpeed && !onLand(e)) {
            const r = api.setSail(sel.id, e.lngLat.lng, e.lngLat.lat);
            if (r.error) flash(r.error); else flash("Under way.", "info");
            return;
        }
        // Selected friendly ground unit + right-click on land = march there directly.
        if (sel && sel.slot === mySlot && UNITS[sel.type].landSpeed && onLand(e)) {
            const r = api.march(sel.id, e.lngLat.lng, e.lngLat.lat);
            if (r.error) flash(r.error); else flash("On the march.", "info");
            return;
        }
        setMenu(null);
    };

    const addPin = (type, ent) => {
        const key = `${type}-${ent.id}`;
        setPins((p) => p.some((x) => x.key === key) ? p : [...p, {
            key,
            type,
            id: ent.id,
            label: type === "city" ? ent.name : labelOf(ent.type, ent.slot),
            lng: ent.lng,
            lat: ent.lat,
            color: teamColor(ent.slot)
        }]);
    };
    const goPin = (p) => mapRef.current?.flyTo?.({center: [p.lng, p.lat], zoom: 4, duration: 800});
    const openCityMenu = (id, ev) => {
        const c = w.cities.find((x) => x.id === id);
        if (!c) return;
        const mine = c.slot === mySlot;
        const rel = relation(c.slot);
        const sel = w.units.find((u) => u.id === selUnit);
        const items = [];
        if (!mine) {
            if (rel === "war") items.push({
                label: "Target with Selected",
                disabled: !(sel && UNITS[sel.type].kind === "offense"),
                onClick: () => {
                    const r = api.commandAttack(selUnit, c.id);
                    if (r.error) flash(r.error);
                }
            }); else items.push({
                label: `Declare War on ${nationName(c.slot)}`,
                danger: true,
                onClick: () => api.declareWar(c.slot)
            });
        }
        items.push({label: "Pin", onClick: () => addPin("city", c)});
        setMenu({title: `${c.name}${c.state ? " · " + c.state : ""}`, items, x: ev.clientX, y: ev.clientY});
    };
    const openUnitMenu = (u, ev) => {
        ev.preventDefault();
        const mine = u.slot === mySlot;
        const off = UNITS[u.type].kind === "offense";
        const items = [];
        if (mine && off) items.push(u.targetId ? {
            label: "Hold Fire",
            onClick: () => api.commandAttack(u.id, null)
        } : {
            label: "Command Attack", onClick: () => {
                setSelUnit(u.id);
                setAttackMode(true);
            }
        });
        if (mine) items.push({
            label: UNITS[u.type].navalSpeed ? "Set Sail" : UNITS[u.type].landSpeed ? "March" : "Move (Relocate)",
            onClick: () => {
                setMoving(u.id);
                setPlacing(null);
                setSelUnit(u.id);
            }
        });
        if (mine && (UNITS[u.type].navalSpeed || UNITS[u.type].landSpeed) && u.dest) items.push({
            label: UNITS[u.type].navalSpeed ? "All Stop" : "Halt",
            onClick: () => api.stopSail(u.id)
        });
        // Airbases: order replacement aircraft into the hangar (per-type capacity).
        if (mine && UNITS[u.type].wing) {
            for (const at of [...new Set(UNITS[u.type].wing)]) {
                const stocked = hangarCount(w, myNation, u.id, at);
                items.push({
                    label: `Order ${labelOf(at, mySlot)} · ${stocked}/${hangarCapOf(u.type, at)} (◆ ${UNITS[at].cost})`,
                    disabled: stocked >= hangarCapOf(u.type, at),
                    onClick: () => {
                        const r = api.queueAircraft(u.id, at);
                        flash(r.error || `${labelOf(at, mySlot)} added to the production queue.`, r.error ? "err" : "info");
                    },
                });
            }
        }
        // Amphibious transport: embark nearby friendly ground units (one menu item
        // each, within lift range and while there's spare capacity) and land the
        // current cargo at a coastal point the player clicks.
        if (mine && UNITS[u.type].capacity) {
            const cap = UNITS[u.type].capacity;
            const loaded = u.cargo?.length || 0;
            if (loaded < cap) {
                const nearby = w.units.filter((g) => g.slot === mySlot && g.hp > 0 && UNITS[g.type].landSpeed
                    && UNITS[g.type].domain === "land" && haversine(u.lng, u.lat, g.lng, g.lat) <= AMPHIB_LIFT_KM);
                for (const g of nearby.slice(0, 6)) items.push({
                    label: `Embark ${labelOf(g.type, g.slot)}`,
                    onClick: () => {
                        const r = api.embark(u.id, g.id);
                        flash(r.error || `${labelOf(g.type, g.slot)} embarked (${r.cargo}/${cap}).`, r.error ? "err" : "info");
                    }
                });
                if (!nearby.length) items.push({label: "No troops in lift range", disabled: true, onClick: () => {}});
            }
            if (loaded) items.push({
                label: `Disembark here (${loaded} aboard)`,
                onClick: () => {
                    setDisembarkId(u.id);
                    setMoving(null);
                    setPlacing(null);
                    setSelUnit(u.id);
                    flash("Landing — click a coastal point in your territory.", "info");
                }
            });
        }
        if (mine) items.push({
            label: `Dismantle (Sell +${Math.round(SCRAP_REFUND_FRAC * 100)}%)`, danger: true, onClick: () => {
                api.scrap(u.id);
                if (selUnit === u.id) setSelUnit(null);
            }
        });
        items.push({label: "Pin", onClick: () => addPin("unit", u)});
        setMenu({title: labelOf(u.type, u.slot), items, x: ev.clientX, y: ev.clientY});
    };
    const onUnitClick = (u, ev) => {
        ev?.stopPropagation?.();
        if (attackMode && selUnit) {
            if (u.slot === mySlot) return;
            const r = api.commandAttack(selUnit, u.id);
            if (r.error) flash(r.error); else setAttackMode(false);
            return;
        }
        if (u.slot === mySlot) setSelUnit(u.id);
    };

    const selectedUnit = w.units.find((u) => u.id === selUnit);
    const movingUnit = w.units.find((u) => u.id === moving);
    const selectedCity = w.cities.find((c) => c.id === selCity);
    const hoverEnt = hover && (hover.kind === "unit" ? visUnits.find((u) => u.id === hover.id) : w.cities.find((c) => c.id === hover.id));

    // Open the game already looking at home: center on the player's capital at a
    // zoom that fits most of their nation. The frame is the geographic span of
    // my cities around the capital, padded and clamped so a city-state still
    // keeps regional context. fitBounds handles the projection math (flat/globe).
    const frameOnCapital = (m) => {
        const mine = w.cities.filter((c) => c.slot === mySlot && c.alive);
        if (!mine.length) return;
        const cap = mine.find((c) => c.cap) || mine[0];
        // Widest deviation of any of my cities from the capital, wrapping longitude
        // across the antimeridian so a nation split by ±180 still frames sanely.
        let dLat = 0.05, dLng = 0.05;
        for (const c of mine) {
            let dl = c.lng - cap.lng;
            if (dl > 180) dl -= 360; else if (dl < -180) dl += 360;
            dLat = Math.max(dLat, Math.abs(c.lat - cap.lat));
            dLng = Math.max(dLng, Math.abs(dl));
        }
        dLat *= START_CAM.spanPad;
        dLng *= START_CAM.spanPad;
        try {
            m.fitBounds(
                [[cap.lng - dLng, cap.lat - dLat], [cap.lng + dLng, cap.lat + dLat]],
                {padding: START_CAM.padPx, maxZoom: START_CAM.maxZoom, duration: 0}
            );
        } catch { /* projection not ready — keep the default view */ }
    };

    // Map is live: frame home, then hold the loading veil until the tiles settle
    // (map "idle"), with a hard failsafe so a slow/never-idling map still reveals.
    const handleMap = (m) => {
        mapRef.current = m;
        setMapReady((x) => x + 1);
        // Force the canvas to match its container. MapLibre can initialize at its
        // 400x300 fallback when the container's size isn't resolved on the exact
        // frame the map is created (a layout race on the screen->match handoff);
        // without this the globe renders tiny in the corner and the rest of the
        // view is black. Re-fit now, next frame, and shortly after to cover any
        // late layout (the lobby map does the same via its own resize()).
        const fit = () => {
            try {
                m.resize();
            } catch { /* map tearing down */ }
        };
        fit();
        requestAnimationFrame(fit);
        setTimeout(fit, 200);
        frameOnCapital(m);
        let settled = false;
        const reveal = () => {
            if (settled) return;
            settled = true;
            setBooting(false);
        };
        try {
            m.once("idle", reveal);
        } catch {
            reveal();
        }
        // (the mount-scoped failsafe above also lifts the veil after bootMs)
    };

    return (
        <>
            <WorldMap globe={globe} onMap={handleMap} interactiveLayerIds={CITY_LAYERS} minZoom={WORLD_ZOOM.min}
                      onMapClick={onMapClick} onContextMenu={onCtx} onMouseMove={onMove}
                      cursor={placing || moving || attackMode || disembarkId ? "crosshair" : "grab"}>
                <Source id="db-regions" type="vector" url={REGIONS_URL}>
                    {/* Controlled-territory recolor: land captured in war in the
                        conqueror's flag color, drawn under the national borders so
                        those still read on top. */}
                    {layers.countries && <Layer id="region-owner" type="fill" source-layer="regions" beforeId="country-line"
                           paint={{"fill-color": ownership.fill, "fill-opacity": REGION_OWNER_OPACITY}}/>}
                    {layers.countries && <Layer id="region-owner-line" type="line" source-layer="regions" beforeId="country-line"
                           filter={["in", ["get", "GID_1"], ["literal", ownership.ids]]}
                           paint={{"line-color": "#0a0c0f", "line-width": REGION_OWNER_LINE_WIDTH, "line-opacity": 0.55}}/>}
                    {layers.states && <Layer id="region-all" type="line" source-layer="regions" paint={{
                        "line-color": "#6b7079",
                        "line-opacity": 0.3,
                        "line-width": 0.5
                    }}/>}
                    <Layer id="region-hover" type="line" source-layer="regions"
                           filter={["==", ["get", "GID_0"], hoveredGid || "__none__"]}
                           paint={{"line-color": "#d6dbe2", "line-opacity": 0.7, "line-width": 1}}/>
                </Source>
                {layers.pop && <Source id="pop-src" type="geojson" data={popFC}>
                    <Layer id="pop-heat" type="heatmap" paint={{
                        "heatmap-weight": ["get", "wt"],
                        "heatmap-intensity": 1.1,
                        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 1, 8, 6, 42],
                        "heatmap-opacity": 0.75,
                        "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(0,0,0,0)", 0.2, "#3a3f46", 0.45, "#6b7178", 0.7, "#a7aeb6", 1, "#eef2f6"]
                    }}/>
                </Source>}
                {layers.backdrop &&
                    <Source id="backdrop-src" type="geojson" data={backdropFC}><Layer id="backdrop-cities" type="circle"
                                                                                      paint={{
                                                                                          "circle-radius": ["case", ["==", ["get", "cap"], 1], 2.3, 1.3],
                                                                                          "circle-color": "#6a707a",
                                                                                          "circle-opacity": 0.5
                                                                                      }}/></Source>}
                {layers.radar && <Source id="radar-src" type="geojson" data={radarFC}>
                    {/* Subtle covered-area tint (per radar-type color) under the ring. */}
                    <Layer id="radar-fill" type="fill"
                           paint={{"fill-color": ["get", "color"], "fill-opacity": 0.05}}/>
                    <Layer id="radar-cov" type="line"
                           paint={{
                               "line-color": ["get", "color"],
                               "line-opacity": 0.4,
                               "line-width": 0.9,
                               "line-dasharray": [3, 3]
                           }}/>
                </Source>}
                {layers.defense && <Source id="defall-src" type="geojson" data={defenseFC}>
                    <Layer id="defall-fill" type="fill" paint={{"fill-color": ["get", "color"], "fill-opacity": 0.05}}/>
                    <Layer id="defall-line" type="line"
                           paint={{"line-color": ["get", "color"], "line-opacity": 0.4, "line-width": 0.8}}/>
                </Source>}
                <Source id="ranges" type="geojson" data={ranges}>
                    <Layer id="range-fill" type="fill" filter={["!=", ["get", "radar"], 1]} paint={{
                        "fill-color": ["get", "color"],
                        "fill-opacity": ["case", ["==", ["get", "sel"], 1], 0.14, 0.05]
                    }}/>
                    <Layer id="range-line" type="line" filter={["!=", ["get", "radar"], 1]} paint={{
                        "line-color": ["get", "color"],
                        "line-width": ["case", ["==", ["get", "sel"], 1], 1.6, 0.7],
                        "line-opacity": 0.6
                    }}/>
                    {/* Subtle covered-area tint for a selected or being-placed radar
                        (large areas, so kept fainter than the defense-ring fill). */}
                    <Layer id="radar-sel-fill" type="fill" filter={["==", ["get", "radar"], 1]} paint={{
                        "fill-color": ["get", "color"],
                        "fill-opacity": 0.07
                    }}/>
                    <Layer id="radar-ring" type="line" filter={["==", ["get", "radar"], 1]} paint={{
                        "line-color": ["get", "color"],
                        "line-width": 0.9,
                        "line-opacity": 0.5,
                        "line-dasharray": [3, 3]
                    }}/>
                </Source>
                <Source id="cmd" type="geojson" data={cmdLines}><Layer id="cmd-line" type="line" paint={{
                    "line-color": teamColor(mySlot),
                    "line-width": 1.4,
                    "line-opacity": 0.5,
                    "line-dasharray": [2, 3]
                }}/></Source>
                <Source id="sail" type="geojson" data={sailLines}>
                    <Layer id="sail-line" type="line" filter={["==", ["get", "k"], "line"]} paint={{
                        "line-color": teamColor(mySlot),
                        "line-width": 1.2,
                        "line-opacity": 0.5,
                        "line-dasharray": [1, 2]
                    }}/>
                    <Layer id="sail-dot" type="circle" filter={["==", ["get", "k"], "dot"]} paint={{
                        "circle-radius": 3,
                        "circle-color": "transparent",
                        "circle-stroke-color": teamColor(mySlot),
                        "circle-stroke-width": 1.2,
                        "circle-opacity": 0.6
                    }}/>
                </Source>
                {/* Radioactive fallout footprint: a glowing contamination haze whose
                    opacity tracks the cloud's live intensity, plus a dashed edge marking
                    the danger radius. Drawn under the cities so ruins and dots stay legible. */}
                <Source id="fallout-src" type="geojson" data={falloutFC}>
                    <Layer id="fallout-haze" type="fill" paint={{
                        "fill-color": "#8cff3a",
                        "fill-opacity": ["*", ["get", "intensity"], 0.17]
                    }}/>
                    <Layer id="fallout-edge" type="line" paint={{
                        "line-color": "#b6ff5c",
                        "line-width": 1,
                        "line-dasharray": [2, 2],
                        "line-opacity": ["*", ["get", "intensity"], 0.55]
                    }}/>
                </Source>
                {/* Ground occupation: a ring around each city being captured, filling
                    toward solid in the occupier's color as capture progress climbs.
                    Drawn under the cities so the city dot stays legible on top. */}
                <Source id="capture-src" type="geojson" data={captureFC}>
                    <Layer id="capture-fill" type="fill" paint={{
                        "fill-color": ["get", "color"],
                        "fill-opacity": ["*", ["get", "progress"], 0.3]
                    }}/>
                    <Layer id="capture-ring" type="line" paint={{
                        "line-color": ["get", "color"],
                        "line-width": 1.5,
                        "line-dasharray": [3, 2],
                        "line-opacity": ["+", 0.35, ["*", ["get", "progress"], 0.55]]
                    }}/>
                </Source>
                <Source id="live-src" type="geojson" data={liveFC}>
                    {/* Destroyed city: a scorched crater with a burnt scar ring, drawn
                        larger than a live city so a ruin reads unmistakably at map scale. */}
                    <Layer id="live-city-ruin" type="circle" filter={["==", ["get", "dead"], 1]} paint={{
                        "circle-radius": ["case", ["==", ["get", "cap"], 1], 9, 7],
                        "circle-color": "#160c0a",
                        "circle-opacity": 0.88,
                        "circle-stroke-color": "#c2410c",
                        "circle-stroke-width": 1.8,
                        "circle-stroke-opacity": 0.9
                    }}/>
                    {/* City-health halo: a ring that only appears once a city is damaged,
                        thickening and reddening (green→amber→red) as vitality falls to 0.
                        Faction fill (below) still encodes ownership. */}
                    <Layer id="live-city-health" type="circle" filter={["<", ["get", "vit"], 0.999]} paint={{
                        "circle-radius": ["case", ["==", ["get", "cap"], 1], 8, 6],
                        "circle-color": "rgba(0,0,0,0)",
                        "circle-stroke-width": ["interpolate", ["linear"], ["get", "vit"], 0, 3, 1, 0.6],
                        "circle-stroke-color": vitPaint(),
                        "circle-stroke-opacity": ["interpolate", ["linear"], ["get", "vit"], 0, 0.95, 0.9, 0.85, 1, 0]
                    }}/>
                    <Layer id="live-cities" type="circle" paint={{
                        "circle-radius": ["case", ["==", ["get", "cap"], 1], 5, 3],
                        "circle-color": ["get", "color"],
                        "circle-stroke-color": ["case", ["==", ["get", "mine"], 1], "#ffffff", "#05070c"],
                        "circle-stroke-width": ["case", ["==", ["get", "mine"], 1], 1.4, 0.6]
                    }}/>
                </Source>

                {selectedCity && <Marker longitude={selectedCity.lng} latitude={selectedCity.lat} anchor="center" opacityWhenCovered="0">
                    <div className="w-4 h-4 rounded-full border-[1.5px] border-[rgba(255,255,255,0.75)] shadow-[0_0_6px_rgba(255,255,255,0.3)]"/>
                </Marker>}
                {/* Capture HUD: a floating badge over every city being taken — the
                    occupier's color, live progress %, whether an assault is pressing
                    it, and a mini bar. Pairs with the ground ring below the cities so
                    a capture reads at a glance (yours, an ally's, or your own falling). */}
                {w.cities.filter((c) => c.alive && c.capture && c.capture.progress > 0.02).map((c) => {
                    const pct = Math.round(c.capture.progress * 100);
                    const col = teamColor(c.capture.slot);
                    const label = c.capture.assault ? "Assault" : (c.slot === mySlot ? "Losing" : "Capturing");
                    return (
                        <Marker key={`cap-${c.id}`} longitude={c.lng} latitude={c.lat} anchor="bottom" opacityWhenCovered="0" offset={[0, -13]}>
                            <div className="pointer-events-none flex flex-col items-center gap-[3px]" aria-hidden="true">
                                <div className="flex items-center gap-1 px-1.5 py-[2px] rounded-full bg-[rgba(8,10,14,0.82)] border backdrop-blur-[3px] font-mono text-[10px] leading-none whitespace-nowrap shadow-[0_1px_3px_rgba(0,0,0,0.55)]"
                                     style={{borderColor: col, color: col}}>
                                    <b className="font-bold">{pct}%</b>
                                    <span className="uppercase tracking-[0.6px] text-[8px] opacity-90">{label}</span>
                                </div>
                                <div className="w-[46px] h-[3px] rounded-full bg-[rgba(255,255,255,0.16)] overflow-hidden">
                                    <i className="block h-full rounded-full" style={{width: `${pct}%`, background: col}}/>
                                </div>
                            </div>
                        </Marker>
                    );
                })}
                {visUnits.map((u) => {
                    const def = UNITS[u.type];
                    const air = !!(def.airSpeed && u.baseId);
                    if (air && (!u.phase || u.phase === "ground")) return null; // housed in the base — not on the map
                    const heading = unitHeading(u);
                    const alt = air ? (u.alt || 0) : 0;
                    const iconName = UNIT_ICON[u.type];
                    const iconStyle = {};
                    // Ground units are now top-down silhouettes (like the naval hulls), so
                    // they rotate to the EXACT heading and read correctly at any angle —
                    // no facing snap, no tip-over.
                    if (heading != null) iconStyle.transform = `rotate(${heading}deg)`;
                    if (air) {
                        iconStyle.opacity = u.vis ?? 1; // engine drives fade-in on takeoff / out on landing
                        iconStyle.transform = `${iconStyle.transform || ""} scale(${(0.7 + alt * 0.3).toFixed(3)})`.trim(); // rises off the deck
                    }
                    return (
                        <Marker key={u.id} longitude={u.lng} latitude={u.lat} anchor="center"
                                opacityWhenCovered="0" offset={air ? [0, -alt * 30] : undefined}>
                            <div
                                className={cn(
                                    "grid place-items-center cursor-pointer [filter:drop-shadow(0_0_4px_currentColor)_drop-shadow(0_1px_2px_#000)] opacity-(--db-unit-opacity,1)",
                                    u.id === selUnit && "scale-[1.35] transition-transform duration-[140ms] ease-out-db"
                                )}
                                title={labelOf(u.type, u.slot)}
                                aria-label={`${labelOf(u.type, u.slot)} — ${nationName(u.slot)}`}
                                onClick={(e) => onUnitClick(u, e)}
                                onContextMenu={(e) => openUnitMenu(u, e)}
                                onMouseEnter={(e) => {
                                    if (!placing && !moving) setHover({
                                        kind: "unit",
                                        id: u.id,
                                        x: e.clientX,
                                        y: e.clientY
                                    });
                                }}
                                onMouseMove={(e) => setHover((h) => (h && h.kind === "unit" && h.id === u.id ? {
                                    ...h,
                                    x: e.clientX,
                                    y: e.clientY
                                } : h))}
                                onMouseLeave={() => setHover((h) => (h && h.kind === "unit" && h.id === u.id ? null : h))}>
              <span className="inline-flex transition-transform duration-[170ms] ease-linear" style={Object.keys(iconStyle).length ? iconStyle : undefined}>
                <UnitIcon name={iconName} color={unitColor(u)} size={air ? 16 : 22}/>
              </span>
                            </div>
                        </Marker>
                    );
                })}
                {(w.effects || []).filter((fx) => fx.type === "fallout").map((fx) => (
                    <Marker key={fx.id} longitude={fx.lng} latitude={fx.lat} anchor="center" opacityWhenCovered="0">
                        <FalloutCloud intensity={falloutIntensity(fx.age)}/>
                    </Marker>
                ))}
                {explosions.map((x) => <Marker key={x.id} longitude={x.lng} latitude={x.lat} anchor="center"
                                               opacityWhenCovered="0" offset={[0, -(x.alt || 0) * 70]}><Explosion kind={x.kind}/></Marker>)}
            </WorldMap>
            <SkyLayer map={mapRef.current}
                      projectiles={w.projectiles.filter((p) => p.slot === mySlot || p.seenBy?.includes(mySlot))}
                      interceptors={w.interceptors.filter((it) => it.slot === mySlot || sensorsCover(mySensors, it.lng, it.lat))}
                      aircraft={visUnits.filter((u) => u.baseId && u.hp > 0 && (u.alt || 0) > 0.02)} tick={w.time}/>
            <CountryLabels map={mapRef.current} labels={labels}/>

            {/* Top command bar (two-tier): LiveHud now owns the whole strip — row 1 is
                telemetry (date/points/economy), row 2 is speed + console nav + arsenal +
                view controls. Stacking the arsenal onto its own row is what removes the
                old overlap entirely; there is no separate corner cluster to collide with.
                The lane clears the left nation panel (left-[272px]) and runs to right-4.
                The wrapper is click-through (pointer-events-none) so the empty space around
                the ticker/alert doesn't block the map; each child re-enables its own. */}
            <div className="absolute top-[40px] left-[272px] right-4 z-6 flex flex-col items-center gap-[7px] pointer-events-none [&>*]:pointer-events-auto">
                <LiveHud world={w} api={api} myNation={myNation} panel={panel} keys={K}
                         onPanel={(id) => setPanel((p) => (p === id ? null : id))}
                         globe={globe} onGlobe={onToggleGlobe} onHelp={() => setHelpOpen(true)}
                         onMenu={onPause} meBadge={meBadge}/>
                <NewsTicker world={w} mySlot={mySlot}/>
                {/* Flowed in the stack (not absolutely pinned) so it always sits below the
                    HUD + ticker instead of overlapping them. */}
                {!w.over && <LeadershipAlert world={w} api={api} mySlot={mySlot}/>}
            </div>
            {!w.over && <NationPanel world={w} mySlot={mySlot} myNation={myNation} onFocus={goPin}/>}
            {!w.over && panel === "research" &&
                <TechTree world={w} api={api} mySlot={mySlot} onClose={() => setPanel(null)}/>}
            {!w.over && panel === "production" &&
                <ProductionScreen world={w} api={api} mySlot={mySlot} placing={placing}
                                  setPlacing={(t) => {
                                      setPlacing(t);
                                      setMoving(null);
                                      setSelUnit(null);
                                  }} onClose={() => setPanel(null)}/>}
            {!w.over && panel === "diplomacy" &&
                <DiplomacyScreen world={w} api={api} mySlot={mySlot} onClose={() => setPanel(null)}/>}
            <LayerBar layers={layers} onToggle={toggleLayer}/>
            {!w.over && <ProductionBar world={w} api={api} mySlot={mySlot}/>}
            <PinnedBar pins={pins} onGo={goPin} onRemove={(key) => setPins((p) => p.filter((x) => x.key !== key))}/>

            {moving && <div
                className="absolute top-[100px] left-1/2 -translate-x-1/2 z-6 flex items-center gap-[10px] bg-panel border border-[rgba(244,192,42,0.4)] text-text py-2 px-[14px] rounded text-[13px] shadow" role="status" aria-live="polite">{UNITS[movingUnit?.type]?.navalSpeed ? "Set Sail — click an open-ocean destination." : UNITS[movingUnit?.type]?.landSpeed ? "March — click a land destination." : isSea(movingUnit?.type) ? "Relocating — click in your coastal waters." : "Relocating — click inside your territory (on land)."}
                <button className={miniButton()} onClick={() => setMoving(null)}>Cancel</button>
            </div>}
            {disembarkId && <div className="absolute top-[100px] left-1/2 -translate-x-1/2 z-6 flex items-center gap-[10px] bg-panel border border-[rgba(244,192,42,0.4)] text-text py-2 px-[14px] rounded text-[13px] shadow" role="status" aria-live="polite">Landing — click a coastal point inside your territory.
                <button className={miniButton()} onClick={() => setDisembarkId(null)}>Cancel</button>
            </div>}

            {selectedUnit && !w.over && (
                <SelectionPanel selectedUnit={selectedUnit} w={w} myNation={myNation} mySlot={mySlot} api={api}
                                labelOf={labelOf} teamColor={teamColor} unitStats={unitStats} moving={moving}
                                setMoving={setMoving} setPlacing={setPlacing} attackMode={attackMode}
                                setAttackMode={setAttackMode} flash={flash}/>
            )}
            {menu && <ContextMenu {...menu} onClose={() => setMenu(null)}/>}
            {helpOpen && <ControlsOverlay keys={keys} onClose={() => setHelpOpen(false)}/>}
            {hover?.kind === "country" && (() => {
                const gl = countryByGid[hover.gid];
                const nation = w.nations.find((n) => toGid3(n.iso) === hover.gid);
                const name = gl?.name || hover.gid;
                const iso = gl?.iso || nation?.iso;
                const cities = nation ? w.cities.filter((c) => c.slot === nation.slot && c.alive) : [];
                const pop = nation ? populationOf(w, nation.slot) : 0;
                const rows = nation ? [
                    ["Status", nation.slot === mySlot ? "Yours" : relation(nation.slot) === "war" ? "At War" : "At Peace"],
                    ["Standing", cities.length ? "Active" : "Eliminated"],
                    ["Population", fmtPop(pop)],
                    ["GDP", `$${gdpOf(w, nation.slot).toFixed(2)}T`],
                    ["States", cities.length],
                ] : [
                    ["Status", "Non-combatant"],
                    ["Role", "Neutral"],
                ];
                return (
                    <HoverReadout x={hover.x} y={hover.y} clampBottom={190} rows={rows}
                                  header={<>{iso ? <Flag iso={iso}/> : null}<span>{name}</span></>}/>
                );
            })()}
            {hoverEnt && (() => {
                let rows, header, footer = null;
                if (hover.kind === "unit") {
                    const def = UNITS[hoverEnt.type];
                    rows = [["Owner", nationName(hoverEnt.slot)], ["Class", def.kind]];
                    if (def.kind === "industry") {
                        rows.push(["Output", `+${def.output}/s`]);
                        rows.push(["GDP", `+$${def.gdpAdd}T`]);
                    } else {
                        rows.push(["Range", `${Math.round(def.kind === "defense" ? defenseRange(w, hoverEnt) : def.range).toLocaleString()} km`]);
                    }
                    if (armOf(hoverEnt.type, hoverEnt.slot)) rows.push(["Armament", armOf(hoverEnt.type, hoverEnt.slot)]);
                    if (def.navalSpeed) rows.push(["Speed", `${def.navalSpeed} kn${hoverEnt.dest ? " · Sailing" : ""}`]);
                    if (def.airSpeed) rows.push(["Air Spd", `${def.airSpeed} kn`]);
                    if (def.radarKm) rows.push(["Radar", `${def.radarKm} km`]);
                    if (def.wing) rows.push(["Patrol", (hoverEnt.patrolSize ? `${hoverEnt.patrolSize}-${UNITS[PATROL_FIGHTER[hoverEnt.type]]?.rotary ? "Helo" : "Aircraft"}` : "Off") + (hoverEnt.awacsPatrol ? " · AWACS" : "")]);
                    rows.push(["HP", Math.round(hoverEnt.hp)]);
                    rows.push(["Upkeep", `${def.upkeep}/s`]);
                    rows.push(["Target", hoverEnt.targetId ? "Engaged" : "—"]);
                    header = <><UnitIcon name={UNIT_ICON[hoverEnt.type]} color={teamColor(hoverEnt.slot)} size={16}/><span>{labelOf(hoverEnt.type, hoverEnt.slot)}</span></>;
                } else {
                    rows = [
                        ["Nation", nationName(hoverEnt.slot)],
                        ["State", hoverEnt.state || "—"],
                        ["Population", fmtPop(hoverEnt.pop * vitalityOf(hoverEnt))],
                        ["Economy", hoverEnt.econ ? (hoverEnt.econ * 100).toFixed(1) + "%" : "—"],
                        ["HP", `${Math.max(0, Math.round(hoverEnt.hp))}/${hoverEnt.maxHp}`],
                        ["Status", hoverEnt.slot === mySlot ? "Yours" : relation(hoverEnt.slot) === "war" ? "At War" : "At Peace"],
                    ];
                    // Radioactive contamination: only shown when the city sits under an
                    // active fallout cloud. Reports the live loss rate and roughly how
                    // long the hazard lingers.
                    const fo = falloutDoseAt(w, hoverEnt.lng, hoverEnt.lat);
                    if (fo.remain > 0) rows.push(["Fallout", `☢ −${(fo.dose * FALLOUT.dmgPerSec).toFixed(1)} hp/s · ~${Math.ceil(fo.remain)}s`, "text-[#a6ff5c]"]);
                    header = <><span className="w-2.5 h-2.5 rounded-full flex-none" style={{background: teamColor(hoverEnt.slot)}}/><span>{hoverEnt.name}{hoverEnt.cap ? " ★" : ""}</span></>;
                    footer = <Meter frac={vitalityOf(hoverEnt)} fillClass={vitalityOf(hoverEnt) <= 0.35 ? "bg-danger" : "bg-good"} className="mt-2"/>;
                }
                return <HoverReadout x={hover.x} y={hover.y} clampBottom={200} header={header} rows={rows} footer={footer}/>;
            })()}

            {err && <div className={cn(
                "absolute bottom-[122px] left-1/2 -translate-x-1/2 z-6 bg-[rgba(14,16,19,0.92)] border border-line-soft text-text py-[9px] px-[18px] rounded text-[12.5px] tracking-[0.3px] pointer-events-none backdrop-blur-[8px] shadow-sm motion-safe:animate-[dbPop_200ms_var(--ease-out)]",
                err.kind === "err" && "bg-[rgba(224,87,79,0.14)] border-danger text-[#ffd7dd]",
                err.kind === "warn" && "bg-[rgba(140,255,58,0.12)] border-[rgba(140,255,58,0.55)] text-[#d6ff9e]"
            )} role="alert"
                         aria-live={err.kind === "err" ? "assertive" : "polite"}>{err.msg}</div>}
            {w.over && (
                <div className={overlay({placement: "center"})} role="dialog" aria-modal="true" aria-labelledby="db-outcome-title">
                    <div className={cn(card({size: "wide"}), "motion-safe:animate-[dbPop_240ms_var(--ease-out)]")}>
                        <div id="db-outcome-title"
                            className={cn(
                                "font-display text-[40px] font-bold tracking-[4px] uppercase text-center mb-3",
                                w.winnerSlot === mySlot ? "text-good [text-shadow:0_0_26px_rgba(62,227,139,0.55)]"
                                    : w.winnerSlot === null ? "text-dim" : "text-danger [text-shadow:0_0_24px_rgba(255,91,110,0.5)]"
                            )}>{w.winnerSlot === mySlot ? "Victory" : w.winnerSlot === null ? "Annihilation" : "Defeated"}</div>
                        <p className={sub()}>{w.winnerSlot === mySlot ? "You are the last power standing." : "The war is over."}</p>
                        <button className={cn(button({variant: "primary"}), "w-full")} onClick={onPause}>Menu</button>
                    </div>
                </div>
            )}

            <div className={cn(
                "absolute inset-0 z-60 grid place-items-center [background:radial-gradient(120%_120%_at_50%_42%,#0b0e13_0%,#05070b_72%)] transition-opacity duration-[520ms] ease-out-db",
                !booting && "opacity-0 pointer-events-none"
            )} aria-hidden={!booting}>
                <div className="text-center motion-safe:animate-[dbRowIn_500ms_var(--ease-out)_both]">
                    {myNation?.iso && <Flag iso={myNation.iso} className="text-[30px] rounded-[3px] shadow-[0_6px_20px_-8px_rgba(0,0,0,0.7)]"/>}
                    <div className="mt-4 font-display text-[26px] font-bold tracking-[8px] uppercase text-text">{myNation?.name || "Command"}</div>
                    <div className="mt-2 font-mono text-[11px] tracking-[3px] uppercase text-dim">Establishing theater command</div>
                    <div className="db-boot-bar w-[190px] h-0.5 mt-[22px] mx-auto bg-[rgba(255,255,255,0.08)] rounded-[2px] overflow-hidden"><i/></div>
                </div>
            </div>
        </>
    );
}
