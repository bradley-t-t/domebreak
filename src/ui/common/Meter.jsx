import {cn} from "../lib/cn.js";

// Meter — the shared thin progress / health track used for city vitality, build
// progress, capture, and industry readouts. `frac` (0..1) drives the fill width;
// tint the fill with either `fillClass` (a bg-* utility) or `color` (any CSS
// colour, e.g. a team colour). Default track height is h-[3px]; pass a height
// utility in `className` to override (e.g. "h-[5px]"). Presentation only.
export default function Meter({frac, fillClass, color, className, ariaLabel}) {
    const pct = Math.max(0, Math.min(1, frac || 0)) * 100;
    return (
        <div role="progressbar" aria-label={ariaLabel} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}
             className={cn("h-[3px] bg-line rounded-[2px] overflow-hidden", className)}>
            <i className={cn("block h-full rounded-[2px] transition-[width] duration-200 ease-out-db", fillClass)}
               style={color ? {width: `${pct}%`, background: color} : {width: `${pct}%`}}/>
        </div>
    );
}
