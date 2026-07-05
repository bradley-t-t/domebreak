import {MAX_SLOTS, SLOT_COLOR} from "../game/constants.js";

export default function Lobby({
                                  match,
                                  players,
                                  isHost,
                                  meId,
                                  onStart,
                                  onAddAi,
                                  onRemove,
                                  onReplaceAi,
                                  onSetSlots,
                                  busy,
                                  error
                              }) {
    const bySlot = {};
    for (const p of players) bySlot[p.slot] = p;
    const filled = players.length;
    const highest = players.reduce((m, p) => Math.max(m, p.slot), 0);
    const slots = Array.from({length: match.max_slots}, (_, i) => i);
    return (
        <div className="gd-overlay bottom">
            <div className="gd-card build">
                <div className="gd-lobby-head">
                    <div>
                        <div className="gd-label">Match code</div>
                        <div className="gd-code">{match.code}</div>
                    </div>
                    {isHost && (
                        <div className="gd-slotcount">
                            <span className="gd-label">Seats</span>
                            <button className="gd-ghost" disabled={busy || match.max_slots <= Math.max(2, highest + 1)}
                                    onClick={() => onSetSlots(match.max_slots - 1)}>−
                            </button>
                            <span className="gd-stepper-val sm">{match.max_slots}</span>
                            <button className="gd-ghost" disabled={busy || match.max_slots >= MAX_SLOTS}
                                    onClick={() => onSetSlots(match.max_slots + 1)}>+
                            </button>
                        </div>
                    )}
                </div>
                <div className="gd-slotgrid">
                    {slots.map((i) => {
                        const p = bySlot[i];
                        const isMe = p && p.player_id === meId;
                        const isHostSeat = p && p.slot === 0;
                        return (
                            <div key={i} className={`gd-slotrow ${p ? (p.is_ai ? "ai" : "human") : "open"}`}>
                                <span className="gd-slot-dot"
                                      style={{background: SLOT_COLOR[i], boxShadow: `0 0 8px ${SLOT_COLOR[i]}`}}/>
                                <span className="gd-slotname">
                  {p ? p.handle : "Open seat"}{isMe ? " (you)" : ""}
                </span>
                                {isHost && (
                                    <span className="gd-slotctl">
                    {!p && <button className="gd-mini" disabled={busy} onClick={() => onAddAi(i)}>+ AI</button>}
                                        {p && p.is_ai && <button className="gd-mini danger" disabled={busy}
                                                                 onClick={() => onRemove(i)}>Remove</button>}
                                        {p && !p.is_ai && !isHostSeat &&
                                            <button className="gd-mini" disabled={busy} onClick={() => onReplaceAi(i)}>→
                                                AI</button>}
                  </span>
                                )}
                            </div>
                        );
                    })}
                </div>
                {isHost
                    ? <button className="gd-btn primary" disabled={busy || filled < 2} onClick={onStart}>
                        {filled < 2 ? "Add players or AI (need 2+)" : `Start build phase — ${filled} nations`}
                    </button>
                    : <p className="gd-sub">Waiting for the host to start. Others can join with the code.</p>}
                {error && <p className="gd-error">{error}</p>}
            </div>
        </div>
    );
}
