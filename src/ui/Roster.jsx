import { SLOT_COLOR } from "../game/constants.js";

// Live roster during the build phase. The host can hand any human seat to an AI
// at any time (unlimited replacements).
export default function Roster({ players, meId, isHost, onReplaceAi, busy }) {
  return (
    <div className="gd-roster">
      <div className="gd-roster-title">Nations</div>
      {players.map((p) => (
        <div key={p.slot} className="gd-roster-row">
          <span className="gd-slot-dot" style={{ background: SLOT_COLOR[p.slot], boxShadow: `0 0 6px ${SLOT_COLOR[p.slot]}` }} />
          <span className="gd-roster-name">{p.handle}{p.player_id === meId ? " (you)" : ""}</span>
          {p.ready && <span className="gd-ready">✓</span>}
          {isHost && !p.is_ai && p.slot !== 0 &&
            <button className="gd-mini" disabled={busy} onClick={() => onReplaceAi(p.slot)}>→ AI</button>}
        </div>
      ))}
    </div>
  );
}
