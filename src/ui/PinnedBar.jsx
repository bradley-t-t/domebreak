import { SLOT_COLOR } from "../game/constants.js";

export default function PinnedBar({ pins, onGo, onRemove }) {
  if (!pins.length) return null;
  return (
    <div className="gd-pins">
      <div className="gd-pins-title">Pinned</div>
      {pins.map((p) => (
        <div key={p.key} className="gd-pin">
          <button className="gd-pin-go" onClick={() => onGo(p)} title="Fly to">
            <span className="gd-slot-dot" style={{ background: p.color || SLOT_COLOR[0] }} />{p.label}
          </button>
          <button className="gd-pin-x" onClick={() => onRemove(p.key)}>×</button>
        </div>
      ))}
    </div>
  );
}
