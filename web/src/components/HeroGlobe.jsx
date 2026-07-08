import {lazy, Suspense, useEffect, useState} from "react";
import {useReducedMotion} from "motion/react";

// Animated hero globe. Reuses the REAL in-game attract simulation (rotating
// world with live missiles, interceptors and detonations) via the `@game` alias.
//
// Reveal choreography:
//  - Nothing is shown in the globe area at first. The hero layout animates in
//    while the heavy engine + MapLibre chunk loads in the background (deferred
//    until the page is idle, so it never starves the rest of the page).
//  - The globe eases in ONLY once both (a) MapLibre has actually painted its
//    first tiles (AttractSim.onReady) and (b) a short minimum has elapsed, so the
//    hero animation always plays first and the globe never pops in half-loaded.
//  - Reduced motion shows the static poster instead. If the engine never becomes
//    ready (slow/failed), the poster fades in as a fallback so the hero is never
//    permanently empty.
//  - Large vector tiles stream from Vercel Blob (CORS + HTTP range).
const heroPng = "/shots/hero-globe.png";
const TILES_BASE = "https://pc9hvrpdxxi66b3t.public.blob.vercel-storage.com";
const MIN_HOLD_MS = 1600;   // hero layout animates in before the globe may appear
const FALLBACK_MS = 9000;   // if the live globe never readies, show the poster

const AttractSim = lazy(() => import("@game/ui/live/AttractSim.jsx"));

// Run `cb` once the page has loaded and the main thread is idle.
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
        if (reduce) return; // reduced motion: static poster, no engine
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
