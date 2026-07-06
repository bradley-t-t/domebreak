import {useEffect, useRef} from "react";

// Modal accessibility primitive: focus-trap + Escape-to-close + focus
// restoration. Attach the returned ref to the modal container (give it
// tabIndex={-1} so it can hold focus). On open, focus moves to the first
// focusable descendant (or the container); Tab cycles within the modal and
// can't reach the map behind it; Escape calls onClose and is stopped from
// falling through to the game's global key handlers; on close, focus returns
// to whatever was focused when the modal opened.
//
// This is the shared a11y contract for every overlay in the game — one place
// to get focus management right instead of re-solving it per screen.
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function useModal(onClose, {autoFocus = true} = {}) {
    const ref = useRef(null);
    // Keep the latest onClose without re-running the focus effect (which would
    // drop and re-take focus every render). Updated in a commit-phase effect so
    // the keydown handler always calls the current onClose.
    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    });

    useEffect(() => {
        const node = ref.current;
        if (!node) return;
        const prev = document.activeElement;
        const visible = (el) => el.offsetParent !== null || el === document.activeElement;
        const focusables = () => [...node.querySelectorAll(FOCUSABLE)].filter(visible);

        if (autoFocus) {
            const f = focusables();
            (f[0] || node).focus?.();
        }

        const onKey = (e) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                onCloseRef.current?.();
                return;
            }
            if (e.key !== "Tab") return;
            const f = focusables();
            if (!f.length) {
                e.preventDefault();
                node.focus?.();
                return;
            }
            const first = f[0], last = f[f.length - 1];
            const active = document.activeElement;
            if (e.shiftKey && (active === first || active === node)) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && active === last) {
                e.preventDefault();
                first.focus();
            }
        };

        node.addEventListener("keydown", onKey);
        return () => {
            node.removeEventListener("keydown", onKey);
            if (prev && prev.focus) prev.focus();
        };
        // Intentionally run once per mount — onClose is read via ref.
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return ref;
}
