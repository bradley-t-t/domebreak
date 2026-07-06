// Memoized map-layer FeatureCollection builders for LiveGame's <Source> layers.
// Pulled out of LiveGame.jsx verbatim — same useMemo calls, same deps, in the
// same order — so React sees an identical hook sequence and identical memo
// invalidation. Nothing here owns state; it only derives GeoJSON from engine
// state (w) and the handful of UI toggles/inputs the map layers care about.
import {useMemo} from "react";
import {airborne, defenseRange, radarRangeOf, sensorsOf, UNITS, unitVisibleTo, vitalityOf} from "../../game/engine.js";
import {RADAR_RING_COLORS} from "../../game/data/constants.js";
import {circle, gcTrail} from "../../game/geo/geo.js";

export function useLiveLayers({
                                  w,
                                  mySlot,
                                  myNation,
                                  backdrop,
                                  layers,
                                  placing,
                                  moving,
                                  cursor,
                                  selUnit,
                                  placeValid,
                                  teamColor,
                                  COAST_KM
                              }) {
    const backdropFC = useMemo(() => ({
        type: "FeatureCollection",
        features: (backdrop || []).map((c) => ({
            type: "Feature",
            properties: {cap: c.cap ? 1 : 0},
            geometry: {type: "Point", coordinates: [c.lng, c.lat]}
        }))
    }), [backdrop]);
    const liveFC = useMemo(() => ({
        type: "FeatureCollection",
        features: w.cities.map((c) => ({
            type: "Feature",
            properties: {
                id: c.id,
                cap: c.cap ? 1 : 0,
                mine: c.slot === mySlot ? 1 : 0,
                vit: c.alive ? vitalityOf(c) : 1,
                color: c.alive ? teamColor(c.slot) : "#3a3a3a"
            },
            geometry: {type: "Point", coordinates: [c.lng, c.lat]}
        }))
    }), [w.cities, w.time, mySlot]);

    // Fog of war: enemy assets exist on my map only where my sensor picture
    // covers them — my own units are always mine to see. unitVisibleTo also
    // splits out submarines, which only surface under my ASW (sonar) coverage
    // and vanish back into the fog otherwise (spec §8c). Everything drawn from
    // w.units below goes through visUnits so hidden forces never leak a pixel.
    const mySensors = useMemo(() => sensorsOf(w, mySlot), [w.units, w.time, mySlot]);
    const visUnits = useMemo(() => w.units.filter((u) => unitVisibleTo(w, mySlot, u)),
        [w.units, w.time, mySlot, mySensors]);

    // Radar coverage is MY detection picture — only my own emitters, never an
    // enemy's radars that my sensors happen to reveal.
    const radarFC = useMemo(() => layers.radar ? ({
        type: "FeatureCollection",
        features: visUnits.filter((u) => u.slot === mySlot && u.hp > 0 && radarRangeOf(u.type) > 0 && airborne(u)).map((u) => {
            const n = w.nations.find((x) => x.slot === u.slot);
            const c = circle(u.lng, u.lat, radarRangeOf(u.type) * (n?.radarMult ?? 1), 44);
            // Dedicated ground sensors ring in their own hue so the warning tiers
            // read apart (OTH amber, Early Warning cyan); mobile emitters keep
            // their faction color.
            c.properties = {color: RADAR_RING_COLORS[u.type] || teamColor(u.slot)};
            return c;
        })
    }) : {type: "FeatureCollection", features: []}, [layers.radar, w.units, w.time, mySlot]);
    const defenseFC = useMemo(() => layers.defense ? ({
        type: "FeatureCollection",
        features: visUnits.filter((u) => UNITS[u.type].kind === "defense" && u.hp > 0).map((u) => {
            const c = circle(u.lng, u.lat, defenseRange(w, u), 40);
            c.properties = {color: teamColor(u.slot)};
            return c;
        })
    }) : {type: "FeatureCollection", features: []}, [layers.defense, w.units, w.time]);
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
                const c = circle(sel.lng, sel.lat, radius);
                c.properties = {color: teamColor(mySlot), sel: 1, radar: isRadar};
                f.push(c);
            }
        }
        if ((placing || moving) && cursor) {
            const type = placing || w.units.find((u) => u.id === moving)?.type;
            const t = type ? UNITS[type] : null;
            const rad = t?.coastal ? COAST_KM
                : t?.detect ? radarRangeOf(type) * (myNation?.radarMult ?? 1)
                    : (t && t.kind !== "offense" && t.range <= 4000) ? t.range : 160;
            const c = circle(cursor.lng, cursor.lat, rad);
            c.properties = {
                color: placeValid ? "#46d38a" : "#ff5d5d",
                sel: 1,
                radar: (t && t.kind === "support") ? 1 : 0
            };
            f.push(c);
        }
        return {type: "FeatureCollection", features: f};
    }, [w.units, w.time, placing, moving, cursor, selUnit, mySlot, placeValid]);

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

    return {backdropFC, liveFC, mySensors, visUnits, radarFC, defenseFC, popFC, ranges, cmdLines, sailLines};
}
