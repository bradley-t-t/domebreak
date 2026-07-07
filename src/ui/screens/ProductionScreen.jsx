// Production — full-screen arsenal command. Three regions that fill the frame:
//   • left rail   — treasury + economy readout and the category selector
//   • centre      — the arsenal: large unit/warhead cards for the active category
//   • right rail  — the live national build queue (current + pending, cancellable)
// Units are picked → placed on the map; warheads queue straight onto the line.
// Presentation only — all mutations go through the engine api.
import {useState} from "react";
import ScreenFrame from "./ScreenFrame.jsx";
import UnitIcon from "../common/UnitIcon.jsx";
import {
    armamentOf,
    gdpOf,
    HANGAR_SPEC,
    incomeOf,
    industryCapOf,
    industryCountOf,
    launchersForAmmo,
    UNIT_ICON,
    unitLabel,
    unitLockReason,
    UNITS,
    upkeepOf,
    WARHEAD_ORDER,
    WARHEADS,
} from "../../game/engine.js";
import {DEFAULT_BUILD_TIME, FALLOUT, INTERCEPT_CAP, WARHEAD_ICON} from "../../game/data/constants.js";
import {fmtNet} from "../common/format.js";
import {cn} from "../lib/cn.js";
import {miniButton} from "../lib/variants.js";

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// Space assets (the Space Command HQ + everything that requires it) group under
// their own category regardless of kind; everything else falls to kind/domain.
const isSpace = (key, u) => key === "spacehq" || u.requiresUnit === "spacehq";
const catOf = (key, u) => (isSpace(key, u) ? "Space" : u.kind === "industry" ? "Industry" : u.domain === "land" ? "Army" : u.domain === "sea" ? "Naval" : u.kind === "offense" ? "Strike" : u.kind === "defense" ? "Air Defense" : "Support");
// Category selector: glyph + the order they read down the rail. Munitions is the
// warhead line; "All" shows every section at once.
const CATS = [
    {id: "all", name: "All Systems", glyph: "⌗"},
    {id: "Strike", name: "Strike", glyph: "✷"},
    {id: "Air Defense", name: "Air Defense", glyph: "⬡"},
    {id: "Army", name: "Army", glyph: "▲"},
    {id: "Naval", name: "Naval", glyph: "⚓"},
    {id: "Space", name: "Space", glyph: "✦"},
    {id: "Industry", name: "Industry", glyph: "⚙"},
    {id: "Support", name: "Support", glyph: "✧"},
    {id: "Munitions", name: "Munitions", glyph: "☢"},
];

export default function ProductionScreen({world, api, mySlot, placing, setPlacing, onClose}) {
    const me = world.nations.find((n) => n.slot === mySlot);
    const points = me?.points ?? 0;
    const income = incomeOf(world, mySlot), upkeep = upkeepOf(world, mySlot), net = income - upkeep;
    const industryCount = industryCountOf(world, mySlot), industryCap = industryCapOf(world, mySlot);
    const ammo = me?.ammo || {};
    const cur = me?.prod?.current || null;
    const queue = me?.prod?.queue || [];
    const mine = world.units.filter((u) => u.slot === mySlot);
    const counts = {};
    for (const u of mine) counts[u.type] = (counts[u.type] || 0) + 1;
    const queuedOf = (kind, type) => (cur?.item.kind === kind && cur?.item.type === type ? 1 : 0) + queue.filter((it) => it.kind === kind && it.type === type).length;

    const [cat, setCat] = useState("all");

    // Picking a unit arms placement and drops back to the map (which the popup
    // covers); clicking the armed unit again just disarms without closing.
    const pick = (key) => {
        if (placing === key) setPlacing(null);
        else {
            setPlacing(key);
            onClose();
        }
    };

    // Group unit defs by category (hidden units excluded).
    const groups = {};
    for (const [key, u] of Object.entries(UNITS)) {
        if (u.hidden) continue;
        (groups[catOf(key, u)] ||= []).push([key, u]);
    }
    const countFor = (id) => id === "all"
        ? Object.values(groups).reduce((a, g) => a + g.length, 0) + WARHEAD_ORDER.length
        : id === "Munitions" ? WARHEAD_ORDER.length : (groups[id]?.length || 0);

    const label = (it) => (it.kind === "ammo" ? WARHEADS[it.type].name : unitLabel(it.type, me?.iso));
    const icon = (it) => (it.kind === "ammo" ? WARHEAD_ICON[it.type] : UNIT_ICON[it.type]);
    const timeOf = (it) => (it.kind === "ammo" ? WARHEADS[it.type].prodTime : (UNITS[it.type].buildTime || DEFAULT_BUILD_TIME));

    // Research-adjusted stat sheet for a unit *type* (nothing placed yet, so we
    // read UNITS[type] and apply this nation's research multipliers directly —
    // mirrors LiveGame.unitStats()/queries.js). Returns compact label/value rows
    // relevant to the unit's kind; kept dense so cards don't bloat.
    const km = (v) => `${Math.round(v).toLocaleString()} km`;
    const statsFor = (u) => {
        const rows = [];
        if (u.kind === "defense") {
            rows.push(["Intercept", `${Math.round(Math.min(INTERCEPT_CAP, u.intercept + (me?.interceptAdd ?? 0)) * 100)}%`]);
            rows.push(["Engage Range", km(u.range * (me?.defRangeMult ?? 1))]);
            if (u.minRange) rows.push(["Min Range", km(u.minRange)]);
            rows.push(["Reload", `${(u.reload * (me?.reloadMult ?? 1)).toFixed(1)}s`]);
            rows.push(["Shot Cost", `◆ ${u.fireCost}`]);
        } else if (u.kind === "offense") {
            rows.push(["Damage", `${Math.round(u.damage * (me?.dmgMult ?? 1))}`]);
            rows.push(["Strike Range", km(u.range * (me?.rangeMult ?? 1))]);
            rows.push(["Reload", `${(u.reload * (me?.reloadMult ?? 1)).toFixed(1)}s`]);
            if (u.speed) rows.push(["Missile Spd", `${u.speed} km/s`]);
        } else if (u.detect) {
            rows.push(["Detection", km((u.radarKm || u.range) * (me?.radarMult ?? 1))]);
            rows.push(["Track Grade", u.warnOnly ? "Warning Only" : "Fire Control"]);
        } else if (u.kind === "industry") {
            rows.push(["Output", `+${u.output}/s`]);
            rows.push(["GDP", `+$${u.gdpAdd}T`]);
        }
        if (u.navalSpeed) rows.push(["Speed", `${u.navalSpeed} kn`]);
        if (u.airSpeed) rows.push(["Air Speed", `${u.airSpeed} kn`]);
        return rows;
    };

    const unitCard = (key, u) => {
        // null when buildable, else a short reason (locked by tech/prereq/cap).
        // Locked cards render greyed with a lock glyph and the reason as the line
        // + tooltip, and can't arm placement.
        const lock = unitLockReason(world, mySlot, key);
        const cost = Math.round(u.cost * (me?.buildCostMult ?? 1));
        const afford = points >= cost && (net >= 0 || u.kind === "industry");
        const qn = queuedOf("unit", key);
        const spec = HANGAR_SPEC[key];
        const wing = spec ? Object.values(spec).reduce((a, b) => a + b, 0) : 0;
        const arm = armamentOf(key, me?.iso);
        const line = lock ? lock
            : u.wing ? `Air wing · ${wing} aircraft`
                : arm ? `Fires ${arm}`
                    : u.kind === "industry" ? `+${u.output}/s income · +$${u.gdpAdd}T GDP`
                        : `${cap(u.kind)}${u.range ? ` · ${u.range.toLocaleString()} km` : ""}`;
        const rows = lock ? [] : statsFor(u);
        return (
            <button key={key}
                    className={cn(
                        "db-ucard relative flex gap-[11px] items-start text-left p-3 border border-line rounded bg-sunk text-text cursor-pointer transition-[border-color,transform,box-shadow] duration-150 ease-out-db",
                        !lock && "hover:border-gold-line hover:-translate-y-px hover:shadow-[0_6px_18px_rgba(0,0,0,0.4)] active:scale-[0.99]",
                        placing === key ? "active border-gold bg-[rgba(245,197,49,0.07)]"
                            : lock ? "locked opacity-[0.55] grayscale-[0.85] cursor-not-allowed border-dashed"
                                : !afford && "poor opacity-50"
                    )}
                    onClick={() => !lock && pick(key)} disabled={!!lock} aria-disabled={!!lock}
                    aria-label={lock ? `${unitLabel(key, me?.iso)} — locked: ${lock}` : `${unitLabel(key, me?.iso)}, ◆ ${cost}`}
                    title={lock || u.hint || `${cap(u.kind)} · builds in ${u.buildTime}s`}>
                {lock && <span className="db-ucard-lock absolute top-2 right-2.5 text-xs leading-none opacity-85 grayscale" aria-hidden="true">🔒</span>}
                <span className="db-ucard-ico flex-none w-[46px] h-[46px] grid place-items-center bg-white/[0.03] border border-line rounded-sm" data-kind={u.kind} data-domain={u.domain || "land"}>
                    <UnitIcon name={UNIT_ICON[key]} size={30}/>
                </span>
                <div className="db-ucard-body flex-1 min-w-0 flex flex-col gap-1">
                    <div className="db-ucard-top flex items-baseline gap-2">
                        <b className="db-ucard-name flex-1 min-w-0 font-display font-bold text-[12.5px] whitespace-nowrap overflow-hidden text-ellipsis">{unitLabel(key, me?.iso)}</b>
                        <span className="db-ucard-cost font-mono text-xs text-gold">◆ {cost}</span>
                    </div>
                    <span className={cn("db-ucard-line text-[10.5px] leading-[1.3] text-dim", lock && "text-faint")}>{line}</span>
                    {rows.length > 0 && (
                        <dl className="db-ucard-stats grid grid-cols-2 gap-x-3 gap-y-0.5 mt-[5px] mb-px pt-1.5 border-t border-line-soft">
                            {rows.map(([k, v]) => (
                                <div key={k} className="flex items-baseline justify-between gap-1.5 min-w-0 overflow-hidden">
                                    <dt className="flex-shrink flex-grow-0 basis-auto min-w-0 overflow-hidden text-ellipsis text-[8.5px] tracking-[0.4px] uppercase text-faint whitespace-nowrap">{k}</dt>
                                    <dd className="flex-none m-0 font-mono text-[10.5px] text-text whitespace-nowrap">{v}</dd>
                                </div>
                            ))}
                        </dl>
                    )}
                    <div className="db-ucard-foot flex flex-wrap gap-2 font-mono text-[9.5px] tracking-[0.3px] text-faint">
                        <span>⧗ {u.buildTime}s</span>
                        {u.kind !== "industry" && <span>−{u.upkeep}/s</span>}
                        {qn > 0 && <span className="db-ucard-q text-gold">{qn} queued</span>}
                        {placing === key && <span className="db-ucard-q hot text-gold-hi">Placing…</span>}
                    </div>
                </div>
            </button>
        );
    };

    const ammoCard = (key) => {
        const wh = WARHEADS[key];
        const stock = ammo[key] || 0;
        const afford = points >= wh.prodCost;
        const qn = queuedOf("ammo", key);
        const fallout = FALLOUT.warheads.includes(key);
        const users = launchersForAmmo(key); // launcher types cleared to fire this warhead
        return (
            <button key={key}
                    className={cn(
                        "db-ucard relative flex gap-[11px] items-start text-left p-3 border border-line rounded bg-sunk text-text cursor-pointer transition-[border-color,transform,box-shadow] duration-150 ease-out-db hover:border-gold-line hover:-translate-y-px hover:shadow-[0_6px_18px_rgba(0,0,0,0.4)] active:scale-[0.99]",
                        !afford && "poor opacity-50"
                    )}
                    onClick={(e) => {
                        for (let i = 0, n = e.shiftKey ? 5 : 1; i < n; i++) if (api.produceAmmo(key)?.error) break;
                    }}
                    aria-label={`${wh.name}, ◆ ${wh.prodCost}, ${stock} in stock. Shift-click to queue five.`}
                    title={`${wh.name} — ${wh.desc}${fallout ? " · Contaminates ground zero with radioactive fallout." : ""}`}>
                <span className="db-ucard-ico flex-none w-[46px] h-[46px] grid place-items-center bg-white/[0.03] border border-line rounded-sm"><UnitIcon name={WARHEAD_ICON[key]} size={30}/></span>
                <div className="db-ucard-body flex-1 min-w-0 flex flex-col gap-1">
                    <div className="db-ucard-top flex items-baseline gap-2">
                        <b className="db-ucard-name flex-1 min-w-0 font-display font-bold text-[12.5px] whitespace-nowrap overflow-hidden text-ellipsis">{wh.name}</b>
                        <span className="db-ucard-cost font-mono text-xs text-gold">◆ {wh.prodCost}</span>
                    </div>
                    <span className="db-ucard-line text-[10.5px] leading-[1.3] text-dim">{wh.desc}</span>
                    {users.length > 0 && (
                        <div className="db-ucard-fires flex items-center gap-1.5 mt-0.5" aria-label={`Fired by: ${users.map((t) => unitLabel(t, me?.iso)).join(", ")}`}>
                            <span className="font-mono text-[9px] tracking-[0.4px] uppercase text-faint" aria-hidden="true">Fires from</span>
                            <span className="flex items-center gap-1" aria-hidden="true">
                                {users.map((t) => (
                                    <span key={t} title={unitLabel(t, me?.iso)} className="grid place-items-center w-[15px] h-[15px] text-dim"><UnitIcon name={UNIT_ICON[t]} size={13}/></span>
                                ))}
                            </span>
                        </div>
                    )}
                    {fallout && <span className="db-ucard-tag db-contam self-start mt-0.5 font-mono text-[9px] tracking-[0.3px] py-px px-[5px] rounded-[3px] border border-[rgba(140,255,58,0.5)] bg-[rgba(140,255,58,0.1)] text-[#a6ff5c]">☢ Leaves fallout</span>}
                    <div className="db-ucard-foot flex flex-wrap gap-2 font-mono text-[9.5px] tracking-[0.3px] text-faint">
                        <span>⧗ {wh.prodTime}s</span>
                        <span className="db-ucard-stock text-dim">{stock} in stock</span>
                        <span className="db-ucard-shift text-faint border border-line rounded-sm px-1 leading-[1.5]" aria-hidden="true">⇧ ×5</span>
                        {qn > 0 && <span className="db-ucard-q text-gold">{qn} queued</span>}
                    </div>
                </div>
            </button>
        );
    };

    const section = (id) => {
        if (id === "Munitions") {
            return (
                <section key="Munitions" className="db-arsec">
                    <h3 className="db-arsec-h flex items-center gap-2 mb-3 font-display font-semibold text-xs tracking-[2px] uppercase text-dim after:content-[''] after:flex-1 after:h-px after:bg-line-soft">Munitions <span className="font-mono text-[10px] text-faint">{WARHEAD_ORDER.length}</span></h3>
                    <div className="db-ucard-grid grid grid-cols-[repeat(auto-fill,minmax(238px,1fr))] gap-[10px]">{WARHEAD_ORDER.map(ammoCard)}</div>
                </section>
            );
        }
        const g = groups[id];
        if (!g?.length) return null;
        return (
            <section key={id} className="db-arsec">
                <h3 className="db-arsec-h flex items-center gap-2 mb-3 font-display font-semibold text-xs tracking-[2px] uppercase text-dim after:content-[''] after:flex-1 after:h-px after:bg-line-soft">{id} <span className="font-mono text-[10px] text-faint">{g.length}</span></h3>
                <div className="db-ucard-grid grid grid-cols-[repeat(auto-fill,minmax(238px,1fr))] gap-[10px]">{g.map(([k, u]) => unitCard(k, u))}</div>
            </section>
        );
    };

    const shown = cat === "all"
        ? [...CATS.filter((c) => c.id !== "all" && c.id !== "Munitions").map((c) => c.id), "Munitions"]
        : [cat];

    return (
        <ScreenFrame title="PRODUCTION" subtitle="Arsenal & national build line" bare onClose={onClose}>
            <div className="db-prod grid grid-cols-[236px_minmax(0,1fr)_304px] h-full">
                <aside className="db-prod-rail db-scroll flex flex-col gap-3 p-[18px] overflow-auto bg-panel border-r border-line-soft">
                    <div className="db-prod-bank flex flex-col gap-px py-3 px-3.5 bg-sunk border border-line rounded">
                        <span className="db-prod-bank-l text-[9px] tracking-[1.5px] uppercase text-faint">Treasury</span>
                        <span className="db-prod-bank-v font-mono text-[22px] font-bold text-gold">◆ {Math.floor(points)}</span>
                        <span className={cn("db-prod-bank-net font-mono text-[11px]", net < 0 ? "neg text-red" : "pos text-[#46d38a]")}>{fmtNet(net, 1)}/s</span>
                    </div>
                    <div className="db-prod-econ grid grid-cols-2 gap-[7px]">
                        <div className="flex flex-col gap-0.5 py-2 px-2.5 bg-sunk border border-line rounded-sm"><span className="text-[8.5px] tracking-[1px] uppercase text-faint">Income</span><b className="pos font-mono text-[13px] text-[#46d38a]">+{income.toFixed(1)}</b></div>
                        <div className="flex flex-col gap-0.5 py-2 px-2.5 bg-sunk border border-line rounded-sm"><span className="text-[8.5px] tracking-[1px] uppercase text-faint">Upkeep</span><b className="neg font-mono text-[13px] text-red">−{upkeep.toFixed(1)}</b></div>
                        <div className="flex flex-col gap-0.5 py-2 px-2.5 bg-sunk border border-line rounded-sm"><span className="text-[8.5px] tracking-[1px] uppercase text-faint">GDP</span><b className="font-mono text-[13px]">${gdpOf(world, mySlot).toFixed(2)}T</b></div>
                        <div className="flex flex-col gap-0.5 py-2 px-2.5 bg-sunk border border-line rounded-sm" title="Industry structures / population-supported cap">
                            <span className="text-[8.5px] tracking-[1px] uppercase text-faint">Industry</span><b className={cn("font-mono text-[13px]", industryCount >= industryCap && "neg text-red")}>{industryCount}/{industryCap}</b>
                        </div>
                        <div className="flex flex-col gap-0.5 py-2 px-2.5 bg-sunk border border-line rounded-sm"><span className="text-[8.5px] tracking-[1px] uppercase text-faint">Fielded</span><b className="font-mono text-[13px]">{mine.length}</b></div>
                    </div>
                    {net < 0 && <div className="db-prod-warn text-[10px] leading-[1.35] text-red py-2 px-2.5 border border-[rgba(224,87,79,0.4)] rounded-sm bg-[rgba(224,87,79,0.08)]">In deficit — build Industry or scrap units to recover.</div>}
                    <nav className="db-prod-cats flex flex-col gap-0.5 mt-1" role="tablist" aria-label="Arsenal categories">
                        {CATS.map((c) => (
                            <button key={c.id}
                                    className={cn(
                                        "db-prod-cat flex items-center gap-[10px] py-[9px] px-[11px] border border-transparent rounded-sm bg-transparent text-dim cursor-pointer text-left transition-[color,background-color,border-color] duration-150 ease-out-db hover:text-text hover:bg-sunk active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue",
                                        cat === c.id && "active text-text bg-sunk border-gold-line"
                                    )}
                                    role="tab" aria-selected={cat === c.id}
                                    aria-label={`${c.name}, ${countFor(c.id)} systems`}
                                    onClick={() => setCat(c.id)}>
                                <span className="db-prod-cat-g w-[18px] text-center text-sm" aria-hidden="true">{c.glyph}</span>
                                <span className="db-prod-cat-n flex-1 font-display font-semibold text-[11.5px] tracking-[0.4px]">{c.name}</span>
                                <span className="db-prod-cat-c font-mono text-[10px] text-faint">{countFor(c.id)}</span>
                            </button>
                        ))}
                    </nav>
                </aside>

                <main className="db-prod-main db-scroll overflow-auto py-5 px-[22px] flex flex-col gap-[22px]">
                    {placing && <div className="db-prod-placing text-[11px] leading-[1.4] text-text py-2.5 px-3 border border-gold-line rounded-sm bg-[rgba(245,197,49,0.07)]">
                        Placing <b>{unitLabel(placing, me?.iso)}</b> — click {UNITS[placing].coastal ? "your coastline" : UNITS[placing].domain === "sea" ? "your coastal waters" : "your territory"} to
                        site it. Hold <b>Shift</b> to place several.
                        <button className={cn(miniButton(), "ml-2")} onClick={() => setPlacing(null)}>Cancel</button>
                    </div>}
                    {shown.map(section)}
                </main>

                <aside className="db-prod-queue flex flex-col p-[18px] overflow-hidden bg-panel border-l border-line-soft">
                    <h3 className="db-queue-h flex items-center gap-2 mb-3 font-display font-semibold text-xs tracking-[2px] uppercase text-dim">Build Queue {(cur ? 1 : 0) + queue.length > 0 &&
                        <span className="font-mono text-[10px] text-faint">{(cur ? 1 : 0) + queue.length}</span>}</h3>
                    <div className="db-queue-list db-scroll flex flex-col gap-1.5 overflow-auto" aria-live="polite" aria-label="National build queue">
                        {!cur && queue.length === 0 && <div className="db-queue-empty text-[10.5px] leading-[1.4] text-faint py-2">The line is idle. Pick a system to
                            build it.</div>}
                        {cur && (
                            <button className="db-qitem building group relative overflow-hidden flex items-center gap-2 py-[9px] px-2.5 border border-gold-line rounded-sm bg-sunk text-text cursor-pointer text-left transition-[border-color] duration-150 ease-out-db hover:border-red" onClick={() => api.cancelProd(-1)}
                                    title="Building — click to cancel for a refund">
                                <i className="db-qitem-fill absolute inset-0 right-auto bg-[rgba(245,197,49,0.14)] pointer-events-none" style={{width: `${Math.round(cur.progress * 100)}%`}}/>
                                <UnitIcon name={icon(cur.item)} size={16}/>
                                <span className="db-qitem-name relative flex-1 min-w-0 text-[11px] whitespace-nowrap overflow-hidden text-ellipsis">{label(cur.item)}</span>
                                <b className="db-qitem-pct relative font-mono text-[10px] text-gold">{Math.round(cur.progress * 100)}%</b>
                            </button>
                        )}
                        {queue.map((it, i) => (
                            <button key={i} className="db-qitem group relative overflow-hidden flex items-center gap-2 py-[9px] px-2.5 border border-line rounded-sm bg-sunk text-text cursor-pointer text-left transition-[border-color] duration-150 ease-out-db hover:border-red" onClick={() => api.cancelProd(i)}
                                    title={`${label(it)} · ${timeOf(it)}s — click to cancel`}>
                                <span className="db-qitem-n w-3.5 font-mono text-[10px] text-faint">{i + 2}</span>
                                <UnitIcon name={icon(it)} size={16}/>
                                <span className="db-qitem-name relative flex-1 min-w-0 text-[11px] whitespace-nowrap overflow-hidden text-ellipsis">{label(it)}</span>
                                <span className="db-qitem-x relative text-[11px] text-faint group-hover:text-red">✕</span>
                            </button>
                        ))}
                    </div>
                </aside>
            </div>
        </ScreenFrame>
    );
}
