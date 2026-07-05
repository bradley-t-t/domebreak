import { SLOT_COLOR } from "../game/constants.js";

export default function ResultOverlay({ result, mySlot, players, onNewMatch }) {
  if (!result) return null;
  const winnerSlot = result.summary?.winnerSlot;
  const draw = winnerSlot === null || winnerSlot === undefined;
  const won = winnerSlot === mySlot;
  const score = result.summary?.score || {};
  const ranked = [...players].sort((a, b) => (score[b.slot] ?? 0) - (score[a.slot] ?? 0));
  return (
    <div className="gd-overlay bottom">
      <div className="gd-card result">
        <div className={`gd-outcome ${draw ? "draw" : won ? "win" : "loss"}`}>
          {draw ? "Stalemate" : won ? "Victory" : "Defeated"}
        </div>
        <div className="gd-standings">
          {ranked.map((p, i) => (
            <div key={p.slot} className={`gd-standing ${p.slot === winnerSlot ? "winner" : ""} ${p.slot === mySlot ? "me" : ""}`}>
              <span className="gd-rank">{i + 1}</span>
              <span className="gd-slot-dot" style={{ background: SLOT_COLOR[p.slot], boxShadow: `0 0 6px ${SLOT_COLOR[p.slot]}` }} />
              <span className="gd-standing-name">{p.handle}{p.is_ai ? "" : ""}</span>
              <span className="gd-standing-score">{score[p.slot] ?? 0}</span>
            </div>
          ))}
        </div>
        <button className="gd-btn primary" onClick={onNewMatch}>New match</button>
      </div>
    </div>
  );
}
