import {useLayoutEffect, useRef, useState} from "react";
import {gdpOf, industryOutputOf, leadershipStatus, netIncomeOf, populationOf, stabilityBreakdown, stabilityStatus} from "../../game/engine.js";
import {GAME_SPEEDS} from "../../game/data/constants.js";
import {keyLabel, resolveKeys} from "../../game/platform/keybindings.js";
import {fmtGdp, fmtNet, fmtPop} from "../lib/format.js";
import {cn} from "../lib/cn.js";
import AmmoBar from "./AmmoBar.jsx";
import {iconButton, popoverCard} from "../lib/variants.js";
import {vitColor} from "../lib/status.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SEC_PER_GS = 1800; // 30 in-game minutes per game-second

function gameDate(t) {
    const d = new Date(Date.UTC(2026, 0, 1) + t * SEC_PER_GS * 1000);
    return {
        date: `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`,
        time: `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`
    };
}

function leadSub(lead) {
    if (!lead) return "";
    if (lead.exposed && lead.atWar) return lead.evac ? "Evacuating" : "Exposed";
    if (lead.inTransit > 0) return "Evacuating";
    if (lead.sheltered > 0) return "Sheltered";
    return "Secure";
}

// Stability shares Leadership's traffic-light palette, with a one-word mood.
function stabSub(stab) {
    if (!stab) return "";
    if (stab.pct >= 67) return "Stable";
    if (stab.pct >= 34) return "Strained";
    return "Unrest";
}

// Top-bar command screens, relocated here from the old left-side console.
const NAV = [
    {id: "production", label: "Production", glyph: "▣"},
    {id: "battle", label: "Battle Plan", glyph: "✷"},
    {id: "diplomacy", label: "Diplomacy", glyph: "⚑"},
];

export default function LiveHud({world, api, myNation, panel, onPanel, keys, online, globe, onGlobe, onHelp, onMenu, meBadge}) {
    const K = resolveKeys(keys);
    const net = myNation ? netIncomeOf(world, myNation.slot) : 0;
    const pop = myNation ? populationOf(world, myNation.slot) : 0;
    const gdp = myNation ? gdpOf(world, myNation.slot) : 0;
    const ind = myNation ? industryOutputOf(world, myNation.slot) : 0;
    const lead = myNation ? leadershipStatus(world, myNation.slot) : null;
    const stab = myNation ? stabilityStatus(world, myNation.slot) : null;
    const stabInfo = myNation ? stabilityBreakdown(world, myNation.slot) : null;
    const alive = world.nations.filter((n) => n.alive).length;
    const {date, time} = gameDate(world.time);

    // Which telemetry cell is showing its hover breakdown ("lead" | "stab" | null).
    const [info, setInfo] = useState(null);

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
            className="db-livehud relative z-5 w-full flex flex-col bg-panel-2 border border-line rounded shadow-[var(--shadow),inset_0_1px_0_var(--hair)] backdrop-blur-[14px] pointer-events-auto motion-safe:animate-[dbDropInY_300ms_var(--ease-drawer)]">
            {/* Row 1 — telemetry: date + points on the left, national stats pushed right. */}
            <div className="flex flex-nowrap items-center gap-3 whitespace-nowrap px-4 py-[7px] border-b border-hair">
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
                <div className="flex flex-nowrap items-center gap-3 ml-auto">
                    <div className="w-px self-stretch bg-line-soft"/>
                    <div className="flex flex-col items-end leading-[1.15]"><span
                        className="text-[9px] tracking-[1px] uppercase text-faint">GDP</span><span
                        className="text-sm font-bold font-mono">{fmtGdp(gdp)}</span><span
                        className="text-[10px] text-dim">Industry +{ind.toFixed(1)}/s</span></div>
                    <div className="w-px self-stretch bg-line-soft"/>
                    <div className="flex flex-col items-end leading-[1.15]"><span
                        className="text-[9px] tracking-[1px] uppercase text-faint">Population</span><span
                        className="text-sm font-bold font-mono">{fmtPop(pop)}</span><span className="text-[10px] text-dim"
                                                                                            aria-live="polite">{alive} Powers Left</span>
                    </div>
                    {lead && <>
                        <div className="w-px self-stretch bg-line-soft"/>
                        <div className="relative flex flex-col items-end leading-[1.15] cursor-help"
                             onMouseEnter={() => setInfo("lead")} onMouseLeave={() => setInfo(null)}><span
                            className="text-[9px] tracking-[1px] uppercase text-faint">Leadership</span><span
                            className="text-sm font-bold font-mono"
                            style={{color: vitColor(lead.pct)}}>{lead.pct}%</span><span
                            className="text-[10px] text-dim" aria-live="polite">{leadSub(lead)}</span>
                            {info === "lead" && (
                                <div className={cn(popoverCard(), "absolute top-full right-0 mt-2 w-[240px] py-[11px] px-[13px] z-20 text-left cursor-default")}>
                                    <div className="flex items-center justify-between font-display font-bold text-[13px]">
                                        <span>National Leadership</span>
                                        <span className="font-mono" style={{color: vitColor(lead.pct)}}>{lead.pct}%</span>
                                    </div>
                                    <div className="mt-1 text-[10px] uppercase tracking-[0.5px] text-faint">{lead.total - lead.lost} of {lead.total} tokens intact</div>
                                    <div className="mt-[9px] flex flex-col gap-[5px] text-[11.5px]">
                                        {lead.atCities.map((c) => (
                                            <div key={c.name} className="flex items-center justify-between gap-3">
                                                <span className="text-dim truncate">{c.cap ? "★ " : ""}{c.name}</span>
                                                <b className="font-mono text-text flex-none">{c.n}</b>
                                            </div>
                                        ))}
                                        {lead.sheltered > 0 && <div className="flex items-center justify-between gap-3"><span className="text-dim">In bunker</span><b className="font-mono text-text flex-none">{lead.sheltered}</b></div>}
                                        {lead.inTransit > 0 && <div className="flex items-center justify-between gap-3"><span className="text-dim">In transit (evac)</span><b className="font-mono text-text flex-none">{lead.inTransit}</b></div>}
                                        {lead.lost > 0 && <div className="flex items-center justify-between gap-3"><span className="text-danger">Killed</span><b className="font-mono text-danger flex-none">{lead.lost}</b></div>}
                                        {!lead.atCities.length && !lead.sheltered && !lead.inTransit && !lead.lost &&
                                            <div className="text-faint">No leaders located.</div>}
                                    </div>
                                </div>
                            )}
                        </div>
                    </>}
                    {stab && <>
                        <div className="w-px self-stretch bg-line-soft"/>
                        <div className="relative flex flex-col items-end leading-[1.15] cursor-help"
                             onMouseEnter={() => setInfo("stab")} onMouseLeave={() => setInfo(null)}><span
                            className="text-[9px] tracking-[1px] uppercase text-faint">Stability</span><span
                            className="text-sm font-bold font-mono"
                            style={{color: vitColor(stab.pct)}}>{stab.pct}%</span><span
                            className="text-[10px] text-dim"
                            aria-live="polite">{stabSub(stab)}</span>
                            {info === "stab" && stabInfo && (
                                <div className={cn(popoverCard(), "absolute top-full right-0 mt-2 w-[250px] py-[11px] px-[13px] z-20 text-left cursor-default")}>
                                    <div className="flex items-center justify-between font-display font-bold text-[13px]">
                                        <span>National Stability</span>
                                        <span className="font-mono" style={{color: vitColor(stabInfo.pct)}}>{stabInfo.pct}%</span>
                                    </div>
                                    <div className="mt-[9px] flex flex-col gap-[6px] text-[11.5px]">
                                        {stabInfo.factors.length ? stabInfo.factors.map((f) => (
                                            <div key={f.key} className="flex items-start justify-between gap-3">
                                                <span className="flex flex-col"><span className="text-dim">{f.label}</span><span className="text-faint text-[10px]">{f.detail}</span></span>
                                                <b className="font-mono text-danger flex-none">&minus;{f.penalty}</b>
                                            </div>
                                        )) : <div className="text-faint">No active pressures — holding steady.</div>}
                                    </div>
                                    <div className="mt-[9px] pt-[8px] border-t border-hair flex items-center justify-between text-[10px] uppercase tracking-[0.5px] text-faint">
                                        <span>Trending toward</span>
                                        <b className="font-mono text-[11.5px]" style={{color: vitColor(stabInfo.target)}}>{stabInfo.target}%</b>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>}
                </div>
            </div>
            {/* Row 2 — controls: speed + console nav on the left, arsenal + view controls right. */}
            <div className="flex flex-nowrap items-center gap-3 whitespace-nowrap px-3 py-[7px]">
                {online ? (
                    <div className="flex items-center pr-3 border-r border-line-soft"
                         title="Online matches run locked at 1× — no pausing" aria-live="polite">
                        {world.startsIn > 0
                            ? <span
                                className="font-mono text-xs font-bold text-gold [text-shadow:var(--glow-gold)] tabular-nums">Battle begins in {world.startsIn}s</span>
                            : <span
                                className="font-mono text-[11px] font-semibold tracking-[1px] uppercase text-dim">Live · 1×</span>}
                    </div>
                ) : (
                    <div className="flex gap-[3px] pr-[3px] border-r border-line-soft"
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
                )}
                {onPanel && (
                    <div className="flex gap-[5px] flex-none">
                        {NAV.map((n) => (
                            <button key={n.id}
                                    className={cn("flex items-center gap-[6px] px-[11px] py-[6px] font-display font-semibold text-[10.5px] tracking-[0.6px] uppercase whitespace-nowrap text-dim bg-sunk border border-line rounded-sm cursor-pointer transition-[border-color,color,background] duration-150 ease-out-db hover:text-text hover:border-gold-line", panel === n.id && "text-gold-contrast bg-gold border-gold")}
                                    onClick={() => onPanel(n.id)}
                                    title={K[n.id] ? `${n.label} (${keyLabel(K[n.id])})` : n.label}
                                    aria-label={n.label}>
                                <span className="text-[13px] leading-none">{n.glyph}</span>
                                <span>{n.label}</span>
                            </button>
                        ))}
                    </div>
                )}
                <div className="flex items-center gap-2 ml-auto">
                    <AmmoBar nation={myNation}/>
                    {onGlobe && <button className={iconButton()} onClick={onGlobe} title="Globe / Flat view"
                                        aria-label="Toggle globe or flat view">{globe ? "◐" : "▦"}</button>}
                    {onHelp && <button className={iconButton()} onClick={onHelp} title="Controls (?)"
                                       aria-label="Show controls reference">?</button>}
                    {onMenu && <button className={iconButton()} onClick={onMenu} title="Menu (Esc)"
                                       aria-label="Open pause menu">☰</button>}
                    {meBadge}
                </div>
            </div>
        </div>
    );
}
