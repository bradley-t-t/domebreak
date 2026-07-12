import {useMemo} from "react";
import {Check, ChevronDown, Landmark, Target} from "lucide-react";
import {evaluateObjectives, leadershipStatus} from "../../game/engine.js";
import Meter from "../common/Meter.jsx";
import {cn} from "../lib/cn.js";
import {button} from "../lib/variants.js";
import {shareOfPct} from "../lib/format.js";
import {vitColor, VIT_AMBER, VIT_GREEN, VIT_RED} from "../lib/status.js";
import {useDisclosure} from "../../lib/hooks/useDisclosure.js";

// How many incomplete objectives the panel foregrounds at once. Purely a
// presentation cap (keeps the to-do list short) — not a gameplay tuning value.
const MAX_ACTIVE = 3;

// Leadership command section, docked at the foot of the Objectives panel — the
// dedicated home for controlling national leadership. Reads the live picture from
// leadershipStatus and dispatches the same shelter/release orders the war alert and
// bunker panel use, so it is always reachable regardless of whether a bunker is
// selected or an alert happens to be up. Presentation only — every action routes
// through api and any rejection surfaces via flash.
function LeadershipSection({world, api, mySlot, flash}) {
    const lead = leadershipStatus(world, mySlot);
    if (!lead) return null;

    const pctOf = (v) => shareOfPct(v, lead.total || 1);
    const sheltering = lead.mode === "shelter";
    const releasing = lead.mode === "release";
    const inCities = pctOf(lead.atCity);
    const sheltered = pctOf(lead.sheltered);
    const inTransit = pctOf(lead.inTransit);

    // Fire the order and surface any validation error (missing bunker/airstrip,
    // nothing to move) inline, matching the bunker panel's behaviour.
    const act = (fn) => {
        const r = fn();
        if (r?.error) flash?.(r.error, "err");
    };

    // The one-line status under the header reflects what leadership is doing right
    // now, escalating to a warning tint when leaders are exposed during a war.
    const danger = lead.atWar && lead.exposed && !sheltering;
    const status = sheltering ? "Airlift underway — sheltering"
        : releasing ? "Releasing back to cities"
            : lead.atWar && lead.exposed ? "Exposed — enemy can decapitate you"
                : lead.sheltered > 0 ? "Sheltered in the bunker"
                    : "Secure in your cities";
    const infraHint = !lead.hasBunker ? "Build a Leadership Bunker to shelter your command."
        : !lead.hasAirstrip ? "Build an Airstrip to fly the airlift." : null;

    // Where the nation's command currently sits, as a stacked bar + legend. This
    // theme is monochrome, so the segments lean on the traffic-light accents to
    // stay distinguishable: cities read amber when exposed in war (red at real
    // risk) and neutral otherwise, the bunker reads safe-green, transit reads amber.
    const cityColor = danger ? VIT_RED : lead.atWar ? VIT_AMBER : "var(--dim)";
    const segs = [
        {label: "In cities", value: inCities, color: cityColor},
        {label: "Sheltered", value: sheltered, color: VIT_GREEN},
        {label: "In transit", value: inTransit, color: VIT_AMBER},
    ];

    // Prompt callout, sitting right above the controls that act on it: the
    // war-declared "shelter now" alarm pulses; the peacetime "bring them home"
    // nudge is calm. Both self-arm and self-clear from world state.
    const where = lead.sites.length
        ? lead.sites.slice(0, 3).join(", ") + (lead.sites.length > 3 ? `, +${lead.sites.length - 3} more` : "")
        : "the field";
    const prompt = danger
        ? {
            tone: "danger",
            title: "Leadership Exposed — War Declared",
            body: `Your national command is spread across ${where}. Airlift them to the bunker before an enemy strike decapitates you.`,
        }
        : !lead.atWar && lead.sheltered > 0 && !releasing
            ? {
                tone: "calm",
                title: "The Wars Have Ended",
                body: "Your leadership is still sheltered in the bunker. Release them back to your cities to restore full national command.",
            }
            : null;

    return (
        <div className="border-t border-hair">
            <div className="flex items-center gap-2 px-3 pt-[9px] pb-[6px]">
                <Landmark size={13} className="flex-none" style={{color: danger ? VIT_RED : vitColor(lead.pct)}} aria-hidden="true"/>
                <span className="font-display font-semibold text-[11px] tracking-[0.3px] uppercase text-dim">Leadership</span>
                <span className="ml-auto font-mono text-[11px] font-semibold tabular-nums"
                      style={{color: vitColor(lead.pct)}} aria-label={`Leadership intact ${lead.pct}%`}>{lead.pct}%</span>
            </div>
            <div className={cn("px-3 text-[10.5px] leading-snug", danger ? "text-red" : "text-faint")}
                 role="status" aria-live="polite">{status}</div>
            {prompt && (
                <div className={cn(
                    "mx-3 mt-[8px] rounded-[6px] border px-[9px] py-[7px]",
                    prompt.tone === "danger"
                        ? "border-red/60 bg-red/10 animate-[db-lead-pulse_1.8s_ease-in-out_infinite] motion-reduce:animate-none"
                        : "border-gold/45 bg-gold/10"
                )} role={prompt.tone === "danger" ? "alert" : "status"}
                     aria-live={prompt.tone === "danger" ? "assertive" : "polite"}>
                    <div className={cn("font-display font-semibold text-[11px] tracking-[0.3px] leading-tight",
                        prompt.tone === "danger" ? "text-red" : "text-gold")}>{prompt.title}</div>
                    <div className="mt-[2px] text-[10px] leading-snug text-faint">{prompt.body}</div>
                </div>
            )}
            {/* Composition bar: where the nation's command currently sits. */}
            <div className="mx-3 mt-[7px] flex h-[5px] overflow-hidden rounded-full bg-sunk" aria-hidden="true">
                {segs.map((s) => (
                    <i key={s.label} className="block h-full transition-[width] duration-300 ease-out-db"
                       style={{width: `${s.value}%`, background: s.color}}/>
                ))}
            </div>
            <div className="mx-3 mt-[6px] grid grid-cols-3 gap-x-2 text-center">
                {segs.map((s) => (
                    <div key={s.label} className="flex flex-col leading-tight">
                        <b className="font-mono text-[11px] tabular-nums" style={{color: s.color}}>{s.value}%</b>
                        <span className="text-[8.5px] tracking-[0.4px] uppercase text-faint">{s.label}</span>
                    </div>
                ))}
            </div>
            <div className="flex gap-[6px] px-3 pt-[9px] pb-[10px]">
                <button className={cn(button({variant: sheltering ? "primary" : "default"}), "flex-1 py-[6px] text-[11px]", sheltering && "disabled:opacity-100")}
                        disabled={!lead.exposed || sheltering || !lead.hasAirstrip || !lead.hasBunker}
                        title={infraHint || (!lead.exposed ? "No leaders are exposed in your cities." : "Airlift exposed leaders into the bunker.")}
                        onClick={() => act(api.shelterLeadership)}>{sheltering ? "Sheltering…" : "Shelter"}</button>
                <button className={cn(button({variant: releasing ? "primary" : "default"}), "flex-1 py-[6px] text-[11px]", releasing && "disabled:opacity-100")}
                        disabled={lead.sheltered <= 0 || releasing || !lead.hasAirstrip}
                        title={!lead.hasAirstrip ? "Build an Airstrip to fly them back out." : lead.sheltered <= 0 ? "No leadership is sheltered." : "Fly sheltered leaders back out to your cities."}
                        onClick={() => act(api.releaseLeadership)}>{releasing ? "Releasing…" : "Release"}</button>
            </div>
            {infraHint && <div className="px-3 pb-[10px] -mt-[4px] text-[10px] font-mono text-gold leading-snug">{infraHint}</div>}
        </div>
    );
}

// In-game Objectives menu: the ordered strategic goals the player works through,
// with live progress. Presentation only — it reads the world through
// evaluateObjectives (sim/objectives.js owns what the goals ARE and whether they're
// met) and never touches game state. Wrapped by an AdjustablePanel in LiveGame, so
// size / placement / opacity / hide all come free from the shared HUD layout store,
// exactly like the other movable panels.
//
// Completed objectives collapse into an expandable "Completed" log at the bottom;
// only the next MAX_ACTIVE incomplete ones are foregrounded (a "+N more" hint
// counts the rest), so the panel always reads as a short to-do list of what to
// do next.
//
// The land-coverage objective runs a full country-grid scan, so evaluation is
// memoized on the whole-second game clock rather than every animation frame — a
// checkmark can lag reaching a goal by at most one game-second, imperceptible here.
export default function ObjectivesPanel({world, api, mySlot, flash}) {
    const second = Math.floor(world.time);
    const objectives = useMemo(
        () => evaluateObjectives(world, mySlot),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- throttled to the game-second clock; world/mySlot read inside
        [second, mySlot],
    );
    const {open: logOpen, toggle: toggleLog} = useDisclosure(false);
    const leadership = <LeadershipSection world={world} api={api} mySlot={mySlot} flash={flash}/>;
    // The panel still stands up as the leadership command surface even before any
    // objective exists, so don't bail purely on an empty objective list.
    if (!objectives.length) {
        if (!leadershipStatus(world, mySlot)) return null;
        return (
            <div className="w-[248px] rounded-lg bg-panel-2 border border-line shadow backdrop-blur-[14px] overflow-hidden"
                 role="region" aria-label="Objectives">
                {leadership}
            </div>
        );
    }

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
                    <button type="button" onClick={toggleLog}
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

            {leadership}
        </div>
    );
}
