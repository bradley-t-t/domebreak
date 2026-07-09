import {cn} from "../lib/cn.js";
import {popoverCard} from "../lib/variants.js";
import StatGrid from "../common/StatGrid.jsx";
import {clamp} from "../../lib/math.js";

// HoverReadout — the shared popover shell for the map's hover probes (the
// zoomed-out whole-country readout and the zoomed-in unit/city readout).
// Both share the same flip/clamp positioning math (keep the card on-screen
// near the cursor, flipping to the left of the pointer when it would run off
// the right edge) and the same two-column StatGrid body; only the header and
// row content differ per caller, so those come in as props. `clampBottom` is
// the bottom-edge margin each caller used inline (country: 190, unit/city:
// 200) — kept distinct so this extraction changes no pixel of either.
// Presentation only — callers own what to show and any game-state lookups.
export default function HoverReadout({x, y, clampBottom, header, rows, footer}) {
    const left = x + 18 > window.innerWidth - 250 ? Math.max(12, x - 248) : x + 18;
    const top = clamp(y - 14, 60, window.innerHeight - clampBottom);
    return (
        <div className={cn(popoverCard(), "fixed z-6 min-w-[206px] max-w-[244px] py-[11px] px-[13px] pb-3")} style={{left, top}} aria-hidden="true">
            <div className="flex items-center gap-2 font-display font-bold text-[13.5px] tracking-[0.2px]">{header}</div>
            <StatGrid rows={rows} className="mt-[10px]"/>
            {footer}
        </div>
    );
}
