import {useEffect, useRef, useState} from "react";
import Flag from "../common/Flag.jsx";
import {fetchLobby, leaveLobby, setLobbyIso, setReady, watchLobby} from "../../account/lobby.js";
import {GREAT_POWERS} from "../../game/sim/newGame.js";

// War-room lobby: shows the roster (humans and server-simulated bots,
// rendered identically — is_bot is never surfaced), lets the local player
// pick their own nation and toggle ready, and hands off to the live game the
// instant the backend marks the match active. There is no host and no manual
// launch — the server auto-launches once every member is ready (or on its
// own lobby-ready timeout), per adr-004.
export default function LobbyScreen({lobbyId, me, connecting, onLaunch, onLeft}) {
    const [lobby, setLobby] = useState(null);
    const [revertErr, setRevertErr] = useState(false);
    const [leaving, setLeaving] = useState(false);
    // Guards so realtime's repeated callbacks can never double-fire the
    // handoff to the game client or the return-to-menu callback.
    const launchedRef = useRef(false);
    const leftRef = useRef(false);
    const prevStatusRef = useRef(null);

    useEffect(() => {
        const refresh = () => fetchLobby(lobbyId).then(setLobby);
        refresh();
        return watchLobby(lobbyId, refresh);
    }, [lobbyId]);

    useEffect(() => {
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

    if (!lobby) return null;

    if (connecting) {
        return (
            <div className="gd-menu-screen">
                <div className="gd-menu-bg"/>
                <div className="gd-menu-inner gd-lobby">
                    <h1 className="gd-menu-title sm">Contacting War Server…</h1>
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
        <div className="gd-menu-screen">
            <div className="gd-menu-bg"/>
            <div className="gd-menu-inner gd-lobby">
                <h1 className="gd-menu-title sm">War Room</h1>
                {revertErr && <p className="gd-friends-err">War server unreachable — try again.</p>}

                <div className="gd-lobby-members" role="list" aria-label="War room roster">
                    {members.map((m) => {
                        const own = me?.id === m.userId;
                        const rowLabel = `Slot ${m.slot + 1} — ${m.username || "Commander"} — ${m.iso || "no nation chosen"} — ${m.ready ? "ready" : "not ready"}`;
                        return (
                            <div key={m.userId ?? `bot-${m.slot}`} className={`gd-lobby-row ${m.ready ? "ready" : ""}`}
                                 role="listitem" aria-label={rowLabel}>
                                <span className="gd-lobby-slot">{m.slot + 1}</span>
                                <Flag iso={m.iso}/>
                                <span className="gd-lobby-name">{m.username}</span>
                                {own ? (
                                    <select className="gd-lobby-select" value={m.iso || ""}
                                            onChange={(e) => setLobbyIso(e.target.value)}
                                            aria-label="Choose nation">
                                        {!m.iso && <option value="" disabled>Choose…</option>}
                                        {GREAT_POWERS.map((iso) => <option key={iso} value={iso}>{iso}</option>)}
                                    </select>
                                ) : <span className="gd-lobby-select-static">{m.iso || "…"}</span>}
                                {own ? (
                                    <button className={`gd-lobby-ready ${m.ready ? "on" : ""}`}
                                            aria-pressed={m.ready}
                                            onClick={() => setReady(!m.ready)}>
                                        {m.ready ? "Ready" : "Not Ready"}
                                    </button>
                                ) : (
                                    <span className={`gd-lobby-ready-dot ${m.ready ? "on" : ""}`}
                                          aria-label={m.ready ? "Ready" : "Not ready"}
                                          title={m.ready ? "Ready" : "Not ready"}/>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="gd-lobby-force">
                    {humans} commanders · {bots} more joining
                </div>

                <p className="gd-lobby-hint">War begins when all commanders are ready.</p>

                <button className="gd-btn block mt" disabled={leaving} onClick={doLeave}>
                    {leaving ? "Leaving…" : "Leave"}
                </button>
            </div>
        </div>
    );
}
