import {useLayoutEffect, useRef, useState} from "react";
import {gdpOf, industryOutputOf, leadershipStatus, netIncomeOf, populationOf, stabilityStatus} from "../../game/engine.js";
import {GAME_SPEEDS} from "../../game/data/constants.js";
import {keyLabel, resolveKeys} from "../../game/platform/keybindings.js";
import {fmtNet, fmtPop} from "../common/format.js";
import {cn} from "../lib/cn.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SEC_PER_GS = 1800; // 30 in-game minutes per game-second

function gameDate(t) {
    const d = new Date(Date.UTC(2026, 0, 1) + t * SEC_PER_GS * 1000);
    return {
        date: `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`,
        time: `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`
    };
}

function leadColor(pct) {
    if (pct == null) return undefined;
    if (pct >= 67) return "#46d38a";
    if (pct >= 34) return "#ffb020";
    return "#ff3b3b";
}

function leadSub(lead) {
    if (!lead) return "";
    if (lead.exposed && lead.atWar) return lead.evac ? "Evacuating" : "Exposed";
    if (lead.inTransit > 0) return "Evacuating";
    if (lead.sheltered > 0) return "Sheltered";
    return "Secure";
}

// Stability shares Leadership's traffic-light palette; a collapsing nation (unrest
// timer running toward civil war) always shows red with a warning word.
function stabSub(stab) {
    if (!stab) return "";
    if (stab.collapsing) return "Collapse imminent";
    if (stab.pct >= 67) return "Stable";
    if (stab.pct >= 34) return "Strained";
    return "Unrest";
}

// Top-bar command screens, relocated here from the old left-side console.
const NAV = [
    {id: "production", label: "Production", glyph: "▣"},
    {id: "research", label: "Research", glyph: "❉"},
    {id: "diplomacy", label: "Diplomacy", glyph: "⚑"},
];

export default function LiveHud({world, api, myNation, panel, onPanel, keys}) {
    const K = resolveKeys(keys);
    const net = myNation ? netIncomeOf(world, myNation.slot) : 0;
    const pop = myNation ? populationOf(world, myNation.slot) : 0;
    const gdp = myNation ? gdpOf(world, myNation.slot) : 0;
    const ind = myNation ? industryOutputOf(world, myNation.slot) : 0;
    const lead = myNation ? leadershipStatus(world, myNation.slot) : null;
    const stab = myNation ? stabilityStatus(world, myNation.slot) : null;
    const alive = world.nations.filter((n) => n.alive).length;
    const {date, time} = gameDate(world.time);

    // Adaptive fit: on smaller/laptop screens the command bar is wider than the lane
    // its gutters leave it, so scale the whole bar down just enough to fit. Uses
    // transform: scale() (NOT the `zoom` property, which vanishes under backdrop-filter
    // on some Chromium builds — that hid the whole bar) with a readable floor so it
    // never shrinks to an illegible sliver; below the floor it may nudge slightly into
    // the gutters rather than disappear. transform doesn't affect layout, so scrollWidth
    // stays the true natural width (no measure->scale feedback), and a negative margin
    // pulls the ticker up to the bar's scaled bottom so there's no gap.
    const FIT_FLOOR = 0.82;
    const barRef = useRef(null);
    const [fit, setFit] = useState({scale: 1, mb: 0});
    useLayoutEffect(() => {
        const measure = () => {
            const bar = barRef.current, lane = bar?.parentElement;
            if (!bar || !lane) return;
            const avail = lane.clientWidth, natural = bar.scrollWidth;
            if (!avail || !natural) return;
            const scale = Math.max(FIT_FLOOR, Math.min(1, avail / natural));
            const mb = scale < 1 ? -Math.round(bar.offsetHeight * (1 - scale)) : 0;
            setFit((p) => (Math.abs(p.scale - scale) < 0.004 && p.mb === mb ? p : {scale, mb}));
        };
        measure();
        const bar = barRef.current, lane = bar?.parentElement;
        const ro = new ResizeObserver(measure);
        if (bar) ro.observe(bar);
        if (lane) ro.observe(lane);
        return () => ro.disconnect();
    }, []);

    return (
        <div
            ref={barRef}
            style={fit.scale < 1 ? {transform: `scale(${fit.scale})`, transformOrigin: "top center", marginBottom: fit.mb} : undefined}
            className="db-livehud relative z-5 flex flex-nowrap items-center gap-3 whitespace-nowrap py-[9px] pr-[10px] pl-4 bg-panel-2 border border-line rounded shadow-[var(--shadow),inset_0_1px_0_var(--hair)] backdrop-blur-[14px] pointer-events-auto motion-safe:animate-[gdDropInY_300ms_var(--ease-drawer)]">
            <div className="flex flex-col items-start leading-[1.15]"><span
                className="text-[9px] tracking-[1px] uppercase text-faint">Date</span><span
                className="text-sm font-bold font-mono">{date}</span><span
                className="text-[10px] text-dim">{time}</span></div>
            <div className="w-px self-stretch bg-line-soft"/>
            <div className="flex flex-col items-start leading-[1.05]"><span
                className="font-display text-2xl text-gold font-bold [text-shadow:var(--glow-gold)]">{Math.floor(myNation?.points ?? 0)}</span><span
                className={cn("font-mono text-[10px] text-dim uppercase tracking-[1px]", net < 0 && "text-danger")}>PTS · {fmtNet(net)}/s</span>
                {net < 0 && <span
                    className="mt-[3px] font-mono text-[9px] font-bold tracking-[1.5px] leading-none text-red border border-red rounded-sm px-[5px] py-[2px]">DEFICIT</span>}
            </div>
            <div className="w-px self-stretch bg-line-soft"/>
            <div className="flex gap-[3px] px-[3px] border-l border-r border-line-soft"
                 title={`${keyLabel(K.pause)} — Pause · ${keyLabel(K.speedDown)}/${keyLabel(K.speedUp)} — Speed · 1–5 — Speed Level`}>
                <button
                    className={cn("min-w-[30px] h-7 border border-transparent bg-transparent text-dim rounded text-xs font-mono font-semibold hover:text-text hover:bg-[rgba(160,168,178,0.1)]", world.paused && "bg-linear-to-b from-gold-hi to-gold text-gold-contrast border-transparent shadow-[var(--glow-gold)]")}
                    onClick={api.pause}
                    aria-pressed={world.paused}
                    title={`Pause (${keyLabel(K.pause)})`}>⏸
                </button>
                <button
                    className="min-w-[30px] h-7 border border-transparent bg-transparent text-dim rounded text-xs font-mono font-semibold hover:text-text hover:bg-[rgba(160,168,178,0.1)]"
                    onClick={api.play} aria-pressed={!world.paused}
                    title={`Resume (${keyLabel(K.pause)})`}>▶</button>
                {GAME_SPEEDS.map((s, i) => <button key={s}
                                                   className={cn("min-w-[30px] h-7 border border-transparent bg-transparent text-dim rounded text-xs font-mono font-semibold hover:text-text hover:bg-[rgba(160,168,178,0.1)]", !world.paused && world.speed === s && "bg-linear-to-b from-gold-hi to-gold text-gold-contrast border-transparent shadow-[var(--glow-gold)]")}
                                                   aria-pressed={!world.paused && world.speed === s}
                                                   onClick={() => api.setSpeed(s)}
                                                   title={`Speed ${s}× (${i + 1})`}>{s}×</button>)}
            </div>
            <div className="w-px self-stretch bg-line-soft"/>
            <div className="flex flex-col items-end leading-[1.15]"><span
                className="text-[9px] tracking-[1px] uppercase text-faint">GDP</span><span
                className="text-sm font-bold font-mono">${gdp.toFixed(2)}T</span><span
                className="text-[10px] text-dim">Industry +{ind.toFixed(1)}/s</span></div>
            <div className="w-px self-stretch bg-line-soft"/>
            <div className="flex flex-col items-end leading-[1.15]"><span
                className="text-[9px] tracking-[1px] uppercase text-faint">Population</span><span
                className="text-sm font-bold font-mono">{fmtPop(pop)}</span><span className="text-[10px] text-dim"
                                                                                    aria-live="polite">{alive} Powers Left</span>
            </div>
            {lead && <>
                <div className="w-px self-stretch bg-line-soft"/>
                <div className="flex flex-col items-end leading-[1.15]"
                     title="National leadership surviving — evacuate to the bunker to protect it"><span
                    className="text-[9px] tracking-[1px] uppercase text-faint">Leadership</span><span
                    className="text-sm font-bold font-mono"
                    style={{color: leadColor(lead.pct)}}>{lead.pct}%</span><span
                    className="text-[10px] text-dim" aria-live="polite">{leadSub(lead)}</span>
                </div>
            </>}
            {stab && <>
                <div className="w-px self-stretch bg-line-soft"/>
                <div className="flex flex-col items-end leading-[1.15]"
                     title="National stability — population loss, war, leadership loss/bunkering, and deficits erode it; hold at 0% too long and your nation fractures in civil war"><span
                    className="text-[9px] tracking-[1px] uppercase text-faint">Stability</span><span
                    className="text-sm font-bold font-mono"
                    style={{color: stab.collapsing ? "#ff3b3b" : leadColor(stab.pct)}}>{stab.pct}%</span><span
                    className={cn("text-[10px] text-dim", stab.collapsing && "text-red font-bold")}
                    aria-live="polite">{stabSub(stab)}</span>
                </div>
            </>}
            {onPanel && <>
                <div className="w-px self-stretch bg-line-soft"/>
                <div className="flex gap-[5px] flex-none">
                    {NAV.map((n) => (
                        <button key={n.id}
                                className={cn("flex items-center gap-[6px] px-[11px] py-[6px] font-display font-semibold text-[10.5px] tracking-[0.6px] uppercase whitespace-nowrap text-dim bg-sunk border border-line rounded-sm cursor-pointer transition-[border-color,color,background] duration-150 ease-out-gd hover:text-text hover:border-gold-line max-[1560px]:px-[9px]", panel === n.id && "text-gold-contrast bg-gold border-gold")}
                                onClick={() => onPanel(n.id)} title={`${n.label} (${keyLabel(K[n.id])})`}
                                aria-label={n.label}>
                            <span className="text-[13px] leading-none max-[1560px]:text-sm">{n.glyph}</span>
                            <span className="max-[1560px]:hidden">{n.label}</span>
                        </button>
                    ))}
                </div>
            </>}
        </div>
    );
}
