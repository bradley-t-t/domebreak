import { TOOLS } from "../game/constants.js";

export default function BuildBar({ me, tool, setTool, secondsLeft, ready, onReady, busy, error }) {
  const budget = me?.budget ?? 0;
  const spent = me?.spent ?? 0;
  const remaining = budget - spent;
  const mm = String(Math.floor(Math.max(0, secondsLeft) / 60)).padStart(1, "0");
  const ss = String(Math.max(0, secondsLeft) % 60).padStart(2, "0");
  return (
    <div className="gd-overlay bottom">
      <div className="gd-card build">
        <div className="gd-build-top">
          <div className={`gd-timer ${secondsLeft <= 15 ? "urgent" : ""}`}>{mm}:{ss}</div>
          <div className="gd-budget">
            <span className="gd-label">Budget</span>
            <strong>{remaining}</strong> <span className="subtle">/ {budget}</span>
          </div>
          <button className={`gd-btn ${ready ? "" : "primary"}`} disabled={busy || ready} onClick={onReady}>
            {ready ? "Ready ✓" : "Ready up"}
          </button>
        </div>
        <div className="gd-tools">
          {Object.entries(TOOLS).map(([key, t]) => {
            const afford = remaining >= t.cost;
            return (
              <button key={key} className={`gd-tool ${tool === key ? "active" : ""} ${afford ? "" : "poor"}`}
                onClick={() => setTool(tool === key ? null : key)} title={t.hint}>
                <span className="gd-tool-glyph">{t.glyph}</span>
                <span className="gd-tool-label">{t.label}</span>
                <span className="gd-tool-cost">{t.cost}</span>
              </button>
            );
          })}
        </div>
        <p className="gd-hint">
          {tool === "silo" ? "Click an enemy city to target it."
            : tool ? "Click your territory to place." : "Pick a system, then click the map."}
        </p>
        {error && <p className="gd-error">{error}</p>}
      </div>
    </div>
  );
}
