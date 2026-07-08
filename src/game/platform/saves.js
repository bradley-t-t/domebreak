// Local save-game system (localStorage, mirrored to the machine-local data
// folder on desktop). The world is plain JSON-serializable data.
//
// NO backwards compatibility (project policy — see CLAUDE.md): DomeBreak never
// migrates or shims old saves. When the world shape changes we bump VERSION; a save
// from any other version is simply unreadable, and the player is told it's outdated
// (listSaves flags it, the load UI says so). We do not carry per-format migration code.
import {persistKey, removeKey} from "./localData.js";

const PREFIX = "domebreak.save.";
// Bump on ANY change to the world shape; older saves become unreadable (no migration).
//   v2: unit type ids renamed to generic roles (interceptor, strikefighter, …).
//   v3: bounded-match / neutral-world model — nations carry an `active` flag (adr-008).
//   v4: world carries `battlePlans` (authored attack plans now persist with the save).
//   v5: battle plans carry `targetNations` (per-plan enemy-nation target scope).
const VERSION = 5;
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
        if (!d || d.v !== VERSION) return null;   // outdated / corrupt → unreadable, no migration
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
                // Outdated saves are still listed (flagged) so the player is told they
                // exist but can't be played — never silently dropped.
                if (d) out.push({slot: k.slice(PREFIX.length), meta: d.meta || {}, outdated: d.v !== VERSION});
            } catch { /* skip */
            }
        }
    }
    return out.sort((a, b) => (b.meta.at || 0) - (a.meta.at || 0));
}

// True when any loadable save exists — gates the start menu's Continue button.
export function hasContinue() {
    return !!loadGame(AUTOSAVE) || listSaves().some((s) => !s.outdated);
}
