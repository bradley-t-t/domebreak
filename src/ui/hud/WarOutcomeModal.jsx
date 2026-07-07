// War outcome / peace-offer modal. Shows the front entry of world.warPopups —
// enqueued by the engine only when the player is a belligerent (see
// sim/warResolution.js). victory/defeat/whitepeace/refused are informational
// (Continue); offer is an interactive Accept/Decline white peace.
//
// In single-player the modal pauses the sim while it's up and resumes on close —
// unless the player had already paused manually. Online matches never pause (they
// are speed-locked), so the modal is non-blocking there. All a11y (focus trap,
// Escape, focus restore) comes from useModal.
import {nationName} from "../../game/engine.js";
import {useModal} from "../hooks/useModal.js";
import {button, card, overlay, sub} from "../lib/variants.js";
import {cn} from "../lib/cn.js";
import Flag from "../common/Flag.jsx";

// Per-kind copy + accent. `foe` is the other belligerent's display name.
function content(kind, foe) {
    switch (kind) {
        case "victory":
            return {
                title: "Victory", tone: "text-good [text-shadow:0_0_26px_rgba(62,227,139,0.55)]",
                body: `${foe} has surrendered. Every territory you occupied is yours to keep.`,
            };
        case "defeat":
            return {
                title: "Defeat", tone: "text-danger [text-shadow:0_0_24px_rgba(255,91,110,0.5)]",
                body: `You have surrendered to ${foe}. The land they occupied is lost, and your nation is shaken for a year to come.`,
            };
        case "whitepeace":
            return {
                title: "White Peace", tone: "text-dim",
                body: `You and ${foe} agree to end the war. All occupied territory returns to its rightful owner — no ground changes hands.`,
            };
        case "offer":
            return {
                title: "Peace Offer", tone: "text-dim",
                body: `${foe} offers a white peace — end the war now, with both sides returning to their pre-war borders.`,
            };
        case "refused":
        default:
            return {
                title: "Offer Rejected", tone: "text-dim",
                body: `${foe} refuses your peace offer. The war goes on.`,
            };
    }
}

export default function WarOutcomeModal({world, api}) {
    const pop = world.warPopups?.[0];
    const isOffer = pop?.kind === "offer";
    const onClose = () => {
        if (!pop) return;
        if (isOffer) api.respondPeace(pop.foe, false);   // Escape / backdrop = decline
        else api.dismissWarPopup(pop.id);
    };
    const ref = useModal(onClose);
    // Pause/resume side-effect lives in the parent (LiveGame) so hooks here stay
    // unconditional even when `pop` is briefly undefined between renders.
    if (!pop) return null;

    const foeNation = world.nations.find((n) => n.slot === pop.foe);
    const foe = nationName(world, pop.foe);
    const {title, tone, body} = content(pop.kind, foe);

    return (
        <div className={overlay({placement: "center"})} role="dialog" aria-modal="true"
             aria-labelledby="db-war-title" ref={ref} tabIndex={-1}>
            <div className={cn(card({size: "wide"}), "motion-safe:animate-[dbPop_240ms_var(--ease-out)]")}>
                {foeNation?.iso &&
                    <Flag iso={foeNation.iso} className="mx-auto mb-3 text-[26px] rounded-[3px] shadow-[0_0_0_1px_var(--line)]"/>}
                <div id="db-war-title"
                     className={cn("font-display text-[34px] font-bold tracking-[3px] uppercase text-center mb-3", tone)}>{title}</div>
                <p className={sub()}>{body}</p>
                {isOffer ? (
                    <div className="flex gap-[10px]">
                        <button className={cn(button(), "flex-1")} onClick={() => api.respondPeace(pop.foe, false)}>Decline</button>
                        <button className={cn(button({variant: "primary"}), "flex-1")} onClick={() => api.respondPeace(pop.foe, true)}>Accept</button>
                    </div>
                ) : (
                    <button className={cn(button({variant: "primary"}), "w-full")}
                            onClick={() => api.dismissWarPopup(pop.id)}>Continue</button>
                )}
            </div>
        </div>
    );
}
