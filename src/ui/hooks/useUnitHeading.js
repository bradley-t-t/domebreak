// Screen-space heading (deg, 0 = north/up) for a unit under way — projected the
// same way the missile sprites are, so it reads correctly in globe and flat.
// Falls back to a fixed cant for static assets (the airstrip reads as angled).
// Pulled out of LiveGame.jsx verbatim — same rotMemo ref, same unwrap math.
import {useRef} from "react";

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
    return (u) => {
        if (ROT_UPRIGHT.has(u.type)) return null; // fixed-orientation icon — never rotate to heading
        const m = mapRef.current;
        let deg = ROT_STATIC[u.type] ?? null;
        if (m && u.face) {
            try {
                const a = m.project([u.lng, u.lat]);
                const b = m.project([u.face.lng, u.face.lat]);
                if (Math.hypot(b.x - a.x, b.y - a.y) >= 0.6) deg = (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI;
            } catch { /* projection not ready */
            }
        }
        if (deg == null) {
            delete rotMemo.current[u.id];
            return null;
        }
        // Unwrap: pick the representation nearest the last shown angle so the
        // 170ms CSS rotation transition never takes the long way around.
        const prev = rotMemo.current[u.id];
        if (prev != null) {
            while (deg - prev > 180) deg -= 360;
            while (deg - prev < -180) deg += 360;
        }
        rotMemo.current[u.id] = deg;
        if (Object.keys(rotMemo.current).length > 600) rotMemo.current = {[u.id]: deg};
        return deg;
    };
}
