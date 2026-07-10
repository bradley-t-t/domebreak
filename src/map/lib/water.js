// Animates the ocean without a custom shader: every effect drives paint
// properties on the bathymetry layers, which are already ocean-shaped, so the
// motion is masked to water for free and stays correct in globe + flat.
// A slow coastal shimmer "breathes" over the shelf while the isobaths drift in a
// gentle ellipse, reading as living current. Honors reduced-motion and pauses
// when the tab is hidden so it never spins the GPU in the background.
import {startPausableRaf} from "../../lib/raf.js";
import {safeMap} from "../../ui/lib/mapSafe.js";

const FPS = 28;
const MIN_DT = 1000 / FPS;

function prefersReducedMotion() {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function startWater(map) {
    if (!map || prefersReducedMotion()) return () => {};
    const set = (layer, prop, value) => safeMap(map, (m) => {
        if (m.getLayer(layer)) m.setPaintProperty(layer, prop, value);
    });
    return startPausableRaf((t) => {
        const s = t / 1000;
        set("ocean-glow", "fill-opacity", 0.06 + 0.05 * Math.sin(s * 0.9));
        set("ocean-contour", "line-translate", [Math.cos(s * 0.5) * 1.6, Math.sin(s * 0.7) * 1.2]);
        set("ocean-contour", "line-opacity", 0.1 + 0.05 * Math.sin(s * 0.6 + 1.5));
    }, {minDtMs: MIN_DT, pauseWhenHidden: true});
}
