// Cursor-anchored right-click menu. Items: [{ label, onClick, danger, disabled, sub }].
import {useEffect, useRef} from "react";

export default function ContextMenu({x, y, title, items, onClose}) {
    const menuRef = useRef(null);

    // The focusable, actionable menuitems (skip separators and disabled rows) in
    // DOM order — the roving keyboard focus walks this list.
    const enabledButtons = () =>
        Array.from(menuRef.current?.querySelectorAll("[role='menuitem']:not([aria-disabled='true'])") || []);

    // Open: move focus onto the first enabled item so arrow keys and Enter work
    // without a mouse. Runs once per open (title/items identity change).
    useEffect(() => {
        enabledButtons()[0]?.focus();
    }, [x, y, title, items]);

    // Roving focus: Up/Down cycle between enabled items, Enter/Space activate the
    // focused one (native button click covers Enter/Space, so we only handle the
    // arrows here), Escape or Tab dismiss. Preserves the existing onClose contract.
    const onKeyDown = (e) => {
        if (e.key === "Escape" || e.key === "Tab") {
            e.preventDefault();
            onClose();
            return;
        }
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        e.preventDefault();
        const btns = enabledButtons();
        if (!btns.length) return;
        const i = btns.indexOf(document.activeElement);
        const next = e.key === "ArrowDown"
            ? (i + 1) % btns.length
            : (i - 1 + btns.length) % btns.length;
        btns[next].focus();
    };

    return (
        <>
            <div className="gd-ctx-catcher" onClick={onClose} onContextMenu={(e) => {
                e.preventDefault();
                onClose();
            }}/>
            <div ref={menuRef} className="gd-ctx" role="menu" aria-label={title || "Actions"}
                 onKeyDown={onKeyDown} style={{
                left: Math.min(x, window.innerWidth - 210),
                top: Math.min(y, window.innerHeight - 40 - items.length * 34)
            }}>
                {title && <div className="gd-ctx-title">{title}</div>}
                {items.map((it, i) => (
                    it.sep ? <div key={i} className="gd-ctx-sep" role="separator"/> :
                        <button key={i} className={`gd-ctx-item ${it.danger ? "danger" : ""}`} disabled={it.disabled}
                                role="menuitem" aria-disabled={!!it.disabled}
                                onClick={() => {
                                    it.onClick?.();
                                    onClose();
                                }}>
                            {it.label}{it.sub && <span className="gd-ctx-sub">{it.sub}</span>}
                        </button>
                ))}
            </div>
        </>
    );
}
