import {STEAM_URL} from "./steam.js";

// Grouped navigation used by both the desktop dropdowns and the mobile drawer,
// so the two never drift. Each item is either an internal target (handled by
// scrollToId — a scroll anchor, or the "wiki"/"download" hash routes) or an
// external link. `steam: true` swaps the game icon for the Steam glyph.
export const NAV_MENUS = [
    {
        label: "Game",
        items: [
            {label: "Doctrine", desc: "What DomeBreak is", icon: "dome", target: "doctrine"},
            {label: "Briefing", desc: "Capabilities at a glance", icon: "reconsat", target: "features"},
            {label: "Unit Wiki", desc: "Every unit and building", icon: "silo", target: "wiki"},
        ],
    },
    {
        label: "Get It",
        items: [
            {label: "Download", desc: "macOS + Windows installers", icon: "factory", target: "download"},
            {label: "Wishlist on Steam", desc: "Get notified at launch", steam: true, external: STEAM_URL},
            {label: "Notify Me by Email", desc: "One email when it launches", icon: "radar", target: "waitlist"},
        ],
    },
];
