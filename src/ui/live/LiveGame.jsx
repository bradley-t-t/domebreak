import {useEffect, useMemo, useRef, useState} from "react";
import WorldMap from "../../map/WorldMap.jsx";
import LiveHud from "../hud/LiveHud.jsx";
import LayerBar from "../hud/LayerBar.jsx";
import WarBar from "../hud/WarBar.jsx";
import ProductionBar from "../hud/ProductionBar.jsx";
import NationPanel from "../hud/NationPanel.jsx";
import NewsTicker from "../hud/NewsTicker.jsx";
import LeadershipAlert from "../hud/LeadershipAlert.jsx";
import WarOutcomeModal from "../hud/WarOutcomeModal.jsx";
import SkyLayer from "./SkyLayer.jsx";
import CountryLabels from "./CountryLabels.jsx";
import ContextMenu from "../hud/ContextMenu.jsx";
import PinnedBar from "../hud/PinnedBar.jsx";
import AdjustablePanel from "../hud/AdjustablePanel.jsx";
import ObjectivesPanel from "../hud/ObjectivesPanel.jsx";
import HudLayoutMenu from "../hud/HudLayoutMenu.jsx";
import {useHudLayout} from "../hud/useHudLayout.js";
import Flag from "../common/Flag.jsx";
import {useGameSession} from "../hooks/useGameSession.js";
import {useEventEffects} from "../hooks/useEventEffects.js";
import {useKeyboardControls} from "../hooks/useKeyboardControls.js";
import {usePanControls} from "../hooks/usePanControls.js";
import {useUnitStats} from "../hooks/useUnitStats.js";
import {useUnitHeading} from "../hooks/useUnitHeading.js";
import {usePlacementChecks} from "../hooks/usePlacementChecks.js";
import {useContextMenus} from "../hooks/useContextMenus.js";
import {useMapBoot} from "../hooks/useMapBoot.js";
import {useMapVisualEffects} from "../hooks/useMapVisualEffects.js";
import {button, miniButton, overlay, card, sub} from "../lib/variants.js";
import {cn} from "../lib/cn.js";
import TechTree from "../screens/TechTree.jsx";
import ProductionScreen from "../screens/ProductionScreen.jsx";
import DiplomacyScreen from "../screens/DiplomacyScreen.jsx";
import ControlsOverlay from "../screens/ControlsOverlay.jsx";
import MapLayers from "./MapLayers.jsx";
import MapMarkers from "./MapMarkers.jsx";
import HoverPopups from "./HoverPopups.jsx";
import {
    armamentOf,
    COAST_KM,
    inTerritory,
    placementBlocked,
    sensorsCover,
    unitLabel,
    UNITS
} from "../../game/engine.js";
import {toGid3} from "../../game/data/iso3.js";
import {WORLD_ZOOM} from "../../game/data/constants.js";
import {resolveKeys} from "../../game/platform/keybindings.js";
import {sfx} from "../../game/platform/audio.js";
import {useLiveLayers} from "./useLiveLayers.js";
import {useOwnershipLayer} from "./useOwnershipLayer.js";
import SelectionPanel from "./SelectionPanel.jsx";

const CITY_LAYERS = ["live-cities"];
// Below this zoom, hovering a country shows a whole-country readout instead of a city.
const COUNTRY_ZOOM = 4.2;
const DEFAULT_LAYERS = {countries: true, states: false, defense: false, radar: false, pop: false, backdrop: true};

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
    // Amphibious landing: the transport id whose cargo the next map click lands.
    const [disembarkId, setDisembarkId] = useState(null);
    const [hover, setHover] = useState(null);
    const [pins, setPins] = useState([]);
    // In-game controls reference (toggled with ? / F1, or the corner button).
    const [helpOpen, setHelpOpen] = useState(false);
    const [err, setErr] = useState(null);
    // Loading veil: covers the map from mount until the style + tiles finish
    // (map "idle"), so the player only sees the world once it's fully drawn and
    // already framed on their capital. Failsafe timer lifts it regardless — see
    // useMapBoot (same mount-scoped effect, same fitBounds/idle-reveal race).
    const [booting, setBooting] = useState(true);
    const handleMap = useMapBoot({w, mySlot, mapRef, setMapReady, setBooting});

    // Player-adjustable HUD layout — per-panel drag/resize/opacity/hide, persisted
    // machine-local (see useHudLayout / hudLayout.js). Presentation only; never
    // touches world state.
    const {layout: hud, update: setHud, resetPanel: resetHudPanel, resetAll: resetHudAll} = useHudLayout();

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
    // Selection-panel stat sheet — see useUnitStats (same rows, same formulas).
    const unitStats = useUnitStats({w, myNation, mySlot, armOf});
    // Screen-space unit heading for map-marker rotation — see useUnitHeading
    // (same rotMemo unwrap math, moved out verbatim).
    const unitHeading = useUnitHeading(mapRef);
    const flash = (m, kind = "err") => {
        sfx(kind === "err" ? "error" : "confirm");
        setErr({msg: m, kind});
        setTimeout(() => setErr(null), 1800);
    };
    const toggleLayer = (id) => setLayers((L) => ({...L, [id]: !L[id]}));
    // Placement/terrain validity checks — see usePlacementChecks (same feature
    // queries, same coastline sampling, moved out verbatim).
    const {onLand, isSea, nearWater, placeError} = usePlacementChecks({mapRef, w, mySlot, myGid});

    // Right-click context-menu construction (cities + units) and the pin-add
    // helper they share — see useContextMenus (same items, same ordering,
    // same menu state, moved out verbatim).
    const {menu, setMenu, openCityMenu, openUnitMenu} = useContextMenus({
        w, mySlot, myNation, api, selUnit,
        relation, nationName, labelOf, teamColor, flash,
        setSelUnit, setAttackMode, setMoving, setPlacing, setDisembarkId, setPins
    });

    // Battle audio + toast/explosion pipeline for fresh world.events — see
    // useEventEffects (same [w.time]-keyed effect, moved out verbatim).
    useEventEffects({w, mySlot, mapRef, setErr, setExplosions, onGameEnd});

    // A war-outcome popup pauses the sim in single-player while the player reads it,
    // then resumes on dismiss — unless they were already paused (manual pause is
    // preserved). Online matches are speed-locked and never pause: the modal is
    // non-blocking there. Keyed on whether the queue is non-empty.
    const hasWarPopup = (w.warPopups?.length ?? 0) > 0;
    const warAutoPaused = useRef(false);
    useEffect(() => {
        if (net) return;                       // online: never pause
        if (hasWarPopup && !w.paused) {
            warAutoPaused.current = true;
            api.pause();
        } else if (!hasWarPopup && warAutoPaused.current) {
            warAutoPaused.current = false;
            api.play();
        }
    }, [hasWarPopup, net]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // Countries layer visibility, per-country border/tint recolor, the
    // unit-fade-with-zoom CSS var, and the GID_0 -> label lookup — see
    // useMapVisualEffects (same effects, same dependency arrays, moved out verbatim).
    const {countryByGid} = useMapVisualEffects({mapRef, layers, mapReady, labels});

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
    const goPin = (p) => mapRef.current?.flyTo?.({center: [p.lng, p.lat], zoom: 4, duration: 800});
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

    return (
        <>
            <WorldMap globe={globe} onMap={handleMap} interactiveLayerIds={CITY_LAYERS} minZoom={WORLD_ZOOM.min}
                      onMapClick={onMapClick} onContextMenu={onCtx} onMouseMove={onMove}
                      cursor={placing || moving || attackMode || disembarkId ? "crosshair" : "grab"}>
                <MapLayers layers={layers} hoveredGid={hoveredGid} ownership={ownership} popFC={popFC}
                           backdropFC={backdropFC} radarFC={radarFC} defenseFC={defenseFC} ranges={ranges}
                           cmdLines={cmdLines} sailLines={sailLines} falloutFC={falloutFC} captureFC={captureFC}
                           liveFC={liveFC} mySlot={mySlot} teamColor={teamColor}/>
                <MapMarkers selectedCity={selectedCity} w={w} mySlot={mySlot} teamColor={teamColor}
                            visUnits={visUnits} unitHeading={unitHeading} unitColor={unitColor} labelOf={labelOf}
                            nationName={nationName} selUnit={selUnit} onUnitClick={onUnitClick}
                            openUnitMenu={openUnitMenu} setHover={setHover} placing={placing} moving={moving}
                            explosions={explosions}/>
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
                <AdjustablePanel panel={hud.topbar} onChange={(p) => setHud("topbar", p)}
                                 onReset={() => resetHudPanel("topbar")} label="Command bar"
                                 origin="top center" resizeDir={{x: 1, y: 0}} clickThrough
                                 className="relative w-full" contentClass="w-full flex justify-center"
                                 tabAlign="center">
                    <LiveHud world={w} api={api} myNation={myNation} panel={panel} keys={K} online={!!net}
                             onPanel={(id) => setPanel((p) => (p === id ? null : id))}
                             globe={globe} onGlobe={onToggleGlobe} onHelp={() => setHelpOpen(true)}
                             onMenu={onPause} meBadge={meBadge}/>
                </AdjustablePanel>
                <NewsTicker world={w} mySlot={mySlot}/>
                {/* Flowed in the stack (not absolutely pinned) so it always sits below the
                    HUD + ticker instead of overlapping them. */}
                {!w.over && <LeadershipAlert world={w} api={api} mySlot={mySlot}/>}
            </div>
            {!w.over && (
                <AdjustablePanel panel={hud.sidebar} onChange={(p) => setHud("sidebar", p)}
                                 onReset={() => resetHudPanel("sidebar")} label="Nation panel"
                                 origin="top left" resizeDir={{x: 1, y: 1}}
                                 className="absolute top-[40px] left-4 z-5"
                                 tabAlign="left">
                    <NationPanel world={w} mySlot={mySlot} myNation={myNation} onFocus={goPin}/>
                </AdjustablePanel>
            )}
            {!w.over && (
                <AdjustablePanel panel={hud.objectives} onChange={(p) => setHud("objectives", p)}
                                 onReset={() => resetHudPanel("objectives")} label="Objectives"
                                 origin="top right" resizeDir={{x: -1, y: 1}}
                                 className="absolute top-[150px] right-4 z-5"
                                 tabAlign="right">
                    <ObjectivesPanel world={w} mySlot={mySlot}/>
                </AdjustablePanel>
            )}
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
                <DiplomacyScreen world={w} api={api} mySlot={mySlot} online={!!net} onClose={() => setPanel(null)}/>}
            <AdjustablePanel panel={hud.bottomRight} onChange={(p) => setHud("bottomRight", p)}
                             onReset={() => resetHudPanel("bottomRight")} label="Map and war bar"
                             origin="bottom right" resizeDir={{x: -1, y: -1}}
                             className="absolute bottom-4 right-4 z-5"
                             tabAlign="right">
                <div className="flex flex-col items-end gap-2 pointer-events-none [&>*]:pointer-events-auto">
                    {!w.over && <WarBar world={w} mySlot={mySlot}/>}
                    <LayerBar layers={layers} onToggle={toggleLayer}/>
                </div>
            </AdjustablePanel>
            {!w.over && Boolean(myNation?.prod?.current || myNation?.prod?.queue?.length) && (
                <AdjustablePanel panel={hud.prodQueue} onChange={(p) => setHud("prodQueue", p)}
                                 onReset={() => resetHudPanel("prodQueue")} label="Production queue"
                                 origin="bottom center" resizeDir={{x: 0, y: -1}} clickThrough
                                 className="absolute bottom-4 inset-x-0 z-5 flex justify-center max-[1180px]:bottom-[76px]"
                                 tabAlign="center">
                    <ProductionBar world={w} api={api} mySlot={mySlot}/>
                </AdjustablePanel>
            )}
            <PinnedBar pins={pins} onGo={goPin} onRemove={(key) => setPins((p) => p.filter((x) => x.key !== key))}/>
            <HudLayoutMenu layout={hud} onToggle={setHud} onResetAll={resetHudAll}/>

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
            <HoverPopups hover={hover} hoverEnt={hoverEnt} countryByGid={countryByGid} w={w} mySlot={mySlot}
                         relation={relation} nationName={nationName} labelOf={labelOf} armOf={armOf}
                         teamColor={teamColor}/>

            {err && <div className={cn(
                "absolute bottom-[122px] left-1/2 -translate-x-1/2 z-6 bg-[rgba(14,16,19,0.92)] border border-line-soft text-text py-[9px] px-[18px] rounded text-[12.5px] tracking-[0.3px] pointer-events-none backdrop-blur-[8px] shadow-sm motion-safe:animate-[dbPop_200ms_var(--ease-out)]",
                err.kind === "err" && "bg-[rgba(224,87,79,0.14)] border-danger text-[#ffd7dd]",
                err.kind === "warn" && "bg-[rgba(140,255,58,0.12)] border-[rgba(140,255,58,0.55)] text-[#d6ff9e]"
            )} role="alert"
                         aria-live={err.kind === "err" ? "assertive" : "polite"}>{err.msg}</div>}
            {!w.over && !net && hasWarPopup && <WarOutcomeModal world={w} api={api}/>}
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
