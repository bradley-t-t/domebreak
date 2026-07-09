import {cn} from "../lib/cn.js";

// The DOME / BREAK wordmark — dim + bright split, exactly as the game title.
// `stacked` renders it as a two-line logotype (DOME over BREAK) with tight
// leading, for the hero; the default is the inline one-line lockup.
export function Wordmark({className, glow = false, stacked = false}) {
    if (stacked) {
        // Tight leading lives on the inner block spans: cn()/tailwind-merge
        // strips a `leading-*` off the outer span because it collides with the
        // arbitrary `text-[clamp(...)]` font-size passed in via className.
        return (
            <span className={cn("block font-display font-bold uppercase tracking-[0.09em]", className)}>
                <span className="block leading-[0.82] text-dim">DOME</span>
                <span className={cn("block leading-[0.82] text-text", glow && "db-title-glow")}>BREAK</span>
            </span>
        );
    }
    return (
        <span className={cn("font-display font-bold uppercase leading-[0.92] tracking-[0.14em]", className)}>
            <span className="text-dim">DOME</span>
            <span className={cn("text-text", glow && "db-title-glow inline-block")}>BREAK</span>
        </span>
    );
}

// Mono kicker with a blinking status dot — the "SYSTEM ONLINE" motif.
export function Eyebrow({children, dot = true, className}) {
    return (
        <div
            className={cn("inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.28em] text-faint", className)}>
            {dot && <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-danger db-blink shadow-[0_0_7px_var(--danger)]"/>}
            <span>{children}</span>
        </div>
    );
}

// A hairline-framed value cell with mono number over an uppercase micro-label —
// the game's telemetry readout pattern.
export function Stat({value, label, sub, className}) {
    return (
        <div className={cn("relative", className)}>
            <div className="font-mono text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-none text-text tabular-nums">
                {value}
            </div>
            <div className="mt-2 font-display text-[10px] font-semibold uppercase tracking-[0.22em] text-faint">
                {label}
            </div>
            {sub && <div className="mt-1 font-mono text-[11px] text-dim">{sub}</div>}
        </div>
    );
}
