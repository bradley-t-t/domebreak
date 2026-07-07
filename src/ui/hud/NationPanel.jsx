import {useMemo, useState} from "react";
import {
    gdpOf,
    industryCapOf,
    industryCountOf,
    industryOutputOf,
    netIncomeOf,
    populationOf,
    vitalityOf,
} from "../../game/engine.js";
import {fmtNet, fmtPop} from "../common/format.js";
import Flag from "../common/Flag.jsx";
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
        return {
            rows,
            heldCount: living.length,
            totalCount: mine.length,
            pop: populationOf(world, mySlot),
            gdp: gdpOf(world, mySlot),
            net: netIncomeOf(world, mySlot),
            indCount: industryCountOf(world, mySlot),
            indCap: industryCapOf(world, mySlot),
            indOut: industryOutputOf(world, mySlot),
        };
    }, [world, mySlot]);

    if (!myNation) return null;
    const indFrac = view.indCap > 0 ? Math.min(1, view.indCount / view.indCap) : 0;

    const pillClass = {
        secure: "text-dim border-line",
        strained: "text-[#d79a3f] border-[rgba(215,154,63,0.5)]",
        critical: "text-red border-[rgba(224,87,79,0.5)]",
        lost: "text-faint border-line",
    };

    return (
        <aside
            className={cn("absolute top-4 left-4 z-5 w-[246px] max-h-[calc(100vh-132px)] flex flex-col bg-panel border border-line rounded-lg shadow-[var(--shadow),inset_0_1px_0_var(--hair)] backdrop-blur-[14px] pointer-events-auto overflow-hidden motion-safe:animate-[dbDropIn_300ms_var(--ease-drawer)]", collapsed && "w-[246px]")}
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
                        <span className="font-display text-[15px] font-semibold text-text">{fmtPop(view.pop)}</span>
                    </div>
                    <div className="flex flex-col gap-0.5 px-3 py-[9px] bg-panel">
                        <span className="text-[9.5px] tracking-[0.8px] uppercase text-faint">GDP</span>
                        <span className="font-display text-[15px] font-semibold text-text">${view.gdp.toFixed(2)}T</span>
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

                <div className="px-3 py-[10px] border-b border-hair">
                    <div className="flex items-baseline justify-between mb-[6px]">
                        <span className="text-[9.5px] tracking-[0.8px] uppercase text-faint">Industry</span>
                        <span className="font-display text-[12.5px] text-dim">{view.indCount}<span
                            className="text-faint font-normal text-xs">/{view.indCap}</span> · +{view.indOut.toFixed(1)}/s</span>
                    </div>
                    <div className="h-[5px] rounded-[3px] bg-hair overflow-hidden">
                        <div className="h-full rounded-[3px] bg-linear-to-r from-dim to-text transition-[width] duration-[400ms] ease-out-db"
                             style={{width: `${indFrac * 100}%`}}/>
                    </div>
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
                                    <span
                                        className="text-[12.5px] text-text whitespace-nowrap overflow-hidden text-ellipsis max-w-[132px]">{c.cap ? "★ " : ""}{c.name}</span>
                                    {c.state && <span
                                        className="text-[10px] text-faint whitespace-nowrap overflow-hidden text-ellipsis max-w-[132px]">{c.state}</span>}
                                </span>
                                <span className="flex flex-col items-end gap-[3px] flex-none">
                                    <span
                                        className="font-display text-[11.5px] text-dim">{c.alive ? fmtPop((c.pop || 0) * v) : "—"}</span>
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
