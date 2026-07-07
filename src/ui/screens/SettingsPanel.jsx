import {useEffect, useState} from "react";
import {GAME_SPEEDS} from "../../game/data/constants.js";
import {DEFAULT_KEYS, KEY_ACTIONS, keyLabel, keyToken, resolveKeys} from "../../game/platform/keybindings.js";
import {useModal} from "../hooks/useModal.js";
import {button, card, miniButton, overlay, menuTitle} from "../lib/variants.js";
import {cn} from "../lib/cn.js";

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
        <div className={overlay({placement: "center"})} onClick={onClose}>
            <div className={cn(card(), "db-settings max-h-[88vh] overflow-y-auto")} ref={cardRef} tabIndex={-1}
                 onClick={(e) => e.stopPropagation()}>
                <div className={menuTitle({sm: true})}>Settings</div>
                <div className="db-set-row flex items-center justify-between gap-3.5 my-3 text-sm text-dim"><span>Default Speed</span>
                    <div className="db-seg flex gap-1" role="radiogroup"
                         aria-label="Default speed">{GAME_SPEEDS.map((s) => <button key={s} role="radio"
                                                                            aria-checked={settings.speed === s}
                                                                            className={cn(
                                                                                "min-w-[40px] py-1.5 px-2 border border-line bg-btn-bg text-dim rounded font-mono text-xs",
                                                                                settings.speed === s && "active bg-gold text-gold-contrast border-transparent"
                                                                            )}
                                                                            onClick={() => set("speed", s)}>{s}×</button>)}</div>
                </div>
                <div className="db-set-row flex items-center justify-between gap-3.5 my-3 text-sm text-dim"><span>Default View</span>
                    <div className="db-seg flex gap-1" role="radiogroup" aria-label="Default view">
                        <button className={cn(
                            "min-w-[40px] py-1.5 px-2 border border-line bg-btn-bg text-dim rounded font-mono text-xs",
                            settings.globe && "active bg-gold text-gold-contrast border-transparent"
                        )} role="radio" aria-checked={settings.globe}
                                onClick={() => set("globe", true)}>Globe
                        </button>
                        <button className={cn(
                            "min-w-[40px] py-1.5 px-2 border border-line bg-btn-bg text-dim rounded font-mono text-xs",
                            !settings.globe && "active bg-gold text-gold-contrast border-transparent"
                        )} role="radio" aria-checked={!settings.globe}
                                onClick={() => set("globe", false)}>Flat
                        </button>
                    </div>
                </div>
                <div className="db-set-row flex items-center justify-between gap-3.5 my-3 text-sm text-dim"><span>Music Volume</span>
                    <div className="db-set-slider flex items-center gap-2.5"><input type="range" min="0" max="100" aria-label="Music volume"
                                                          className="w-[120px] accent-gold"
                                                          value={Math.round((settings.musicVol ?? 0.5) * 100)}
                                                          onChange={(e) => set("musicVol", +e.target.value / 100)}/><b>{Math.round((settings.musicVol ?? 0.5) * 100)}%</b>
                    </div>
                </div>
                <div className="db-set-row flex items-center justify-between gap-3.5 my-3 text-sm text-dim"><span>Effects Volume</span>
                    <div className="db-set-slider flex items-center gap-2.5"><input type="range" min="0" max="100" aria-label="Effects volume"
                                                          className="w-[120px] accent-gold"
                                                          value={Math.round((settings.sfxVol ?? 0.8) * 100)}
                                                          onChange={(e) => set("sfxVol", +e.target.value / 100)}/><b>{Math.round((settings.sfxVol ?? 0.8) * 100)}%</b>
                    </div>
                </div>
                <div className="db-set-row flex items-center justify-between gap-3.5 my-3 text-sm text-dim"><span>Reduce Motion</span>
                    <button className={cn(
                        "db-toggle w-11 h-6 rounded border border-line bg-btn-bg relative",
                        settings.reduceMotion && "on bg-gold-soft border-[rgba(244,192,42,0.4)]"
                    )}
                            aria-pressed={settings.reduceMotion} aria-label="Reduce motion"
                            onClick={() => set("reduceMotion", !settings.reduceMotion)}>
                        <span className={cn(
                            "absolute top-0.5 left-0.5 w-[18px] h-[18px] rounded-full bg-dim transition-[transform,background] duration-150 ease-out-db",
                            settings.reduceMotion && "translate-x-5 bg-gold"
                        )}/>
                    </button>
                </div>

                <div className="db-set-head flex items-center justify-between gap-3 mt-[22px] mb-1.5 pt-4 border-t border-line font-mono text-xs tracking-[0.08em] uppercase text-faint">
                    <span>Controls</span>
                    <button className={miniButton()} onClick={() => {
                        setCapturing(null);
                        set("keys", {...DEFAULT_KEYS});
                    }}>Reset to Defaults
                    </button>
                </div>
                <div className="db-keybinds flex flex-col gap-2.5">
                    {groups.map((g) => (
                        <div key={g} className="db-keygroup">
                            <div className="db-keygroup-h font-mono text-[10.5px] tracking-[0.1em] uppercase text-faint mt-2 mb-0.5">{g}</div>
                            {KEY_ACTIONS.filter((a) => a.group === g).map((a) => (
                                <div key={a.id} className="db-set-row db-keyrow flex items-center justify-between gap-3.5 my-1.5 text-sm text-dim">
                                    <span>{a.label}</span>
                                    <button className={cn(
                                        "db-key min-w-[92px] py-1.5 px-2.5 border border-line bg-btn-bg text-text rounded font-mono text-xs text-center",
                                        capturing === a.id && "capturing border-gold bg-gold-soft text-gold"
                                    )}
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
                <div className="db-menu-hint mt-3.5 font-mono text-[11px] text-dim tracking-[0.02em]">Esc — Cancel / Menu · 1–5 — Jump to speed level (fixed)</div>

                <button className={cn(button({variant: "primary"}), "block")} onClick={onClose}>Done
                </button>
            </div>
        </div>
    );
}
