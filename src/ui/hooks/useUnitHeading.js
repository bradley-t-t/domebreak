// Screen-space heading (deg, 0 = north/up) for a unit under way — projected the same way
// the missile sprites are, so it reads correctly in globe and flat. Falls back to a fixed
// cant for static assets (the airstrip reads as angled).
import {useCallback, useRef} from "react";
import {screenHeadingDeg, unwrapLng} from "../../lib/geo.js";
import {safeMap} from "../lib/mapSafe.js";

// Fixed sprite cant for static assets on the map (airstrip reads as a diagonal
// runway — angled the opposite way from the naval hulls in the arsenal).
const ROT_STATIC = {airstrip: 42};
// Side-view silhouettes (the marching infantryman, the TEL launch vehicle) read
// wrong if they rotate to heading — they'd tip over or drive head-down. These stay
// fixed upright while every other ground unit (a top-down silhouette) still turns to
// its bearing.
const ROT_UPRIGHT = new Set(["infantry", "launcher"]);

export function useUnitHeading(mapRef) {
    const rotMemo = useRef({});
    // useCallback so the returned closure can sit in memo/dep chains without
    // invalidating them every render (mapRef is a stable ref).
    return useCallback((u) => {
        if (ROT_UPRIGHT.has(u.type)) return null; // fixed-orientation icon — never rotate to heading
        // No facing point and no fixed cant means the icon never rotates —
        // bail before touching the map or the unwrap memo. This is the common
        // case (hundreds of standing installations) on every render.
        if (!u.face && ROT_STATIC[u.type] === undefined) return null;
        const m = mapRef.current;
        let deg = ROT_STATIC[u.type] ?? null;
        if (u.face) safeMap(m, (mm) => {
            const a = mm.project([u.lng, u.lat]);
            // Unwrap the facing point against the hull: when a ship's stored lng
            // rewraps at the dateline (+179.9 -> -179.9) the raw pair projects a
            // world apart and the sprite snaps to due east/west for a tick.
            const b = mm.project([unwrapLng(u.face.lng, u.lng), u.face.lat]);
            if (Math.hypot(b.x - a.x, b.y - a.y) >= 0.6) deg = screenHeadingDeg(b.x - a.x, b.y - a.y);
        });
        if (deg == null) {
            delete rotMemo.current[u.id];
            return null;
        }
        // Unwrap: pick the representation nearest the last shown angle so the
        // 170ms CSS rotation transition never takes the long way around.
        const prev = rotMemo.current[u.id];
        if (prev != null) deg = unwrapLng(deg, prev);
        rotMemo.current[u.id] = deg;
        if (Object.keys(rotMemo.current).length > 600) rotMemo.current = {[u.id]: deg};
        return deg;
    }, [mapRef]);
}
