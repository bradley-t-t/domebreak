// Map-visual side effects driven by layer toggles, style-ready renders, and zoom:
// countries layer visibility, the per-country border/tint recolor fetched from
// colors.json, the unit-marker fade-with-zoom CSS var, and the GID_0 -> country-label
// lookup for the zoomed-out hover readout.
import {useEffect, useMemo, useState} from "react";
import {COUNTRY_FILL_OPACITY} from "../../map/lib/mapPaint.js";
import {toGid3} from "../../game/data/iso3.js";
import {norm01} from "../../lib/math.js";
import {loadJsonAsset} from "../../lib/fetchJson.js";
import {buildPoliticalTint} from "../lib/politicalTint.js";
import {safeMap} from "../lib/mapSafe.js";

// Units dissolve as the camera pulls back toward the whole-earth view: fully
// visible at/above UNIT_FADE_ZOOM[1], gone by UNIT_FADE_ZOOM[0] (min zoom is 1.1,
// so by the time the entire globe is in frame the map reads clean). Tuning knob.
const UNIT_FADE_ZOOM = [1.8, 3.0];

export function useMapVisualEffects({mapRef, layers, mapReady, labels, activeGids, wipedGids, conquered}) {
    // Countries layer visibility (keep fill queryable at opacity 0 so land/water tests still work).
    useEffect(() => {
        safeMap(mapRef.current, (m) => {
            m.setPaintProperty("country-fill", "fill-opacity", layers.countries ? COUNTRY_FILL_OPACITY : 0);
            m.setLayoutProperty("country-line", "visibility", layers.countries ? "visible" : "none");
            m.setLayoutProperty("country-tint", "visibility", layers.countries ? "visible" : "none");
        });
    }, [layers.countries, mapReady, mapRef]);

    // Per-country border/fill tint from each flag's primary color. Only the ACTIVE
    // powers are colored by their flag; nations wiped out in war fall to the scorched
    // wipeout wash; every other neutral country falls to one shared neutral color
    // (they're passive scenery). GID_0 → rgb from colors.json. In an all-active match
    // `activeGids` is unset and every country keeps its flag color.
    const [borderExpr, setBorderExpr] = useState(null);
    useEffect(() => {
        loadJsonAsset("/assets/colors.json", {cache: true}).then((cols) => {
            if (cols) setBorderExpr(buildPoliticalTint(cols, {activeGids, wipedGids, conquered}));
        });
    }, [activeGids, wipedGids, conquered]);
    useEffect(() => {
        if (!borderExpr) return;
        safeMap(mapRef.current, (m) => {
            m.setPaintProperty("country-line", "line-color", borderExpr.line);
            m.setPaintProperty("country-tint", "fill-color", borderExpr.tint);
        });
    }, [borderExpr, mapReady, mapRef]);

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
            const o = norm01(m.getZoom(), lo, hi);
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
    }, [mapReady, mapRef]);

    // GID_0 (ISO3) → country label, for the zoomed-out country hover readout.
    const countryByGid = useMemo(() => {
        const o = {};
        for (const l of labels || []) {
            const g = toGid3(l.iso);
            if (g) o[g] = l;
        }
        return o;
    }, [labels]);

    return {countryByGid};
}
