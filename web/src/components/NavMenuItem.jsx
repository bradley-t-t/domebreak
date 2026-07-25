import {scrollToId} from "../lib/nav.js";
import {cn} from "../lib/cn.js";
import GameIcon from "./GameIcon.jsx";

// A single menu row: framed icon + label + micro-description. Shared by the
// desktop dropdown and the mobile drawer so both read identically. Internal
// items route through scrollToId; external items are real anchors.
export default function NavMenuItem({item, onDone}) {
    const icon = <GameIcon name={item.icon} size={18}/>;

    const body = (
        <>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-line bg-gold-soft text-gold transition-colors duration-150 group-hover/item:border-gold-line">
                {icon}
            </span>
            <span className="min-w-0">
                <span className="block font-display text-[12.5px] font-semibold uppercase tracking-[0.08em] text-text">
                    {item.label}
                </span>
                {item.desc && (
                    <span className="mt-0.5 block font-mono text-[10.5px] leading-relaxed text-faint">
                        {item.desc}
                    </span>
                )}
            </span>
        </>
    );

    const cls = "group/item flex w-full items-start gap-3 rounded-sm px-3 py-2.5 text-left transition-colors duration-150 hover:bg-bg-2 cursor-pointer";

    if (item.external) {
        return (
            <a role="menuitem" href={item.external} target="_blank" rel="noopener noreferrer" onClick={onDone} className={cls}>
                {body}
            </a>
        );
    }
    return (
        <button
            role="menuitem"
            onClick={() => {
                onDone?.();
                scrollToId(item.target);
            }}
            className={cn(cls)}
        >
            {body}
        </button>
    );
}
