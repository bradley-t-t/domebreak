import {useEffect, useState} from "react";
import {acceptFriend, fetchFriends, removeFriend, requestFriend} from "../../account/social.js";

// Command network: add/accept/decline/remove friends. A simple modal card —
// opened from MeBadge, closes on backdrop click or Escape.
export default function FriendsPanel({onClose}) {
    const [friends, setFriends] = useState([]);
    const [loading, setLoading] = useState(true);
    const [input, setInput] = useState("");
    const [addErr, setAddErr] = useState(null);
    const [busy, setBusy] = useState(false);

    const load = () => fetchFriends().then((f) => {
        setFriends(f);
        setLoading(false);
    });

    useEffect(() => {
        load();
    }, []);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "Escape") onClose?.();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

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
            <div className="gd-card gd-friends" onClick={(e) => e.stopPropagation()}>
                <div className="gd-menu-title sm">Command Network</div>
                <div className="gd-row">
                    <input className="gd-input" placeholder="Commander username" value={input} maxLength={24}
                           onChange={(e) => setInput(e.target.value)}
                           onKeyDown={(e) => {
                               if (e.key === "Enter") add();
                           }}/>
                    <button className="gd-btn primary" disabled={!input.trim() || busy} onClick={add}>Add</button>
                </div>
                {addErr && <p className="gd-friends-err">{addErr}</p>}

                {loading && <p className="gd-sub">Loading allies…</p>}
                {!loading && friends.length === 0 && (
                    <p className="gd-sub">No allies yet — add a commander by name.</p>
                )}

                {incoming.length > 0 && (
                    <div className="gd-friends-section">
                        <div className="gd-label">Requests</div>
                        {incoming.map((f) => (
                            <div key={f.id} className="gd-friends-row">
                                <span className="gd-friends-name">{f.other?.username || "Commander"}</span>
                                <div className="gd-friends-row-actions">
                                    <button className="gd-mini" disabled={busy}
                                            onClick={() => act(acceptFriend, f.id)}>Accept
                                    </button>
                                    <button className="gd-mini danger" disabled={busy}
                                            onClick={() => act(removeFriend, f.id)}>Decline
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {outgoing.length > 0 && (
                    <div className="gd-friends-section">
                        <div className="gd-label">Pending</div>
                        {outgoing.map((f) => (
                            <div key={f.id} className="gd-friends-row">
                                <span className="gd-friends-name">{f.other?.username || "Commander"}</span>
                                <div className="gd-friends-row-actions">
                                    <button className="gd-mini danger" disabled={busy}
                                            onClick={() => act(removeFriend, f.id)}>Cancel
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {accepted.length > 0 && (
                    <div className="gd-friends-section">
                        <div className="gd-label">Friends</div>
                        {accepted.map((f) => (
                            <div key={f.id} className="gd-friends-row">
                                <span className="gd-friends-name">{f.other?.username || "Commander"}</span>
                                <div className="gd-friends-row-actions">
                                    <button className="gd-mini danger" disabled={busy}
                                            onClick={() => act(removeFriend, f.id)}>Remove
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <button className="gd-btn block" onClick={onClose}>Close</button>
            </div>
        </div>
    );
}
