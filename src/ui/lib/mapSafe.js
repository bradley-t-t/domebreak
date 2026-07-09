// Run an imperative MapLibre op under a null-check + try/catch. Returns
// `fallback` (default undefined) when the map is missing or the style/layer
// isn't ready yet — same shape as the repeated `try { m.setPaint...; } catch
// { /* style not ready */ }` scaffolding at every touch point.
export function safeMap(map, fn, fallback) {
    if (!map) return fallback;
    try {
        return fn(map);
    } catch {
        return fallback;
    }
}
