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
    const leavingRoute = window.location.hash.startsWith("#/");
    if (leavingRoute) {
        history.replaceState(null, "", window.location.pathname + window.location.search);
        window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
    if (id === "top") {
        window.scrollTo({top: 0, behavior: leavingRoute ? "auto" : "smooth"});
        return;
    }
    // When we've just left a hash route the landing page hasn't rendered yet, so
    // the target element doesn't exist — wait a frame for React to mount it.
    const scroll = () => document.getElementById(id)?.scrollIntoView({behavior: "smooth", block: "start"});
    if (leavingRoute) {
        requestAnimationFrame(() => requestAnimationFrame(scroll));
    } else {
        scroll();
    }
}

// Push the hash router to the Wiki. Kept separate so both the nav and the "u"
// hotkey use one call site.
function openWiki() {
    if (!window.location.hash.startsWith("#/wiki")) {
        window.location.hash = "#/wiki";
    }
    window.scrollTo({top: 0, behavior: "auto"});
}

function openDownload() {
    if (!window.location.hash.startsWith("#/download")) {
        window.location.hash = "#/download";
    }
    window.scrollTo({top: 0, behavior: "auto"});
}

// key → { label, target, hint (display key) }
export const SHORTCUTS = [
    {key: "g", label: "Top", target: "top", hint: "G"},
    {key: "b", label: "Briefing", target: "features", hint: "B"},
    {key: "p", label: "Play free", target: "play", hint: "P"},
    {key: "u", label: "Unit wiki", target: "wiki", hint: "U"},
    {key: "d", label: "Download", target: "download", hint: "D"},
];
