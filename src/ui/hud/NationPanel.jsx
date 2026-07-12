import {useMemo, useState} from "react";
import {
    gdpOf,
    hasSurrendered,
    industryCapOf,
    industryCountOf,
    industryOutputOf,
    industryPendingOf,
    netIncomeOf,
    populationOf,
    populationTrendOf,
    vitalityOf,
} from "../../game/engine.js";
import {fmtGdp, fmtNet, fmtPop} from "../lib/format.js";
import Flag from "../common/Flag.jsx";
import Icon from "../common/Icon.jsx";
import Meter from "../common/Meter.jsx";
import PopTrend from "../common/PopTrend.jsx";
import {cn} from "../lib/cn.js";

// A territory's readiness band from its city vitality (hp share). Drives the
// status pill colour and label; a dead holding reads "Lost".
function statusOf(c) {
    if (!c.alive) return {key: "lost", label: "Lost"};
    const v = vitalityOf(c);
    if (v >= 0.85) return {key: "secure", label: "Secure"};
    if (v >= 0.5) return {key: "strained", label: "Strained"};
    return {key: "critical", label: "Critical"};
}

// Left-docked command panel: our nation at a glance — population, GDP, industry
// (living structures vs the pop-driven ceiling), net points — over a live,
// scrollable roster of every state we hold and its current status. Reads engine
// queries only; never mutates. Clicking a territory flies the camera to it.
export default function NationPanel({world, mySlot, myNation, onFocus}) {
    const [collapsed, setCollapsed] = useState(false);

    // Recomputed each tick (world.time advances) so population, vitality, and
    // the territory roster stay live as cities take damage or fall.
    const view = useMemo(() => {
        const mine = world.cities.filter((c) => c.slot === mySlot);
        const living = mine.filter((c) => c.alive);
        // Living holdings first, biggest population at top; lost ones sink below.
        const rows = [...mine].sort((a, b) => {
            if (a.alive !== b.alive) return a.alive ? -1 : 1;
            return (b.pop || 0) * vitalityOf(b) - (a.pop || 0) * vitalityOf(a);
        });
        // Owner standing gates the per-city "rebuilding" caret, matching healCities.
        const me = world.nations.find((n) => n.slot === mySlot);
        return {
            rows,
            heldCount: living.length,
            totalCount: mine.length,
            standing: !!me && me.alive && !hasSurrendered(world, me),
            pop: populationOf(world, mySlot),
            popRate: populationTrendOf(world, mySlot),
            gdp: gdpOf(world, mySlot),
            net: netIncomeOf(world, mySlot),
            indCount: industryCountOf(world, mySlot),
            indPending: industryPendingOf(world, mySlot),
            indCap: industryCapOf(world, mySlot),
            indOut: industryOutputOf(world, mySlot),
        };
        // world is mutated in place (stable ref), so key off world.time — it
        // advances every tick — to keep this recompute live, matching every other
        // world-derived memo. Omitting it froze the panel at first-mount values,
        // so population/GDP/roster drifted from the live HUD and player list.
        // eslint-disable-next-line react-hooks/exhaustive-deps -- world read inside; world.time is the tick clock we intend to key on
    }, [world, world.time, mySlot]);

    if (!myNation) return null;
    const indUsed = view.indCount + view.indPending;
    const indFrac = view.indCap > 0 ? Math.min(1, indUsed / view.indCap) : 0;

    const pillClass = {
        secure: "text-dim border-line",
        strained: "text-[#d79a3f] border-[rgba(215,154,63,0.5)]",
        critical: "text-red border-[rgba(224,87,79,0.5)]",
        lost: "text-faint border-line",
    };

    return (
        <aside
            className={cn("w-[246px] max-h-[calc(100vh-132px)] flex flex-col bg-panel border border-line rounded-lg shadow-[var(--shadow),inset_0_1px_0_var(--hair)] backdrop-blur-[14px] pointer-events-auto overflow-hidden motion-safe:animate-[dbDropIn_300ms_var(--ease-drawer)]", collapsed && "w-[246px]")}
            aria-label="Nation status">
            <div className="flex items-center gap-[10px] px-3 py-[11px] border-b border-hair">
                <Flag iso={myNation.iso} className="w-[26px] h-[18px] rounded-sm shadow-[0_0_0_1px_var(--line)] flex-none"/>
                <div className="flex flex-col leading-[1.15] min-w-0 flex-1">
                    <span
                        className="font-display text-[15px] font-bold text-text whitespace-nowrap overflow-hidden text-ellipsis">{myNation.name}</span>
                    <span className="text-[9.5px] tracking-[1px] uppercase text-faint">Your Command</span>
                </div>
                <button
                    className="w-6 h-6 border border-line rounded-sm bg-transparent text-dim text-[11px] flex-none transition-[border-color,color] duration-150 ease-out-db hover:text-text hover:border-line-soft"
                    onClick={() => setCollapsed((v) => !v)}
                    title={collapsed ? "Expand" : "Collapse"}
                    aria-label={collapsed ? "Expand nation panel" : "Collapse nation panel"}>
                    {collapsed ? "▸" : "▾"}
                </button>
            </div>

            {!collapsed && <>
                <div className="grid grid-cols-2 gap-px bg-hair border-b border-hair">
                    <div className="flex flex-col gap-0.5 px-3 py-[9px] bg-panel">
                        <span className="text-[9.5px] tracking-[0.8px] uppercase text-faint">Population</span>
                        <span className="font-display text-[15px] font-semibold text-text inline-flex items-center gap-[4px]">
                            {fmtPop(view.pop)}
                            <PopTrend rate={view.popRate} base={view.pop} className="text-[11px]"/>
                        </span>
                    </div>
                    <div className="flex flex-col gap-0.5 px-3 py-[9px] bg-panel">
                        <span className="text-[9.5px] tracking-[0.8px] uppercase text-faint">GDP</span>
                        <span className="font-display text-[15px] font-semibold text-text">{fmtGdp(view.gdp)}</span>
                    </div>
                    <div className="flex flex-col gap-0.5 px-3 py-[9px] bg-panel">
                        <span className="text-[9.5px] tracking-[0.8px] uppercase text-faint">Net</span>
                        <span
                            className={cn("font-display text-[15px] font-semibold text-text", view.net < 0 && "text-red")}>{fmtNet(view.net, 1)}/s</span>
                    </div>
                    <div className="flex flex-col gap-0.5 px-3 py-[9px] bg-panel">
                        <span className="text-[9.5px] tracking-[0.8px] uppercase text-faint">Territories</span>
                        <span className="font-display text-[15px] font-semibold text-text">{view.heldCount}<span
                            className="text-faint font-normal text-xs">/{view.totalCount}</span></span>
                    </div>
                </div>

                <div className="px-3 py-[10px] border-b border-hair"
                     title={`${view.indCount} standing${view.indPending ? ` + ${view.indPending} in production` : ""} of ${view.indCap} industry slots (factories, ports, refineries, tech parks). Cap grows with population. Combined output +${view.indOut.toFixed(1)} pts/s.`}>
                    <div className="flex items-baseline justify-between mb-[6px]">
                        <span className="text-[9.5px] tracking-[0.8px] uppercase text-faint">Industry (used / cap)</span>
                        <span className="font-display text-[12.5px] text-dim">{indUsed}<span
                            className="text-faint font-normal text-xs">/{view.indCap}</span> · +{view.indOut.toFixed(1)}/s</span>
                    </div>
                    <Meter frac={indFrac} className="h-[5px] rounded-[3px] bg-hair"
                           fillClass="rounded-[3px] bg-linear-to-r from-dim to-text duration-[400ms]"/>
                </div>

                <div
                    className="px-3 pt-[9px] pb-[5px] text-[9.5px] tracking-[1px] uppercase text-faint">Territories
                </div>
                <div className="db-scroll flex-1 overflow-y-auto px-[6px] pb-2">
                    {view.rows.map((c) => {
                        const st = statusOf(c);
                        const v = vitalityOf(c);
                        return (
                            <button key={c.id}
                                    className={cn("flex items-center justify-between gap-2 w-full px-2 py-[7px] border-none rounded-sm bg-transparent text-left cursor-pointer transition-[background] duration-150 ease-out-db hover:bg-hair", !c.alive && "opacity-55")}
                                    onClick={() => onFocus?.(c)} title={`Focus ${c.name}`}>
                                <span className="flex flex-col leading-[1.2] min-w-0">
                                    <span className="flex items-center gap-1 text-[12.5px] text-text max-w-[132px]">
                                        {!!c.cap && <Icon name="star" size={9} className="text-gold flex-none" title="Capital"/>}
                                        <span className="whitespace-nowrap overflow-hidden text-ellipsis">{c.name}</span></span>
                                    {c.state && <span
                                        className="text-[10px] text-faint whitespace-nowrap overflow-hidden text-ellipsis max-w-[132px]">{c.state}</span>}
                                </span>
                                <span className="flex flex-col items-end gap-[3px] flex-none">
                                    <span
                                        className="font-display text-[11.5px] text-dim inline-flex items-center gap-[3px]">{c.alive ? fmtPop((c.pop || 0) * v) : "—"}
                                        {c.alive && view.standing && (c.pop || 0) > 0 && c.hp < c.maxHp &&
                                            <PopTrend up title="Rebuilding — population recovering as the city heals" className="text-[9px]"/>}
                                    </span>
                                    <span
                                        className={cn("text-[9px] tracking-[0.4px] uppercase px-[6px] py-px rounded-full border border-line text-dim", pillClass[st.key])}>{st.label}</span>
                                </span>
                            </button>
                        );
                    })}
                    {view.rows.length === 0 &&
                        <div className="px-3 py-3 text-center text-faint text-xs">No territories held.</div>}
                </div>
            </>}
        </aside>
    );
}
