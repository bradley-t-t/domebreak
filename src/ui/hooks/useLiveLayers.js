// Memoized map-layer FeatureCollection builders for LiveGame's <Source> layers. Nothing
// here owns state; it only derives GeoJSON from engine state (w) and the handful of UI
// toggles/inputs the map layers care about.
//
// The world is mutated in place, so w and its arrays keep the same identity every
// tick; each memo lists w.time (the tick counter) as its recompute trigger. That
// pattern is invisible to exhaustive-deps, so it's disabled for this file.
/* eslint-disable react-hooks/exhaustive-deps */
import {useMemo} from "react";
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

export function useLiveLayers({
                                  w,
                                  mySlot,
                                  myNation,
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
    const liveFC = useMemo(() => ({
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
    }), [w.cities, w.nations, w.time, mySlot]);

    // Radioactive fallout footprints: one polygon per active cloud, its opacity
    // driven by the same intensity curve the tick uses for damage, so the visible
    // haze and the real danger zone are always the same shape and strength. Not
    // fog-gated — a contamination cloud is a physical, map-scale hazard everyone
    // can see. Rebuilds each tick (w.time) as clouds grow, drift, and decay.
    const falloutFC = useMemo(() => ({
        type: "FeatureCollection",
        features: (w.effects || []).filter((fx) => fx.type === "fallout").map((fx) => {
            const c = coverageRing(globe, fx.lng, fx.lat, fx.radiusKm, 48);
            c.properties = {intensity: falloutIntensity(fx.age)};
            return c;
        })
    }), [w.effects, w.time, globe]);

    // Ground occupation in progress: a ring around every city currently being
    // captured, colored by the occupier and filled by how far the capture has
    // advanced (c.capture.progress). Map-scale event — like fallout, not fog-gated
    // — so the player sees a province being taken (theirs or an enemy's). Rebuilds
    // each tick (w.time) as progress climbs or bleeds off.
    const captureFC = useMemo(() => ({
        type: "FeatureCollection",
        features: w.cities.filter((c) => c.alive && c.capture && c.capture.progress > 0.02).map((c) => {
            const f = coverageRing(globe, c.lng, c.lat, CAPTURE.holdKm, 40);
            f.properties = {color: teamColor(c.capture.slot), progress: c.capture.progress};
            return f;
        })
    }), [w.cities, w.time, teamColor, globe]);

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
    // enemy's radars that my sensors happen to reveal.
    const radarFC = useMemo(() => layers.radar ? ({
        type: "FeatureCollection",
        features: visUnits.filter((u) => u.slot === mySlot && u.hp > 0 && radarRangeOf(u.type) > 0 && airborne(u)).map((u) => {
            const n = w.nations.find((x) => x.slot === u.slot);
            const c = coverageRing(globe, u.lng, u.lat, radarRangeOf(u.type) * (n?.radarMult ?? 1), 44);
            // Dedicated ground sensors ring in their own hue so the warning tiers
            // read apart (OTH amber, Early Warning cyan); mobile emitters keep
            // their faction color.
            c.properties = {color: RADAR_RING_COLORS[u.type] || teamColor(u.slot)};
            return c;
        })
    }) : {type: "FeatureCollection", features: []}, [layers.radar, w.units, w.time, mySlot, globe]);
    // Emitter centers + coverage radius for the animated PPI sweep — same filter
    // and research-scaled radius as radarFC, so the sweep tracks the ring exactly.
    // RadarSweep rebuilds the rotating wedge geometry itself each animation frame;
    // this only feeds it where the emitters are and how far they reach.
    const radarEmitters = useMemo(() => layers.radar
        ? visUnits.filter((u) => u.slot === mySlot && u.hp > 0 && radarRangeOf(u.type) > 0 && airborne(u)).map((u) => {
            const n = w.nations.find((x) => x.slot === u.slot);
            return {
                lng: u.lng, lat: u.lat,
                rKm: radarRangeOf(u.type) * (n?.radarMult ?? 1),
                color: RADAR_RING_COLORS[u.type] || teamColor(u.slot)
            };
        })
        : [], [layers.radar, w.units, w.time, mySlot]);
    const defenseFC = useMemo(() => layers.defense ? ({
        type: "FeatureCollection",
        features: visUnits.filter((u) => UNITS[u.type].kind === "defense" && u.hp > 0).map((u) => {
            const c = coverageRing(globe, u.lng, u.lat, defenseRange(w, u), 40, defenseMinRange(w, u));
            c.properties = {color: teamColor(u.slot)};
            return c;
        })
    }) : {type: "FeatureCollection", features: []}, [layers.defense, w.units, w.time, globe]);
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
            let radius = null, isRadar = 0;
            if (def.kind === "defense") radius = defenseRange(w, sel); else if (def.kind === "support") {
                // Sensors show their true coverage (research-scaled) — same circle
                // the radar layer draws, so selection and coverage never disagree.
                radius = def.detect ? radarRangeOf(sel.type) * (myNation?.radarMult ?? 1) : def.range;
                isRadar = 1;
            }
            if (radius && (def.detect || radius <= 4000)) {
                const c = coverageRing(globe, sel.lng, sel.lat, radius, 56, def.kind === "defense" ? defenseMinRange(w, sel) : 0);
                c.properties = {color: teamColor(mySlot), sel: 1, radar: isRadar};
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
