// Placement/terrain validity checks shared by placement, movement orders, and
// the on-map cursor probe. Pulled out of LiveGame.jsx verbatim — same feature
// queries, same coastline sampling, same per-domain rules.
import {COAST_KM, inTerritory, UNITS} from "../../game/engine.js";

export function usePlacementChecks({mapRef, w, mySlot, myGid}) {
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
    return {featsAt, onLand, inMyLand, isSea, nearWater, placeError};
}
