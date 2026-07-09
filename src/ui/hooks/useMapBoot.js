// Loading veil + first-frame camera framing for the live match.
import {useEffect} from "react";
import {START_CAM} from "../../game/data/constants.js";

export function useMapBoot({w, mySlot, mapRef, setMapReady, setBooting}) {
    // Failsafe: never let the loading veil stick, even if the map's onLoad never
    // fires (a WebGL/style hiccup on the lobby->match handoff would otherwise leave
    // a permanent black screen). handleMap also lifts it on the map's first idle;
    // whichever fires first wins. Mount-scoped so it's independent of the map.
    useEffect(() => {
        const t = setTimeout(() => setBooting(false), START_CAM.bootMs);
        return () => clearTimeout(t);
    }, [setBooting]);

    // Open the game already looking at home: center on the player's capital at a
    // zoom that fits most of their nation. The frame is the geographic span of
    // my cities around the capital, padded and clamped so a city-state still
    // keeps regional context. fitBounds handles the projection math (flat/globe).
    const frameOnCapital = (m) => {
        const mine = w.cities.filter((c) => c.slot === mySlot && c.alive);
        if (!mine.length) return;
        const cap = mine.find((c) => c.cap) || mine[0];
        // Widest deviation of any of my cities from the capital, wrapping longitude
        // across the antimeridian so a nation split by ±180 still frames sanely.
        let dLat = 0.05, dLng = 0.05;
        for (const c of mine) {
            let dl = c.lng - cap.lng;
            if (dl > 180) dl -= 360; else if (dl < -180) dl += 360;
            dLat = Math.max(dLat, Math.abs(c.lat - cap.lat));
            dLng = Math.max(dLng, Math.abs(dl));
        }
        dLat *= START_CAM.spanPad;
        dLng *= START_CAM.spanPad;
        try {
            m.fitBounds(
                [[cap.lng - dLng, cap.lat - dLat], [cap.lng + dLng, cap.lat + dLat]],
                {padding: START_CAM.padPx, maxZoom: START_CAM.maxZoom, duration: 0}
            );
        } catch { /* projection not ready — keep the default view */ }
    };

    // Map is live: frame home, then hold the loading veil until the tiles settle
    // (map "idle"), with a hard failsafe so a slow/never-idling map still reveals.
    const handleMap = (m) => {
        mapRef.current = m;
        setMapReady((x) => x + 1);
        // Force the canvas to match its container. MapLibre can initialize at its
        // 400x300 fallback when the container's size isn't resolved on the exact
        // frame the map is created (a layout race on the screen->match handoff);
        // without this the globe renders tiny in the corner and the rest of the
        // view is black. Re-fit now, next frame, and shortly after to cover any
        // late layout (the lobby map does the same via its own resize()).
        const fit = () => {
            try {
                m.resize();
            } catch { /* map tearing down */ }
        };
        fit();
        requestAnimationFrame(fit);
        setTimeout(fit, 200);
        frameOnCapital(m);
        let settled = false;
        const reveal = () => {
            if (settled) return;
            settled = true;
            setBooting(false);
        };
        try {
            m.once("idle", reveal);
        } catch {
            reveal();
        }
        // (the mount-scoped failsafe above also lifts the veil after bootMs)
    };

    return handleMap;
}
