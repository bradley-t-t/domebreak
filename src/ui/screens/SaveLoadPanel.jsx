import {useEffect, useRef, useState} from "react";
import {AUTOSAVE, deleteSave, listSaves} from "../../game/platform/saves.js";
import {useModal} from "../hooks/useModal.js";

const CONFIRM_MS = 4000;

export default function SaveLoadPanel({mode, onSave, onLoad, onClose}) {
    const [, force] = useState(0);
    const [confirmSlot, setConfirmSlot] = useState(null);
    const confirmTimerRef = useRef(null);
    const ref = useModal(onClose);
    const saves = listSaves();
    const slots = ["1", "2", "3"];
    const fmt = (m) => (m?.at ? new Date(m.at).toLocaleString() : "Empty");
    const auto = saves.find((x) => x.slot === AUTOSAVE);
    const titleId = "gd-saveload-title";

    useEffect(() => () => clearTimeout(confirmTimerRef.current), []);

    const requestDelete = (slot) => {
        clearTimeout(confirmTimerRef.current);
        if (confirmSlot === slot) {
            setConfirmSlot(null);
            deleteSave(slot);
            force((t) => t + 1);
            return;
        }
        setConfirmSlot(slot);
        confirmTimerRef.current = setTimeout(() => setConfirmSlot(null), CONFIRM_MS);
    };

    return (
        <div className="gd-overlay center" onClick={onClose}>
            <div className="gd-card wide" ref={ref} tabIndex={-1} role="dialog" aria-modal="true"
                 aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
                <div className="gd-menu-title sm" id={titleId}>{mode === "save" ? "Save Game" : "Load Game"}</div>
                <div className="gd-savelist" role="list" aria-labelledby={titleId}>
                    {slots.map((slot) => {
                        const s = saves.find((x) => x.slot === slot);
                        const summary = s
                            ? `Slot ${slot} — ${s.meta.playerName || "?"} · ${s.meta.nations || "?"} Powers · ${fmt(s.meta)}`
                            : `Slot ${slot} — Empty`;
                        const confirming = confirmSlot === slot;
                        return (
                            <div key={slot} className="gd-saverow" role="listitem" aria-label={summary}>
                                <div className="gd-saveinfo">
                                    <b>Slot {slot}</b><span>{s ? `${s.meta.playerName || "?"} · ${s.meta.nations || "?"} Powers · ${fmt(s.meta)}` : "Empty"}</span>
                                </div>
                                {mode === "save"
                                    ? <button className="gd-mini" aria-label={`Save to slot ${slot}`} onClick={() => {
                                        onSave(slot);
                                        force((t) => t + 1);
                                    }}>Save</button>
                                    : <button className="gd-mini" disabled={!s} aria-label={`Load slot ${slot}`}
                                              onClick={() => s && onLoad(slot)}>Load</button>}
                                {s && (
                                    <button className="gd-mini danger" aria-label={confirming
                                        ? `Confirm delete slot ${slot}`
                                        : `Delete slot ${slot}`}
                                            onClick={() => requestDelete(slot)}>
                                        {confirming ? "Confirm?" : "Delete"}
                                    </button>
                                )}
                            </div>
                        );
                    })}
                    {auto && mode === "load" && (
                        <div className="gd-saverow" role="listitem" aria-label={`Autosave — ${fmt(auto.meta)}`}>
                            <div className="gd-saveinfo"><b>Autosave</b><span>{fmt(auto.meta)}</span></div>
                            <button className="gd-mini" aria-label="Load autosave"
                                    onClick={() => onLoad(AUTOSAVE)}>Load</button>
                        </div>
                    )}
                </div>
                <button className="gd-btn block" onClick={onClose}>Close</button>
            </div>
        </div>
    );
}
