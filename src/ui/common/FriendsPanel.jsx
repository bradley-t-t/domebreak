import {useEffect, useState} from "react";
import {acceptFriend, fetchFriends, removeFriend, requestFriend} from "../../account/social.js";
import {useModal} from "../hooks/useModal.js";
import {overlay, card, button, miniButton, badge, input as inputCls, label, sub} from "../lib/variants.js";
import {cn} from "../lib/cn.js";
import Flag from "./Flag.jsx";

// The three join modes a party leader can set, in display order.
const JOIN_MODES = ["open", "invite", "both"];

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
// `presence` is the { [userId]: {activity, at, party} } map of who is currently
// online. `partyCtl` is the caller's live party controller (party/members/meId
// + actions) — see useParty.js.
export default function FriendsPanel({onClose, presence, partyCtl}) {
    const [friends, setFriends] = useState([]);
    const [loading, setLoading] = useState(true);
    const [input, setInput] = useState("");
    const [addErr, setAddErr] = useState(null);
    const [busy, setBusy] = useState(false);
    const [partyBusy, setPartyBusy] = useState(false);
    const [invited, setInvited] = useState({});
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

    // Party actions run against their own busy flag so an in-flight party call
    // (e.g. launching) never disables the unrelated friend-request buttons.
    const partyAct = async (fn, ...args) => {
        if (partyBusy) return;
        setPartyBusy(true);
        await fn(...args);
        setPartyBusy(false);
    };
    // Invite has its own transient "Invited" state per user id, separate from
    // the busy flag, so a friend's row keeps that feedback after the request
    // resolves rather than flashing back to "Invite" immediately.
    const inviteToParty = async (userId) => {
        if (partyBusy) return;
        setPartyBusy(true);
        await partyCtl.invite(userId);
        setPartyBusy(false);
        setInvited((prev) => ({...prev, [userId]: true}));
        setTimeout(() => setInvited((prev) => {
            const next = {...prev};
            delete next[userId];
            return next;
        }), 5000);
    };

    const incoming = friends.filter((f) => f.direction === "in" && f.status === "pending");
    const outgoing = friends.filter((f) => f.direction === "out" && f.status === "pending");
    const accepted = friends.filter((f) => f.status === "accepted");

    // Live status line for one friend: green dot + activity if online, else a
    // dim dot + "Last online x ago" (or "Offline" when never seen).
    const presenceRow = (friend) => {
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

    // "Your Party" card: roster (with leader badge, ready dot, flag), my own
    // ready toggle, leader-only kick/join-mode/launch controls, and leave.
    const partySection = () => {
        const {party, members, meId} = partyCtl;
        if (!party) {
            return (
                <button className={cn(button({variant: "primary"}), "w-full")} disabled={partyBusy}
                        onClick={() => partyAct(partyCtl.create)}>Create Party</button>
            );
        }
        const isLeader = party.leader === meId;
        const me = members.find((m) => m.user_id === meId);
        return (
            <div className="px-[10px] py-2 bg-btn-bg border border-line rounded-sm">
                <div role="list" aria-labelledby="db-party-roster-h">
                    {members.map((m) => (
                        <div key={m.user_id} className="flex items-center justify-between gap-2 py-1" role="listitem"
                             aria-label={`${m.username} — ${m.ready ? "ready" : "not ready"}`}>
                            <div className="min-w-0 flex items-center gap-1.5">
                                <span className={cn("inline-block w-2 h-2 rounded-full shrink-0",
                                    m.ready ? "bg-[#46d38a] shadow-[0_0_6px_rgba(70,211,138,0.9)]" : "bg-line")} aria-hidden="true"/>
                                {m.iso && <Flag iso={m.iso}/>}
                                <span className="text-[13px] text-text truncate">{m.username}</span>
                                {m.is_leader && <span className={badge({you: true})}>Leader</span>}
                            </div>
                            {isLeader && m.user_id !== meId && (
                                <button className={miniButton({danger: true})} disabled={partyBusy}
                                        aria-label={`Kick ${m.username} from party`}
                                        onClick={() => partyAct(partyCtl.kick, m.user_id)}>Kick</button>
                            )}
                        </div>
                    ))}
                </div>
                <div className="flex gap-1.5 mt-2">
                    <button className={cn(miniButton(), "flex-1")} disabled={partyBusy}
                            onClick={() => partyAct(partyCtl.setReady, !me?.ready)}>
                        {me?.ready ? "Not Ready" : "Ready"}
                    </button>
                    <button className={cn(miniButton({danger: true}), "flex-1")} disabled={partyBusy}
                            onClick={() => partyAct(partyCtl.leave)}>Leave Party</button>
                </div>
                {isLeader && (
                    <div className="mt-2 pt-2 border-t border-line-soft">
                        <div className="flex gap-1.5" role="group" aria-label="Party join mode">
                            {JOIN_MODES.map((mode) => (
                                <button key={mode}
                                        className={cn(miniButton(), "flex-1 capitalize",
                                            party.join_mode === mode && "border-gold-line text-gold")}
                                        disabled={partyBusy} aria-pressed={party.join_mode === mode}
                                        onClick={() => partyAct(partyCtl.setJoinMode, mode)}>{mode}</button>
                            ))}
                        </div>
                        <div className="flex gap-1.5 mt-1.5">
                            <button className={cn(miniButton(), "flex-1")} disabled={partyBusy}
                                    onClick={() => partyAct(partyCtl.launchPrivate)}>Launch Private</button>
                            <button className={cn(miniButton(), "flex-1 border-gold-line text-gold")} disabled={partyBusy}
                                    onClick={() => partyAct(partyCtl.queuePublic)}>Queue Public</button>
                        </div>
                    </div>
                )}
            </div>
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

                {partyCtl && (
                    <div className="mt-4">
                        {partyCtl.party && <div className={label()} id="db-party-roster-h">Your Party</div>}
                        {partySection()}
                    </div>
                )}

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
                                const friendId = f.other?.id;
                                const online = !!presence?.[friendId];
                                const fp = presence?.[friendId]?.party;
                                const inMyParty = !!partyCtl?.party && partyCtl.members.some((m) => m.user_id === friendId);
                                const canJoin = !!fp && fp.id !== partyCtl?.party?.id && fp.seats < fp.max
                                    && (fp.join_mode === "open" || fp.join_mode === "both");
                                const canInvite = !!partyCtl?.party && online && !inMyParty;
                                return (
                                    <div key={f.id} className="flex items-center justify-between gap-2 px-[10px] py-2 bg-btn-bg border border-line rounded-sm mt-[6px] animate-[dbRowIn_220ms_var(--ease-out)_both]" role="listitem"
                                         aria-label={`${uname} — ${online ? "online" : "offline"}`}>
                                        <div className="min-w-0 flex flex-col">
                                            <span className="text-[13px] text-text truncate">{uname}</span>
                                            {presenceRow(f)}
                                        </div>
                                        <div className="flex flex-wrap justify-end gap-1.5 shrink-0">
                                            {canJoin && (
                                                <button className={miniButton()} disabled={partyBusy}
                                                        aria-label={`Join ${uname}'s party`}
                                                        onClick={() => partyAct(partyCtl.join, fp.id)}>
                                                    Join ({fp.seats}/{fp.max})
                                                </button>
                                            )}
                                            {canInvite && (
                                                <button className={miniButton()} disabled={partyBusy || invited[friendId]}
                                                        aria-label={`Invite ${uname} to party`}
                                                        onClick={() => inviteToParty(friendId)}>
                                                    {invited[friendId] ? "Invited" : "Invite"}
                                                </button>
                                            )}
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
