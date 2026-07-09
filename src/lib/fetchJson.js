// Fetch a static JSON asset and resolve to `null` on any error (network,
// non-2xx, parse). Callers that would otherwise write `.catch(() => {})` get
// the same graceful degradation without the boilerplate.
//
// Set `cache: true` to memoize the download so repeated callers of the same
// path (e.g. /assets/colors.json across ownership, tint, and attract mode)
// share one request.

const memo = new Map();

export async function loadJsonAsset(path, opts = {}) {
    const {signal, cache = false} = opts;
    if (cache && memo.has(path)) return memo.get(path);
    const p = (async () => {
        try {
            const r = await fetch(path, signal ? {signal} : undefined);
            if (!r.ok) return null;
            return await r.json();
        } catch {
            return null;
        }
    })();
    if (cache) memo.set(path, p);
    return p;
}
