import {useEffect, useRef, useState} from "react";
import Flag from "./Flag.jsx";
import FriendsPanel from "./FriendsPanel.jsx";
import {useModal} from "../hooks/useModal.js";
import {miniButton} from "../lib/variants.js";
import {cn} from "../lib/cn.js";

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
        <div className="gd-mebadge-pop absolute top-[calc(100%+8px)] right-0 w-[260px] px-4 py-[14px] border border-line rounded bg-panel-2 backdrop-blur-[14px] shadow animate-[gdPop_150ms_var(--ease-out)]"
             ref={ref} tabIndex={-1} role="dialog" aria-modal="true"
             aria-labelledby={titleId}>
            <div className="flex items-baseline justify-between gap-2">
                <span className="font-display font-bold text-sm text-text" id={titleId}>{profile?.username || "—"}</span>
                <span className="text-[10px] tracking-[1px] uppercase text-faint">Commander</span>
            </div>
            <div className="text-faint text-[11px] mt-[3px]">{profile ? `Commander since ${since || "—"}` : "—"}</div>
            <div className="flex flex-wrap gap-x-[10px] gap-y-1 mt-[10px] pt-[10px] border-t border-line-soft font-mono text-[11px] text-dim"
                 role="group" aria-label="Career record">
                <span title="Wins" aria-label={stats ? `${stats.wins} wins` : "Wins — unavailable"}>{stats ? `${stats.wins}W` : "—"}</span>
                <span title="Losses" aria-label={stats ? `${stats.losses} losses` : "Losses — unavailable"}>{stats ? `${stats.losses}L` : "—"}</span>
                <span title="Total matches played" aria-label={stats ? `${total} matches played` : "Matches — unavailable"}>{stats ? `${total} Matches` : "—"}</span>
                <span title="Win rate" aria-label={stats ? `${winRate} percent win rate` : "Win rate — unavailable"}>{stats ? `${winRate}% Win Rate` : "—"}</span>
                <span title="Total time in command" aria-label={hours != null ? `${hours} hours playtime` : "Playtime — unavailable"}>{hours != null ? `${hours}h Playtime` : "—"}</span>
            </div>
            {inGame && players?.length > 0 && (
                <div className="mt-[10px] pt-[10px] border-t border-line-soft">
                    <div className="font-display text-[10px] tracking-[1.2px] uppercase text-faint mb-1.5" id="gd-mebadge-roster-h">In This War</div>
                    <div role="list" aria-labelledby="gd-mebadge-roster-h">
                        {players.map((p) => (
                            <div key={p.slot} className="flex items-center gap-2 py-[3px] text-xs text-text" role="listitem"
                                 aria-label={`${p.username || "Commander"} — ${p.iso || "no nation"}`}>
                                <Flag iso={p.iso}/>
                                <span>{p.username || "Commander"}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            <div className="flex gap-2 mt-3">
                <button className={cn(miniButton(), "flex-1")} onClick={onOpenFriends}>Friends</button>
                {onSignOut && <button className={cn(miniButton({danger: true}), "flex-1")} aria-label="Sign out of commander account"
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
        <div ref={rootRef}
             className={cn("z-20", inGame ? "static" : "fixed top-[14px] right-4")}>
            <button className={cn(
                "flex items-center gap-2 h-[38px] rounded border border-line bg-panel text-text backdrop-blur-[8px] transition-[border-color,transform] duration-150 ease-out-gd hover:border-blue active:scale-[0.96]",
                inGame ? "w-[38px] p-0 justify-center" : "p-0 pr-3"
            )} onClick={() => setOpen((v) => !v)} aria-haspopup="true"
                    aria-expanded={open} aria-label="Commander profile">
                <span className={cn(
                    "grid place-items-center w-[30px] h-[30px] rounded-full bg-gold-soft border border-gold-line text-gold font-display font-bold text-[13px]",
                    inGame ? "" : "ml-1"
                )}>{initial}</span>
                {!inGame && <span className="font-display text-[12.5px] font-semibold tracking-[0.4px] whitespace-nowrap max-w-[140px] overflow-hidden text-ellipsis">{profile?.username || "—"}</span>}
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
