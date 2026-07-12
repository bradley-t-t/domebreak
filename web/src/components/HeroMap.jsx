import {lazy, Suspense, useEffect, useState} from "react";
import {useReducedMotion} from "motion/react";

// Animated hero background: a pre-made, looping "defense of the United States"
// scene on the game's real flat command map (see HeroDefenseScene). Incoming
// ICBMs arc in and US batteries intercept them, over and over — art-directed
// scenery, not the live simulation.
//
// Reveal + performance:
//  - Nothing shows at first; the hero layout animates in while the map chunk
//    (MapLibre + the game's render layers) loads in the background, deferred
//    until the page is idle.
//  - The scene eases in only once MapLibre has painted its first tiles (or a
//    fallback timer fires), so the layout animation plays first and the hero is
//    never a blank flash.
//  - PERF: HeroDefenseScene stands its loop + MapLibre repaints fully down
//    whenever it scrolls off screen or the tab is hidden.
//  - Reduced motion renders the same scene held still (no missiles, no drift) —
//    a static tactical map of the homeland and its defenses.
const TILES_BASE = "https://pc9hvrpdxxi66b3t.public.blob.vercel-storage.com";
const MIN_HOLD_MS = 1400;
const FALLBACK_MS = 9000;

const HeroDefenseScene = lazy(() => import("./HeroDefenseScene.jsx"));

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

export default function HeroMap() {
    const reduce = useReducedMotion();
    const [mount, setMount] = useState(false);
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

    // Off-origin CDN for the heavy vector tiles (WorldMap reads this at style
    // build). Set before the scene mounts. Defer the mount until the page is idle.
    useEffect(() => {
        if (typeof window !== "undefined") window.__DB_TILES_BASE__ = TILES_BASE;
        const cancel = whenPageIdle(() => setMount(true));
        return cancel;
    }, []);

    const reveal = (tilesReady && minElapsed) || fallback;
    // Reduced motion fades in without the scale drift.
    const enter = reduce
        ? (reveal ? "opacity-100" : "opacity-0")
        : (reveal ? "scale-100 opacity-100" : "scale-[1.06] opacity-0");

    return (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
            {mount && (
                <Suspense fallback={null}>
                    <div className={`absolute inset-0 origin-center transition-[opacity,transform] duration-[1500ms] ease-[cubic-bezier(0.23,1,0.32,1)] ${enter}`}>
                        <HeroDefenseScene still={reduce} onReady={() => setTilesReady(true)}/>
                    </div>
                </Suspense>
            )}
        </div>
    );
}
