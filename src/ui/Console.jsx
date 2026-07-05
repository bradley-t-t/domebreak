import {useState} from "react";
import UnitsPanel from "./panels/UnitsPanel.jsx";
import ResearchPanel from "./panels/ResearchPanel.jsx";
import DiplomacyPanel from "./panels/DiplomacyPanel.jsx";
import {netIncomeOf, populationOf} from "../game/engine.js";
import {SLOT_COLOR} from "../game/constants.js";

const TABS = [
    {id: "units", label: "Forces", glyph: "▣"},
    {id: "research", label: "Research", glyph: "❉"},
    {id: "diplomacy", label: "Diplomacy", glyph: "⚑"},
];
const fmtPop = (p) => (p >= 1e9 ? (p / 1e9).toFixed(2) + "B" : p >= 1e6 ? (p / 1e6).toFixed(0) + "M" : p >= 1e3 ? (p / 1e3).toFixed(0) + "K" : "" + Math.round(p || 0));

export default function Console({world, api, mySlot, active, setActive, placing, setPlacing}) {
    const [collapsed, setCollapsed] = useState(false);
    const me = world.nations.find((n) => n.slot === mySlot);
    const net = me ? netIncomeOf(world, mySlot) : 0;
    const pop = me ? populationOf(world, mySlot) : 0;
    if (collapsed) {
        return (
            <div className="gd-console-rail">
                {TABS.map((t) => <button key={t.id} className={`gd-rail-tab ${active === t.id ? "active" : ""}`}
                                         title={t.label} onClick={() => {
                    setActive(t.id);
                    setCollapsed(false);
                }}>{t.glyph}</button>)}
                <button className="gd-rail-tab expand" title="Expand" onClick={() => setCollapsed(false)}>▸</button>
            </div>
        );
    }
    return (
        <div className="gd-console">
            <div className="gd-con-head">
                <div className="gd-con-flag" style={{borderColor: SLOT_COLOR[mySlot]}}>{(me?.iso || "—").toUpperCase()}</div>
                <div className="gd-con-id">
                    <div className="gd-con-name">{me?.name || "Nation"}</div>
                    <div className="gd-con-sub">{fmtPop(pop)} people</div>
                </div>
                <div className="gd-con-pts">
                    <div className="gd-con-ptsval">{Math.floor(me?.points ?? 0)}</div>
                    <div
                        className={`gd-con-net ${net < 0 ? "neg" : "pos"}`}>{net >= 0 ? "+" : "−"}{Math.abs(net).toFixed(0)}/s
                    </div>
                </div>
                <button className="gd-collapse" title="Collapse" onClick={() => setCollapsed(true)}>◀</button>
            </div>
            <div className="gd-tabs2">
                {TABS.map((t) => <button key={t.id} className={`gd-tab2 ${active === t.id ? "active" : ""}`}
                                         onClick={() => setActive(t.id)}><span
                    className="gd-tab2-g">{t.glyph}</span>{t.label}</button>)}
            </div>
            <div className="gd-panel" key={active}>
                {active === "units" &&
                    <UnitsPanel world={world} mySlot={mySlot} placing={placing} setPlacing={setPlacing}/>}
                {active === "research" && <ResearchPanel world={world} api={api} mySlot={mySlot}/>}
                {active === "diplomacy" && <DiplomacyPanel world={world} api={api} mySlot={mySlot}/>}
            </div>
        </div>
    );
}
