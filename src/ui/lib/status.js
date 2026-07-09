// Shared "traffic-light" vitality colour mapping (leadership, stability, city
// vitality). One source for the green/amber/red band + its thresholds so the DOM
// readouts and the MapLibre paint expressions can never drift apart.

const VIT_GREEN = "#46d38a", VIT_AMBER = "#ffb020", VIT_RED = "#ff3b3b";

// A 0..100 percentage → band colour (leadership / stability HUD readouts).
// Returns undefined for a null/absent value so callers can leave colour unset.
export function vitColor(pct) {
    if (pct == null) return undefined;
    if (pct >= 67) return VIT_GREEN;
    if (pct >= 34) return VIT_AMBER;
    return VIT_RED;
}

// MapLibre paint expression mapping a 0..1 `vit` feature property to the same
// red→amber→green band, so map circles match the HUD colours exactly.
export function vitPaint(prop = "vit") {
    return ["interpolate", ["linear"], ["get", prop], 0, VIT_RED, 0.5, VIT_AMBER, 1, VIT_GREEN];
}
