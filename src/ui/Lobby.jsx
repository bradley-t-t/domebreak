export default function Lobby({ match, players, isHost, onStart, busy, error }) {
  const full = players.length >= 2;
  return (
    <div className="gd-overlay bottom">
      <div className="gd-card">
        <div className="gd-lobby-head">
          <div>
            <div className="gd-label">Match code</div>
            <div className="gd-code">{match.code}</div>
          </div>
          <div className="gd-players">
            {[0, 1].map((slot) => {
              const p = players.find((x) => x.slot === slot);
              return (
                <div key={slot} className={`gd-slot ${p ? "filled" : ""}`}>
                  <span className="gd-slot-dot" data-slot={slot} />
                  {p ? p.handle : "waiting…"}
                </div>
              );
            })}
          </div>
        </div>
        {isHost
          ? <button className="gd-btn primary" disabled={!full || busy} onClick={onStart}>
              {full ? "Start build phase" : "Waiting for opponent…"}
            </button>
          : <p className="gd-sub">Share the code. The host starts the match.</p>}
        {error && <p className="gd-error">{error}</p>}
      </div>
    </div>
  );
}
