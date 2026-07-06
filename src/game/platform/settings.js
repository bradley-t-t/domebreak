// User preferences persisted to localStorage — display, audio, and default
// match options. Unknown/missing keys always fall back to DEFAULT_SETTINGS.
import {persistKey} from "./localData.js";
import {DEFAULT_KEYS} from "./keybindings.js";

const KEY = "goldendome.settings";
export const DEFAULT_SETTINGS = {
    speed: 1, globe: true, reduceMotion: false, opponents: 5, musicVol: 0.5, sfxVol: 0.8, keys: DEFAULT_KEYS,
};

// Loads saved settings merged over the defaults (corrupt/absent storage → defaults).
// Key bindings merge per-action, so a newly added control always resolves even
// when the saved blob predates it.
export function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
        return {...DEFAULT_SETTINGS, ...saved, keys: {...DEFAULT_KEYS, ...(saved.keys || {})}};
    } catch {
        return {...DEFAULT_SETTINGS};
    }
}

// Persists the full settings object (best-effort — storage errors are ignored).
export function saveSettings(s) {
    try {
        localStorage.setItem(KEY, JSON.stringify(s));
        persistKey(KEY);
    } catch { /* ignore */
    }
}
