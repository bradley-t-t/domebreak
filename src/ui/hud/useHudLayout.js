import {useCallback, useState} from "react";
import {loadHudLayout, normalizePanel, saveHudLayout, DEFAULT_HUD_LAYOUT} from "../../game/platform/hudLayout.js";

// React state bridge over the machine-local HUD layout store. Holds the current
// arrangement, and every mutation both re-renders and persists (localStorage +
// on-disk mirror) so nothing is lost between sessions. Presentation-only — this
// never touches game/world state, only how the chrome is drawn.
export function useHudLayout() {
    // Lazy init so the disk-hydrated localStorage is read exactly once on mount.
    const [layout, setLayout] = useState(loadHudLayout);

    // Merge a partial patch into one panel, re-normalize it into bounds, persist,
    // and return the next layout. Accepts a patch object or an updater fn.
    const update = useCallback((id, patch) => {
        setLayout((prev) => {
            const cur = prev[id] || DEFAULT_HUD_LAYOUT[id];
            const delta = typeof patch === "function" ? patch(cur) : patch;
            const next = {...prev, [id]: normalizePanel({...cur, ...delta})};
            saveHudLayout(next);
            return next;
        });
    }, []);

    // Restore one panel to its docked default.
    const resetPanel = useCallback((id) => update(id, {...DEFAULT_HUD_LAYOUT[id]}), [update]);

    // Restore every panel at once.
    const resetAll = useCallback(() => {
        const next = {};
        for (const id of Object.keys(DEFAULT_HUD_LAYOUT)) next[id] = {...DEFAULT_HUD_LAYOUT[id]};
        saveHudLayout(next);
        setLayout(next);
    }, []);

    return {layout, update, resetPanel, resetAll};
}
