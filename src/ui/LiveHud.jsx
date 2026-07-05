import { netIncomeOf } from "../game/engine.js";

const SPEEDS = [0.5, 1, 2, 4, 10];

export default function LiveHud({ world, api, myNation }) {
  const alive = world.nations.filter((n) => n.alive).length;
  const net = myNation ? netIncomeOf(world, myNation.slot) : 0;
  return (
    <div className="gd-livehud">
      <div className="gd-points">
        <span className="gd-points-val">{Math.floor(myNation?.points ?? 0)}</span>
        <span className={`gd-points-label ${net < 0 ? "deficit" : ""}`}>pts · {net >= 0 ? "+" : "−"}{Math.abs(net).toFixed(0)}/s</span>
      </div>
      <div className="gd-speed">
        <button className={`gd-speedbtn ${world.paused ? "active" : ""}`} onClick={api.pause} title="Pause">⏸</button>
        <button className="gd-speedbtn" onClick={api.play} title="Play">▶</button>
        {SPEEDS.map((s) => (
          <button key={s} className={`gd-speedbtn ${!world.paused && world.speed === s ? "active" : ""}`}
            onClick={() => api.setSpeed(s)}>{s}×</button>
        ))}
      </div>
      <div className="gd-clock">
        <span>{Math.floor(world.time / 60)}:{String(Math.floor(world.time % 60)).padStart(2, "0")}</span>
        <span className="gd-nations-left">{alive} nations</span>
      </div>
    </div>
  );
}
