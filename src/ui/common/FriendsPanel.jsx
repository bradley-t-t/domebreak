import {useEffect, useState} from "react";
import {acceptFriend, fetchFriends, removeFriend, requestFriend} from "../../account/social.js";
import {useModal} from "../hooks/useModal.js";
import "./a11y.css";

// Command network: add/accept/decline/remove friends. A simple modal card —
// opened from MeBadge, closes on backdrop click or Escape.
export default function FriendsPanel({onClose}) {
    const [friends, setFriends] = useState([]);
    const [loading, setLoading] = useState(true);
    const [input, setInput] = useState("");
    const [addErr, setAddErr] = useState(null);
    const [busy, setBusy] = useState(false);
    const ref = useModal(onClose);
    const titleId = "gd-friends-title";

    const load = () => fetchFriends().then((f) => {
        setFriends(f);
        setLoading(false);
    });

    useEffect(() => {
        load();
    }, []);

    const add = async () => {
        const name = input.trim();
        if (!name || busy) return;
        setBusy(true);
        setAddErr(null);
        const r = await requestFriend(name);
        setBusy(false);
        if (r?.error) {
            setAddErr(r.error);
            return;
        }
        setInput("");
        load();
    };
    const act = async (fn, id) => {
        if (busy) return;
        setBusy(true);
        await fn(id);
        setBusy(false);
        load();
    };

    const incoming = friends.filter((f) => f.direction === "in" && f.status === "pending");
    const outgoing = friends.filter((f) => f.direction === "out" && f.status === "pending");
    const accepted = friends.filter((f) => f.status === "accepted");

    return (
        <div className="gd-overlay center" onClick={onClose}>
            <div className="gd-card gd-friends" ref={ref} tabIndex={-1} role="dialog" aria-modal="true"
                 aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
                <div className="gd-menu-title sm" id={titleId}>Command Network</div>
                <div className="gd-row">
                    <label className="sr-only" htmlFor="gd-friends-input">Commander username</label>
                    <input id="gd-friends-input" className="gd-input" placeholder="Commander username" value={input}
                           maxLength={24} onChange={(e) => setInput(e.target.value)}
                           onKeyDown={(e) => {
                               if (e.key === "Enter") add();
                           }}/>
                    <button className="gd-btn primary" disabled={!input.trim() || busy} onClick={add}>Add</button>
                </div>
                <div aria-live="assertive">
                    {addErr && <p className="gd-friends-err">{addErr}</p>}
                </div>

                {loading && <p className="gd-sub">Loading allies…</p>}
                {!loading && friends.length === 0 && (
                    <p className="gd-sub">No allies yet — add a commander by name.</p>
                )}

                {incoming.length > 0 && (
                    <div className="gd-friends-section">
                        <div className="gd-label" id="gd-friends-requests-h">Requests</div>
                        <div role="list" aria-labelledby="gd-friends-requests-h">
                            {incoming.map((f) => {
                                const uname = f.other?.username || "Commander";
                                return (
                                    <div key={f.id} className="gd-friends-row" role="listitem"
                                         aria-label={`${uname} — incoming request`}>
                                        <span className="gd-friends-name">{uname}</span>
                                        <div className="gd-friends-row-actions">
                                            <button className="gd-mini" disabled={busy}
                                                    aria-label={`Accept request from ${uname}`}
                                                    onClick={() => act(acceptFriend, f.id)}>Accept
                                            </button>
                                            <button className="gd-mini danger" disabled={busy}
                                                    aria-label={`Decline request from ${uname}`}
                                                    onClick={() => act(removeFriend, f.id)}>Decline
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {outgoing.length > 0 && (
                    <div className="gd-friends-section">
                        <div className="gd-label" id="gd-friends-pending-h">Pending</div>
                        <div role="list" aria-labelledby="gd-friends-pending-h">
                            {outgoing.map((f) => {
                                const uname = f.other?.username || "Commander";
                                return (
                                    <div key={f.id} className="gd-friends-row" role="listitem"
                                         aria-label={`${uname} — pending request`}>
                                        <span className="gd-friends-name">{uname}</span>
                                        <div className="gd-friends-row-actions">
                                            <button className="gd-mini danger" disabled={busy}
                                                    aria-label={`Cancel request to ${uname}`}
                                                    onClick={() => act(removeFriend, f.id)}>Cancel
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {accepted.length > 0 && (
                    <div className="gd-friends-section">
                        <div className="gd-label" id="gd-friends-list-h">Friends</div>
                        <div role="list" aria-labelledby="gd-friends-list-h">
                            {accepted.map((f) => {
                                const uname = f.other?.username || "Commander";
                                return (
                                    <div key={f.id} className="gd-friends-row" role="listitem"
                                         aria-label={`${uname} — friend`}>
                                        <span className="gd-friends-name">{uname}</span>
                                        <div className="gd-friends-row-actions">
                                            <button className="gd-mini danger" disabled={busy}
                                                    aria-label={`Remove ${uname} from friends`}
                                                    onClick={() => act(removeFriend, f.id)}>Remove
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <button className="gd-btn block" onClick={onClose}>Close</button>
            </div>
        </div>
    );
}
