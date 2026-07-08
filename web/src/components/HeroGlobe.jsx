import {lazy, Suspense, useEffect, useState} from "react";
import {useReducedMotion} from "motion/react";

// Animated hero globe. Reuses the REAL in-game attract simulation (rotating
// world with live missiles, interceptors and detonations) via the `@game` alias
// — one source of truth with the shipped game. The engine + MapLibre are
// lazy-loaded so first paint stays instant; a static poster shows until the live
// globe is up, and remains as the fallback under reduced-motion or if it fails.
//
// The globe's large vector tiles are hosted on Vercel Blob (CORS + HTTP range),
// so the browser streams only the low-zoom tiles it needs. WorldMap reads this
// base from window.__DB_TILES_BASE__.
const heroPng = "/shots/hero-globe.png";
const TILES_BASE = "https://pc9hvrpdxxi66b3t.public.blob.vercel-storage.com";

const AttractSim = lazy(() => import("@game/ui/live/AttractSim.jsx"));

export default function HeroGlobe() {
    const reduce = useReducedMotion();
    const [data, setData] = useState(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        if (reduce) return; // reduced motion: keep the static poster, no engine
        if (typeof window !== "undefined") window.__DB_TILES_BASE__ = TILES_BASE;
        let alive = true;
        let t;
        import("@game/game/sim/newGame.js")
            .then((m) => m.loadGameData())
            .then((d) => {
                if (!alive) return;
                setData(d);
                // Give MapLibre a beat to fetch + paint the first tiles before we
                // cross-fade off the poster, so there's no flash of empty globe.
                t = setTimeout(() => alive && setReady(true), 2400);
            })
            .catch(() => {});
        return () => {
            alive = false;
            clearTimeout(t);
        };
    }, [reduce]);

    return (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
            {data && !reduce && (
                <Suspense fallback={null}>
                    <div className={`absolute inset-0 transition-opacity duration-[1200ms] ease-out ${ready ? "opacity-100" : "opacity-0"}`}>
                        <AttractSim data={data} framed/>
                    </div>
                </Suspense>
            )}
            <img
                src={heroPng}
                alt=""
                className={`absolute top-1/2 right-[-14%] aspect-square w-[min(86vh,860px)] max-w-[92%] -translate-y-1/2 object-contain transition-opacity duration-[1200ms] ease-out sm:right-[-8%] lg:right-[-3%] ${ready ? "opacity-0" : "opacity-[0.96]"}`}
            />
        </div>
    );
}
