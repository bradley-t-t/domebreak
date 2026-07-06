import {WARHEAD_ICON, WARHEAD_ORDER, WARHEADS} from "../../game/data/constants.js";
import UnitIcon from "../common/UnitIcon.jsx";

// Top-right stockpile readout: how many warheads of each type the nation holds.
// Strikes from silos (ICBM) and launchers consume one per launch, so this is
// the player's at-a-glance "can I still shoot" indicator.
export default function AmmoBar({nation}) {
    if (!nation) return null;
    return (
        <div className="gd-ammobar">
            {WARHEAD_ORDER.map((t) => {
                const n = nation.ammo?.[t] ?? 0;
                return (
                    <span key={t} className={`gd-ammo-chip ${n === 0 ? "empty" : ""}`}
                          title={`${WARHEADS[t].name} warheads in stockpile: ${n}`}>
                        <UnitIcon name={WARHEAD_ICON[t]} color={WARHEADS[t].flame} size={13}/>
                        <b>{n}</b>
                    </span>
                );
            })}
        </div>
    );
}
