import {useMemo} from "react";
import {Check, Target} from "lucide-react";
import {evaluateObjectives} from "../../game/engine.js";
import Meter from "../common/Meter.jsx";
import {cn} from "../lib/cn.js";

// In-game Objectives menu: the ordered strategic goals the player works through,
// with live progress. Presentation only — it reads the world through
// evaluateObjectives (sim/objectives.js owns what the goals ARE and whether they're
// met) and never touches game state. Wrapped by an AdjustablePanel in LiveGame, so
// size / placement / opacity / hide all come free from the shared HUD layout store,
// exactly like the other movable panels.
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
    if (!objectives.length) return null;

    const doneCount = objectives.filter((o) => o.done).length;
    const allDone = doneCount === objectives.length;

    return (
        <div className="w-[248px] rounded-lg bg-panel-2 border border-line shadow backdrop-blur-[14px] overflow-hidden"
             role="region" aria-label="Objectives">
            <div className="flex items-center gap-2 px-3 py-[9px] border-b border-hair">
                <Target size={14} className={cn("flex-none", allDone ? "text-good" : "text-gold")} aria-hidden="true"/>
                <span className="font-display font-bold text-[12px] tracking-[0.4px] uppercase text-text">Objectives</span>
                <span className={cn("ml-auto font-mono text-[10px] font-semibold tabular-nums", allDone ? "text-good" : "text-dim")}
                      aria-live="polite">{doneCount} / {objectives.length}</span>
            </div>
            <ol className="flex flex-col">
                {objectives.map((o, i) => (
                    <li key={o.id}
                        className={cn("px-3 py-[10px]", i > 0 && "border-t border-hair", o.done && "opacity-70")}>
                        <div className="flex items-start gap-[9px]">
                            <span className={cn(
                                "flex-none mt-[1px] w-[18px] h-[18px] grid place-items-center rounded-full border text-[10px] font-mono font-bold",
                                o.done ? "bg-good/20 border-good/60 text-good" : "bg-sunk border-line text-dim",
                            )} aria-hidden="true">
                                {o.done ? <Check size={12}/> : i + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className={cn("font-display font-semibold text-[12.5px] leading-tight",
                                    o.done ? "text-dim line-through decoration-good/50" : "text-text")}>
                                    {o.title}
                                </div>
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
            </ol>
        </div>
    );
}
