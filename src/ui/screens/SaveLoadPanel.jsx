import {useState} from "react";
import {AUTOSAVE, deleteSave, listSaves} from "../../game/platform/saves.js";

export default function SaveLoadPanel({mode, onSave, onLoad, onClose}) {
    const [, force] = useState(0);
    const saves = listSaves();
    const slots = ["1", "2", "3"];
    const fmt = (m) => (m?.at ? new Date(m.at).toLocaleString() : "Empty");
    const auto = saves.find((x) => x.slot === AUTOSAVE);
    return (
        <div className="gd-overlay center" onClick={onClose}>
            <div className="gd-card wide" onClick={(e) => e.stopPropagation()}>
                <div className="gd-menu-title sm">{mode === "save" ? "Save Game" : "Load Game"}</div>
                <div className="gd-savelist">
                    {slots.map((slot) => {
                        const s = saves.find((x) => x.slot === slot);
                        return (
                            <div key={slot} className="gd-saverow">
                                <div className="gd-saveinfo">
                                    <b>Slot {slot}</b><span>{s ? `${s.meta.playerName || "?"} · ${s.meta.nations || "?"} Powers · ${fmt(s.meta)}` : "Empty"}</span>
                                </div>
                                {mode === "save"
                                    ? <button className="gd-mini" onClick={() => {
                                        onSave(slot);
                                        force((t) => t + 1);
                                    }}>Save</button>
                                    : <button className="gd-mini" disabled={!s}
                                              onClick={() => s && onLoad(slot)}>Load</button>}
                                {s && <button className="gd-mini danger" onClick={() => {
                                    deleteSave(slot);
                                    force((t) => t + 1);
                                }}>Delete</button>}
                            </div>
                        );
                    })}
                    {auto && mode === "load" && (
                        <div className="gd-saverow">
                            <div className="gd-saveinfo"><b>Autosave</b><span>{fmt(auto.meta)}</span></div>
                            <button className="gd-mini" onClick={() => onLoad(AUTOSAVE)}>Load</button>
                        </div>
                    )}
                </div>
                <button className="gd-btn block" onClick={onClose}>Close</button>
            </div>
        </div>
    );
}
