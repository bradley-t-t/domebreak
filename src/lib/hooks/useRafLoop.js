import {useEffect} from "react";

// React wrapper around a per-frame requestAnimationFrame loop with
// automatic cancel-on-unmount and dt/now bookkeeping. Replaces the manual
// `let raf; ...; return () => cancelAnimationFrame(raf)` boilerplate at
// every per-frame effect.
//
// Note: `deps` is the caller's effect dependency list — pass whatever inputs
// the frame closes over. `enabled: false` skips the loop entirely.
export function useRafLoop(callback, opts = {}) {
    const {enabled = true, deps = []} = opts;
    useEffect(() => {
        if (!enabled) return undefined;
        let raf = 0;
        let last = 0;
        const loop = (now) => {
            const dt = last ? now - last : 0;
            last = now;
            callback(dt, now);
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => {
            if (raf) cancelAnimationFrame(raf);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, ...deps]);
}
