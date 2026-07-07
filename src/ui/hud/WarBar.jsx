import {Swords} from "lucide-react";
import {atWar} from "../../game/engine.js";
import Flag from "../common/Flag.jsx";

// Horizontal strip of the flags of every nation the player is currently at war
// with — an at-a-glance belligerents readout that sits above the map layer bar.
// Renders nothing while the player is at peace with the whole world, so the
// strip only appears once a war is on.
export default function WarBar({world, mySlot}) {
    const enemies = world.nations.filter(
        (n) => n.slot !== mySlot && n.alive && atWar(world, mySlot, n.slot)
    );
    if (!enemies.length) return null;
    return (
        <div className="flex flex-row flex-wrap items-center justify-end gap-[7px] max-w-[440px] rounded-lg bg-panel border border-line px-[10px] py-[6px] shadow backdrop-blur-[12px]"
             role="group" aria-label={`At war with ${enemies.length} ${enemies.length === 1 ? "nation" : "nations"}`}>
            <span className="flex items-center gap-[5px] pr-[8px] border-r border-line-soft text-red">
                <Swords size={13} aria-hidden="true"/>
                <span className="font-mono text-[9px] font-semibold tracking-[1.2px] uppercase">At War</span>
            </span>
            {enemies.map((n) => (
                <span key={n.slot} className="grid place-items-center text-[18px] leading-none"
                      title={`At war with ${n.name}`}>
                    <Flag iso={n.iso} className="shadow-[0_0_0_1.5px_var(--red)]"/>
                </span>
            ))}
        </div>
    );
}
