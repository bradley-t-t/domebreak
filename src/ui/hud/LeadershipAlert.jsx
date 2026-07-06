import {leadershipStatus} from "../../game/engine.js";
import {cn} from "../lib/cn.js";

// Persistent, non-dismissing leadership prompt (see design/gdd/leadership.md).
// Derives entirely from world state — it owns no state and dispatches the normal
// shelterLeadership order — so it self-arms while the player is at war with leaders
// still exposed, and self-clears once they are sheltered or lost. It never closes
// on a timer. Once the airlift is underway it becomes a passive progress readout.
export default function LeadershipAlert({world, api, mySlot}) {
    if (world.over) return null;
    const s = leadershipStatus(world, mySlot);
    if (!s) return null;

    const showPrompt = s.atWar && s.exposed && !s.evac;
    // Only the inbound (shelter) airlift shows a progress banner; a release run is
    // driven from the bunker panel, not the war alert.
    const showProgress = s.mode === "shelter" && (s.exposed || s.inTransit > 0);
    if (!showPrompt && !showProgress) return null;

    if (showProgress) {
        // Leadership reads as a share of national command, never a headcount:
        // "X% evacuated · Y% exposed". atCity + inTransit are still at risk until
        // they land in the bunker, so both count as exposed.
        const total = s.total || 1;
        const pctOf = (v) => Math.round((v / total) * 100);
        const evacuated = pctOf(s.sheltered);
        const exposed = pctOf(s.atCity + s.inTransit);
        const lost = pctOf(s.lost);
        return (
            <div className={cn(
                "relative z-[8] flex items-center gap-3 max-w-[min(560px,78vw)] py-2.5 px-3.5 rounded-[var(--radius)] bg-panel [backdrop-filter:blur(10px)] shadow-[var(--shadow)] text-text",
                "border border-[rgba(244,192,42,0.45)]"
            )} role="status" aria-live="polite">
                <div className="text-xl leading-none text-red flex-none text-[#f4c02a]">⬢</div>
                <div className="flex-1 min-w-0">
                    <div className="font-bold text-xs tracking-[0.4px] mb-0.5">Evacuating Leadership</div>
                    <div className="text-xs text-[#aab1ba] leading-[1.35]">{evacuated}% evacuated · {exposed}% exposed{s.lost ? ` · ${lost}% lost` : ""}</div>
                </div>
            </div>
        );
    }

    const canShelter = s.hasBunker && s.hasAirstrip;
    const hint = !s.hasBunker ? "Build a Leadership Bunker to shelter your leaders."
        : !s.hasAirstrip ? "Build an Airstrip to fly the evacuation." : null;
    const where = s.sites.length
        ? s.sites.slice(0, 3).join(", ") + (s.sites.length > 3 ? `, +${s.sites.length - 3} more` : "")
        : "the field";
    return (
        <div className={cn(
            "absolute top-[108px] left-1/2 -translate-x-1/2 z-[8] flex items-center gap-3 max-w-[min(560px,78vw)] py-2.5 px-3.5 rounded-[var(--radius)] bg-panel [backdrop-filter:blur(10px)] shadow-[var(--shadow)] text-text",
            "border border-red animate-[gd-lead-pulse_1.8s_ease-in-out_infinite] motion-reduce:animate-none"
        )} role="alert" aria-live="assertive">
            <div className="text-xl leading-none text-red flex-none">⚠</div>
            <div className="flex-1 min-w-0">
                <div className="font-bold text-xs tracking-[0.4px] mb-0.5">Leadership Exposed — War Declared</div>
                <div className="text-xs text-[#aab1ba] leading-[1.35]">Your national command is spread across {where}. Airlift them to the
                    bunker before an enemy strike decapitates you.</div>
                {hint && <div className="mt-1 text-[11px] font-mono text-[#f4c02a]">{hint}</div>}
            </div>
            <button className="flex-none font-bold text-xs tracking-[0.4px] text-ink bg-red border-0 rounded-sm py-2 px-3 cursor-pointer enabled:hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!canShelter}
                    title={canShelter ? "Auto-dispatch transports to evacuate leadership" : hint || ""}
                    onClick={() => api.shelterLeadership()}>Shelter Leadership
            </button>
        </div>
    );
}
