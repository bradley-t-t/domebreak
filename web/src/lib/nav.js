// Shared navigation targets + scroll helpers, used by the nav, hotkeys and the
// shortcuts overlay so they never drift out of sync.
export function scrollToId(id) {
    // Wiki targets ride through the hash router, not scroll.
    if (id === "wiki") {
        openWiki();
        return;
    }
    // Any scroll target only makes sense on the landing page — hop back to it
    // first when we're currently on the wiki route.
    if (window.location.hash.startsWith("#/wiki")) {
        history.replaceState(null, "", window.location.pathname + window.location.search);
        window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
    if (id === "top") {
        window.scrollTo({top: 0, behavior: "smooth"});
        return;
    }
    document.getElementById(id)?.scrollIntoView({behavior: "smooth", block: "start"});
}

// Push the hash router to the Wiki. Kept separate so both the nav and the "u"
// hotkey use one call site.
export function openWiki() {
    if (!window.location.hash.startsWith("#/wiki")) {
        window.location.hash = "#/wiki";
    }
    window.scrollTo({top: 0, behavior: "auto"});
}

// key → { label, target, hint (display key) }
export const SHORTCUTS = [
    {key: "g", label: "Top", target: "top", hint: "G"},
    {key: "b", label: "Briefing", target: "features", hint: "B"},
    {key: "u", label: "Unit wiki", target: "wiki", hint: "U"},
    {key: "w", label: "Request access", target: "waitlist", hint: "W"},
];
