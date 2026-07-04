import { useState } from "react";

export default function Home({ onCreate, onJoin, busy, error }) {
  const [handle, setHandle] = useState("");
  const [code, setCode] = useState("");
  return (
    <div className="gd-overlay center">
      <div className="gd-card wide">
        <h1 className="gd-title">GOLDEN<span>DOME</span></h1>
        <p className="gd-sub">Build your arsenal. When the clock runs out, the missiles fly.</p>
        <label className="gd-label">Commander name</label>
        <input className="gd-input" value={handle} maxLength={24}
          placeholder="e.g. NORAD" onChange={(e) => setHandle(e.target.value)} />
        <div className="gd-row">
          <button className="gd-btn primary" disabled={busy} onClick={() => onCreate(handle || "Commander")}>
            Create match
          </button>
        </div>
        <div className="gd-divider"><span>or join</span></div>
        <div className="gd-row">
          <input className="gd-input mono" value={code} maxLength={5} placeholder="CODE"
            onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <button className="gd-btn" disabled={busy || code.length < 5}
            onClick={() => onJoin(code, handle || "Commander")}>Join</button>
        </div>
        {error && <p className="gd-error">{error}</p>}
      </div>
    </div>
  );
}
