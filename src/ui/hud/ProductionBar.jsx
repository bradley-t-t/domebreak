import UnitIcon from "../common/UnitIcon.jsx";
import {UNIT_ICON, unitLabel, UNITS, WARHEADS} from "../../game/engine.js";
import {DEFAULT_BUILD_TIME, WARHEAD_ICON} from "../../game/data/constants.js";
import "./ProductionBar.css";

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
    // Seconds of work left on the item currently on the line (whole-second, at 1×
    // game speed) — a concrete countdown alongside the percentage.
    const eta = cur ? Math.max(0, Math.ceil(time(cur.item) * (1 - cur.progress))) : 0;
    // Collapse consecutive identical orders into one pill with a ×count, so a
    // long spam-queue reads as "ICBM ×12" instead of a mile-long strip of pills.
    // Build order is preserved — only adjacent same-item runs merge. Canceling a
    // group removes its last-queued instance (LIFO), keeping the rest in place.
    const groups = [];
    queue.forEach((it, i) => {
        const sig = `${it.kind}:${it.type}`;
        const last = groups[groups.length - 1];
        if (last && last.sig === sig) {
            last.count++;
            last.lastIndex = i;
        } else {
            groups.push({sig, item: it, count: 1, firstIndex: i, lastIndex: i});
        }
    });
    return (
        <div className="gd-prodbar">
            <span className="gd-prodbar-t">Production</span>
            {/* Polite live region: re-announces only when the item on the line
                changes identity, so a new build start is spoken without narrating
                every percentage tick. */}
            <span className="gd-sr-only" aria-live="polite">
                {cur ? `Now building ${label(cur.item)}` : ""}
            </span>
            {cur && (
                <button className="gd-prodbar-item building"
                        style={cur.item.kind === "ammo" ? {"--flame": WARHEADS[cur.item.type].flame} : undefined}
                        role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
                        aria-label={`Building ${label(cur.item)} — ${pct}%, ${eta}s remaining. Click to cancel for a refund.`}
                        title={`${label(cur.item)} — building. Click to cancel for a refund.`}
                        onClick={() => api.cancelProd(-1)}>
                    <i className="gd-prodbar-fill" style={{width: `${pct}%`}}/>
                    <UnitIcon name={icon(cur.item)} size={14}/>
                    <span className="gd-prodbar-name">{label(cur.item)}</span>
                    <b>{pct}%</b>
                    <span className="gd-prodbar-eta">{eta}s</span>
                </button>
            )}
            {groups.map((g) => (
                <button key={g.firstIndex} className="gd-prodbar-item"
                        style={g.item.kind === "ammo" ? {"--flame": WARHEADS[g.item.type].flame} : undefined}
                        title={g.count > 1
                            ? `${label(g.item)} ×${g.count} queued · ${time(g.item)}s each. Click to cancel one for a refund.`
                            : `${label(g.item)} · ${time(g.item)}s on the line. Click to cancel for a refund.`}
                        onClick={() => api.cancelProd(g.lastIndex)}>
                    <UnitIcon name={icon(g.item)} size={14}/>
                    <span className="gd-prodbar-name">{label(g.item)}</span>
                    {g.count > 1 && <b className="gd-prodbar-mult">×{g.count}</b>}
                    <span className="gd-prodbar-x">×</span>
                </button>
            ))}
        </div>
    );
}
