import UnitsPanel from "./panels/UnitsPanel.jsx";
import ResearchPanel from "./panels/ResearchPanel.jsx";
import DiplomacyPanel from "./panels/DiplomacyPanel.jsx";

const TABS = [
    {id: "units", label: "Units", glyph: "▣"},
    {id: "research", label: "Research", glyph: "❉"},
    {id: "diplomacy", label: "Diplomacy", glyph: "⚑"},
];

export default function Console({world, api, mySlot, active, setActive, placing, setPlacing}) {
    return (
        <div className="gd-console">
            <div className="gd-tabs">
                {TABS.map((t) => (
                    <button key={t.id} className={`gd-tab ${active === t.id ? "active" : ""}`}
                            onClick={() => setActive(t.id)}>
                        <span className="gd-tab-glyph">{t.glyph}</span>{t.label}
                    </button>
                ))}
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
