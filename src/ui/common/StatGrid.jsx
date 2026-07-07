import {cn} from "../lib/cn.js";

// StatGrid — the shared two-column label/value readout used by the map hover
// popovers (city / country / unit) and the selection panel. Pass `rows` as an
// array of [label, value] (or [label, value, valueClassName] to tint a value,
// e.g. a danger/vitality colour). Presentation only.
export default function StatGrid({rows, className}) {
    return (
        <div className={cn(
            "grid grid-cols-2 gap-x-[14px] gap-y-[7px] [&>div]:flex [&>div]:flex-col [&_span]:text-[10px] [&_span]:tracking-[0.5px] [&_span]:uppercase [&_span]:text-faint [&_b]:font-mono [&_b]:text-[12.5px]",
            className,
        )}>
            {rows.map(([label, value, valueClass], i) => (
                <div key={i}><span>{label}</span><b className={valueClass}>{value}</b></div>
            ))}
        </div>
    );
}
