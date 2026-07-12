// Memoized map-layer FeatureCollection builders for LiveGame's <Source> layers. Nothing
// here owns state; it only derives GeoJSON from engine state (w) and the handful of UI
// toggles/inputs the map layers care about.
//
// The world is mutated in place, so w and its arrays keep the same identity every
// tick; each memo lists w.time (the tick counter) as its recompute trigger. That
// pattern is invisible to exhaustive-deps, so it's disabled for this file.
/* eslint-disable react-hooks/exhaustive-deps */
import {useMemo, useRef} from "react";
import {airborne, defenseMinRange, defenseRange, falloutIntensity, isActive, radarRangeOf, sensorsOf, subSensorsOf, UNITS, unitVisibleTo, vitalityOf} from "../../game/engine.js";
import {CAPTURE, RADAR_RING_COLORS} from "../../game/data/constants.js";
import {circle, gcTrail, geoCircle, GEODESIC_MAX_KM} from "../../game/geo/geo.js";

// Coverage rings render round in whichever projection is showing: a true geodesic
// cap on the globe, the Mercator disc on the flat map. Satellites (rings wider than
// a hemisphere) stay on the Mercator disc either way — a geodesic cap that big folds
// toward the antipode instead of reading as a ring. Module-level (not a hook dep) so
// the memos below only react to `globe`, which they already list.
const coverageRing = (globe, lng, lat, km, steps, innerKm = 0) =>
    (globe && km <= GEODESIC_MAX_KM ? geoCircle : circle)(lng, lat, km, steps, innerKm);

// Strike-envelope color for a selected offensive unit's reach ring — the same warm
// amber as the battle-plan strike arcs, so an offensive reach ring never reads as a
// (team-colored) defensive coverage bubble.
const STRIKE_COLOR = "#f0a63c";

// Rolling 32-bit checksum helpers for the change-detectors below — the same
// Math.imul(31) mix useOwnershipLayer / useDiplomacyLayer gate their heavy
// rebuilds on. Folding the inputs that actually reach the GeoJSON lets a memo
// return its previous FeatureCollection by reference on the (very common)
// tick where nothing moved, so the <Source> deep-equal never runs.
const foldNum = (sig, n) => (Math.imul(sig, 31) + n) | 0;
const foldStr = (sig, s) => {
    for (let i = 0; i < s.length; i++) sig = (Math.imul(sig, 31) + s.charCodeAt(i)) | 0;
    return sig;
};

// Shared empty FeatureCollection: a stable identity for "nothing to draw", so
// idle overlays hand the map the same object every tick. Never mutated.
const EMPTY_FC = {type: "FeatureCollection", features: []};
const EMPTY_RADAR = {radarFC: EMPTY_FC, radarEmitters: []};

export function useLiveLayers({
                                  w,
                                  mySlot,
                                  backdrop,
                                  layers,
                                  selUnit,
                                  teamColor,
                                  globe,
                                  battlePreview
                              }) {
    const backdropFC = useMemo(() => ({
        type: "FeatureCollection",
        features: (backdrop || []).map((c) => ({
            type: "Feature",
            properties: {cap: c.cap ? 1 : 0},
            geometry: {type: "Point", coordinates: [c.lng, c.lat]}
        }))
    }), [backdrop]);
    // Cities in neutral (inactive) countries are pure scenery — no dot on the map,
    // no ruin, no health halo. LiveGame's onCityClick / openCityMenu also treat them
    // as non-interactable, so dropping them here keeps the map, the hit tests, and
    // the game rules aligned.
    //
    // Rebuilding a feature for every living city (~2565) each tick is the single
    // biggest per-frame allocation on the map, so the rebuild is gated on a
    // checksum over everything a city dot encodes: owner + alive + vitality per
    // city, plus each nation's active flag and my relation to it (relation is
    // what teamColor turns into the dot color). Vitality is folded at 1/255
    // steps — finer than the halo paint can show — so a slow fallout bleed only
    // re-derives the FC when the change could actually appear.
    const liveSigRef = useRef(null);
    const liveFCRef = useRef(null);
    const liveFC = useMemo(() => {
        const me = w.nations.find((n) => n.slot === mySlot);
        let sig = foldNum(0, mySlot);
        for (const n of w.nations) {
            const rel = n.slot === mySlot ? 3 : me?.relations[n.slot] === "war" ? 2 : me?.relations[n.slot] === "ally" ? 1 : 0;
            sig = foldNum(sig, n.slot * 8 + (n.active !== false ? 4 : 0) + rel);
        }
        for (const c of w.cities) {
            sig = foldNum(sig, c.slot * 4 + (c.alive ? 2 : 0));
            sig = foldNum(sig, Math.round(vitalityOf(c) * 255));
        }
        if (liveFCRef.current && sig === liveSigRef.current) return liveFCRef.current;
        liveSigRef.current = sig;
        liveFCRef.current = {
            type: "FeatureCollection",
            features: w.cities.filter((c) => isActive(w, c.slot)).map((c) => ({
                type: "Feature",
                properties: {
                    id: c.id,
                    cap: c.cap ? 1 : 0,
                    mine: c.slot === mySlot ? 1 : 0,
                    dead: c.alive ? 0 : 1,
                    vit: c.alive ? vitalityOf(c) : 1,
                    color: c.alive ? teamColor(c.slot) : "#3a3a3a"
                },
                geometry: {type: "Point", coordinates: [c.lng, c.lat]}
            }))
        };
        return liveFCRef.current;
    }, [w.cities, w.nations, w.time, mySlot]);

    // Radioactive fallout footprints: one polygon per active cloud, its opacity
    // driven by the same intensity curve the tick uses for damage, so the visible
    // haze and the real danger zone are always the same shape and strength. Not
    // fog-gated — a contamination cloud is a physical, map-scale hazard everyone
    // can see. Rebuilds each tick (w.time) as clouds grow, drift, and decay.
    const falloutFC = useMemo(() => {
        const clouds = (w.effects || []).filter((fx) => fx.type === "fallout");
        if (!clouds.length) return EMPTY_FC; // stable identity — no clouds costs nothing per tick
        return {
            type: "FeatureCollection",
            features: clouds.map((fx) => {
                const c = coverageRing(globe, fx.lng, fx.lat, fx.radiusKm, 48);
                c.properties = {intensity: falloutIntensity(fx.age)};
                return c;
            })
        };
    }, [w.effects, w.time, globe]);

    // Ground occupation in progress: a ring around every city currently being
    // captured, colored by the occupier and filled by how far the capture has
    // advanced (c.capture.progress). Map-scale event — like fallout, not fog-gated
    // — so the player sees a province being taken (theirs or an enemy's). Rebuilds
    // each tick (w.time) as progress climbs or bleeds off.
    const captureFC = useMemo(() => {
        const taking = w.cities.filter((c) => c.alive && c.capture && c.capture.progress > 0.02);
        if (!taking.length) return EMPTY_FC; // stable identity — peacetime costs one cheap scan
        return {
            type: "FeatureCollection",
            features: taking.map((c) => {
                const f = coverageRing(globe, c.lng, c.lat, CAPTURE.holdKm, 40);
                f.properties = {color: teamColor(c.capture.slot), progress: c.capture.progress};
                return f;
            })
        };
    }, [w.cities, w.time, teamColor, globe]);

    // Fog of war: enemy assets exist on my map only where my sensor picture
    // covers them — my own units are always mine to see. unitVisibleTo also
    // splits out submarines, which only surface under my ASW (sonar) coverage
    // and vanish back into the fog otherwise. Everything drawn from w.units below
    // goes through visUnits so hidden forces never leak a pixel.
    const mySensors = useMemo(() => sensorsOf(w, mySlot), [w.units, w.time, mySlot]);
    const mySubSensors = useMemo(() => subSensorsOf(w, mySlot), [w.units, w.time, mySlot]);
    // Precomputed sensor lists are threaded into unitVisibleTo so the fog filter
    // is O(units) instead of O(units^2) (it would otherwise rebuild sensorsOf per unit).
    const visUnits = useMemo(() => w.units.filter((u) => unitVisibleTo(w, mySlot, u, mySensors, mySubSensors)),
        [w.units, w.time, mySlot, mySensors, mySubSensors]);

    // Radar coverage is MY detection picture — only my own emitters, never an
    // enemy's radars that my sensors happen to reveal. The ring FC and the
    // emitter list for the animated ping share one filter and one rebuild —
    // RadarPulse regenerates the expanding ring itself each animation frame;
    // radarEmitters only feeds it where the emitters are and how far they reach.
    // Dedicated ground sensors ring in their own hue so the warning tiers read
    // apart (OTH amber, Early Warning cyan); mobile emitters keep their faction
    // color. The 44-step ring geometry only regenerates when the checksum over
    // emitter identity/position/range/color (or the projection, which reshapes
    // the ring) moves — a wall of static ground radars costs one scan per tick.
    const radarSigRef = useRef(null);
    const radarRef = useRef(null);
    const {radarFC, radarEmitters} = useMemo(() => {
        if (!layers.radar) return EMPTY_RADAR;
        const emitters = visUnits.filter((u) => u.slot === mySlot && u.hp > 0 && radarRangeOf(u.type) > 0 && airborne(u));
        let sig = foldNum(0, globe ? 1 : 2);
        for (const u of emitters) {
            sig = foldStr(sig, u.id);
            sig = foldNum(sig, Math.round(u.lng * 1e5));
            sig = foldNum(sig, Math.round(u.lat * 1e5));
            sig = foldNum(sig, Math.round(radarRangeOf(u.type)));
            sig = foldStr(sig, RADAR_RING_COLORS[u.type] || teamColor(u.slot));
        }
        if (radarRef.current && sig === radarSigRef.current) return radarRef.current;
        radarSigRef.current = sig;
        radarRef.current = {
            radarFC: {
                type: "FeatureCollection",
                features: emitters.map((u) => {
                    const c = coverageRing(globe, u.lng, u.lat, radarRangeOf(u.type), 44);
                    c.properties = {color: RADAR_RING_COLORS[u.type] || teamColor(u.slot)};
                    return c;
                })
            },
            radarEmitters: emitters.map((u) => ({
                lng: u.lng, lat: u.lat,
                rKm: radarRangeOf(u.type),
                color: RADAR_RING_COLORS[u.type] || teamColor(u.slot)
            }))
        };
        return radarRef.current;
    }, [layers.radar, w.units, w.time, mySlot, globe]);
    // Same checksum gate for the defense bubbles: position, engagement range
    // (the radar link stretches the outer edge, so the live range is folded,
    // not the static one), and allegiance color (relations can flip it).
    const defenseSigRef = useRef(null);
    const defenseFCRef = useRef(null);
    const defenseFC = useMemo(() => {
        if (!layers.defense) return EMPTY_FC;
        const batteries = visUnits.filter((u) => UNITS[u.type].kind === "defense" && u.hp > 0);
        let sig = foldNum(0, globe ? 1 : 2);
        for (const u of batteries) {
            sig = foldStr(sig, u.id);
            sig = foldNum(sig, Math.round(u.lng * 1e5));
            sig = foldNum(sig, Math.round(u.lat * 1e5));
            sig = foldNum(sig, Math.round(defenseRange(w, u)));
            sig = foldStr(sig, teamColor(u.slot));
        }
        if (defenseFCRef.current && sig === defenseSigRef.current) return defenseFCRef.current;
        defenseSigRef.current = sig;
        defenseFCRef.current = {
            type: "FeatureCollection",
            features: batteries.map((u) => {
                const c = coverageRing(globe, u.lng, u.lat, defenseRange(w, u), 40, defenseMinRange(w, u));
                c.properties = {color: teamColor(u.slot)};
                return c;
            })
        };
        return defenseFCRef.current;
    }, [layers.defense, w.units, w.time, globe]);
    const popFC = useMemo(() => layers.pop ? ({
        type: "FeatureCollection",
        features: [...w.cities.filter((c) => c.alive), ...(backdrop || [])].map((c) => ({
            type: "Feature",
            properties: {wt: Math.min(1, (c.pop || c.p || 0) / 6e6)},
            geometry: {type: "Point", coordinates: [c.lng, c.lat]}
        }))
    }) : {type: "FeatureCollection", features: []}, [layers.pop, backdrop, w.cities]);

    const ranges = useMemo(() => {
        const f = [];
        const sel = w.units.find((u) => u.id === selUnit && u.slot === mySlot);
        if (sel) {
            const def = UNITS[sel.type];
            let radius = null, isRadar = 0, isStrike = 0;
            if (def.kind === "defense") radius = defenseRange(w, sel); else if (def.kind === "support") {
                // Sensors show their true coverage — same circle the radar layer
                // draws, so selection and coverage never disagree.
                radius = def.detect ? radarRangeOf(sel.type) : def.range;
                isRadar = 1;
            } else if (def.kind === "offense") {
                // Strike platforms — silo, TEL, hypersonic battery, subs, the orbital
                // strike bus, ground guns — show how far their munition reaches. The
                // strategic ranges are huge (an ICBM is near-global), which is the
                // point: the reach IS the overlay. Painted in the strike color below.
                radius = def.range;
                isStrike = 1;
            }
            // An airstrip (or other sortie platform) shows how far its bomber sorties
            // reach — the amber strike ring — rather than its short runway footprint.
            if (def.sortieKm) {
                radius = def.sortieKm;
                isStrike = 1;
                isRadar = 0;
            }
            // Draw the ring for any sensor, orbital, or strike platform regardless of
            // size (their reach IS the point), plus any ring small enough not to
            // clutter the surface map. The 4000km cap only ever existed to keep big
            // dedicated-sensor rings off the map, so it doesn't gate these.
            if (radius && (def.detect || def.orbital || isStrike || radius <= 4000)) {
                const c = coverageRing(globe, sel.lng, sel.lat, radius, 56, def.kind === "defense" ? defenseMinRange(w, sel) : 0);
                c.properties = {color: isStrike ? STRIKE_COLOR : teamColor(mySlot), sel: 1, radar: isRadar};
                f.push(c);
            }
        }
        // The being-placed / relocating unit's ghost ring is drawn by PlacementGhost
        // (its own source), so cursor motion never re-renders LiveGame — only the
        // selected unit's standing ring lives here now.
        return {type: "FeatureCollection", features: f};
    }, [w.units, w.time, selUnit, mySlot, globe]);

    const cmdLines = useMemo(() => ({
        type: "FeatureCollection",
        features: w.units.filter((u) => u.slot === mySlot && u.targetId).map((u) => {
            const t = w.cities.find((c) => c.id === u.targetId) || w.units.find((x) => x.id === u.targetId);
            return t ? {
                type: "Feature",
                properties: {},
                geometry: {type: "LineString", coordinates: gcTrail(u.lng, u.lat, t.lng, t.lat, 1, 18)}
            } : null;
        }).filter(Boolean)
    }), [w.units, w.time, mySlot]);
    // Dashed course line through every remaining waypoint + a marker on the
    // destination, for each of my ships that's under way. Longitudes unwrap
    // leg by leg so a dateline crossing doesn't streak across the map.
    const sailLines = useMemo(() => ({
        type: "FeatureCollection",
        features: w.units.filter((u) => u.slot === mySlot && u.dest).flatMap((u) => {
            const coords = [[u.lng, u.lat]];
            for (const wp of (u.route?.length ? u.route : [u.dest])) {
                const prev = coords[coords.length - 1][0];
                coords.push([wp.lng + Math.round((prev - wp.lng) / 360) * 360, wp.lat]);
            }
            return [{
                type: "Feature",
                properties: {k: "line"},
                geometry: {type: "LineString", coordinates: coords}
            }, {
                type: "Feature",
                properties: {k: "dot"},
                geometry: {type: "Point", coordinates: coords[coords.length - 1]}
            }];
        })
    }), [w.units, w.time, mySlot]);

    // Battle-plan preview: the active plan's attacker→target strike arcs and its
    // target markers, derived from the SAME solve the reconciler fires (planPreview
    // in sim/battlePlan.js) so the drawn lines and the real orders never disagree.
    // Only present while the Battle Planning panel is open on a plan with content.
    const planArcsFC = useMemo(() => ({
        type: "FeatureCollection",
        features: (battlePreview?.arcs || []).map((a) => ({
            type: "Feature",
            properties: {},
            geometry: {type: "LineString", coordinates: gcTrail(a.from[0], a.from[1], a.to[0], a.to[1], 1, 18)}
        }))
    }), [battlePreview]);
    const planTargetsFC = useMemo(() => ({
        type: "FeatureCollection",
        features: (battlePreview?.targets || []).map((t) => ({
            type: "Feature",
            properties: {},
            geometry: {type: "Point", coordinates: [t.lng, t.lat]}
        }))
    }), [battlePreview]);

    return {backdropFC, liveFC, falloutFC, captureFC, mySensors, visUnits, radarFC, radarEmitters, defenseFC, popFC, ranges, cmdLines, sailLines, planArcsFC, planTargetsFC};
}
