import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import WorldMap from "../../map/WorldMap.jsx";
import LiveHud from "../hud/LiveHud.jsx";
import LayerBar from "../hud/LayerBar.jsx";
import WarBar from "../hud/WarBar.jsx";
import ProductionBar from "../hud/ProductionBar.jsx";
import NationPanel from "../hud/NationPanel.jsx";
import NewsTicker from "../hud/NewsTicker.jsx";
import WarOutcomeModal from "../hud/WarOutcomeModal.jsx";
import GraceIndicator from "../hud/GraceIndicator.jsx";
import ChatBox from "../hud/ChatBox.jsx";
import SkyLayer from "./SkyLayer.jsx";
import CountryLabels from "./CountryLabels.jsx";
import ContextMenu from "../hud/ContextMenu.jsx";
import PinnedBar from "../hud/PinnedBar.jsx";
import AdjustablePanel from "../hud/AdjustablePanel.jsx";
import ObjectivesPanel from "../hud/ObjectivesPanel.jsx";
import HudLayoutMenu from "../hud/HudLayoutMenu.jsx";
import BattlePlanScreen from "../screens/BattlePlanScreen.jsx";
import {useHudLayout} from "../hooks/useHudLayout.js";
import {HUD_PANELS} from "../../game/platform/hudLayout.js";
import {useBattlePlans} from "../hooks/useBattlePlans.js";
import {useBattlePlanReconciler} from "../hooks/useBattlePlanReconciler.js";
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
import ProductionScreen from "../screens/ProductionScreen.jsx";
import DiplomacyScreen from "../screens/DiplomacyScreen.jsx";
import ControlsOverlay from "../screens/ControlsOverlay.jsx";
import PlayerListOverlay from "../screens/PlayerListOverlay.jsx";
import CountryInfoPopup from "../screens/CountryInfoPopup.jsx";
import MapLayers from "./MapLayers.jsx";
import MapMarkers from "./MapMarkers.jsx";
import PlacementGhost from "./PlacementGhost.jsx";
import HoverPopups from "./HoverPopups.jsx";
import {
    armamentOf,
    isActive,
    inTerritory,
    placementBlocked,
    radarRangeOf,
    sensorsCover,
    unitLabel,
    UNITS
} from "../../game/engine.js";
import {toGid3} from "../../game/data/iso3.js";
import {WORLD_ZOOM} from "../../game/data/constants.js";
import {resolveKeys} from "../../game/platform/keybindings.js";
import {sfx} from "../../game/platform/audio.js";
import {useLiveLayers} from "../hooks/useLiveLayers.js";
import {useOwnershipLayer} from "../hooks/useOwnershipLayer.js";
import {useDiplomacyLayer} from "../hooks/useDiplomacyLayer.js";
import SelectionPanel from "./SelectionPanel.jsx";

const CITY_LAYERS = ["live-cities"];
// Below this zoom, hovering a country shows a whole-country readout instead of a city.
const COUNTRY_ZOOM = 4.2;
const DEFAULT_LAYERS = {countries: true, diplomacy: false, states: false, defense: false, radar: false, pop: false, backdrop: true};

export default function LiveGame({
                                     world,
                                     net,
                                     globe,
                                     keys,
                                     onToggleGlobe,
                                     onPause,
                                     onLeave,
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
    // The cursor-following placement ring owns its own position state inside
    // PlacementGhost; we drive it imperatively so a mousemove updates only that
    // one source, never LiveGame's marker fan-out (see PlacementGhost / onMove).
    const ghostRef = useRef(null);
    // rAF-coalescing for onMove: MapLibre fires mousemove per raw event (well over
    // one per frame). We stash the latest event and process at most once per frame.
    const moveRAF = useRef(0);
    const lastMoveEvt = useRef(null);

    // null | "production" | "battle" | "diplomacy" — the top-bar command screens.
    const [panel, setPanel] = useState(null);
    const [placing, setPlacing] = useState(null);
    const [moving, setMoving] = useState(null);
    // Naval "follow" arming: the id of the ship awaiting a guide-ship pick (the next
    // friendly-ship click assigns it to that ship's formation).
    const [following, setFollowing] = useState(null);
    const [selUnit, setSelUnit] = useState(null);
    const [selCity, setSelCity] = useState(null);
    const [attackMode, setAttackMode] = useState(false);
    const [hoveredGid, setHoveredGid] = useState(null);
    const [layers, setLayers] = useState(DEFAULT_LAYERS);
    const [mapReady, setMapReady] = useState(0);
    const [explosions, setExplosions] = useState([]);
    // Amphibious landing: the transport id whose cargo the next map click lands.
    const [disembarkId, setDisembarkId] = useState(null);
    // Hover CONTENT (what the cursor is over) lives in state; the cursor's x/y
    // lives in this mutated ref. Splitting them means moving the mouse across a
    // country (every drag-pan does) never re-renders the whole LiveGame tree
    // per pointer frame — the readout repositions from the ref on the ~30fps sim
    // renders it gets for free.
    const [hover, setHover] = useState(null);
    const hoverPosRef = useRef({x: 0, y: 0});
    const [pins, setPins] = useState([]);
    // In-game controls reference (toggled with ? / F1, or the corner button).
    const [helpOpen, setHelpOpen] = useState(false);
    // In-game scoreboard (Tab): every active power, their commander, and stats.
    const [playerListOpen, setPlayerListOpen] = useState(false);
    // Country dossier popup — the slot whose CountryInfoPopup is showing, or null.
    // Opened by clicking a flag (scoreboard, WarBar) or right-clicking a hovered
    // country plaque.
    const [countryPopupSlot, setCountryPopupSlot] = useState(null);
    const [err, setErr] = useState(null);
    // Loading veil: covers the map from mount until the style + tiles finish
    // (map "idle"), so the player only sees the world once it's fully drawn and
    // already framed on their capital. Failsafe timer lifts it regardless — see
    // useMapBoot (same mount-scoped effect, same fitBounds/idle-reveal race).
    const [booting, setBooting] = useState(true);
    // Once eliminated, the player may choose to stay and watch the war play out.
    // Spectating drops every command surface but keeps the map, chat, and scoreboard.
    const [spectating, setSpectating] = useState(false);
    const handleMap = useMapBoot({w, mySlot, mapRef, setMapReady, setBooting});

    // The local player's OWN elimination in an online match: their nation lost its
    // last city (server flips nation.alive — see sim/tickPhases.stepVictory) while
    // the war rages on for everyone else. Solo defeat is terminal (w.over) and never
    // reaches this. `hudHidden` collapses the whole command HUD both when the local
    // player is out (eliminated) and when the match itself has ended (w.over).
    const eliminated = !!net && !w.over && !!myNation && myNation.alive === false;
    const hudHidden = w.over || eliminated;

    // On elimination, tear down every in-flight command interaction so no ghost
    // ring, move prompt, or open panel outlives the nation it belonged to.
    useEffect(() => {
        if (!eliminated) return;
        setPanel(null);
        setPlacing(null);
        setMoving(null);
        setSelUnit(null);
        setSelCity(null);
        setDisembarkId(null);
        setAttackMode(false);
    }, [eliminated]);

    // Player-adjustable HUD layout — per-panel drag/resize/opacity/hide, persisted
    // machine-local (see useHudLayout / hudLayout.js). Presentation only; never
    // touches world state.
    const {layout: hud, update: setHud, resetPanel: resetHudPanel, resetAll: resetHudAll} = useHudLayout();

    // Battle Planning: the player's authored attack plans (intent) plus the reconciler
    // that turns armed/executed plans into real orders through the sanctioned engine
    // commands. Plans are seeded from — and mirrored back onto — the world so they
    // persist across save/load and can be drafted in peacetime. See its GDD/ADR.
    const bp = useBattlePlans(w);
    useBattlePlanReconciler({world: w, api, mySlot, plans: bp.plans, onFired: (id, n) => flash(n ? `Strike launched — ${n} on the way.` : "No units in range to fire.", n ? "info" : undefined)});

    // These helpers are threaded into memoized consumers (the MapMarkers children
    // and useLiveLayers' checksum-gated FeatureCollections), so they're wrapped in
    // useCallback to keep a stable identity. The world and nation objects they
    // close over are mutated in place by the engine (their identities never
    // change), so every call still reads the live relations/names at call time.
    const relation = useCallback((slot) => {
        const r = myNation?.relations[slot];
        return r === "war" ? "war" : r === "ally" ? "ally" : "peace";
    }, [myNation]);
    // Tactical allegiance color for anything drawn on the map: you = white,
    // hostile (at war) = red, allied = blue, everyone else = neutral grey.
    const teamColor = useCallback((slot) => (slot === mySlot ? "#f0f3f7" : relation(slot) === "war" ? "#f0556a" : relation(slot) === "ally" ? "#5fa8ff" : "#8b94a1"), [mySlot, relation]);
    // Your leadership airlift stands out from your white forces: a transport
    // ferry reads BLUE while it's carrying leaders and YELLOW when flying empty
    // (outbound to a pickup or back home), so a glance tells you which planes are
    // actually moving command. Its fighter escorts read green — a distinct guard.
    const unitColor = useCallback((u) => {
        if (u.slot !== mySlot) return teamColor(u.slot);
        if (u.mission?.role === "leadershipFerry") return u.mission.cargo > 0 ? "#3d9bff" : "#f4c02a";
        if (u.mission?.role === "leadershipEscort") return "#46d38a";
        return teamColor(u.slot);
    }, [mySlot, teamColor]);
    const nationName = useCallback((slot) => w.nations.find((n) => n.slot === slot)?.name || `Nation ${slot}`, [w]);
    const labelOf = useCallback((type, slot) => unitLabel(type, w.nations.find((n) => n.slot === slot)?.iso), [w]);
    const armOf = useCallback((type, slot) => armamentOf(type, w.nations.find((n) => n.slot === slot)?.iso), [w]);
    // Selection-panel stat sheet — see useUnitStats (same rows, same formulas).
    const unitStats = useUnitStats({w, mySlot, armOf});
    // Screen-space unit heading for map-marker rotation — see useUnitHeading
    // (same rotMemo unwrap math, moved out verbatim).
    const unitHeading = useUnitHeading(mapRef);
    const flash = (m, kind = "err") => {
        sfx(kind === "err" ? "error" : "confirm");
        setErr({msg: m, kind});
        setTimeout(() => setErr(null), 1800);
    };
    const toggleLayer = (id) => setLayers((L) => ({...L, [id]: !L[id]}));
    // Placing or relocating a radar-emitting unit: force the radar layer on so
    // the ghost's coverage ring (and the pulse over it) is visible while you
    // aim, then restore whatever the layer was before placement started. The
    // saved value is captured only on the OFF→ON transition and cleared on
    // ON→OFF, so a manual toggle mid-placement doesn't clobber the restore.
    const savedRadarRef = useRef(null);
    useEffect(() => {
        const type = placing || (moving && w.units.find((u) => u.id === moving)?.type);
        const emits = !!type && radarRangeOf(type) > 0;
        if (emits && savedRadarRef.current === null) {
            savedRadarRef.current = layers.radar;
            if (!layers.radar) setLayers((L) => ({...L, radar: true}));
        } else if (!emits && savedRadarRef.current !== null) {
            const prev = savedRadarRef.current;
            savedRadarRef.current = null;
            setLayers((L) => (L.radar === prev ? L : {...L, radar: prev}));
        }
        // w.units read is intentionally not a dep — we only need to resolve the
        // moving unit's type at each transition, not re-fire every sim tick.
    }, [placing, moving]); // eslint-disable-line react-hooks/exhaustive-deps
    // Placement/terrain validity checks — see usePlacementChecks (same feature
    // queries, same coastline sampling, moved out verbatim).
    const {onLand, isSea, nearWater, placeError} = usePlacementChecks({mapRef, w, mySlot, myGid});

    // Right-click context-menu construction (cities + units) and the pin-add
    // helper they share — see useContextMenus (same items, same ordering,
    // same menu state, moved out verbatim).
    const {menu, setMenu, openCityMenu, openUnitMenu} = useContextMenus({
        w, mySlot, myNation, api, selUnit,
        relation, nationName, labelOf, teamColor, flash,
        setSelUnit, setAttackMode, setMoving, setFollowing, setPlacing, setDisembarkId, setPins
    });

    // Battle audio + toast/explosion pipeline for fresh world.events — see
    // useEventEffects (same [w.time]-keyed effect, moved out verbatim).
    useEventEffects({w, mySlot, mapRef, setErr, setExplosions, onGameEnd});

    // A war-outcome popup pauses the sim in single-player while the player reads it,
    // then resumes on dismiss — unless they were already paused (manual pause is
    // preserved). Online matches are speed-locked and never pause: the modal is
    // non-blocking there. Keyed on whether the queue is non-empty.
    const hasWarPopup = (w.warPopups?.length ?? 0) > 0;
    // Online alliance offers ride the broadcast pendingAlliance queue rather than
    // the per-player warPopups modal queue (the server can't address one seat). Each
    // client surfaces the front proposal aimed at its own slot as an Accept/Decline
    // prompt; answering it clears the offer for everyone via respondAlliance.
    const allyOffer = net ? w.pendingAlliance?.find((o) => o.to === mySlot) : null;
    const allyOfferPop = allyOffer ? {id: `ally-offer-${allyOffer.from}`, kind: "ally-offer", foe: allyOffer.from} : null;
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
        following, setFollowing,
        placing, setPlacing,
        attackMode, setAttackMode,
        panel, setPanel,
        playerListOpen, setPlayerListOpen,
        countryPopupSlot, setCountryPopupSlot,
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
    // Two GID_0 sets driving the political tint (see useMapVisualEffects): active
    // powers wear their flag color; nations wiped out in war (surrendered or
    // decapitated) drop to a darker wipeout grey-green; every other country is neutral
    // scenery. Recomputed whenever a nation's active/wiped state flips — a routed
    // belligerent is neutralized mid-match, so the set is no longer fixed.
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nationSig]);
    const {countryByGid} = useMapVisualEffects({mapRef, layers, mapReady, labels, activeGids, wipedGids});

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
        radarEmitters,
        defenseFC,
        popFC,
        ranges,
        cmdLines,
        sailLines,
        planArcsFC,
        planTargetsFC
    } = useLiveLayers({
        w, mySlot, backdrop, layers, selUnit, teamColor, globe
    });
    // Territory recolor for conquered / broken-away provinces (see useOwnershipLayer).
    const ownership = useOwnershipLayer(w);
    // Diplomacy map filter: recolor every nation by your standing (see useDiplomacyLayer).
    const diplomacy = useDiplomacyLayer(w, mySlot);

    // The actual per-move work: a country hit-test, the placement-validity probe
    // (which pushes the ghost ring's position straight into PlacementGhost, off
    // LiveGame's render path), and the zoom-aware hover readout. Run at most once
    // per frame via the rAF gate below.
    const processMove = (e) => {
        const m = mapRef.current;
        if (!m) return;
        const feats = m.queryRenderedFeatures(e.point, {layers: ["country-fill"]});
        const gid = feats[0]?.properties?.GID_0 || null;
        const activeType = placing || (moving && w.units.find((u) => u.id === moving)?.type);
        if (activeType) {
            const orbital = !!UNITS[activeType]?.orbital;
            let valid;
            if (orbital) {
                // Orbital assets orbit above every surface — the cursor is always a
                // valid orbit slot regardless of land/water/foreign territory, and
                // the MIN_SEP proximity check is meaningless for a sat.
                valid = true;
            } else {
                const onLandHere = feats.length > 0, inTerr = inTerritory(w, mySlot, e.lngLat.lng, e.lngLat.lat);
                const myLandHere = myGid ? feats.some((f) => f.properties?.GID_0 === myGid) : (onLandHere && inTerr);
                // A marching ground unit may head anywhere on land (same freedom ships
                // have at sea); placement and paid relocation stay territory-bound.
                const marching = moving && UNITS[activeType]?.landSpeed;
                const terrainOk = marching ? onLandHere
                    : UNITS[activeType]?.coastal ? (myLandHere && nearWater(e))
                        : isSea(activeType) ? (!onLandHere && inTerr) : myLandHere;
                valid = terrainOk && !placementBlocked(w, e.lngLat.lng, e.lngLat.lat, moving || null);
            }
            ghostRef.current?.update(e.lngLat.lng, e.lngLat.lat, valid);
        }
        if (gid !== hoveredGid) setHoveredGid(gid);
        // Localized hover probe: zoomed out → whole-country readout; zoomed in → the
        // city under the cursor. (Units carry their own hover via their markers.)
        // Every setHover below preserves identity when the CONTENT is unchanged, so
        // sweeping the cursor across one country costs zero re-renders.
        if (!placing && !moving) {
            hoverPosRef.current.x = e.originalEvent.clientX;
            hoverPosRef.current.y = e.originalEvent.clientY;
            if (m.getZoom() < COUNTRY_ZOOM) {
                if (gid) setHover((h) => (h && h.kind === "country" && h.gid === gid ? h : {kind: "country", gid}));
                else setHover((h) => (h && h.kind === "country" ? null : h));
            } else {
                const cf = m.queryRenderedFeatures(e.point, {layers: CITY_LAYERS})[0];
                if (cf) {
                    const id = cf.properties.id;
                    setHover((h) => (h && h.kind === "city" && h.id === id ? h : {kind: "city", id}));
                } else setHover((h) => (h && (h.kind === "city" || h.kind === "country") ? null : h));
            }
        }
    };
    const onMove = (e) => {
        lastMoveEvt.current = e;
        if (moveRAF.current) return;
        moveRAF.current = requestAnimationFrame(() => {
            moveRAF.current = 0;
            const e2 = lastMoveEvt.current;
            lastMoveEvt.current = null;
            if (e2) processMove(e2);
        });
    };
    useEffect(() => () => {
        if (moveRAF.current) cancelAnimationFrame(moveRAF.current);
    }, []);
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
        const feat = cityFeatAt(e);
        if (feat) return onCityClick(feat.properties.id);
        // A follow order needs a ship target, not empty water — clear the arming.
        if (following) {
            setFollowing(null);
            flash("Follow cancelled — click one of your ships.", "info");
            return;
        }
        setSelUnit(null);
        setSelCity(null);
        setAttackMode(false);
        setMenu(null);
    };
    // One-shot city hit-test for click/context handlers. Doing this here instead
    // of via the Map's interactiveLayerIds matters: interactive layers make the
    // react-map-gl proxy run a queryRenderedFeatures hover test on EVERY raw
    // pointer event (un-coalesced — above frame rate on 120Hz inputs), stacked on
    // top of processMove's own rAF-gated queries, for the entire drag of every
    // camera pan. Clicks are rare; pointer moves are not.
    const cityFeatAt = (e) => mapRef.current?.queryRenderedFeatures?.(e.point, {layers: CITY_LAYERS})?.[0];
    const onCityClick = (id) => {
        const c = w.cities.find((x) => x.id === id);
        if (!c) return;
        // Neutral countries are passive scenery — not interactable (no select, target, or capture).
        if (!isActive(w, c.slot)) return;
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
        if (following) {
            setFollowing(null);
            return;
        }
        if (attackMode) {
            setAttackMode(false);
            return;
        }
        const feat = cityFeatAt(e);
        if (feat) return openCityMenu(feat.properties.id, e.originalEvent);
        // Zoomed out enough that the whole-country plaque is up: right-clicking
        // the country opens its dossier (declare war / manage alliance / etc.).
        if (hover?.kind === "country") {
            const country = w.nations.find((n) => toGid3(n.iso) === hover.gid);
            if (country) {
                setCountryPopupSlot(country.slot);
                return;
            }
        }
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
        // Follow pick: the armed ship keeps station on the clicked friendly ship.
        if (following) {
            if (u.id === following) return flash("A ship can't follow itself.");
            if (u.slot !== mySlot || !UNITS[u.type].navalSpeed) return flash("Pick one of your ships to follow.");
            const r = api.setFollow(following, u.id);
            if (r.error) flash(r.error); else flash(`Keeping station on ${labelOf(u.type, u.slot)}.`, "info");
            setFollowing(null);
            return;
        }
        // Battle-plan pick: add my offensive units to the roster, or enemy-at-war
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
            <WorldMap globe={globe} onMap={handleMap} minZoom={WORLD_ZOOM.min}
                      onMapClick={onMapClick} onContextMenu={onCtx} onMouseMove={onMove}
                      cursor={placing || moving || following || attackMode || disembarkId ? "crosshair" : "grab"}>
                <MapLayers layers={layers} hoveredGid={hoveredGid} ownership={ownership} diplomacy={diplomacy}
                           popFC={popFC}
                           backdropFC={backdropFC} radarFC={radarFC} radarEmitters={radarEmitters} defenseFC={defenseFC} ranges={ranges}
                           cmdLines={cmdLines} sailLines={sailLines} falloutFC={falloutFC} captureFC={captureFC}
                           liveFC={liveFC} mySlot={mySlot} teamColor={teamColor}
                           planArcsFC={planArcsFC} planTargetsFC={planTargetsFC} planColor={bp.active?.color}
                           globe={globe}/>
                <PlacementGhost ref={ghostRef} placing={placing} moving={moving} w={w} globe={globe}/>
                <MapMarkers selectedCity={selectedCity} w={w} mySlot={mySlot} teamColor={teamColor}
                            visUnits={visUnits} unitHeading={unitHeading} unitColor={unitColor} labelOf={labelOf}
                            nationName={nationName} selUnit={selUnit} onUnitClick={onUnitClick}
                            openUnitMenu={openUnitMenu} setHover={setHover} hoverPos={hoverPosRef.current}
                            placing={placing} moving={moving}
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
                {/* The command bar and the Live Wire feed are one attached unit: the
                    ticker is docked directly beneath LiveHud inside the same panel, so
                    it moves, scales, and fades together with the top bar. */}
                <AdjustablePanel panel={hud.topbar} onChange={(p) => setHud("topbar", p)}
                                 onReset={() => resetHudPanel("topbar")} label="Command bar"
                                 origin="top center" resizeDir={{x: 1, y: 0}} clickThrough
                                 className="relative w-full" contentClass="w-full flex flex-col items-center gap-[6px]"
                                 tabAlign="center">
                    <LiveHud world={w} api={api} myNation={myNation} panel={panel} keys={K} online={!!net}
                             onPanel={hudHidden ? null : (id) => setPanel((p) => (p === id ? null : id))}
                             globe={globe} onGlobe={onToggleGlobe} onHelp={() => setHelpOpen(true)}
                             onMenu={onPause} meBadge={meBadge}/>
                    <NewsTicker world={w} mySlot={mySlot}/>
                </AdjustablePanel>
            </div>
            {!hudHidden && (
                <AdjustablePanel panel={hud.sidebar} onChange={(p) => setHud("sidebar", p)}
                                 onReset={() => resetHudPanel("sidebar")} label="Nation panel"
                                 origin="top left" resizeDir={{x: 1, y: 1}}
                                 className="absolute top-[40px] left-4 z-5"
                                 tabAlign="left">
                    <NationPanel world={w} mySlot={mySlot} myNation={myNation} onFocus={goPin}/>
                </AdjustablePanel>
            )}
            {!hudHidden && (
                <AdjustablePanel panel={hud.objectives} onChange={(p) => setHud("objectives", p)}
                                 onReset={() => resetHudPanel("objectives")} label="Objectives"
                                 origin="top right" resizeDir={{x: -1, y: 1}}
                                 className="absolute top-[150px] right-4 z-5"
                                 tabAlign="right">
                    <ObjectivesPanel world={w} api={api} mySlot={mySlot} flash={flash}/>
                </AdjustablePanel>
            )}
            {!hudHidden && panel === "production" &&
                <ProductionScreen world={w} api={api} mySlot={mySlot} placing={placing}
                                  setPlacing={(t) => {
                                      setPlacing(t);
                                      setMoving(null);
                                      setSelUnit(null);
                                  }} onClose={() => setPanel(null)}/>}
            {!hudHidden && panel === "diplomacy" &&
                <DiplomacyScreen world={w} api={api} mySlot={mySlot} online={!!net} players={net?.players} onClose={() => setPanel(null)}/>}
            {!hudHidden && panel === "battle" &&
                <BattlePlanScreen world={w} mySlot={mySlot} bp={bp} onClose={() => setPanel(null)}/>}
            <AdjustablePanel panel={hud.bottomRight} onChange={(p) => setHud("bottomRight", p)}
                             onReset={() => resetHudPanel("bottomRight")} label="Map and war bar"
                             origin="bottom right" resizeDir={{x: -1, y: -1}}
                             className="absolute bottom-4 right-4 z-5"
                             tabAlign="right">
                <div className="flex flex-col items-end gap-2 pointer-events-none [&>*]:pointer-events-auto">
                    {!hudHidden && <WarBar world={w} mySlot={mySlot} onOpenCountry={setCountryPopupSlot}/>}
                    <LayerBar layers={layers} onToggle={toggleLayer}/>
                </div>
            </AdjustablePanel>
            {!hudHidden && Boolean(myNation?.prod?.current || myNation?.prod?.queue?.length) && (
                <AdjustablePanel panel={hud.prodQueue} onChange={(p) => setHud("prodQueue", p)}
                                 onReset={() => resetHudPanel("prodQueue")} label="Production queue"
                                 origin="bottom center" resizeDir={{x: 0, y: -1}} clickThrough
                                 className="absolute bottom-4 inset-x-0 z-5 flex justify-center max-[1180px]:bottom-[76px]"
                                 tabAlign="center">
                    <ProductionBar world={w} api={api} mySlot={mySlot}/>
                </AdjustablePanel>
            )}
            <PinnedBar pins={pins} onGo={goPin} onRemove={(key) => setPins((p) => p.filter((x) => x.key !== key))}/>
            <HudLayoutMenu layout={hud} onToggle={setHud} onResetAll={resetHudAll}
                           panels={net ? HUD_PANELS : HUD_PANELS.filter((p) => !p.online)}/>

            {moving && <div
                className="absolute top-[100px] left-1/2 -translate-x-1/2 z-6 flex items-center gap-[10px] bg-panel border border-[rgba(244,192,42,0.4)] text-text py-2 px-[14px] rounded text-[13px] shadow" role="status" aria-live="polite">{UNITS[movingUnit?.type]?.navalSpeed ? "Set Sail — click an open-ocean destination." : UNITS[movingUnit?.type]?.landSpeed ? "March — click a land destination." : isSea(movingUnit?.type) ? "Relocating — click in your coastal waters." : "Relocating — click inside your territory (on land)."}
                <button className={miniButton()} onClick={() => setMoving(null)}>Cancel</button>
            </div>}
            {following && <div className="absolute top-[100px] left-1/2 -translate-x-1/2 z-6 flex items-center gap-[10px] bg-panel border border-[rgba(244,192,42,0.4)] text-text py-2 px-[14px] rounded text-[13px] shadow" role="status" aria-live="polite">Follow — click one of your ships to keep station on.
                <button className={miniButton()} onClick={() => setFollowing(null)}>Cancel</button>
            </div>}
            {disembarkId && <div className="absolute top-[100px] left-1/2 -translate-x-1/2 z-6 flex items-center gap-[10px] bg-panel border border-[rgba(244,192,42,0.4)] text-text py-2 px-[14px] rounded text-[13px] shadow" role="status" aria-live="polite">Landing — click a coastal point inside your territory.
                <button className={miniButton()} onClick={() => setDisembarkId(null)}>Cancel</button>
            </div>}

            {selectedUnit && !hudHidden && (
                <SelectionPanel selectedUnit={selectedUnit} w={w} myNation={myNation} mySlot={mySlot} api={api}
                                labelOf={labelOf} teamColor={teamColor} unitStats={unitStats} moving={moving}
                                setMoving={setMoving} following={following} setFollowing={setFollowing}
                                setPlacing={setPlacing} attackMode={attackMode}
                                setAttackMode={setAttackMode} flash={flash}/>
            )}
            {menu && <ContextMenu {...menu} onClose={() => setMenu(null)}/>}
            {helpOpen && <ControlsOverlay keys={keys} onClose={() => setHelpOpen(false)}/>}
            <HoverPopups hover={hover} hoverEnt={hoverEnt} pos={hoverPosRef.current} countryByGid={countryByGid} w={w} mySlot={mySlot}
                         relation={relation} nationName={nationName} labelOf={labelOf} armOf={armOf}
                         teamColor={teamColor}/>

            {err && <div className={cn(
                "absolute bottom-[122px] left-1/2 -translate-x-1/2 z-6 bg-[rgba(14,16,19,0.92)] border border-line-soft text-text py-[9px] px-[18px] rounded text-[12.5px] tracking-[0.3px] pointer-events-none backdrop-blur-[8px] shadow-sm motion-safe:animate-[dbPop_200ms_var(--ease-out)]",
                err.kind === "err" && "bg-[rgba(224,87,79,0.14)] border-danger text-[#ffd7dd]",
                err.kind === "warn" && "bg-[rgba(140,255,58,0.12)] border-[rgba(140,255,58,0.55)] text-[#d6ff9e]"
            )} role="alert"
                         aria-live={err.kind === "err" ? "assertive" : "polite"}>{err.msg}</div>}
            {!hudHidden && <GraceIndicator world={w}/>}
            {/* Player chat — online matches only. Stays up after the war ends so the
                outcome screen can still talk. Movable via the shared HUD layout
                system, docked bottom-left above the layout hub by default. */}
            {net && (
                <AdjustablePanel panel={hud.comms} onChange={(p) => setHud("comms", p)}
                                 onReset={() => resetHudPanel("comms")} label="Comms"
                                 origin="bottom left" resizeDir={{x: 1, y: -1}}
                                 className="absolute bottom-[68px] left-4 z-6"
                                 tabAlign="left">
                    <ChatBox net={net} mySlot={mySlot} overlayOpen={overlayOpen}/>
                </AdjustablePanel>
            )}
            {!w.over && !net && hasWarPopup && <WarOutcomeModal world={w} api={api}/>}
            {!w.over && net && allyOfferPop && <WarOutcomeModal world={w} api={api} pop={allyOfferPop}/>}
            {/* You were knocked out but the war rages on: a blocking notice with the
                choice to keep watching (spectate) or leave to the menu. Dismissing it
                (Spectate) drops into the HUD-less spectator view below. */}
            {eliminated && !spectating && (
                <div className={overlay({placement: "center"})} role="dialog" aria-modal="true" aria-labelledby="db-eliminated-title">
                    <div className={cn(card({size: "wide"}), "motion-safe:animate-[dbPop_240ms_var(--ease-out)]")}>
                        <div id="db-eliminated-title"
                             className="font-display text-[40px] font-bold tracking-[4px] uppercase text-center mb-3 text-danger [text-shadow:0_0_24px_rgba(255,91,110,0.5)]">Eliminated</div>
                        <p className={sub()}>{myNation?.name || "Your nation"} has fallen. The war goes on without you.</p>
                        <div className="flex gap-2">
                            <button className={cn(button(), "flex-1")} onClick={() => setSpectating(true)}>Spectate</button>
                            <button className={cn(button({variant: "primary"}), "flex-1")} onClick={onLeave}>Leave</button>
                        </div>
                    </div>
                </div>
            )}
            {/* Spectator ribbon — the only chrome left once you opt to keep watching. */}
            {eliminated && spectating && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-6 flex items-center gap-3 bg-panel border border-line-soft text-text py-[7px] px-[14px] rounded text-[12.5px] tracking-[0.3px] backdrop-blur-[8px] shadow-sm motion-safe:animate-[dbPop_200ms_var(--ease-out)]" role="status" aria-live="polite">
                    <span className="font-mono uppercase tracking-[1px] text-dim">Spectating</span>
                    <button className={miniButton()} onClick={onLeave}>Leave</button>
                </div>
            )}
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
            {/* Rendered after the outcome modal so a Tab-hold still surfaces the scoreboard when the match has ended. */}
            {playerListOpen && <PlayerListOverlay world={w} mySlot={mySlot} players={net?.players}
                                                  onOpenCountry={setCountryPopupSlot}
                                                  onClose={() => setPlayerListOpen(false)}/>}
            {countryPopupSlot != null &&
                <CountryInfoPopup world={w} api={api} mySlot={mySlot} online={!!net}
                                  targetSlot={countryPopupSlot} players={net?.players}
                                  onClose={() => setCountryPopupSlot(null)}/>}

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
