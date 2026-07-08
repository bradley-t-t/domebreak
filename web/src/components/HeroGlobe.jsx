import {lazy, Suspense, useEffect, useState} from "react";
import {useReducedMotion} from "motion/react";

// Animated hero globe. Reuses the REAL in-game attract simulation (rotating
// world with live missiles, interceptors and detonations) via the `@game` alias.
//
// Perf + correctness:
//  - The heavy engine + MapLibre chunk is loaded ONLY after the page has fully
//    loaded and gone idle, so it never competes with the hero image or the rest
//    of the page for the browser's connections on first paint. (This is what was
//    starving the images — they now load first, the globe streams in after.)
//  - The globe is revealed only once MapLibre reports its first tiles have
//    actually painted (AttractSim's onReady), never on a blind timer, then it
//    fades + eases in over the static poster.
//  - Large vector tiles stream from Vercel Blob (CORS + HTTP range).
const heroPng = "/shots/hero-globe.png";
const TILES_BASE = "https://pc9hvrpdxxi66b3t.public.blob.vercel-storage.com";

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
    const [ready, setReady] = useState(false);

    useEffect(() => {
        if (reduce) return; // reduced motion: keep the static poster, no engine
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

    return (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
            {data && !reduce && (
                <Suspense fallback={null}>
                    <div
                        className={`absolute inset-0 origin-center transition-[opacity,transform] duration-[1400ms] ease-[cubic-bezier(0.23,1,0.32,1)] ${ready ? "scale-100 opacity-100" : "scale-[1.06] opacity-0"}`}
                    >
                        <AttractSim data={data} framed onReady={() => setReady(true)}/>
                    </div>
                </Suspense>
            )}
            <img
                src={heroPng}
                alt=""
                fetchPriority="high"
                decoding="async"
                className={`absolute top-1/2 right-[-14%] aspect-square w-[min(86vh,860px)] max-w-[92%] -translate-y-1/2 object-contain transition-opacity duration-[1200ms] ease-out sm:right-[-8%] lg:right-[-3%] ${ready ? "opacity-0" : "opacity-[0.96]"}`}
            />
        </div>
    );
}
