import {useEffect, useState} from "react";
import {GAME_SPEEDS} from "../../game/data/constants.js";
import {DEFAULT_KEYS, KEY_ACTIONS, keyLabel, keyToken, resolveKeys} from "../../game/platform/keybindings.js";
import {useModal} from "../hooks/useModal.js";

export default function SettingsPanel({settings, onChange, onClose}) {
    const set = (k, v) => onChange({...settings, [k]: v});
    const keys = resolveKeys(settings.keys);
    // Which action (if any) is currently listening for its next keypress.
    const [capturing, setCapturing] = useState(null);
    // Focus-trap + Escape-to-close + focus restoration on the card. The keybinding
    // capture listener below runs on the capturing phase and stops propagation, so
    // while capturing, Escape cancels the capture before it can bubble to this
    // modal's (bubble-phase) close handler — capture-cancel keeps priority.
    const cardRef = useModal(onClose);

    // While capturing, the next keypress rebinds the action. Escape cancels the
    // capture; a key already bound to another action is swapped, so no two
    // actions ever collide on the same key.
    useEffect(() => {
        if (!capturing) return;
        const h = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.key === "Escape") {
                setCapturing(null);
                return;
            }
            const code = keyToken(e);
            const next = {...keys};
            const prev = next[capturing];
            for (const id of Object.keys(next)) if (next[id] === code && id !== capturing) next[id] = prev;
            next[capturing] = code;
            set("keys", next);
            setCapturing(null);
        };
        window.addEventListener("keydown", h, true);
        return () => window.removeEventListener("keydown", h, true);
    }, [capturing]); // eslint-disable-line react-hooks/exhaustive-deps

    const groups = [...new Set(KEY_ACTIONS.map((a) => a.group))];

    return (
        <div className="gd-overlay center" onClick={onClose}>
            <div className="gd-card gd-settings" ref={cardRef} tabIndex={-1}
                 onClick={(e) => e.stopPropagation()}>
                <div className="gd-menu-title sm">Settings</div>
                <div className="gd-set-row"><span>Default Speed</span>
                    <div className="gd-seg" role="radiogroup"
                         aria-label="Default speed">{GAME_SPEEDS.map((s) => <button key={s} role="radio"
                                                                            aria-checked={settings.speed === s}
                                                                            className={settings.speed === s ? "active" : ""}
                                                                            onClick={() => set("speed", s)}>{s}×</button>)}</div>
                </div>
                <div className="gd-set-row"><span>Default View</span>
                    <div className="gd-seg" role="radiogroup" aria-label="Default view">
                        <button className={settings.globe ? "active" : ""} role="radio" aria-checked={settings.globe}
                                onClick={() => set("globe", true)}>Globe
                        </button>
                        <button className={!settings.globe ? "active" : ""} role="radio" aria-checked={!settings.globe}
                                onClick={() => set("globe", false)}>Flat
                        </button>
                    </div>
                </div>
                <div className="gd-set-row"><span>Music Volume</span>
                    <div className="gd-set-slider"><input type="range" min="0" max="100" aria-label="Music volume"
                                                          value={Math.round((settings.musicVol ?? 0.5) * 100)}
                                                          onChange={(e) => set("musicVol", +e.target.value / 100)}/><b>{Math.round((settings.musicVol ?? 0.5) * 100)}%</b>
                    </div>
                </div>
                <div className="gd-set-row"><span>Effects Volume</span>
                    <div className="gd-set-slider"><input type="range" min="0" max="100" aria-label="Effects volume"
                                                          value={Math.round((settings.sfxVol ?? 0.8) * 100)}
                                                          onChange={(e) => set("sfxVol", +e.target.value / 100)}/><b>{Math.round((settings.sfxVol ?? 0.8) * 100)}%</b>
                    </div>
                </div>
                <div className="gd-set-row"><span>Reduce Motion</span>
                    <button className={`gd-toggle ${settings.reduceMotion ? "on" : ""}`}
                            aria-pressed={settings.reduceMotion} aria-label="Reduce motion"
                            onClick={() => set("reduceMotion", !settings.reduceMotion)}><span/></button>
                </div>

                <div className="gd-set-head">
                    <span>Controls</span>
                    <button className="gd-mini" onClick={() => {
                        setCapturing(null);
                        set("keys", {...DEFAULT_KEYS});
                    }}>Reset to Defaults
                    </button>
                </div>
                <div className="gd-keybinds">
                    {groups.map((g) => (
                        <div key={g} className="gd-keygroup">
                            <div className="gd-keygroup-h">{g}</div>
                            {KEY_ACTIONS.filter((a) => a.group === g).map((a) => (
                                <div key={a.id} className="gd-set-row gd-keyrow">
                                    <span>{a.label}</span>
                                    <button className={`gd-key ${capturing === a.id ? "capturing" : ""}`}
                                            aria-live={capturing === a.id ? "polite" : undefined}
                                            aria-busy={capturing === a.id ? "true" : undefined}
                                            onClick={() => setCapturing((c) => (c === a.id ? null : a.id))}>
                                        {capturing === a.id ? "Press a key…" : keyLabel(keys[a.id])}
                                    </button>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
                <div className="gd-menu-hint">Esc — Cancel / Menu · 1–5 — Jump to speed level (fixed)</div>

                <button className="gd-btn primary block" onClick={onClose}>Done
                </button>
            </div>
        </div>
    );
}
