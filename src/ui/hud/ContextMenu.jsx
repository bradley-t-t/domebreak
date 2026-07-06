// Cursor-anchored right-click menu. Items: [{ label, onClick, danger, disabled, sub }].
import {useEffect, useRef} from "react";
import {cn} from "../lib/cn.js";

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
            <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => {
                e.preventDefault();
                onClose();
            }}/>
            <div ref={menuRef}
                 className="gd-ctx fixed z-41 min-w-[190px] bg-panel-solid border border-line rounded shadow overflow-hidden p-[5px] motion-safe:animate-[gdCtxIn_120ms_var(--ease-out)]"
                 role="menu" aria-label={title || "Actions"}
                 onKeyDown={onKeyDown} style={{
                left: Math.min(x, window.innerWidth - 210),
                top: Math.min(y, window.innerHeight - 40 - items.length * 34)
            }}>
                {title && <div
                    className="text-[11px] tracking-[0.5px] uppercase text-faint px-2 pt-[6px] pb-1 whitespace-nowrap overflow-hidden text-ellipsis">{title}</div>}
                {items.map((it, i) => (
                    it.sep ? <div key={i} className="h-px bg-line-soft my-1 mx-[6px]" role="separator"/> :
                        <button key={i}
                                className={cn("flex justify-between gap-[10px] w-full text-left px-[9px] py-2 border-none bg-transparent text-text rounded-sm text-[13px] enabled:hover:bg-[#17191d]", it.danger && "enabled:hover:bg-[rgba(255,93,93,0.14)] enabled:hover:text-danger", it.disabled && "opacity-40")}
                                disabled={it.disabled}
                                role="menuitem" aria-disabled={!!it.disabled}
                                onClick={() => {
                                    it.onClick?.();
                                    onClose();
                                }}>
                            {it.label}{it.sub && <span className="text-dim font-mono text-[11px]">{it.sub}</span>}
                        </button>
                ))}
            </div>
        </>
    );
}
