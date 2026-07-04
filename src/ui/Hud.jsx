export default function Hud({ phase, handle, globe, onToggleGlobe, onQuit }) {
  return (
    <header className="gd-hud">
      <div className="gd-brand">GOLDEN<span>DOME</span></div>
      <div className="gd-hud-right">
        {phase && <span className="gd-chip">{phase}</span>}
        {handle && <span className="gd-chip subtle">{handle}</span>}
        <button className="gd-ghost" onClick={onToggleGlobe}>{globe ? "Globe" : "Flat"}</button>
        {onQuit && <button className="gd-ghost" onClick={onQuit}>Leave</button>}
      </div>
    </header>
  );
}
