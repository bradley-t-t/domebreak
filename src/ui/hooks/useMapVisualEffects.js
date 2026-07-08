// Map-visual side effects driven by layer toggles, style-ready renders, and
// zoom: countries layer visibility, the per-country border/tint recolor
// fetched from colors.json, the unit-marker fade-with-zoom CSS var, and the
// GID_0 -> country-label lookup for the zoomed-out hover readout. Pulled out
// of LiveGame.jsx verbatim — same effects, same dependency arrays, same order.
import {useEffect, useMemo, useState} from "react";
import {COUNTRY_FILL_OPACITY} from "../../map/WorldMap.jsx";
import {toGid3} from "../../game/data/iso3.js";

// Units dissolve as the camera pulls back toward the whole-earth view: fully
// visible at/above UNIT_FADE_ZOOM[1], gone by UNIT_FADE_ZOOM[0] (min zoom is 1.1,
// so by the time the entire globe is in frame the map reads clean). Tuning knob.
const UNIT_FADE_ZOOM = [1.8, 3.0];

export function useMapVisualEffects({mapRef, layers, mapReady, labels, activeGids}) {
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

    // Per-country border/fill tint from each flag's primary color. Only the ACTIVE
    // powers are colored by their flag; every neutral country falls to one shared
    // neutral color (they're passive scenery). GID_0 → rgb from colors.json. In an
    // all-active match `activeGids` is unset and every country keeps its flag color.
    const [borderExpr, setBorderExpr] = useState(null);
    useEffect(() => {
        fetch("/assets/colors.json").then((r) => r.json()).then((cols) => {
            const only = activeGids && activeGids.size ? activeGids : null;
            const mix = (v, g) => Math.round(v * 0.6 + g * 0.4); // blend toward neutral grey
            const pairs = [], tintPairs = [];
            for (const [gid, c] of Object.entries(cols)) {
                if (only && !only.has(gid)) continue; // neutrals → the shared default color below
                pairs.push(gid, `rgb(${mix(c[0], 96)},${mix(c[1], 100)},${mix(c[2], 108)})`);
                tintPairs.push(gid, `rgb(${c[0]},${c[1]},${c[2]})`);
            }
            setBorderExpr({
                line: pairs.length ? ["match", ["get", "GID_0"], ...pairs, "#454b53"] : "#454b53",
                tint: tintPairs.length ? ["match", ["get", "GID_0"], ...tintPairs, "#767b84"] : "#767b84",
            });
        }).catch(() => { /* colors optional */
        });
    }, [activeGids]);
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

    return {countryByGid};
}
