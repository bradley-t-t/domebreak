import {netIncomeOf, populationOf} from "../game/engine.js";
import {GAME_SPEEDS} from "../game/constants.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SEC_PER_GS = 1800; // 30 in-game minutes per game-second

function gameDate(t) {
    const d = new Date(Date.UTC(2026, 0, 1) + t * SEC_PER_GS * 1000);
    return {
        date: `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`,
        time: `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`
    };
}

function fmtPop(p) {
    if (p >= 1e9) return (p / 1e9).toFixed(2) + "B";
    if (p >= 1e6) return (p / 1e6).toFixed(0) + "M";
    if (p >= 1e3) return (p / 1e3).toFixed(0) + "K";
    return "" + Math.round(p);
}

export default function LiveHud({world, api, myNation}) {
    const net = myNation ? netIncomeOf(world, myNation.slot) : 0;
    const pop = myNation ? populationOf(world, myNation.slot) : 0;
    const alive = world.nations.filter((n) => n.alive).length;
    const {date, time} = gameDate(world.time);
    return (
        <div className="gd-livehud">
            <div className="gd-hud-cell"><span className="gd-hud-lbl">Date</span><span
                className="gd-hud-val">{date}</span><span className="gd-hud-sub">{time}</span></div>
            <div className="gd-hud-sep"/>
            <div className="gd-points"><span className="gd-points-val">{Math.floor(myNation?.points ?? 0)}</span><span
                className={`gd-points-label ${net < 0 ? "deficit" : ""}`}>pts · {net >= 0 ? "+" : "−"}{Math.abs(net).toFixed(0)}/s</span>
            </div>
            <div className="gd-hud-sep"/>
            <div className="gd-speed" title="Space: pause · + / − : speed · 1–5: speed level">
                <button className={`gd-speedbtn ${world.paused ? "active" : ""}`} onClick={api.pause}
                        title="Pause (Space)">⏸
                </button>
                <button className="gd-speedbtn" onClick={api.play} title="Resume (Space)">▶</button>
                {GAME_SPEEDS.map((s, i) => <button key={s}
                                                    className={`gd-speedbtn ${!world.paused && world.speed === s ? "active" : ""}`}
                                                    onClick={() => api.setSpeed(s)}
                                                    title={`Speed ${s}× (${i + 1})`}>{s}×</button>)}
            </div>
            <div className="gd-hud-sep"/>
            <div className="gd-hud-cell right"><span className="gd-hud-lbl">Population</span><span
                className="gd-hud-val">{fmtPop(pop)}</span><span className="gd-hud-sub">{alive} powers left</span></div>
        </div>
    );
}
