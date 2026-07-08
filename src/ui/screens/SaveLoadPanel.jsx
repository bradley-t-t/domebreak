import {useEffect, useRef, useState} from "react";
import {AUTOSAVE, deleteSave, listSaves} from "../../game/platform/saves.js";
import {useModal} from "../hooks/useModal.js";
import {button, card, miniButton, overlay, menuTitle} from "../lib/variants.js";
import {cn} from "../lib/cn.js";

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
    const titleId = "db-saveload-title";

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
        <div className={overlay({placement: "center"})} onClick={onClose}>
            <div className={card({size: "wide"})} ref={ref} tabIndex={-1} role="dialog" aria-modal="true"
                 aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
                <div className={menuTitle({sm: true})} id={titleId}>{mode === "save" ? "Save Game" : "Load Game"}</div>
                <div className="db-savelist flex flex-col gap-2 mt-1.5" role="list" aria-labelledby={titleId}>
                    {slots.map((slot) => {
                        const s = saves.find((x) => x.slot === slot);
                        const summary = s
                            ? `Slot ${slot} — ${s.meta.playerName || "?"} · ${s.meta.nations || "?"} Powers · ${fmt(s.meta)}`
                            : `Slot ${slot} — Empty`;
                        const confirming = confirmSlot === slot;
                        return (
                            <div key={slot} className="db-saverow flex items-center gap-2 py-2.5 px-3 bg-btn-bg border border-line rounded" role="listitem" aria-label={summary}>
                                <div className="db-saveinfo flex-1 flex flex-col min-w-0">
                                    <b className="text-sm">Slot {slot}</b><span className={cn("text-[11px] whitespace-nowrap overflow-hidden text-ellipsis", s?.outdated ? "text-danger" : "text-dim")}>{s ? (s.outdated ? "Outdated save — cannot be played" : `${s.meta.playerName || "?"} · ${s.meta.nations || "?"} Powers · ${fmt(s.meta)}`) : "Empty"}</span>
                                </div>
                                {mode === "save"
                                    ? <button className={miniButton()} aria-label={`Save to slot ${slot}`} onClick={() => {
                                        onSave(slot);
                                        force((t) => t + 1);
                                    }}>Save</button>
                                    : <button className={miniButton()} disabled={!s || s.outdated} aria-label={`Load slot ${slot}`}
                                              onClick={() => s && !s.outdated && onLoad(slot)}>Load</button>}
                                {s && (
                                    <button className={miniButton({danger: true})} aria-label={confirming
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
                        <div className="db-saverow flex items-center gap-2 py-2.5 px-3 bg-btn-bg border border-line rounded" role="listitem" aria-label={`Autosave — ${fmt(auto.meta)}`}>
                            <div className="db-saveinfo flex-1 flex flex-col min-w-0"><b className="text-sm">Autosave</b><span className={cn("text-[11px] whitespace-nowrap overflow-hidden text-ellipsis", auto.outdated ? "text-danger" : "text-dim")}>{auto.outdated ? "Outdated save — cannot be played" : fmt(auto.meta)}</span></div>
                            <button className={miniButton()} disabled={auto.outdated} aria-label="Load autosave"
                                    onClick={() => !auto.outdated && onLoad(AUTOSAVE)}>Load</button>
                        </div>
                    )}
                </div>
                <button className={cn(button(), "block")} onClick={onClose}>Close</button>
            </div>
        </div>
    );
}
