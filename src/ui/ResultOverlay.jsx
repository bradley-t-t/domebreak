export default function ResultOverlay({ result, mySlot, players, onNewMatch }) {
  if (!result) return null;
  const winnerSlot = result.summary?.winnerSlot;
  const draw = winnerSlot === null || winnerSlot === undefined;
  const won = winnerSlot === mySlot;
  const score = result.summary?.score || {};
  return (
    <div className="gd-overlay bottom">
      <div className="gd-card result">
        <div className={`gd-outcome ${draw ? "draw" : won ? "win" : "loss"}`}>
          {draw ? "Stalemate" : won ? "Victory" : "Defeated"}
        </div>
        <div className="gd-scoreline">
          {[0, 1].map((s) => {
            const p = players.find((x) => x.slot === s);
            return (
              <div key={s} className="gd-score">
                <span className="gd-slot-dot" data-slot={s} />
                {p?.handle || `Slot ${s}`}: <strong>{score[s] ?? 0}</strong>
              </div>
            );
          })}
        </div>
        <button className="gd-btn primary" onClick={onNewMatch}>New match</button>
      </div>
    </div>
  );
}
