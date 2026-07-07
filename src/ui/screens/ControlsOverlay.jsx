import {keyLabel, resolveKeys} from "../../game/platform/keybindings.js";
import {useModal} from "../hooks/useModal.js";
import {button, card, iconButton, overlay, menuTitle} from "../lib/variants.js";
import {cn} from "../lib/cn.js";

// In-game command reference. Reads the live key bindings so rebinds show through,
// and lays out every control the map surface responds to — including the ones
// that were previously only discoverable by digging through Settings (camera
// pan) or by accident (shift-click to bulk-order / place several). Toggle with
// the ? key or the corner button; Esc or ? closes it.

// A single keycap. `mouse` renders a wider, sentence-case pill for pointer
// actions (L-Click, Scroll) so they read apart from keyboard keys.
function Key({children, mouse}) {
    return (
        <span className={cn(
            "db-kbd min-w-[22px] h-[23px] py-0 px-[7px] inline-flex items-center justify-center border border-line border-b-2 bg-btn-bg text-text rounded-sm font-mono text-[11.5px] leading-none whitespace-nowrap",
            mouse && "mouse text-dim text-[10.5px] tracking-[0.01em]"
        )}>{children}</span>
    );
}

// Render a row's key list: keycaps joined by "+" (chord) or a thin separator.
function Keys({combo, chord}) {
    return (
        <span className="db-ctrl-keys flex items-center gap-[3px] shrink-0">
            {combo.map((k, i) => (
                <span key={i} className="db-kbd-wrap inline-flex items-center gap-[3px]">
                    {i > 0 && <span className={chord ? "db-kbd-plus text-faint text-[11px]" : "db-kbd-sep w-0.5"}>{chord ? "+" : ""}</span>}
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
                {label: "Zoom in · out", combo: [cap(keyLabel(K.zoomIn)), cap(keyLabel(K.zoomOut))]},
                {label: "Zoom (scroll)", combo: [mouse("Scroll")]},
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
        <div className={overlay({placement: "center"})} onClick={onClose}>
            <div className={cn(card(), "db-controls w-[min(760px,94vw)] max-h-[88vh] overflow-y-auto text-left")}
                 role="dialog" aria-modal="true" aria-labelledby="db-controls-title"
                 tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
                <div className="db-controls-head flex items-start justify-between gap-3 mb-1.5">
                    <div>
                        <div className={menuTitle({sm: true})} id="db-controls-title">Controls</div>
                        <div className="db-controls-sub font-mono text-[11px] tracking-[0.02em] text-dim mt-1">Command reference · rebind keys in Settings</div>
                    </div>
                    <button className={iconButton()} onClick={onClose} title="Close (Esc)" aria-label="Close controls">✕
                    </button>
                </div>
                <div className="db-controls-grid grid grid-cols-1 sm:grid-cols-2 gap-x-[34px] gap-y-1 my-3 mb-5">
                    {groups.map((g) => (
                        <div className="db-ctrl-group [break-inside:avoid]" key={g.h}>
                            <div className="db-ctrl-group-h font-mono text-[10.5px] tracking-[0.1em] uppercase text-faint mt-3.5 mb-1.5 pb-[5px] border-b border-line">{g.h}</div>
                            {g.rows.map((r) => (
                                <div className="db-ctrl-row flex items-center justify-between gap-3 py-[5px] text-[13px] text-dim" key={r.label}>
                                    <span className="db-ctrl-lbl min-w-0">{r.label}</span>
                                    <Keys combo={r.combo} chord={r.chord ?? false}/>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
                <button className={cn(button({variant: "primary"}), "block")} onClick={onClose}>Done</button>
            </div>
        </div>
    );
}
