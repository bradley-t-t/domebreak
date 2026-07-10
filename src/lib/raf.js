// Imperative rAF loop with an optional FPS floor and tab-visibility pause.
// Returns a `stop()` that cancels the frame and detaches the listener.

export function startPausableRaf(frame, options = {}) {
    const {minDtMs = 0, pauseWhenHidden = true} = options;
    let raf = 0;
    let running = true;
    let last = 0;
    const step = (t) => {
        if (!running) return;
        raf = requestAnimationFrame(step);
        const dt = last ? t - last : 0;
        if (minDtMs > 0 && dt < minDtMs) return;
        last = t;
        frame(t, dt);
    };
    const onVisibility = () => {
        const shouldRun = !document.hidden;
        if (shouldRun === running) return;
        running = shouldRun;
        if (running) {
            last = 0;
            raf = requestAnimationFrame(step);
        } else if (raf) {
            cancelAnimationFrame(raf);
            raf = 0;
        }
    };
    if (pauseWhenHidden) document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(step);
    return () => {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (pauseWhenHidden) document.removeEventListener("visibilitychange", onVisibility);
    };
}
