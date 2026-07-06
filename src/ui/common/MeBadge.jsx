import {useEffect, useRef, useState} from "react";
import Flag from "./Flag.jsx";
import FriendsPanel from "./FriendsPanel.jsx";

// "Month Year" from an ISO created_at timestamp — mirrors StartMenu's commander strip.
const monthYear = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, {month: "long", year: "numeric"});
};

// Persistent identity chip: fixed top-right on menu screens, inline (chip-only)
// when mounted inside the live HUD's top-button strip. Click opens a popover
// with stats, the friends roster, and (in-match) the human roster.
export default function MeBadge({profile, stats, onSignOut, inGame, players}) {
    const [open, setOpen] = useState(false);
    const [friendsOpen, setFriendsOpen] = useState(false);
    const rootRef = useRef(null);

    // Outside-click + Escape close the popover — only listens while open, so
    // this never adds work to the common render path.
    useEffect(() => {
        if (!open) return;
        const onDown = (e) => {
            if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
        };
        const onKey = (e) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        window.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            window.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const since = monthYear(profile?.created_at);
    const total = stats?.total_matches ?? 0;
    const winRate = total > 0 ? Math.round(((stats?.wins ?? 0) / total) * 100) : 0;
    const hours = stats ? (stats.total_playtime_s / 3600).toFixed(1) : null;
    const initial = (profile?.username || "?").charAt(0).toUpperCase();

    return (
        <div ref={rootRef} className={`gd-mebadge ${inGame ? "ingame" : ""}`}>
            <button className="gd-mebadge-chip" onClick={() => setOpen((v) => !v)} aria-haspopup="true"
                    aria-expanded={open} aria-label="Commander profile">
                <span className="gd-mebadge-mono">{initial}</span>
                {!inGame && <span className="gd-mebadge-name">{profile?.username || "—"}</span>}
            </button>
            {open && (
                <div className="gd-mebadge-pop">
                    <div className="gd-mebadge-id">
                        <span className="gd-mebadge-uname">{profile?.username || "—"}</span>
                        <span className="gd-mebadge-role">Commander</span>
                    </div>
                    <div className="gd-mebadge-since">{profile ? `Commander since ${since || "—"}` : "—"}</div>
                    <div className="gd-mebadge-stats">
                        <span>{stats ? `${stats.wins}W` : "—"}</span>
                        <span>{stats ? `${stats.losses}L` : "—"}</span>
                        <span>{stats ? `${total} Matches` : "—"}</span>
                        <span>{stats ? `${winRate}% Win Rate` : "—"}</span>
                        <span>{hours != null ? `${hours}h Playtime` : "—"}</span>
                    </div>
                    {inGame && players?.length > 0 && (
                        <div className="gd-mebadge-roster">
                            <div className="gd-mebadge-roster-title">In This War</div>
                            {players.map((p) => (
                                <div key={p.slot} className="gd-mebadge-roster-row">
                                    <Flag iso={p.iso}/>
                                    <span>{p.username || "Commander"}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="gd-mebadge-actions">
                        <button className="gd-mini" onClick={() => setFriendsOpen(true)}>Friends</button>
                        {onSignOut && <button className="gd-mini danger" onClick={onSignOut}>Sign Out</button>}
                    </div>
                </div>
            )}
            {friendsOpen && <FriendsPanel onClose={() => setFriendsOpen(false)}/>}
        </div>
    );
}
