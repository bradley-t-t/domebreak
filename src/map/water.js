// Animates the ocean without a custom shader: every effect drives paint
// properties on the bathymetry layers, which are already ocean-shaped, so the
// motion is masked to water for free and stays correct in globe + flat.
// A slow coastal shimmer "breathes" over the shelf while the isobaths drift in a
// gentle ellipse, reading as living current. Honors reduced-motion and pauses
// when the tab is hidden so it never spins the GPU in the background.
const FPS = 28;
const MIN_DT = 1000 / FPS;

function prefersReducedMotion() {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function startWater(map) {
    if (!map || prefersReducedMotion()) return () => {
    };
    let raf = 0;
    let last = 0;
    let running = true;

    const set = (layer, prop, value) => {
        try {
            if (map.getLayer(layer)) map.setPaintProperty(layer, prop, value);
        } catch { /* map torn down */
        }
    };

    const frame = (t) => {
        if (!running) return;
        raf = requestAnimationFrame(frame);
        if (t - last < MIN_DT) return;
        last = t;
        const s = t / 1000;
        set("ocean-glow", "fill-opacity", 0.06 + 0.05 * Math.sin(s * 0.9));
        set("ocean-contour", "line-translate", [Math.cos(s * 0.5) * 1.6, Math.sin(s * 0.7) * 1.2]);
        set("ocean-contour", "line-opacity", 0.1 + 0.05 * Math.sin(s * 0.6 + 1.5));
    };

    const onVisibility = () => {
        const wake = running !== !document.hidden;
        running = !document.hidden;
        if (running && wake) {
            last = 0;
            raf = requestAnimationFrame(frame);
        }
    };

    raf = requestAnimationFrame(frame);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
        running = false;
        cancelAnimationFrame(raf);
        document.removeEventListener("visibilitychange", onVisibility);
    };
}
