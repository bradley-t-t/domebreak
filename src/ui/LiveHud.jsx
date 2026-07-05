const SPEEDS = [0.5, 1, 2, 4, 10];

export default function LiveHud({ world, api, myNation }) {
  const alive = world.nations.filter((n) => n.alive).length;
  return (
    <div className="gd-livehud">
      <div className="gd-points">
        <span className="gd-points-val">{Math.floor(myNation?.points ?? 0)}</span>
        <span className="gd-points-label">pts · +{Math.round(myNation ? (10 + world.cities.filter((c) => c.slot === myNation.slot && c.alive).length * 8) : 0)}/s</span>
      </div>
      <div className="gd-speed">
        <button className={`gd-speedbtn ${world.paused ? "active" : ""}`} onClick={api.pause} title="Pause">⏸</button>
        <button className={`gd-speedbtn ${!world.paused && world.speed === 1 ? "" : ""}`} onClick={api.play} title="Play">▶</button>
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
