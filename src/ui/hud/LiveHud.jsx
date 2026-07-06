import {gdpOf, industryOutputOf, netIncomeOf, populationOf} from "../../game/engine.js";
import {GAME_SPEEDS} from "../../game/data/constants.js";
import {keyLabel, resolveKeys} from "../../game/platform/keybindings.js";
import {fmtNet, fmtPop} from "../common/format.js";
import "./LiveHud.css";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SEC_PER_GS = 1800; // 30 in-game minutes per game-second

function gameDate(t) {
    const d = new Date(Date.UTC(2026, 0, 1) + t * SEC_PER_GS * 1000);
    return {
        date: `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`,
        time: `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`
    };
}

// Top-bar command screens, relocated here from the old left-side console.
const NAV = [
    {id: "production", label: "Production", glyph: "▣"},
    {id: "research", label: "Research", glyph: "❉"},
    {id: "diplomacy", label: "Diplomacy", glyph: "⚑"},
];

export default function LiveHud({world, api, myNation, panel, onPanel, keys}) {
    const K = resolveKeys(keys);
    const net = myNation ? netIncomeOf(world, myNation.slot) : 0;
    const pop = myNation ? populationOf(world, myNation.slot) : 0;
    const gdp = myNation ? gdpOf(world, myNation.slot) : 0;
    const ind = myNation ? industryOutputOf(world, myNation.slot) : 0;
    const alive = world.nations.filter((n) => n.alive).length;
    const {date, time} = gameDate(world.time);
    return (
        <div className="gd-livehud">
            <div className="gd-hud-cell"><span className="gd-hud-lbl">Date</span><span
                className="gd-hud-val">{date}</span><span className="gd-hud-sub">{time}</span></div>
            <div className="gd-hud-sep"/>
            <div className="gd-points"><span className="gd-points-val">{Math.floor(myNation?.points ?? 0)}</span><span
                className={`gd-points-label ${net < 0 ? "deficit" : ""}`}>PTS · {fmtNet(net)}/s</span>
                {net < 0 && <span className="gd-deficit-chip">DEFICIT</span>}
            </div>
            <div className="gd-hud-sep"/>
            <div className="gd-speed"
                 title={`${keyLabel(K.pause)} — Pause · ${keyLabel(K.speedDown)}/${keyLabel(K.speedUp)} — Speed · 1–5 — Speed Level`}>
                <button className={`gd-speedbtn ${world.paused ? "active" : ""}`} onClick={api.pause}
                        aria-pressed={world.paused}
                        title={`Pause (${keyLabel(K.pause)})`}>⏸
                </button>
                <button className="gd-speedbtn" onClick={api.play} aria-pressed={!world.paused}
                        title={`Resume (${keyLabel(K.pause)})`}>▶</button>
                {GAME_SPEEDS.map((s, i) => <button key={s}
                                                   className={`gd-speedbtn ${!world.paused && world.speed === s ? "active" : ""}`}
                                                   aria-pressed={!world.paused && world.speed === s}
                                                   onClick={() => api.setSpeed(s)}
                                                   title={`Speed ${s}× (${i + 1})`}>{s}×</button>)}
            </div>
            <div className="gd-hud-sep"/>
            <div className="gd-hud-cell right"><span className="gd-hud-lbl">GDP</span><span
                className="gd-hud-val">${gdp.toFixed(2)}T</span><span
                className="gd-hud-sub">Industry +{ind.toFixed(1)}/s</span></div>
            <div className="gd-hud-sep"/>
            <div className="gd-hud-cell right"><span className="gd-hud-lbl">Population</span><span
                className="gd-hud-val">{fmtPop(pop)}</span><span className="gd-hud-sub" aria-live="polite">{alive} Powers Left</span></div>
            {onPanel && <>
                <div className="gd-hud-sep"/>
                <div className="gd-hud-nav">
                    {NAV.map((n) => (
                        <button key={n.id} className={`gd-navbtn ${panel === n.id ? "active" : ""}`}
                                onClick={() => onPanel(n.id)} title={`${n.label} (${keyLabel(K[n.id])})`}
                                aria-label={n.label}>
                            <span className="gd-navbtn-g">{n.glyph}</span>
                            <span className="gd-navbtn-t">{n.label}</span>
                        </button>
                    ))}
                </div>
            </>}
        </div>
    );
}
