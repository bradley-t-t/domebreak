// Local save-game system (localStorage, mirrored to the machine-local data
// folder on desktop). The world is plain JSON-serializable data.
import {persistKey, removeKey} from "./localData.js";
import {allowedAmmo, initialWarhead, UNITS} from "../data/constants.js";

// Forward-compat migration for loaded worlds. Platform loadouts can change between
// builds (e.g. the launcher became a SICBM-only TEL); a saved unit may carry a
// warhead its platform can no longer load. Reset any such orphaned warhead to the
// platform's default round so it never fires a payload it isn't cleared for.
// Ammo stockpiles are untouched (no warhead keys were renamed).
function migrateWorld(world) {
    if (!world || !Array.isArray(world.units)) return world;
    for (const u of world.units) {
        const def = UNITS[u.type];
        if (def?.warheads && u.warhead && !allowedAmmo(u.type).includes(u.warhead)) {
            u.warhead = initialWarhead(u.type);
        }
    }
    return world;
}

const PREFIX = "domebreak.save.";
// v2: unit type ids renamed to generic roles (interceptor, strikefighter, …) — older saves are unreadable.
const VERSION = 2;
// Reserved slot name for the rolling autosave (drives the Continue button).
export const AUTOSAVE = "auto";

// Writes {v, world, meta} to the named slot. Returns false on storage failure.
export function saveGame(slot, world, meta) {
    try {
        localStorage.setItem(PREFIX + slot, JSON.stringify({v: VERSION, world, meta}));
        persistKey(PREFIX + slot);
        return true;
    } catch (e) {
        console.warn("save failed", e);
        return false;
    }
}

// Returns the saved {v, world, meta} for a slot, or null if absent, corrupt,
// or written by an incompatible save version.
export function loadGame(slot) {
    try {
        const raw = localStorage.getItem(PREFIX + slot);
        const d = raw ? JSON.parse(raw) : null;
        if (!d || d.v !== VERSION) return null;
        d.world = migrateWorld(d.world);
        return d;
    } catch {
        return null;
    }
}

export function deleteSave(slot) {
    removeKey(PREFIX + slot);
}

// All readable saves as {slot, meta}, newest first (per meta.at timestamp).
export function listSaves() {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX)) {
            try {
                const d = JSON.parse(localStorage.getItem(k));
                if (d && d.v === VERSION) out.push({slot: k.slice(PREFIX.length), meta: d.meta || {}});
            } catch { /* skip */
            }
        }
    }
    return out.sort((a, b) => (b.meta.at || 0) - (a.meta.at || 0));
}

// True when any loadable save exists — gates the start menu's Continue button.
export function hasContinue() {
    return !!loadGame(AUTOSAVE) || listSaves().length > 0;
}
