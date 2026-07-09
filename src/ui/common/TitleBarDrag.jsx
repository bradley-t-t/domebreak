// Frameless-window drag strip: electron/main.cjs sets the BrowserWindow to
// `titleBarStyle: "hidden"`, so the app supplies its own draggable region — a
// full-width, top-anchored bar rendered above every screen so the window always
// stays draggable. Its 34px height and z-35 are a shared contract with the macOS
// traffic-light position, the Windows titleBarOverlay height in electron/main.cjs,
// and every top-pinned element's inset that must clear it. Non-interactive by
// design — clickable things near the top get inset below it instead.
export default function TitleBarDrag() {
    return (
        <div
            className="fixed top-0 left-0 right-0 h-[34px] z-[35] [-webkit-app-region:drag]"
            aria-hidden="true"
        />
    );
}
