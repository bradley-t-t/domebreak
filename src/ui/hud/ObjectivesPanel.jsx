import {useMemo, useState} from "react";
import {Check, ChevronDown, Target} from "lucide-react";
import {evaluateObjectives} from "../../game/engine.js";
import Meter from "../common/Meter.jsx";
import {cn} from "../lib/cn.js";

// How many incomplete objectives the panel foregrounds at once. Purely a
// presentation cap (keeps the to-do list short) — not a gameplay tuning value.
const MAX_ACTIVE = 3;

// In-game Objectives menu: the ordered strategic goals the player works through,
// with live progress. Presentation only — it reads the world through
// evaluateObjectives (sim/objectives.js owns what the goals ARE and whether they're
// met) and never touches game state. Wrapped by an AdjustablePanel in LiveGame, so
// size / placement / opacity / hide all come free from the shared HUD layout store,
// exactly like the other movable panels.
//
// Completed objectives leave the active list so the panel always foregrounds what
// the player should do next; they collapse into a "Completed" log at the bottom that
// can be expanded to review everything already cleared.
//
// Only the next MAX_ACTIVE incomplete objectives are shown at once, so the panel
// stays a short, focused to-do list. As each visible one is cleared it drops into
// the completed log and the next queued objective slides up to take its place; a
// "+N more" hint records how many are still waiting.
//
// The land-coverage objective runs a full country-grid scan, so evaluation is
// memoized on the whole-second game clock rather than every animation frame — a
// checkmark can lag reaching a goal by at most one game-second, imperceptible here.
export default function ObjectivesPanel({world, mySlot}) {
    const second = Math.floor(world.time);
    const objectives = useMemo(
        () => evaluateObjectives(world, mySlot),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- throttled to the game-second clock; world/mySlot read inside
        [second, mySlot],
    );
    const [logOpen, setLogOpen] = useState(false);
    if (!objectives.length) return null;

    const active = objectives.filter((o) => !o.done);
    const completed = objectives.filter((o) => o.done);
    const doneCount = completed.length;
    const allDone = doneCount === objectives.length;

    // Foreground only the next few incomplete objectives; the rest stay queued
    // and surface one-by-one as these clear.
    const visibleActive = active.slice(0, MAX_ACTIVE);
    const queuedCount = active.length - visibleActive.length;

    return (
        <div className="w-[248px] rounded-lg bg-panel-2 border border-line shadow backdrop-blur-[14px] overflow-hidden"
             role="region" aria-label="Objectives">
            <div className="flex items-center gap-2 px-3 py-[9px] border-b border-hair">
                <Target size={14} className={cn("flex-none", allDone ? "text-good" : "text-gold")} aria-hidden="true"/>
                <span className="font-display font-bold text-[12px] tracking-[0.4px] uppercase text-text">Objectives</span>
                <span className={cn("ml-auto font-mono text-[10px] font-semibold tabular-nums", allDone ? "text-good" : "text-dim")}
                      aria-live="polite">{doneCount} / {objectives.length}</span>
            </div>

            {allDone ? (
                <div className="flex items-center gap-2 px-3 py-[11px] text-good">
                    <Check size={14} className="flex-none" aria-hidden="true"/>
                    <span className="font-display font-semibold text-[12px]">All objectives complete</span>
                </div>
            ) : (
                <ol className="flex flex-col">
                    {visibleActive.map((o, i) => (
                        <li key={o.id} className={cn("px-3 py-[10px]", i > 0 && "border-t border-hair")}>
                            <div className="flex items-start gap-[9px]">
                                <span className="flex-none mt-[1px] w-[18px] h-[18px] grid place-items-center rounded-full border bg-sunk border-line text-dim text-[10px] font-mono font-bold"
                                      aria-hidden="true">{i + 1}</span>
                                <div className="min-w-0 flex-1">
                                    <div className="font-display font-semibold text-[12.5px] leading-tight text-text">{o.title}</div>
                                    <div className="mt-[2px] text-[10.5px] leading-snug text-faint">{o.blurb}</div>
                                    <ul className="mt-[7px] flex flex-col gap-[6px]">
                                        {o.tasks.map((t) => (
                                            <li key={t.id}>
                                                <div className="flex items-center gap-2">
                                                    <span className={cn("flex-none w-[13px] h-[13px] grid place-items-center rounded-[3px] border",
                                                        t.done ? "bg-good/25 border-good/60 text-good" : "border-line text-transparent")}
                                                          aria-hidden="true">
                                                        <Check size={9}/>
                                                    </span>
                                                    <span className={cn("flex-1 min-w-0 truncate text-[11.5px]",
                                                        t.done ? "text-dim" : "text-text")}>{t.label}</span>
                                                    <span className={cn("flex-none font-mono text-[10px] tabular-nums",
                                                        t.done ? "text-good" : "text-dim")}>{t.detail}</span>
                                                </div>
                                                <Meter frac={t.progress}
                                                       className="mt-[4px] ml-[21px] h-[3px]"
                                                       fillClass={t.done ? "bg-good" : "bg-gold"}
                                                       ariaLabel={`${t.label} progress`}/>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </li>
                    ))}
                    {queuedCount > 0 && (
                        <li className="px-3 py-[7px] border-t border-hair flex items-center gap-2">
                            <span className="flex-none w-[18px] h-[18px] grid place-items-center rounded-full border border-dashed border-line text-dim text-[10px] font-mono font-bold"
                                  aria-hidden="true">+{queuedCount}</span>
                            <span className="text-[10.5px] leading-snug text-faint">
                                {queuedCount} more objective{queuedCount > 1 ? "s" : ""} queued
                            </span>
                        </li>
                    )}
                </ol>
            )}

            {doneCount > 0 && (
                <div className="border-t border-hair">
                    <button type="button" onClick={() => setLogOpen((v) => !v)}
                            className="w-full flex items-center gap-2 px-3 py-[8px] text-left hover:bg-panel-1/60 transition-colors"
                            aria-expanded={logOpen} aria-controls="objectives-log">
                        <Check size={12} className="flex-none text-good" aria-hidden="true"/>
                        <span className="font-display font-semibold text-[11px] tracking-[0.3px] uppercase text-dim">Completed</span>
                        <span className="font-mono text-[10px] font-semibold tabular-nums text-good">{doneCount}</span>
                        <ChevronDown size={13} aria-hidden="true"
                                     className={cn("ml-auto flex-none text-dim transition-transform", logOpen && "rotate-180")}/>
                    </button>
                    {logOpen && (
                        <ol id="objectives-log" className="flex flex-col pb-[4px]">
                            {completed.map((o) => (
                                <li key={o.id} className="flex items-start gap-[9px] px-3 py-[6px]">
                                    <span className="flex-none mt-[1px] w-[18px] h-[18px] grid place-items-center rounded-full bg-good/20 border border-good/60 text-good"
                                          aria-hidden="true"><Check size={12}/></span>
                                    <div className="min-w-0 flex-1">
                                        <div className="font-display font-semibold text-[12px] leading-tight text-dim line-through decoration-good/50">{o.title}</div>
                                        <div className="mt-[1px] text-[10px] leading-snug text-faint">{o.blurb}</div>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
            )}
        </div>
    );
}
