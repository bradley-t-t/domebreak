import UnitIcon from "../common/UnitIcon.jsx";
import {UNIT_ICON, unitLabel, UNITS, WARHEADS} from "../../game/engine.js";
import {DEFAULT_BUILD_TIME, WARHEAD_ICON} from "../../game/data/constants.js";

// The national production line, docked bottom-center over the map: the item on
// the line with live progress, then everything queued behind it in order. Click
// any item to cancel it for a refund. Hidden entirely while the line is idle.
export default function ProductionBar({world, api, mySlot}) {
    const me = world.nations.find((n) => n.slot === mySlot);
    const cur = me?.prod?.current || null;
    const queue = me?.prod?.queue || [];
    if (!cur && queue.length === 0) return null;
    const label = (it) => (it.kind === "ammo" ? WARHEADS[it.type].name : unitLabel(it.type, me?.iso));
    const time = (it) => (it.kind === "ammo" ? WARHEADS[it.type].prodTime : (UNITS[it.type].buildTime || DEFAULT_BUILD_TIME));
    const icon = (it) => (it.kind === "ammo" ? WARHEAD_ICON[it.type] : UNIT_ICON[it.type]);
    const pct = cur ? Math.round(cur.progress * 100) : 0;
    return (
        <div className="gd-prodbar">
            <span className="gd-prodbar-t">Production</span>
            {cur && (
                <button className="gd-prodbar-item building"
                        style={cur.item.kind === "ammo" ? {"--flame": WARHEADS[cur.item.type].flame} : undefined}
                        title={`${label(cur.item)} — building. Click to cancel for a refund.`}
                        onClick={() => api.cancelProd(-1)}>
                    <i className="gd-prodbar-fill" style={{width: `${pct}%`}}/>
                    <UnitIcon name={icon(cur.item)} size={14}/>
                    <span className="gd-prodbar-name">{label(cur.item)}</span>
                    <b>{pct}%</b>
                </button>
            )}
            {queue.map((it, i) => (
                <button key={i} className="gd-prodbar-item"
                        style={it.kind === "ammo" ? {"--flame": WARHEADS[it.type].flame} : undefined}
                        title={`${label(it)} · ${time(it)}s on the line. Click to cancel for a refund.`}
                        onClick={() => api.cancelProd(i)}>
                    <UnitIcon name={icon(it)} size={14}/>
                    <span className="gd-prodbar-name">{label(it)}</span>
                    <span className="gd-prodbar-x">×</span>
                </button>
            ))}
        </div>
    );
}
