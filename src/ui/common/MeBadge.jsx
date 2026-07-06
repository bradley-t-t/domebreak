import {useEffect, useRef, useState} from "react";
import Flag from "./Flag.jsx";
import FriendsPanel from "./FriendsPanel.jsx";
import {useModal} from "../hooks/useModal.js";

// "Month Year" from an ISO created_at timestamp — mirrors StartMenu's commander strip.
const monthYear = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, {month: "long", year: "numeric"});
};

// The popover's own subtree, mounted only while open. Split out so useModal's
// once-per-mount focus-trap effect binds at the moment the popover actually
// enters the DOM (MeBadge itself stays mounted the whole time, so the hook
// can't live on the parent — its ref would never attach).
function MeBadgePopover({profile, stats, since, total, winRate, hours, inGame, players, onSignOut, onClose, onOpenFriends}) {
    const ref = useModal(onClose);
    const titleId = "gd-mebadge-title";
    return (
        <div className="gd-mebadge-pop" ref={ref} tabIndex={-1} role="dialog" aria-modal="true"
             aria-labelledby={titleId}>
            <div className="gd-mebadge-id">
                <span className="gd-mebadge-uname" id={titleId}>{profile?.username || "—"}</span>
                <span className="gd-mebadge-role">Commander</span>
            </div>
            <div className="gd-mebadge-since">{profile ? `Commander since ${since || "—"}` : "—"}</div>
            <div className="gd-mebadge-stats" role="group" aria-label="Career record">
                <span title="Wins" aria-label={stats ? `${stats.wins} wins` : "Wins — unavailable"}>{stats ? `${stats.wins}W` : "—"}</span>
                <span title="Losses" aria-label={stats ? `${stats.losses} losses` : "Losses — unavailable"}>{stats ? `${stats.losses}L` : "—"}</span>
                <span title="Total matches played" aria-label={stats ? `${total} matches played` : "Matches — unavailable"}>{stats ? `${total} Matches` : "—"}</span>
                <span title="Win rate" aria-label={stats ? `${winRate} percent win rate` : "Win rate — unavailable"}>{stats ? `${winRate}% Win Rate` : "—"}</span>
                <span title="Total time in command" aria-label={hours != null ? `${hours} hours playtime` : "Playtime — unavailable"}>{hours != null ? `${hours}h Playtime` : "—"}</span>
            </div>
            {inGame && players?.length > 0 && (
                <div className="gd-mebadge-roster">
                    <div className="gd-mebadge-roster-title" id="gd-mebadge-roster-h">In This War</div>
                    <div role="list" aria-labelledby="gd-mebadge-roster-h">
                        {players.map((p) => (
                            <div key={p.slot} className="gd-mebadge-roster-row" role="listitem"
                                 aria-label={`${p.username || "Commander"} — ${p.iso || "no nation"}`}>
                                <Flag iso={p.iso}/>
                                <span>{p.username || "Commander"}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            <div className="gd-mebadge-actions">
                <button className="gd-mini" onClick={onOpenFriends}>Friends</button>
                {onSignOut && <button className="gd-mini danger" aria-label="Sign out of commander account"
                                       onClick={onSignOut}>Sign Out</button>}
            </div>
        </div>
    );
}

// Persistent identity chip: fixed top-right on menu screens, inline (chip-only)
// when mounted inside the live HUD's top-button strip. Click opens a popover
// with stats, the friends roster, and (in-match) the human roster.
export default function MeBadge({profile, stats, onSignOut, inGame, players}) {
    const [open, setOpen] = useState(false);
    const [friendsOpen, setFriendsOpen] = useState(false);
    const rootRef = useRef(null);

    // Outside-click closes the popover — useModal handles Escape + focus trap
    // + restoration once the popover itself is mounted; this effect only
    // needs to cover the backdrop-click case, which useModal doesn't do.
    useEffect(() => {
        if (!open) return;
        const onDown = (e) => {
            if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
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
                <MeBadgePopover profile={profile} stats={stats} since={since} total={total} winRate={winRate}
                                hours={hours} inGame={inGame} players={players} onSignOut={onSignOut}
                                onClose={() => setOpen(false)} onOpenFriends={() => setFriendsOpen(true)}/>
            )}
            {friendsOpen && <FriendsPanel onClose={() => setFriendsOpen(false)}/>}
        </div>
    );
}
