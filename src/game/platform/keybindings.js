// Configurable in-game controls. Every rebindable action maps to a physical key
// (KeyboardEvent.code), so bindings are keyboard-layout stable and unaffected by
// Shift or locale. Escape (cancel / open menu) and the 1–5 speed-level keys are
// intentionally fixed and not rebindable.
//
// This is the single source of truth for controls — LiveGame reads bindings from
// here (via settings) and the Settings panel edits them; no key is hardcoded in
// the input handlers.

// Rebindable actions, in the order and grouping shown by the Settings editor.
export const KEY_ACTIONS = [
    {id: "production", label: "Production Menu", group: "Command"},
    {id: "diplomacy", label: "Diplomacy Menu", group: "Command"},
    {id: "research", label: "Research Tree", group: "Command"},
    {id: "pause", label: "Pause / Resume", group: "Time"},
    {id: "speedUp", label: "Speed Up", group: "Time"},
    {id: "speedDown", label: "Slow Down", group: "Time"},
    {id: "panUp", label: "Pan Camera Up", group: "Camera"},
    {id: "panLeft", label: "Pan Camera Left", group: "Camera"},
    {id: "panDown", label: "Pan Camera Down", group: "Camera"},
    {id: "panRight", label: "Pan Camera Right", group: "Camera"},
];

// Default binding for each action (KeyboardEvent.code values).
export const DEFAULT_KEYS = {
    production: "KeyE",
    diplomacy: "KeyR",
    research: "KeyT",
    pause: "Space",
    speedUp: "Equal",
    speedDown: "Minus",
    panUp: "KeyW",
    panLeft: "KeyA",
    panDown: "KeyS",
    panRight: "KeyD",
};

// Saved bindings merged over the defaults, so actions added in later versions
// always resolve to a key even for players carrying older saved settings.
export function resolveKeys(saved) {
    return {...DEFAULT_KEYS, ...(saved || {})};
}

// The canonical binding token for a keyboard event: the physical key code, which
// is stable across layouts and ignores modifiers.
export function keyToken(e) {
    return e.code;
}

// Human-readable label for a key code, for the Settings editor and on-screen hints.
export function keyLabel(code) {
    if (!code) return "—";
    if (code.startsWith("Key")) return code.slice(3);       // KeyE → E
    if (code.startsWith("Digit")) return code.slice(5);     // Digit1 → 1
    if (code.startsWith("Numpad")) return "Num " + code.slice(6);
    const named = {
        Space: "Space", Equal: "=", Minus: "−", Comma: ",", Period: ".", Slash: "/",
        ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
        BracketLeft: "[", BracketRight: "]", Backquote: "`", Semicolon: ";", Quote: "'",
        Backslash: "\\", Tab: "Tab", Enter: "Enter",
    };
    return named[code] || code;
}
