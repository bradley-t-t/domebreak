import {leadershipStatus} from "../../game/engine.js";
import "./LiveHud.css";

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
        const remaining = s.atCity + s.inTransit;
        return (
            <div className="gd-lead-alert evac" role="status" aria-live="polite">
                <div className="gd-lead-icon">⬢</div>
                <div className="gd-lead-body">
                    <div className="gd-lead-title">Evacuating Leadership</div>
                    <div className="gd-lead-text">{s.sheltered} sheltered · {remaining} still exposed{s.lost ? ` · ${s.lost} lost` : ""}</div>
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
        <div className="gd-lead-alert warn" role="alert" aria-live="assertive">
            <div className="gd-lead-icon">⚠</div>
            <div className="gd-lead-body">
                <div className="gd-lead-title">Leadership Exposed — War Declared</div>
                <div className="gd-lead-text">Your national command is spread across {where}. Airlift them to the
                    bunker before an enemy strike decapitates you.</div>
                {hint && <div className="gd-lead-hint">{hint}</div>}
            </div>
            <button className="gd-lead-btn" disabled={!canShelter}
                    title={canShelter ? "Auto-dispatch transports to evacuate leadership" : hint || ""}
                    onClick={() => api.shelterLeadership()}>Shelter Leadership
            </button>
        </div>
    );
}
