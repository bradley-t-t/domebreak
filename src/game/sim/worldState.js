// Shared low-level world helpers used across the sim modules: nation lookup,
// the deterministic PRNG, and monotonic id allocation. Never exported from the
// public engine facade — internal plumbing only.

// Slots are assigned 0..N-1 in array order at setup, so nations[slot] is the
// nation almost always — an O(1) hit that matters now the roster is the whole
// world (~222 nations) and this is called deep inside the tick's hot loops. Falls
// back to a linear scan if the ordering ever fails to hold (e.g. a legacy save).
export const nationOf = (w, slot) => {
    const direct = w.nations[slot];
    if (direct && direct.slot === slot) return direct;
    return w.nations.find((n) => n.slot === slot);
};

export function rand(world) {
    let a = world._r | 0;
    a = (a + 0x6D2B79F5) | 0;
    world._r = a;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function nextId(world, p) {
    world._id = (world._id || 0) + 1;
    return p + world._id;
}
