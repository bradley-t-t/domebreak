import {useEffect, useRef, useState} from "react";
import Flag from "../common/Flag.jsx";
import {fetchLobby, leaveLobby, setLobbyIso, setReady, watchLobby} from "../../account/lobby.js";
import {GREAT_POWERS} from "../../game/sim/newGame.js";
import {button, menuScreen, menuBg, menuInner, menuTitle} from "../lib/variants.js";
import {cn} from "../lib/cn.js";

// War-room lobby: shows the roster (humans and server-simulated bots,
// rendered identically — is_bot is never surfaced), lets the local player
// pick their own nation and toggle ready, and hands off to the live game the
// instant the backend marks the match active. There is no host and no manual
// launch — the server auto-launches once every member is ready (or on its
// own lobby-ready timeout), per adr-004.
export default function LobbyScreen({lobbyId, me, connecting, onLaunch, onLeft}) {
    // undefined = initial fetch still in flight, null = fetched and gone/closed,
    // object = loaded. The distinction matters: treating the initial `undefined`
    // as "gone" would fire onLeft() on mount — before fetchLobby() resolves —
    // and bounce the player straight back to the menu the instant they match.
    const [lobby, setLobby] = useState(undefined);
    const [revertErr, setRevertErr] = useState(false);
    const [leaving, setLeaving] = useState(false);
    // Guards so realtime's repeated callbacks can never double-fire the
    // handoff to the game client or the return-to-menu callback.
    const launchedRef = useRef(false);
    const leftRef = useRef(false);
    const prevStatusRef = useRef(null);

    useEffect(() => {
        const refresh = () => fetchLobby(lobbyId).then((l) => setLobby(l ?? null));
        refresh();
        return watchLobby(lobbyId, refresh);
    }, [lobbyId]);

    useEffect(() => {
        if (lobby === undefined) return; // still loading — not "gone", don't bounce
        if (!lobby) {
            if (!leftRef.current) {
                leftRef.current = true;
                onLeft?.();
            }
            return;
        }
        if (lobby.status === "closed" && !leftRef.current) {
            leftRef.current = true;
            onLeft?.();
            return;
        }
        // Backend couldn't reach a claim in time and reported failure.
        if (prevStatusRef.current === "starting" && lobby.status !== "starting" && lobby.status !== "active") {
            setRevertErr(true);
        }
        prevStatusRef.current = lobby.status;

        if (lobby.status === "active" && lobby.match_id && lobby.server_url && !launchedRef.current) {
            launchedRef.current = true;
            onLaunch?.(lobby);
        }
    }, [lobby, onLaunch, onLeft]);

    if (lobby === undefined) {
        return (
            <div className={menuScreen()}>
                <div className={menuBg()}/>
                <div className={cn(menuInner(), "w-[min(620px,94vw)] text-left")}>
                    <h1 className={menuTitle({sm: true})}>Entering War Room…</h1>
                </div>
            </div>
        );
    }
    if (!lobby) return null;

    if (connecting) {
        return (
            <div className={menuScreen()}>
                <div className={menuBg()}/>
                <div className={cn(menuInner(), "w-[min(620px,94vw)] text-left")}>
                    <h1 className={menuTitle({sm: true})}>Contacting War Server…</h1>
                </div>
            </div>
        );
    }

    const members = [...lobby.members].sort((a, b) => a.slot - b.slot);
    const humans = members.filter((m) => !m.isBot).length;
    const bots = members.length - humans;

    const doLeave = async () => {
        if (leaving) return;
        setLeaving(true);
        await leaveLobby();
        setLeaving(false);
        onLeft?.();
    };

    return (
        <div className={menuScreen()}>
            <div className={menuBg()}/>
            <div className={cn(menuInner(), "w-[min(620px,94vw)] text-left")}>
                <h1 className={menuTitle({sm: true})}>War Room</h1>
                {revertErr && <p className="gd-friends-err text-danger bg-[rgba(224,87,79,0.1)] border border-danger rounded-sm py-2 px-3 text-[12.5px] mt-2.5">War server unreachable — try again.</p>}

                <div className="gd-lobby-members flex flex-col gap-1.5 max-h-[42vh] overflow-auto mt-1.5" role="list" aria-label="War room roster">
                    {members.map((m) => {
                        const own = me?.id === m.userId;
                        const rowLabel = `Slot ${m.slot + 1} — ${m.username || "Commander"} — ${m.iso || "no nation chosen"} — ${m.ready ? "ready" : "not ready"}`;
                        return (
                            <div key={m.userId ?? `bot-${m.slot}`}
                                 className={cn(
                                     "gd-lobby-row flex items-center gap-2.5 py-[9px] px-3 bg-btn-bg border border-line rounded-sm transition-[border-color,background] duration-150 ease-out-gd [animation:gdRowIn_220ms_var(--ease-out)_both]",
                                     m.ready && "ready border-gold-line bg-gold-soft"
                                 )}
                                 role="listitem" aria-label={rowLabel}>
                                <span className="gd-lobby-slot font-mono text-[11px] text-faint w-4 text-center shrink-0">{m.slot + 1}</span>
                                <Flag iso={m.iso}/>
                                <span className="gd-lobby-name flex-1 text-[13px] whitespace-nowrap overflow-hidden text-ellipsis">{m.username}</span>
                                {own ? (
                                    <select className="gd-lobby-select bg-sunk border border-line text-text rounded-sm px-2 py-[5px] text-xs font-mono outline-none transition-[border-color,box-shadow] duration-150 ease-out-gd focus-visible:border-text focus-visible:shadow-[0_0_0_3px_var(--gold-soft)]"
                                            value={m.iso || ""}
                                            onChange={(e) => setLobbyIso(e.target.value)}
                                            aria-label="Choose nation">
                                        {!m.iso && <option value="" disabled>Choose…</option>}
                                        {GREAT_POWERS.map((iso) => <option key={iso} value={iso}>{iso}</option>)}
                                    </select>
                                ) : <span className="gd-lobby-select-static font-mono text-xs text-dim px-2 py-[5px]">{m.iso || "…"}</span>}
                                {own ? (
                                    <button className={cn(
                                        "gd-lobby-ready font-display text-[10.5px] font-bold tracking-[1px] uppercase py-1.5 px-2.5 rounded-sm border border-line bg-btn-bg text-dim shrink-0 transition-[border-color,background,color] duration-150 ease-out-gd",
                                        m.ready && "on border-gold-line bg-gold text-gold-contrast"
                                    )}
                                            aria-pressed={m.ready}
                                            onClick={() => setReady(!m.ready)}>
                                        {m.ready ? "Ready" : "Not Ready"}
                                    </button>
                                ) : (
                                    <span className={cn(
                                        "gd-lobby-ready-dot w-2.5 h-2.5 rounded-full bg-faint shrink-0",
                                        m.ready && "on bg-gold shadow-[0_0_8px_var(--gold)]"
                                    )}
                                          aria-label={m.ready ? "Ready" : "Not ready"}
                                          title={m.ready ? "Ready" : "Not ready"}/>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="gd-lobby-force font-mono text-[11.5px] text-dim mt-3 text-center">
                    {humans} commanders · {bots} more joining
                </div>

                <p className="gd-lobby-hint text-center text-faint text-xs mt-3.5">War begins when all commanders are ready.</p>

                <button className={cn(button(), "block mt-4")} disabled={leaving} onClick={doLeave}>
                    {leaving ? "Leaving…" : "Leave"}
                </button>
            </div>
        </div>
    );
}
