import {useMemo} from "react";
import {DEFAULT_RULES, normalizeRules, rulesForMode} from "../../game/sim/gameRules.js";
import {GAME_SPEEDS} from "../../game/data/constants.js";
import {cn} from "../lib/cn.js";

// Reusable rules editor. Renders one labelled range control per rule that
// applies to the given mode ("sp" | "mp"). Callers pass the current rules
// object and an onChange(next) — no internal state, so lifting into either the
// New Game rules screen (localStorage-backed) or the lobby (Supabase-backed) is
// a drop-in.
export default function GameRulesForm({mode, rules, onChange, readOnly = false, className}) {
    const active = normalizeRules(rules);
    const visible = useMemo(() => rulesForMode(mode), [mode]);
    const set = (key, value) => {
        if (readOnly) return;
        const next = {...active, [key]: value};
        onChange?.(normalizeRules(next));
    };
    const reset = () => {
        if (readOnly) return;
        onChange?.({...DEFAULT_RULES});
    };
    return (
        <div className={cn("flex flex-col gap-3", className)}>
            {visible.map((meta) => {
                const stored = active[meta.key];
                const isSpeed = meta.key === "startSpeed";
                const sliderVal = isSpeed ? GAME_SPEEDS.indexOf(stored) : stored;
                const display = isSpeed
                    ? `${stored}x`
                    : meta.format(stored);
                return (
                    <label key={meta.key} className="flex flex-col gap-1">
                        <span className="flex items-baseline justify-between gap-3">
                            <span className="font-display uppercase tracking-[1.5px] text-[11px] font-semibold text-faint">
                                {meta.label}
                            </span>
                            <span className="font-mono text-[12px] text-gold tabular-nums">{display}</span>
                        </span>
                        <input
                            type="range"
                            min={meta.min}
                            max={meta.max}
                            step={meta.step}
                            value={sliderVal}
                            disabled={readOnly}
                            onChange={(e) => {
                                const idx = Number(e.target.value);
                                set(meta.key, isSpeed ? GAME_SPEEDS[idx] : idx);
                            }}
                            className="db-rules-range w-full accent-gold disabled:opacity-40 disabled:cursor-not-allowed"
                        />
                        <span className="text-[11px] leading-snug text-dim">{meta.help}</span>
                    </label>
                );
            })}
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
