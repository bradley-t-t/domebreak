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
    UNIT_ICON,
    unitLabel,
    unitLockReason,
    UNITS,
    upkeepOf,
    WARHEAD_ORDER,
    WARHEADS,
} from "../../game/engine.js";
import {DEFAULT_BUILD_TIME, FALLOUT, WARHEAD_ICON} from "../../game/data/constants.js";
import {fmtNet} from "../common/format.js";

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
        return (
            <button key={key}
                    className={`gd-ucard ${placing === key ? "active" : ""} ${lock ? "locked" : afford ? "" : "poor"}`}
                    onClick={() => !lock && pick(key)} disabled={!!lock} aria-disabled={!!lock}
                    title={lock || u.hint || `${cap(u.kind)} · builds in ${u.buildTime}s`}>
                {lock && <span className="gd-ucard-lock" aria-hidden="true">🔒</span>}
                <span className="gd-ucard-ico" data-kind={u.kind} data-domain={u.domain || "land"}>
                    <UnitIcon name={UNIT_ICON[key]} size={30}/>
                </span>
                <div className="gd-ucard-body">
                    <div className="gd-ucard-top">
                        <b className="gd-ucard-name">{unitLabel(key, me?.iso)}</b>
                        <span className="gd-ucard-cost">◆ {cost}</span>
                    </div>
                    <span className="gd-ucard-line">{line}</span>
                    <div className="gd-ucard-foot">
                        <span>⧗ {u.buildTime}s</span>
                        {u.kind !== "industry" && <span>−{u.upkeep}/s</span>}
                        {qn > 0 && <span className="gd-ucard-q">{qn} queued</span>}
                        {placing === key && <span className="gd-ucard-q hot">Placing…</span>}
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
        return (
            <button key={key} className={`gd-ucard ${afford ? "" : "poor"}`}
                    onClick={(e) => {
                        for (let i = 0, n = e.shiftKey ? 5 : 1; i < n; i++) if (api.produceAmmo(key)?.error) break;
                    }}
                    title={`${wh.name} — ${wh.desc}${fallout ? " · Contaminates ground zero with radioactive fallout." : ""} (Shift-click ×5)`}>
                <span className="gd-ucard-ico"><UnitIcon name={WARHEAD_ICON[key]} size={30}/></span>
                <div className="gd-ucard-body">
                    <div className="gd-ucard-top">
                        <b className="gd-ucard-name">{wh.name}</b>
                        <span className="gd-ucard-cost">◆ {wh.prodCost}</span>
                    </div>
                    <span className="gd-ucard-line">{wh.desc}</span>
                    {fallout && <span className="gd-ucard-tag gd-contam">☢ Leaves fallout</span>}
                    <div className="gd-ucard-foot">
                        <span>⧗ {wh.prodTime}s</span>
                        <span className="gd-ucard-stock">{stock} in stock</span>
                        {qn > 0 && <span className="gd-ucard-q">{qn} queued</span>}
                    </div>
                </div>
            </button>
        );
    };

    const section = (id) => {
        if (id === "Munitions") {
            return (
                <section key="Munitions" className="gd-arsec">
                    <h3 className="gd-arsec-h">Munitions <span>{WARHEAD_ORDER.length}</span></h3>
                    <div className="gd-ucard-grid">{WARHEAD_ORDER.map(ammoCard)}</div>
                </section>
            );
        }
        const g = groups[id];
        if (!g?.length) return null;
        return (
            <section key={id} className="gd-arsec">
                <h3 className="gd-arsec-h">{id} <span>{g.length}</span></h3>
                <div className="gd-ucard-grid">{g.map(([k, u]) => unitCard(k, u))}</div>
            </section>
        );
    };

    const shown = cat === "all"
        ? [...CATS.filter((c) => c.id !== "all" && c.id !== "Munitions").map((c) => c.id), "Munitions"]
        : [cat];

    return (
        <ScreenFrame title="PRODUCTION" subtitle="Arsenal & national build line" bare onClose={onClose}>
            <div className="gd-prod">
                <aside className="gd-prod-rail">
                    <div className="gd-prod-bank">
                        <span className="gd-prod-bank-l">Treasury</span>
                        <span className="gd-prod-bank-v">◆ {Math.floor(points)}</span>
                        <span className={`gd-prod-bank-net ${net < 0 ? "neg" : "pos"}`}>{fmtNet(net, 1)}/s</span>
                    </div>
                    <div className="gd-prod-econ">
                        <div><span>Income</span><b className="pos">+{income.toFixed(1)}</b></div>
                        <div><span>Upkeep</span><b className="neg">−{upkeep.toFixed(1)}</b></div>
                        <div><span>GDP</span><b>${gdpOf(world, mySlot).toFixed(2)}T</b></div>
                        <div title="Industry structures / population-supported cap">
                            <span>Industry</span><b className={industryCount >= industryCap ? "neg" : ""}>{industryCount}/{industryCap}</b>
                        </div>
                        <div><span>Fielded</span><b>{mine.length}</b></div>
                    </div>
                    {net < 0 && <div className="gd-prod-warn">In deficit — build Industry or scrap units to recover.</div>}
                    <nav className="gd-prod-cats">
                        {CATS.map((c) => (
                            <button key={c.id} className={`gd-prod-cat ${cat === c.id ? "active" : ""}`}
                                    onClick={() => setCat(c.id)}>
                                <span className="gd-prod-cat-g">{c.glyph}</span>
                                <span className="gd-prod-cat-n">{c.name}</span>
                                <span className="gd-prod-cat-c">{countFor(c.id)}</span>
                            </button>
                        ))}
                    </nav>
                </aside>

                <main className="gd-prod-main">
                    {placing && <div className="gd-prod-placing">
                        Placing <b>{unitLabel(placing, me?.iso)}</b> — click {UNITS[placing].coastal ? "your coastline" : UNITS[placing].domain === "sea" ? "your coastal waters" : "your territory"} to
                        site it. Hold <b>Shift</b> to place several.
                        <button className="gd-mini" onClick={() => setPlacing(null)}>Cancel</button>
                    </div>}
                    {shown.map(section)}
                </main>

                <aside className="gd-prod-queue">
                    <h3 className="gd-queue-h">Build Queue {(cur ? 1 : 0) + queue.length > 0 &&
                        <span>{(cur ? 1 : 0) + queue.length}</span>}</h3>
                    <div className="gd-queue-list">
                        {!cur && queue.length === 0 && <div className="gd-queue-empty">The line is idle. Pick a system to
                            build it.</div>}
                        {cur && (
                            <button className="gd-qitem building" onClick={() => api.cancelProd(-1)}
                                    title="Building — click to cancel for a refund">
                                <i className="gd-qitem-fill" style={{width: `${Math.round(cur.progress * 100)}%`}}/>
                                <UnitIcon name={icon(cur.item)} size={16}/>
                                <span className="gd-qitem-name">{label(cur.item)}</span>
                                <b className="gd-qitem-pct">{Math.round(cur.progress * 100)}%</b>
                            </button>
                        )}
                        {queue.map((it, i) => (
                            <button key={i} className="gd-qitem" onClick={() => api.cancelProd(i)}
                                    title={`${label(it)} · ${timeOf(it)}s — click to cancel`}>
                                <span className="gd-qitem-n">{i + 2}</span>
                                <UnitIcon name={icon(it)} size={16}/>
                                <span className="gd-qitem-name">{label(it)}</span>
                                <span className="gd-qitem-x">✕</span>
                            </button>
                        ))}
                    </div>
                </aside>
            </div>
        </ScreenFrame>
    );
}
