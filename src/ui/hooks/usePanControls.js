// Camera pan: pan the flat map / rotate the globe while a pan key is held
// (bindings configurable in Settings; defaults W / A / S / D). Driven by short
// constant-velocity ease SEGMENTS chained back-to-back at PAN_PX_PER_SEC.
// A per-frame panBy({duration:0}) fires a full movestart/move/moveend cycle
// every frame, re-settling the vector map's tiles + labels ~60x/sec — that was
// the WASD stutter. One giant ease killed the stutter but crawled (a far target
// clamps at the poles and distorts velocity). Short segments keep `move`
// flowing (overlays + unit markers track the camera) at a true, constant px/s,
// while `moveend` (the heavy part) runs ~once/sec, like a mouse drag. panBy
// works in both projections.
import {useEffect} from "react";
import {isTyping, keyToken} from "../../game/platform/keybindings.js";
import {PAN_LAT_LIMIT, PAN_PX_PER_SEC} from "../../game/data/constants.js";
import {clampSym} from "../../lib/math.js";

export function usePanControls({globe, overlayOpen, K, mapRef}) {
    useEffect(() => {
        const dir = {[K.panUp]: "up", [K.panLeft]: "left", [K.panDown]: "down", [K.panRight]: "right"};
        const held = new Set();
        const SEG_MS = 800; // ease-segment length; the next starts just before it ends so motion never idles
        let timer = 0, curKey = "";
        const vec = () => [
            (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0),
            (held.has("down") ? 1 : 0) - (held.has("up") ? 1 : 0),
        ];
        const runSeg = () => {
            const m = mapRef.current;
            const [dx, dy] = vec();
            curKey = `${dx},${dy}`;
            if (!m || (!dx && !dy)) {
                timer = 0;
                m?.stop(); // nothing held: settle once, like releasing a drag
                return;
            }
            const len = Math.hypot(dx, dy);
            const nx = dx / len, ny = dy / len;
            const distPx = (PAN_PX_PER_SEC * SEG_MS) / 1000;
            if (globe) {
                // On the globe, pan by shifting the CENTER in lng/lat rather than a
                // pixel panBy (a horizontal screen line is not a line of latitude on a
                // sphere, so panBy drifts toward the poles on A/D). The W/S scale is a
                // tiny vertical reference sampled toward the equator — down-screen
                // never crosses the pole, so it stays well-defined at high latitude.
                // The A/D scale is analytic: at the view center the projection is
                // locally isotropic, so degPerPxLng = degPerPxLat / cos(lat), and
                // meridians converging poleward make a screen step span more longitude.
                // Sampling a pixel to the RIGHT instead would flip sign and explode
                // near the on-screen pole (it lands across the pole on the opposite
                // meridian) — the source of the polar A/D inversion and stutter.
                const c = m.getCenter();
                const pc = m.project(c);
                const ref = 10;
                const degPerPxLat = (c.lat - m.unproject([pc.x, pc.y + ref]).lat) / ref;
                const cosLat = Math.max(Math.cos((c.lat * Math.PI) / 180), 0.01);
                const degPerPxLng = degPerPxLat / cosLat;
                const lat = clampSym(c.lat - ny * distPx * degPerPxLat, PAN_LAT_LIMIT);
                m.easeTo({center: [c.lng + nx * distPx * degPerPxLng, lat], duration: SEG_MS, easing: (t) => t});
            } else {
                // Flat mercator: a raw panBy has no latitude limit, so W/S can drive
                // the center past the data edge (MERC_LAT) into the polar stretch —
                // the stutter/lag. Reproduce panBy's target center by hand
                // (panBy([dx,dy]) lands at unproject(project(center)+[dx,dy])) so we
                // can clamp latitude to PAN_LAT_LIMIT, matching the globe branch.
                const c = m.getCenter();
                const pc = m.project(c);
                const dest = m.unproject([pc.x + nx * distPx, pc.y + ny * distPx]);
                const lat = clampSym(dest.lat, PAN_LAT_LIMIT);
                m.easeTo({center: [dest.lng, lat], duration: SEG_MS, easing: (t) => t});
            }
            timer = setTimeout(runSeg, SEG_MS - 60); // slight overlap → seamless continuous motion
        };
        // (Re)start the segment chain only when the held direction actually changes
        // (keydown auto-repeat and unrelated keys are no-ops).
        const refresh = () => {
            const [dx, dy] = vec();
            if (`${dx},${dy}` === curKey && timer) return;
            if (timer) clearTimeout(timer);
            timer = 0;
            runSeg();
        };
        const dn = (e) => {
            if (e.repeat || overlayOpen || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
            const d = dir[keyToken(e)];
            if (d) {
                held.add(d);
                e.preventDefault();
                refresh();
            }
        };
        const up = (e) => {
            const d = dir[keyToken(e)];
            if (d) {
                held.delete(d);
                refresh();
            }
        };
        const clear = () => {
            held.clear();
            if (timer) clearTimeout(timer);
            timer = 0;
            curKey = "";
            mapRef.current?.stop();
        };
        window.addEventListener("keydown", dn);
        window.addEventListener("keyup", up);
        window.addEventListener("blur", clear);
        return () => {
            window.removeEventListener("keydown", dn);
            window.removeEventListener("keyup", up);
            window.removeEventListener("blur", clear);
            if (timer) clearTimeout(timer);
            // The map initializes async, so it's read lazily (a setup-time snapshot
            // could be null); the current instance is what we want to stop.
            // eslint-disable-next-line react-hooks/exhaustive-deps
            mapRef.current?.stop();
        };
    }, [globe, overlayOpen, K.panUp, K.panLeft, K.panDown, K.panRight, mapRef]);
}
