import {useEffect, useState} from "react";
import {acceptFriend, fetchFriends, removeFriend, requestFriend} from "../../account/social.js";
import {useModal} from "../hooks/useModal.js";
import {overlay, card, button, miniButton, input as inputCls, label, sub} from "../lib/variants.js";
import {cn} from "../lib/cn.js";

// What each broadcast activity code reads as in a friend's row.
const ACTIVITY_LABEL = {
    menu: "In menus",
    searching: "Searching for a match",
    lobby: "In a lobby",
    single: "In a single-player game",
    multi: "In a multiplayer match",
};

// Coarse "x ago" for a last_seen timestamp — enough to read at a glance.
function relTime(iso) {
    if (!iso) return "";
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "just now";
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

// Command network: add/accept/decline/remove friends, with live presence. A
// simple modal card — opened from MeBadge, closes on backdrop click or Escape.
// `presence` is the { [userId]: {activity, at} } map of who is currently online.
export default function FriendsPanel({onClose, presence}) {
    const [friends, setFriends] = useState([]);
    const [loading, setLoading] = useState(true);
    const [input, setInput] = useState("");
    const [addErr, setAddErr] = useState(null);
    const [busy, setBusy] = useState(false);
    const ref = useModal(onClose);
    const titleId = "db-friends-title";

    const load = () => fetchFriends().then((f) => {
        setFriends(f);
        setLoading(false);
    });

    // Load on open, then poll so a friend accepting/removing shows up without a
    // reopen. Online status itself updates live through the `presence` prop.
    useEffect(() => {
        load();
        const t = setInterval(load, 15_000);
        return () => clearInterval(t);
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

    // Live status line for one friend: green dot + activity if online, else a
    // dim dot + "Last online x ago" (or "Offline" when never seen).
    const Presence = ({friend}) => {
        const meta = presence?.[friend.other?.id];
        const online = !!meta;
        const text = online
            ? (ACTIVITY_LABEL[meta.activity] || "Online")
            : (friend.other?.last_seen ? `Last online ${relTime(friend.other.last_seen)}` : "Offline");
        return (
            <span className="flex items-center gap-1.5 text-[11px] text-dim mt-[3px]">
                <span className={cn("inline-block w-2 h-2 rounded-full shrink-0",
                    online ? "bg-[#46d38a] shadow-[0_0_6px_rgba(70,211,138,0.9)]" : "bg-line")}/>
                <span className="truncate">{text}</span>
            </span>
        );
    };

    return (
        <div className={overlay({placement: "center"})} onClick={onClose}>
            <div className={cn(card(), "pointer-events-auto w-[min(380px,94vw)] text-left max-h-[84vh] overflow-auto")}
                 ref={ref} tabIndex={-1} role="dialog" aria-modal="true"
                 aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
                <div className="db-menu-title sm text-[26px] tracking-[3px] mb-4 font-bold uppercase text-dim" id={titleId}>Command Network</div>
                <div className="flex gap-[10px] mt-4">
                    <label className="sr-only" htmlFor="db-friends-input">Username</label>
                    <input id="db-friends-input" className={cn(inputCls(), "flex-1")} placeholder="Add by username" value={input}
                           maxLength={24} onChange={(e) => setInput(e.target.value)}
                           onKeyDown={(e) => {
                               if (e.key === "Enter") add();
                           }}/>
                    <button className={button({variant: "primary"})} disabled={!input.trim() || busy} onClick={add}>Add</button>
                </div>
                <div aria-live="assertive">
                    {addErr && <p className="text-danger bg-[rgba(224,87,79,0.1)] border border-danger rounded-sm px-3 py-2 text-[12.5px] mt-[10px] mb-0">{addErr}</p>}
                </div>

                {loading && <p className={sub()}>Loading allies…</p>}
                {!loading && friends.length === 0 && (
                    <p className={sub()}>No allies yet — add a commander by name.</p>
                )}

                {incoming.length > 0 && (
                    <div className="mt-4">
                        <div className={label()} id="db-friends-requests-h">Requests</div>
                        <div role="list" aria-labelledby="db-friends-requests-h">
                            {incoming.map((f) => {
                                const uname = f.other?.username || "Commander";
                                return (
                                    <div key={f.id} className="flex items-center justify-between gap-2 px-[10px] py-2 bg-btn-bg border border-line rounded-sm mt-[6px] animate-[dbRowIn_220ms_var(--ease-out)_both]" role="listitem"
                                         aria-label={`${uname} — incoming request`}>
                                        <span className="text-[13px] text-text whitespace-nowrap overflow-hidden text-ellipsis">{uname}</span>
                                        <div className="flex gap-1.5 shrink-0">
                                            <button className={miniButton()} disabled={busy}
                                                    aria-label={`Accept request from ${uname}`}
                                                    onClick={() => act(acceptFriend, f.id)}>Accept
                                            </button>
                                            <button className={miniButton({danger: true})} disabled={busy}
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
                    <div className="mt-4">
                        <div className={label()} id="db-friends-pending-h">Pending</div>
                        <div role="list" aria-labelledby="db-friends-pending-h">
                            {outgoing.map((f) => {
                                const uname = f.other?.username || "Commander";
                                return (
                                    <div key={f.id} className="flex items-center justify-between gap-2 px-[10px] py-2 bg-btn-bg border border-line rounded-sm mt-[6px] animate-[dbRowIn_220ms_var(--ease-out)_both]" role="listitem"
                                         aria-label={`${uname} — pending request`}>
                                        <span className="text-[13px] text-text whitespace-nowrap overflow-hidden text-ellipsis">{uname}</span>
                                        <div className="flex gap-1.5 shrink-0">
                                            <button className={miniButton({danger: true})} disabled={busy}
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
                    <div className="mt-4">
                        <div className={label()} id="db-friends-list-h">Friends</div>
                        <div role="list" aria-labelledby="db-friends-list-h">
                            {accepted.map((f) => {
                                const uname = f.other?.username || "Commander";
                                const online = !!presence?.[f.other?.id];
                                return (
                                    <div key={f.id} className="flex items-center justify-between gap-2 px-[10px] py-2 bg-btn-bg border border-line rounded-sm mt-[6px] animate-[dbRowIn_220ms_var(--ease-out)_both]" role="listitem"
                                         aria-label={`${uname} — ${online ? "online" : "offline"}`}>
                                        <div className="min-w-0 flex flex-col">
                                            <span className="text-[13px] text-text truncate">{uname}</span>
                                            <Presence friend={f}/>
                                        </div>
                                        <div className="flex gap-1.5 shrink-0">
                                            <button className={miniButton({danger: true})} disabled={busy}
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

                <button className={cn(button(), "w-full mt-[14px]")} onClick={onClose}>Close</button>
            </div>
        </div>
    );
}
