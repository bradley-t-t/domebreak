// Frameless-window drag strip: with electron/main.cjs's BrowserWindow set to
// `titleBarStyle: "hidden"`, the OS supplies no draggable title bar, so the app
// must expose its own. This is a full-width, top-anchored region the player can
// grab to move the window; it renders above every screen (menus, HUD, modals)
// so the window stays draggable no matter what's on screen. Its height (34px)
// and z-index (35) are shared contract with the macOS traffic-light position
// and the Windows titleBarOverlay height configured in electron/main.cjs, and
// with every top-pinned UI element's inset (see LiveGame.jsx, NationPanel.jsx,
// PinnedBar.jsx, MeBadge.jsx) that must clear it. Non-interactive by design —
// anything that needs to be clickable near the top gets inset below this strip
// instead of living inside it.
export default function TitleBarDrag() {
    return (
        <div
            className="fixed top-0 left-0 right-0 h-[34px] z-[35] [-webkit-app-region:drag]"
            aria-hidden="true"
        />
    );
}
