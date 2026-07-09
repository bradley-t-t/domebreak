import UnitIcon from "../common/UnitIcon.jsx";
import {WARHEADS} from "../../game/engine.js";
import {prodIcon, prodLabel, prodTime} from "../lib/prod.js";

// The national production line, docked bottom-center over the map: the item on
// the line with live progress, then everything queued behind it in order. Click
// any item to cancel it for a refund. Hidden entirely while the line is idle.
export default function ProductionBar({world, api, mySlot}) {
    const me = world.nations.find((n) => n.slot === mySlot);
    const cur = me?.prod?.current || null;
    const queue = me?.prod?.queue || [];
    if (!cur && queue.length === 0) return null;
    const label = (it) => prodLabel(it, me?.iso);
    const time = prodTime;
    const icon = prodIcon;
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
        <div
            className="pointer-events-auto flex items-center gap-[6px] max-w-[min(620px,52vw)] bg-panel border border-line rounded-lg px-[10px] py-[7px] shadow overflow-x-auto backdrop-blur-[12px] motion-safe:animate-[dbPop_220ms_var(--ease-out)]">
            <span
                className="font-display text-[9px] tracking-[1.5px] uppercase text-faint mr-1 whitespace-nowrap">Production</span>
            {/* Polite live region: re-announces only when the item on the line
                changes identity, so a new build start is spoken without narrating
                every percentage tick. */}
            <span className="sr-only" aria-live="polite">
                {cur ? `Now building ${label(cur.item)}` : ""}
            </span>
            {cur && (
                <button
                    className="relative overflow-hidden flex items-center gap-[6px] px-[9px] py-[5px] bg-btn-bg border border-gold-line rounded-sm text-text text-[11px] whitespace-nowrap cursor-pointer"
                    style={cur.item.kind === "ammo" ? {"--flame": WARHEADS[cur.item.type].flame} : undefined}
                    role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
                    aria-label={`Building ${label(cur.item)} — ${pct}%, ${eta}s remaining. Click to cancel for a refund.`}
                    title={`${label(cur.item)} — building. Click to cancel for a refund.`}
                    onClick={() => api.cancelProd(-1)}>
                    <i className="absolute left-0 top-0 bottom-0 bg-[var(--flame,var(--gold-soft))] opacity-[0.22] transition-[width] duration-300 ease-out-db pointer-events-none"
                       style={{width: `${pct}%`}}/>
                    <UnitIcon name={icon(cur.item)} size={14}/>
                    <span
                        className="relative z-1 max-w-[130px] overflow-hidden text-ellipsis">{label(cur.item)}</span>
                    <b className="relative z-1 font-mono text-[10.5px]">{pct}%</b>
                    <span
                        className="relative z-1 font-mono text-[9.5px] text-faint tracking-[0.3px]">{eta}s</span>
                </button>
            )}
            {groups.map((g) => (
                <button key={g.firstIndex}
                        className="group relative overflow-hidden flex items-center gap-[6px] px-[9px] py-[5px] bg-btn-bg border border-line rounded-sm text-dim text-[11px] whitespace-nowrap cursor-pointer hover:text-text hover:border-line-soft"
                        style={g.item.kind === "ammo" ? {"--flame": WARHEADS[g.item.type].flame} : undefined}
                        title={g.count > 1
                            ? `${label(g.item)} ×${g.count} queued · ${time(g.item)}s each. Click to cancel one for a refund.`
                            : `${label(g.item)} · ${time(g.item)}s on the line. Click to cancel for a refund.`}
                        onClick={() => api.cancelProd(g.lastIndex)}>
                    <UnitIcon name={icon(g.item)} size={14}/>
                    <span className="max-w-[130px] overflow-hidden text-ellipsis">{label(g.item)}</span>
                    {g.count > 1 && <b
                        className="flex-none font-mono text-[10px] leading-none px-[5px] py-0.5 rounded-full bg-gold-soft text-text">×{g.count}</b>}
                    <span
                        className="text-danger text-xs leading-none opacity-0 transition-opacity duration-[120ms] ease-out-db group-hover:opacity-100">×</span>
                </button>
            ))}
        </div>
    );
}
