// Local save-game system (localStorage). The world is plain JSON-serializable data.
const PREFIX = "goldendome.save.";
export const AUTOSAVE = "auto";

export function saveGame(slot, world, meta) {
    try {
        localStorage.setItem(PREFIX + slot, JSON.stringify({v: 1, world, meta}));
        return true;
    } catch (e) {
        console.warn("save failed", e);
        return false;
    }
}

export function loadGame(slot) {
    try {
        const raw = localStorage.getItem(PREFIX + slot);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function deleteSave(slot) {
    localStorage.removeItem(PREFIX + slot);
}

export function listSaves() {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX)) {
            try {
                const d = JSON.parse(localStorage.getItem(k));
                out.push({slot: k.slice(PREFIX.length), meta: d.meta || {}});
            } catch { /* skip */
            }
        }
    }
    return out.sort((a, b) => (b.meta.at || 0) - (a.meta.at || 0));
}

export function hasContinue() {
    return !!loadGame(AUTOSAVE) || listSaves().length > 0;
}
