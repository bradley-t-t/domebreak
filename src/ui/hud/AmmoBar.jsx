import {WARHEAD_ICON, WARHEAD_ORDER, WARHEADS} from "../../game/data/constants.js";
import UnitIcon from "../common/UnitIcon.jsx";
import {cn} from "../lib/cn.js";

// Top-right stockpile readout: how many warheads of each type the nation holds.
// Strikes from silos (ICBM) and launchers consume one per launch, so this is
// the player's at-a-glance "can I still shoot" indicator.
export default function AmmoBar({nation}) {
    if (!nation) return null;
    return (
        <div
            className="flex items-center gap-3 h-[38px] px-[13px] rounded border border-line bg-panel backdrop-blur-[8px]">
            {WARHEAD_ORDER.map((t) => {
                const n = nation.ammo?.[t] ?? 0;
                return (
                    <span key={t} className={cn("flex items-center gap-[5px] cursor-default", n === 0 && "opacity-40")}
                          role="img" aria-label={`${WARHEADS[t].name} warheads: ${n}`}
                          title={`${WARHEADS[t].name} warheads in stockpile: ${n}`}>
                        <UnitIcon name={WARHEAD_ICON[t]} color={WARHEADS[t].flame} size={13}/>
                        <b className="text-text text-[12.5px] tabular-nums" aria-hidden="true">{n}</b>
                    </span>
                );
            })}
        </div>
    );
}
