// User preferences persisted to localStorage — display, audio, and default
// match options. Unknown/missing keys always fall back to DEFAULT_SETTINGS.
import {createPersistedStore} from "../../lib/storage.js";
import {DEFAULT_KEYS} from "./keybindings.js";

const DEFAULT_SETTINGS = {
    speed: 1, globe: true, reduceMotion: false, opponents: 5, musicVol: 0.5, sfxVol: 0.8, keys: DEFAULT_KEYS,
};

// Loaded settings merge over the defaults; key bindings merge per-action so a
// newly added control always resolves even when the saved blob predates it.
const store = createPersistedStore("domebreak.settings", DEFAULT_SETTINGS, {
    normalize: (saved, defaults) => ({
        ...defaults,
        ...(saved || {}),
        keys: {...DEFAULT_KEYS, ...(saved?.keys || {})},
    }),
});

export const loadSettings = store.load;
export const saveSettings = store.save;
