// JSON-in-localStorage load/save pair with defaults merging, corrupt-input
// safety, best-effort writes, and an Electron persistKey desktop mirror.
// `settings.js` and `hudLayout.js` both landed here.

import {persistKey} from "../game/platform/localData.js";

export function createPersistedStore(key, defaults, options = {}) {
    const {normalize, mirror = true} = options;
    const load = () => {
        let saved;
        try {
            saved = JSON.parse(localStorage.getItem(key) || "null");
        } catch {
            saved = null;
        }
        if (normalize) return normalize(saved, defaults);
        if (saved == null || typeof saved !== "object") return {...defaults};
        return {...defaults, ...saved};
    };
    const save = (value) => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            if (mirror) persistKey(key);
        } catch { /* ignore — storage quota / disabled */ }
    };
    return {load, save};
}
