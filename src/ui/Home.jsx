import { useState } from "react";
import { MAX_SLOTS } from "../game/constants.js";

export default function Home({ onCreate, onJoin, busy, error }) {
  const [handle, setHandle] = useState("");
  const [code, setCode] = useState("");
  const [slots, setSlots] = useState(4);
  return (
    <div className="gd-overlay center">
      <div className="gd-card wide">
        <h1 className="gd-title">GOLDEN<span>DOME</span></h1>
        <p className="gd-sub">Build your arsenal. When the clock runs out, the missiles fly.</p>
        <label className="gd-label">Commander name</label>
        <input className="gd-input" value={handle} maxLength={24}
          placeholder="e.g. NORAD" onChange={(e) => setHandle(e.target.value)} />
        <label className="gd-label mt">Countries in play</label>
        <div className="gd-stepper">
          <button className="gd-ghost" onClick={() => setSlots((s) => Math.max(2, s - 1))}>−</button>
          <span className="gd-stepper-val">{slots}</span>
          <button className="gd-ghost" onClick={() => setSlots((s) => Math.min(MAX_SLOTS, s + 1))}>+</button>
          <span className="gd-sub">seats — fill with players or AI next</span>
        </div>
        <div className="gd-row">
          <button className="gd-btn primary" disabled={busy} onClick={() => onCreate(handle || "Commander", slots)}>
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
