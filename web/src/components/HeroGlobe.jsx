import {lazy, Suspense, useEffect, useState} from "react";
import {useReducedMotion} from "motion/react";

// Animated hero globe. Reuses the REAL in-game attract simulation (rotating
// world with live missiles, interceptors and detonations) via the `@game` alias.
//
// Reveal + performance:
//  - Nothing shows at first; the hero layout animates in while the heavy engine
//    + MapLibre chunk loads in the background (deferred until the page is idle).
//  - The globe eases in only once MapLibre has painted its first tiles AND a
//    short minimum has elapsed, so the layout animation plays first.
//  - PERF: AttractSim self-pauses its simulation and MapLibre rendering whenever
//    it scrolls off screen or the tab is hidden (see AttractSim's camera loop),
//    so it costs almost nothing while you read the rest of the page.
//  - Reduced motion shows the static poster; a poster fallback covers a slow or
//    failed load so the hero is never empty.
const heroPng = "/shots/hero-globe.png";
const TILES_BASE = "https://pc9hvrpdxxi66b3t.public.blob.vercel-storage.com";
const MIN_HOLD_MS = 1600;
const FALLBACK_MS = 9000;

const AttractSim = lazy(() => import("@game/ui/live/AttractSim.jsx"));

function whenPageIdle(cb) {
    if (typeof window === "undefined") return () => {};
    let done = false;
    const run = () => {
        if (done) return;
        done = true;
        cb();
    };
    const schedule = () => {
        if ("requestIdleCallback" in window) window.requestIdleCallback(run, {timeout: 1800});
        else setTimeout(run, 400);
    };
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, {once: true});
    return () => window.removeEventListener("load", schedule);
}

export default function HeroGlobe() {
    const reduce = useReducedMotion();
    const [data, setData] = useState(null);
    const [tilesReady, setTilesReady] = useState(false);
    const [minElapsed, setMinElapsed] = useState(false);
    const [fallback, setFallback] = useState(false);

    useEffect(() => {
        const t1 = setTimeout(() => setMinElapsed(true), MIN_HOLD_MS);
        const t2 = setTimeout(() => setFallback(true), FALLBACK_MS);
        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
        };
    }, []);

    useEffect(() => {
        if (reduce) return;
        if (typeof window !== "undefined") window.__DB_TILES_BASE__ = TILES_BASE;
        let alive = true;
        const cancel = whenPageIdle(() => {
            import("@game/game/sim/newGame.js")
                .then((m) => m.loadGameData())
                .then((d) => alive && setData(d))
                .catch(() => {});
        });
        return () => {
            alive = false;
            cancel();
        };
    }, [reduce]);

    const showGlobe = !reduce && tilesReady && minElapsed;
    const showPoster = reduce || (fallback && !tilesReady);

    return (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
            {!reduce && data && (
                <Suspense fallback={null}>
                    <div
                        className={`absolute inset-0 origin-center transition-[opacity,transform] duration-[1500ms] ease-[cubic-bezier(0.23,1,0.32,1)] ${showGlobe ? "scale-100 opacity-100" : "scale-[1.08] opacity-0"}`}
                    >
                        <AttractSim data={data} framed onReady={() => setTilesReady(true)}/>
                    </div>
                </Suspense>
            )}
            {showPoster && (
                <img
                    src={heroPng}
                    alt=""
                    decoding="async"
                    className="absolute top-1/2 right-[-14%] aspect-square w-[min(86vh,860px)] max-w-[92%] -translate-y-1/2 object-contain opacity-[0.96] transition-opacity duration-[900ms] ease-out sm:right-[-8%] lg:right-[-3%]"
                />
            )}
        </div>
    );
}
