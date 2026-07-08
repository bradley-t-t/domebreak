// Shared framed-popup shell for the top-bar screens (Production, Diplomacy) —
// same centered-rectangle chrome as the research tree: header with title + close,
// scrollable body, optional footer hint. Esc closes.
import {useModal} from "../hooks/useModal.js";
import {iconButton} from "../lib/variants.js";
import {cn} from "../lib/cn.js";

export default function ScreenFrame({title, subtitle, onClose, children, foot, wide, bare, head}) {
    const ref = useModal(onClose);

    return (
        <div className="db-screen absolute inset-0 z-40 flex flex-col bg-[rgba(4,6,9,0.62)] backdrop-blur-[6px] border border-line rounded-none shadow-[0_26px_80px_rgba(0,0,0,0.6)] overflow-hidden animate-[dbRowIn_220ms_var(--ease-out)_both]"
             ref={ref} tabIndex={-1} role="dialog" aria-modal="true"
             aria-labelledby="db-screenframe-title">
            <div className="flex items-baseline gap-[14px] px-[22px] py-[14px] border-b border-line-soft bg-panel">
                <span className="font-display font-bold text-[15px] tracking-[4px] text-text" id="db-screenframe-title">{title}</span>
                {subtitle && <span className="font-mono text-[11px] tracking-[1px] text-dim">{subtitle}</span>}
                {head}
                <button className={cn(iconButton(), "ml-auto self-center")} onClick={onClose} title="Close (Esc)"
                        aria-label="Close">✕
                </button>
            </div>
            {bare
                ? <div className="flex-1 block p-0 overflow-hidden">{children}</div>
                : <div className="flex-1 overflow-auto p-[22px] flex justify-center">
                    <div className={cn("w-full max-w-[480px]", wide && "max-w-[960px]")}>{children}</div>
                </div>}
            {foot && <div>{foot}</div>}
        </div>
    );
}
