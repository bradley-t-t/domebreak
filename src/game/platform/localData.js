// Machine-local data folder bridge. On Electron the preload exposes
// window.gdLocal (IPC to a JSON-file store under the OS userData dir); in the
// browser there is no folder, so localStorage alone carries the data.
//
// Everything still reads/writes localStorage synchronously — existing call
// sites stay untouched. On desktop we hydrate localStorage from disk once at
// boot, and mirror writes back to disk fire-and-forget, so the folder is the
// durable copy and localStorage is the hot cache.

const bridge = typeof window !== "undefined" ? window.gdLocal : undefined;

export const isDesktop = !!bridge;

// Seed localStorage from the on-disk store. Must complete before first render
// so saves/settings/auth read their persisted values. No-op in the browser.
export async function hydrateLocalData() {
    if (!bridge) return;
    try {
        const all = await bridge.list();
        for (const [k, v] of Object.entries(all)) {
            if (localStorage.getItem(k) == null) localStorage.setItem(k, v);
        }
    } catch { /* disk store unreadable — run on cache alone */
    }
}

// Mirror one localStorage key to the data folder (fire and forget).
export function persistKey(key) {
    if (!bridge) return;
    const v = localStorage.getItem(key);
    if (v == null) bridge.del(key);
    else bridge.set(key, v);
}

export function removeKey(key) {
    localStorage.removeItem(key);
    if (bridge) bridge.del(key);
}
