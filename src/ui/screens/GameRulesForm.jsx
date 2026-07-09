import {useMemo} from "react";
import {DEFAULT_RULES, normalizeRules, rulesForMode} from "../../game/sim/gameRules.js";
import {cn} from "../lib/cn.js";

// Reusable rules editor. Renders one labelled control per rule that applies to
// the given mode ("sp" | "mp") — range slider by default, an inline toggle for
// boolean rules. Callers pass the current rules object and an onChange(next);
// no internal state, so lifting into either the New Game rules screen
// (localStorage-backed) or the lobby (Supabase-backed) is a drop-in.
export default function GameRulesForm({mode, rules, onChange, readOnly = false, className}) {
    const active = normalizeRules(rules);
    const visible = useMemo(() => rulesForMode(mode), [mode]);
    const set = (key, value) => {
        if (readOnly) return;
        onChange?.(normalizeRules({...active, [key]: value}));
    };
    const reset = () => {
        if (readOnly) return;
        onChange?.({...DEFAULT_RULES});
    };
    return (
        <div className={cn("flex flex-col gap-3", className)}>
            {visible.map((meta) => meta.type === "toggle"
                ? <ToggleRow key={meta.key} meta={meta} value={!!active[meta.key]} readOnly={readOnly}
                             onChange={(v) => set(meta.key, v)}/>
                : <RangeRow key={meta.key} meta={meta} value={active[meta.key]} readOnly={readOnly}
                            onChange={(v) => set(meta.key, v)}/>
            )}
            {!readOnly && (
                <button
                    type="button"
                    onClick={reset}
                    className="self-start font-display text-[10px] font-semibold tracking-[2px] uppercase text-dim border border-line-soft rounded-sm px-2 py-1 hover:text-text hover:border-line"
                >
                    Reset to Defaults
                </button>
            )}
        </div>
    );
}

function RangeRow({meta, value, readOnly, onChange}) {
    return (
        <label className="flex flex-col gap-1">
            <span className="flex items-baseline justify-between gap-3">
                <span className="font-display uppercase tracking-[1.5px] text-[11px] font-semibold text-faint">
                    {meta.label}
                </span>
                <span className="font-mono text-[12px] text-gold tabular-nums">{meta.format(value)}</span>
            </span>
            <input
                type="range"
                min={meta.min}
                max={meta.max}
                step={meta.step}
                value={value}
                disabled={readOnly}
                onChange={(e) => onChange(Number(e.target.value))}
                className="db-rules-range w-full accent-gold disabled:opacity-40 disabled:cursor-not-allowed"
            />
            <span className="text-[11px] leading-snug text-dim">{meta.help}</span>
        </label>
    );
}

function ToggleRow({meta, value, readOnly, onChange}) {
    return (
        <label className="flex flex-col gap-1">
            <span className="flex items-center justify-between gap-3">
                <span className="font-display uppercase tracking-[1.5px] text-[11px] font-semibold text-faint">
                    {meta.label}
                </span>
                <button
                    type="button"
                    role="switch"
                    aria-checked={value}
                    disabled={readOnly}
                    onClick={() => onChange(!value)}
                    className={cn(
                        "relative w-10 h-5 rounded-full border transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                        value ? "bg-gold border-gold-line" : "bg-[rgba(255,255,255,0.08)] border-line-soft"
                    )}
                >
                    <span className={cn(
                        "absolute top-[2px] w-3.5 h-3.5 rounded-full bg-white shadow transition-[left] duration-150 ease-out",
                        value ? "left-[22px]" : "left-[2px]"
                    )}/>
                </button>
            </span>
            <span className="text-[11px] leading-snug text-dim">{meta.help}</span>
        </label>
    );
}
