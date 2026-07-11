import {Eye, EyeOff, RotateCcw, SlidersHorizontal} from "lucide-react";
import {HUD_PANELS} from "../../game/platform/hudLayout.js";
import {cn} from "../lib/cn.js";
import {useDisclosure} from "../../lib/hooks/useDisclosure.js";

// Always-visible HUD hub, docked bottom-left over the map. It's the reliable way
// back for anything the player has hidden or dragged astray: toggle each panel's
// visibility and reset the whole layout — reachable even when every adjustable
// panel is hidden. Complements the per-panel drag toolbars.
//
// `panels` defaults to the full set; the caller narrows it (e.g. dropping the
// online-only Comms panel in solo play) so the menu only lists panels that
// actually render.
export default function HudLayoutMenu({layout, onToggle, onResetAll, panels = HUD_PANELS}) {
    const {open, toggle} = useDisclosure(false);
    const hiddenCount = panels.filter((p) => layout[p.id]?.hidden).length;

    return (
        <div className="absolute bottom-4 left-4 z-6 pointer-events-auto">
            {open && (
                <div className="absolute bottom-full left-0 mb-2 w-[224px] bg-panel-2 border border-line rounded-lg shadow backdrop-blur-[14px] p-2 motion-safe:animate-[dbPop_120ms_var(--ease-out)]"
                     role="menu" aria-label="HUD layout">
                    <div className="px-1.5 py-1 text-[9.5px] tracking-[1.2px] uppercase text-faint">HUD Panels</div>
                    {panels.map((p) => {
                        const hidden = !!layout[p.id]?.hidden;
                        return (
                            <button key={p.id} type="button" role="menuitemcheckbox" aria-checked={!hidden}
                                    className="flex items-center justify-between gap-2 w-full px-2 py-[7px] rounded-sm text-left text-[12px] text-dim hover:bg-hair hover:text-text transition-colors"
                                    onClick={() => onToggle(p.id, {hidden: !hidden})}
                                    title={hidden ? `Show ${p.label}` : `Hide ${p.label}`}>
                                <span className={cn("truncate", hidden && "text-faint")}>{p.label}</span>
                                {hidden
                                    ? <EyeOff size={14} className="flex-none text-faint" aria-hidden="true"/>
                                    : <Eye size={14} className="flex-none text-gold" aria-hidden="true"/>}
                            </button>
                        );
                    })}
                    <button type="button"
                            className="flex items-center gap-2 w-full mt-1 px-2 py-[7px] rounded-sm text-left text-[12px] text-dim border-t border-hair hover:bg-hair hover:text-text transition-colors"
                            onClick={() => onResetAll()} title="Reset all HUD panels to default">
                        <RotateCcw size={13} className="flex-none" aria-hidden="true"/>
                        Reset Layout
                    </button>
                </div>
            )}
            <button type="button"
                    className={cn(
                        "relative w-9 h-9 grid place-items-center rounded border border-line bg-panel text-dim backdrop-blur-[8px] transition-[color,border-color] duration-150 ease-out-db hover:text-text hover:border-blue",
                        open && "text-text border-blue",
                    )}
                    onClick={toggle}
                    aria-expanded={open} aria-haspopup="menu"
                    title="Customize HUD layout" aria-label="Customize HUD layout">
                <SlidersHorizontal size={16} aria-hidden="true"/>
                {hiddenCount > 0 && !open && (
                    <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 grid place-items-center rounded-full bg-gold text-gold-contrast font-mono text-[9px] font-bold leading-none"
                          aria-label={`${hiddenCount} hidden`}>{hiddenCount}</span>
                )}
            </button>
        </div>
    );
}
