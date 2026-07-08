import {useEffect} from "react";

// Global keyboard shortcuts. `handlers` maps a single lowercase key (or "?") to
// a callback. Ignores keystrokes while typing in a field or holding a modifier,
// so it never fights browser/OS shortcuts or form input.
export function useHotkeys(handlers) {
    useEffect(() => {
        const onKey = (e) => {
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            const t = e.target;
            if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
            const key = e.key === "?" ? "?" : e.key.toLowerCase();
            const fn = handlers[key];
            if (fn) {
                e.preventDefault();
                fn();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [handlers]);
}
