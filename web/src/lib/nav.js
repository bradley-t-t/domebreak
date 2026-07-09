// Shared navigation targets + scroll helpers, used by the nav, hotkeys and the
// shortcuts overlay so they never drift out of sync.
export function scrollToId(id) {
    // Hash-routed targets don't scroll.
    if (id === "wiki") {
        openWiki();
        return;
    }
    if (id === "download") {
        openDownload();
        return;
    }
    // Any scroll target only makes sense on the landing page — hop back to it
    // first when we're currently on a hash-routed page.
    if (window.location.hash.startsWith("#/")) {
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

export function openDownload() {
    if (!window.location.hash.startsWith("#/download")) {
        window.location.hash = "#/download";
    }
    window.scrollTo({top: 0, behavior: "auto"});
}

// key → { label, target, hint (display key) }
export const SHORTCUTS = [
    {key: "g", label: "Top", target: "top", hint: "G"},
    {key: "b", label: "Briefing", target: "features", hint: "B"},
    {key: "u", label: "Unit wiki", target: "wiki", hint: "U"},
    {key: "d", label: "Download", target: "download", hint: "D"},
    {key: "w", label: "Request access", target: "waitlist", hint: "W"},
];
