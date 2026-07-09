import {useEffect, useState} from "react";

// Minimal hash router — reads window.location.hash and re-renders on change.
// The whole marketing site is a single page, so this saves us pulling in a full
// router just to swap in the Wiki. Returns the current hash (empty string on
// the landing page, "#/wiki" and friends elsewhere) and a `navigate` helper.
export function useHashRoute() {
    const [hash, setHash] = useState(() => window.location.hash);

    useEffect(() => {
        const onHash = () => setHash(window.location.hash);
        window.addEventListener("hashchange", onHash);
        return () => window.removeEventListener("hashchange", onHash);
    }, []);

    // Set the hash and dispatch a hashchange event manually so `history.replaceState`
    // paths still trigger listeners. We prefer assignment when we can — it keeps
    // browser Back/Forward working.
    function navigate(target) {
        if (target === window.location.hash) return;
        window.location.hash = target;
    }

    return [hash, navigate];
}

// True while any wiki route is active — the App uses this to swap the shell for
// the Wiki page. Accepts either the raw hash or nothing (reads window).
export function isWikiRoute(hash = window.location.hash) {
    return hash.startsWith("#/wiki");
}
