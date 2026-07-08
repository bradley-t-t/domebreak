import {Handshake, Swords} from "lucide-react";
import {atWar} from "../../game/engine.js";
import Flag from "../common/Flag.jsx";
import {cn} from "../lib/cn.js";

// One labelled standing readout — a header chip (icon + tone-colored label) and
// the ringed flags of every nation in that standing. Shared by the war and ally
// groups so both read identically apart from color and copy.
function StandingGroup({icon: Icon, label, tone, verb, nations}) {
    const ring = tone === "war" ? "shadow-[0_0_0_1.5px_var(--red)]" : "shadow-[0_0_0_1.5px_var(--ally)]";
    return (
        <div className="flex flex-row flex-wrap items-center justify-end gap-[7px] max-w-[440px] rounded-lg bg-panel border border-line px-[10px] py-[6px] shadow backdrop-blur-[12px]"
             role="group" aria-label={`${label} — ${nations.length} ${nations.length === 1 ? "nation" : "nations"}`}>
            <span className={cn("flex items-center gap-[5px] pr-[8px] border-r border-line-soft",
                tone === "war" ? "text-red" : "text-[color:var(--ally)]")}>
                <Icon size={13} aria-hidden="true"/>
                <span className="font-mono text-[9px] font-semibold tracking-[1.2px] uppercase">{label}</span>
            </span>
            {nations.map((n) => (
                <span key={n.slot} className="grid place-items-center text-[18px] leading-none"
                      title={`${verb} ${n.name}`}>
                    <Flag iso={n.iso} className={ring}/>
                </span>
            ))}
        </div>
    );
}

// Bottom-right diplomacy readout: an at-a-glance list of the player's current
// alliances and active wars, each in its own labelled group so allies read as
// allied (blue) and never get lumped under the war strip. Allies sit above the
// wars. Renders nothing while the player has no alliances and no wars, so it
// only appears once a standing exists.
export default function WarBar({world, mySlot}) {
    const me = world.nations.find((n) => n.slot === mySlot);
    const enemies = world.nations.filter(
        (n) => n.slot !== mySlot && n.alive && atWar(world, mySlot, n.slot)
    );
    const allies = world.nations.filter(
        (n) => n.slot !== mySlot && n.alive && me?.relations[n.slot] === "ally"
    );
    if (!enemies.length && !allies.length) return null;
    return (
        <div className="flex flex-col items-end gap-[6px]">
            {allies.length > 0 && (
                <StandingGroup icon={Handshake} label="Allies" tone="ally" verb="Allied with" nations={allies}/>
            )}
            {enemies.length > 0 && (
                <StandingGroup icon={Swords} label="At War" tone="war" verb="At war with" nations={enemies}/>
            )}
        </div>
    );
}
