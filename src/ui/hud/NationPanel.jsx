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

    return (
        <aside className={`gd-natpanel ${collapsed ? "collapsed" : ""}`} aria-label="Nation status">
            <div className="gd-natpanel-head">
                <Flag iso={myNation.iso} className="gd-natpanel-flag"/>
                <div className="gd-natpanel-id">
                    <span className="gd-natpanel-name">{myNation.name}</span>
                    <span className="gd-natpanel-tag">Your Command</span>
                </div>
                <button className="gd-natpanel-collapse" onClick={() => setCollapsed((v) => !v)}
                        title={collapsed ? "Expand" : "Collapse"}
                        aria-label={collapsed ? "Expand nation panel" : "Collapse nation panel"}>
                    {collapsed ? "▸" : "▾"}
                </button>
            </div>

            {!collapsed && <>
                <div className="gd-natpanel-stats">
                    <div className="gd-natpanel-stat">
                        <span className="gd-natpanel-sl">Population</span>
                        <span className="gd-natpanel-sv">{fmtPop(view.pop)}</span>
                    </div>
                    <div className="gd-natpanel-stat">
                        <span className="gd-natpanel-sl">GDP</span>
                        <span className="gd-natpanel-sv">${view.gdp.toFixed(2)}T</span>
                    </div>
                    <div className="gd-natpanel-stat">
                        <span className="gd-natpanel-sl">Net</span>
                        <span className={`gd-natpanel-sv ${view.net < 0 ? "neg" : "pos"}`}>{fmtNet(view.net, 1)}/s</span>
                    </div>
                    <div className="gd-natpanel-stat">
                        <span className="gd-natpanel-sl">Territories</span>
                        <span className="gd-natpanel-sv">{view.heldCount}<span
                            className="gd-natpanel-of">/{view.totalCount}</span></span>
                    </div>
                </div>

                <div className="gd-natpanel-ind">
                    <div className="gd-natpanel-ind-top">
                        <span className="gd-natpanel-sl">Industry</span>
                        <span className="gd-natpanel-ind-v">{view.indCount}<span
                            className="gd-natpanel-of">/{view.indCap}</span> · +{view.indOut.toFixed(1)}/s</span>
                    </div>
                    <div className="gd-natpanel-bar">
                        <div className="gd-natpanel-bar-fill" style={{width: `${indFrac * 100}%`}}/>
                    </div>
                </div>

                <div className="gd-natpanel-terr-h">Territories</div>
                <div className="gd-natpanel-terr">
                    {view.rows.map((c) => {
                        const st = statusOf(c);
                        const v = vitalityOf(c);
                        return (
                            <button key={c.id} className={`gd-terr-row ${c.alive ? "" : "dead"}`}
                                    onClick={() => onFocus?.(c)} title={`Focus ${c.name}`}>
                                <span className="gd-terr-main">
                                    <span className="gd-terr-name">{c.cap ? "★ " : ""}{c.name}</span>
                                    {c.state && <span className="gd-terr-state">{c.state}</span>}
                                </span>
                                <span className="gd-terr-meta">
                                    <span className="gd-terr-pop">{c.alive ? fmtPop((c.pop || 0) * v) : "—"}</span>
                                    <span className={`gd-terr-pill ${st.key}`}>{st.label}</span>
                                </span>
                            </button>
                        );
                    })}
                    {view.rows.length === 0 &&
                        <div className="gd-terr-empty">No territories held.</div>}
                </div>
            </>}
        </aside>
    );
}
