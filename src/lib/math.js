// Scalar range helpers shared by sim math, UI meters, and map effects.
// One canonical clamp, two closed-interval variants, and a linear-normalize
// used by every zoom-fade site.

export function clamp(x, lo, hi) {
    return x < lo ? lo : x > hi ? hi : x;
}

export function clamp01(x) {
    return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function clampSym(x, limit) {
    return x < -limit ? -limit : x > limit ? limit : x;
}

// Linearly normalize x from [lo, hi] into [0, 1], clamped at the endpoints.
// The zoom-fade / opacity-band primitive shared by useMapVisualEffects and
// AttractSim — not the cubic-Hermite `smoothstep`.
export function norm01(x, lo, hi) {
    if (hi === lo) return x >= hi ? 1 : 0;
    const t = (x - lo) / (hi - lo);
    return t < 0 ? 0 : t > 1 ? 1 : t;
}
