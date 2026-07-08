// Shared navigation targets + scroll helpers, used by the nav, hotkeys and the
// shortcuts overlay so they never drift out of sync.
export function scrollToId(id) {
    if (id === "top") {
        window.scrollTo({top: 0, behavior: "smooth"});
        return;
    }
    document.getElementById(id)?.scrollIntoView({behavior: "smooth", block: "start"});
}

// key → { label, target, hint (display key) }
export const SHORTCUTS = [
    {key: "g", label: "Top", target: "top", hint: "G"},
    {key: "b", label: "Briefing", target: "features", hint: "B"},
    {key: "d", label: "Download", target: "download", hint: "D"},
    {key: "w", label: "Request access", target: "waitlist", hint: "W"},
];
