import {useEffect, useState} from "react";
import {acceptFriend, fetchFriends, removeFriend, requestFriend} from "../../account/social.js";
import {useModal} from "../hooks/useModal.js";
import {overlay, card, button, miniButton, input as inputCls, label, sub} from "../lib/variants.js";
import {cn} from "../lib/cn.js";

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
        <div className={overlay({placement: "center"})} onClick={onClose}>
            <div className={cn(card(), "pointer-events-auto w-[min(380px,94vw)] text-left max-h-[84vh] overflow-auto")}
                 ref={ref} tabIndex={-1} role="dialog" aria-modal="true"
                 aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
                <div className="gd-menu-title sm text-[26px] tracking-[3px] mb-4 font-bold uppercase text-dim" id={titleId}>Command Network</div>
                <div className="flex gap-[10px] mt-4">
                    <label className="sr-only" htmlFor="gd-friends-input">Commander username</label>
                    <input id="gd-friends-input" className={cn(inputCls(), "flex-1")} placeholder="Commander username" value={input}
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
                        <div className={label()} id="gd-friends-requests-h">Requests</div>
                        <div role="list" aria-labelledby="gd-friends-requests-h">
                            {incoming.map((f) => {
                                const uname = f.other?.username || "Commander";
                                return (
                                    <div key={f.id} className="flex items-center justify-between gap-2 px-[10px] py-2 bg-btn-bg border border-line rounded-sm mt-[6px] animate-[gdRowIn_220ms_var(--ease-out)_both]" role="listitem"
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
                        <div className={label()} id="gd-friends-pending-h">Pending</div>
                        <div role="list" aria-labelledby="gd-friends-pending-h">
                            {outgoing.map((f) => {
                                const uname = f.other?.username || "Commander";
                                return (
                                    <div key={f.id} className="flex items-center justify-between gap-2 px-[10px] py-2 bg-btn-bg border border-line rounded-sm mt-[6px] animate-[gdRowIn_220ms_var(--ease-out)_both]" role="listitem"
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
                        <div className={label()} id="gd-friends-list-h">Friends</div>
                        <div role="list" aria-labelledby="gd-friends-list-h">
                            {accepted.map((f) => {
                                const uname = f.other?.username || "Commander";
                                return (
                                    <div key={f.id} className="flex items-center justify-between gap-2 px-[10px] py-2 bg-btn-bg border border-line rounded-sm mt-[6px] animate-[gdRowIn_220ms_var(--ease-out)_both]" role="listitem"
                                         aria-label={`${uname} — friend`}>
                                        <span className="text-[13px] text-text whitespace-nowrap overflow-hidden text-ellipsis">{uname}</span>
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
