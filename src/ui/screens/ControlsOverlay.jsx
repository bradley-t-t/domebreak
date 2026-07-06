import {keyLabel, resolveKeys} from "../../game/platform/keybindings.js";
import {useModal} from "../hooks/useModal.js";

// In-game command reference. Reads the live key bindings so rebinds show through,
// and lays out every control the map surface responds to — including the ones
// that were previously only discoverable by digging through Settings (camera
// pan) or by accident (shift-click to bulk-order / place several). Toggle with
// the ? key or the corner button; Esc or ? closes it.

// A single keycap. `mouse` renders a wider, sentence-case pill for pointer
// actions (L-Click, Scroll) so they read apart from keyboard keys.
function Key({children, mouse}) {
    return <span className={`gd-kbd${mouse ? " mouse" : ""}`}>{children}</span>;
}

// Render a row's key list: keycaps joined by "+" (chord) or a thin separator.
function Keys({combo, chord}) {
    return (
        <span className="gd-ctrl-keys">
            {combo.map((k, i) => (
                <span key={i} className="gd-kbd-wrap">
                    {i > 0 && <span className={chord ? "gd-kbd-plus" : "gd-kbd-sep"}>{chord ? "+" : ""}</span>}
                    <Key mouse={k.mouse}>{k.label}</Key>
                </span>
            ))}
        </span>
    );
}

const cap = (label) => ({label});
const mouse = (label) => ({label, mouse: true});

export default function ControlsOverlay({keys, onClose}) {
    const K = resolveKeys(keys);
    const ref = useModal(onClose);

    const groups = [
        {
            h: "Command Screens", rows: [
                {label: "Production", combo: [cap(keyLabel(K.production))]},
                {label: "Research tree", combo: [cap(keyLabel(K.research))]},
                {label: "Diplomacy", combo: [cap(keyLabel(K.diplomacy))]},
            ]
        },
        {
            h: "Time Control", rows: [
                {label: "Pause / resume", combo: [cap(keyLabel(K.pause))]},
                {label: "Slow down · speed up", combo: [cap(keyLabel(K.speedDown)), cap(keyLabel(K.speedUp))]},
                {label: "Jump to speed level", combo: [cap("1"), cap("2"), cap("3"), cap("4"), cap("5")]},
            ]
        },
        {
            h: "Camera", rows: [
                {label: "Pan map / rotate globe", combo: [cap(keyLabel(K.panUp)), cap(keyLabel(K.panLeft)), cap(keyLabel(K.panDown)), cap(keyLabel(K.panRight))]},
                {label: "Pan (drag)", combo: [mouse("L-Drag")]},
                {label: "Zoom", combo: [mouse("Scroll")]},
                {label: "Globe / flat view", combo: [mouse("Corner ◐ / ▦")]},
            ]
        },
        {
            h: "Units & Orders", rows: [
                {label: "Select friendly unit", combo: [mouse("L-Click")]},
                {label: "Unit / city orders", combo: [mouse("R-Click")]},
                {label: "Sail selected ship", combo: [mouse("R-Click"), mouse("open water")], chord: false},
                {label: "March selected force", combo: [mouse("R-Click"), mouse("land")], chord: false},
                {label: "Pin a target (bookmark)", combo: [mouse("R-Click"), mouse("→ Pin")], chord: false},
            ]
        },
        {
            h: "Shortcuts", rows: [
                {label: "Place several without reselecting", combo: [cap("Shift"), mouse("L-Click")], chord: true},
                {label: "Order ×5 (munitions / aircraft)", combo: [cap("Shift"), mouse("Click")], chord: true},
                {label: "Cancel targeting · back out", combo: [cap("Esc")]},
                {label: "Pause menu", combo: [cap("Esc")]},
                {label: "This reference", combo: [cap("?")]},
            ]
        },
    ];

    return (
        <div className="gd-overlay center" onClick={onClose}>
            <div className="gd-card gd-controls" role="dialog" aria-modal="true" aria-labelledby="gd-controls-title"
                 tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
                <div className="gd-controls-head">
                    <div>
                        <div className="gd-menu-title sm" id="gd-controls-title">Controls</div>
                        <div className="gd-controls-sub">Command reference · rebind keys in Settings</div>
                    </div>
                    <button className="gd-iconbtn" onClick={onClose} title="Close (Esc)" aria-label="Close controls">✕
                    </button>
                </div>
                <div className="gd-controls-grid">
                    {groups.map((g) => (
                        <div className="gd-ctrl-group" key={g.h}>
                            <div className="gd-ctrl-group-h">{g.h}</div>
                            {g.rows.map((r) => (
                                <div className="gd-ctrl-row" key={r.label}>
                                    <span className="gd-ctrl-lbl">{r.label}</span>
                                    <Keys combo={r.combo} chord={r.chord ?? false}/>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
                <button className="gd-btn primary block" onClick={onClose}>Done</button>
            </div>
        </div>
    );
}
