// Seeded-RNG helpers. Callers pass a pre-sampled 0..1 value (from world.rng,
// Math.random, or any seeded stream) so determinism stays with the caller.

// Map a 0..1 sample onto [min, min + span). Names the intent behind the
// `min + rand() * span` pattern used for AI think delays and placement radii.
export function randRange(sample01, min, span) {
    return min + sample01 * span;
}

// Signed uniform sample in (-span/2, +span/2) — the `(sample - 0.5) * span`
// idiom used for MIRV scatter and AI placement wobble.
export function jitter(sample01, span) {
    return (sample01 - 0.5) * span;
}

// Roll rng() * total and walk an [item, weight] list subtracting weights
// until exhausted. Returns the last item as a fallback when total is 0, or
// null when entries is empty. Takes an rng function so the walk samples
// exactly once — passing a pre-sampled value would fight the loop semantics.
export function weightedPick(entries, rng) {
    if (!entries || entries.length === 0) return null;
    let total = 0;
    for (const [, w] of entries) total += w;
    if (total <= 0) return entries[entries.length - 1][0];
    let r = rng() * total;
    for (const [item, w] of entries) {
        r -= w;
        if (r <= 0) return item;
    }
    return entries[entries.length - 1][0];
}
