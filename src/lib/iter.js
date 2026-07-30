// Array / object primitives used across sim, hooks, and server.

// One-liner for the pervasive `arr.find((x) => x.id === id)` pattern.
export function byId(arr, id) {
    return arr.find((x) => x.id === id);
}

// Tally an iterable into a Map keyed by keyFn, summing weightFn (default 1).
// A Map rather than a plain object so keys of any type work and a key named
// like an Object.prototype member can't collide with it.
export function countBy(iterable, keyFn, weightFn) {
    const m = new Map();
    for (const item of iterable) {
        const k = keyFn(item);
        const w = weightFn ? weightFn(item) : 1;
        m.set(k, (m.get(k) || 0) + w);
    }
    return m;
}

// Turn an array into a lookup Map without the double-arrow tuple boilerplate.
// If valueFn is omitted, the element itself is stored.
export function indexBy(items, keyFn, valueFn) {
    const m = new Map();
    for (const item of items) m.set(keyFn(item), valueFn ? valueFn(item) : item);
    return m;
}

// Stable string comparator over a getter. `arr.sort(cmpStr((x) => x.id))`
// beats the triple-ternary `(a.id < b.id ? -1 : a.id > b.id ? 1 : 0)`.
export function cmpStr(getter) {
    const g = getter || ((x) => x);
    return (a, b) => {
        const ka = g(a), kb = g(b);
        return ka < kb ? -1 : ka > kb ? 1 : 0;
    };
}
