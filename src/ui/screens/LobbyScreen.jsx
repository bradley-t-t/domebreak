import {useEffect, useRef, useState} from "react";
import Flag from "../common/Flag.jsx";
import {
    fetchLobby,
    leaveLobby,
    setAiSlots,
    setLobbyIso,
    setReady,
    startLobby,
    watchLobby
} from "../../account/lobby.js";
import {GREAT_POWERS} from "../../game/sim/newGame.js";

// War-room lobby: shows the roster, lets the host tune AI slots and launch,
// and hands off to the live game the instant the backend marks the match active.
export default function LobbyScreen({lobbyId, me, connecting, onLaunch, onLeft}) {
    const [lobby, setLobby] = useState(null);
    const [launchErr, setLaunchErr] = useState(null);
    const [revertErr, setRevertErr] = useState(false);
    const [leaving, setLeaving] = useState(false);
    // Guards so realtime's repeated callbacks can never double-fire the
    // handoff to the game client or the return-to-browser callback.
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
        // Backend un-stuck an unreachable server: it reverted starting -> open.
        if (prevStatusRef.current === "starting" && lobby.status === "open") setRevertErr(true);
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
    const humans = members.length;
    const aiSlots = lobby.ai_slots || 0;
    const openSeats = Math.max(0, lobby.max_players - humans - aiSlots);
    const isHost = lobby.host === me?.id;
    const othersReady = members.filter((m) => m.userId !== me?.id).every((m) => m.ready);

    const doStart = async () => {
        setLaunchErr(null);
        const r = await startLobby();
        if (r?.error) setLaunchErr(r.error);
    };
    const doLeave = async () => {
        if (leaving) return;
        setLeaving(true);
        await leaveLobby();
        setLeaving(false);
        onLeft?.();
    };
    const changeAi = (delta) => {
        const next = Math.max(0, Math.min(lobby.max_players - humans, aiSlots + delta));
        if (next !== aiSlots) setAiSlots(next);
    };

    return (
        <div className="gd-menu-screen">
            <div className="gd-menu-bg"/>
            <div className="gd-menu-inner gd-lobby">
                <h1 className="gd-menu-title sm">{lobby.name || "War Room"}</h1>
                {revertErr && <p className="gd-friends-err">War server unreachable — try again.</p>}

                <div className="gd-lobby-members">
                    {members.map((m) => {
                        const own = me?.id === m.userId;
                        return (
                            <div key={m.userId} className={`gd-lobby-row ${m.ready ? "ready" : ""}`}>
                                <span className="gd-lobby-slot">{m.slot + 1}</span>
                                <Flag iso={m.iso}/>
                                <span className="gd-lobby-name">{m.username}</span>
                                {own ? (
                                    <select className="gd-lobby-select" value={m.iso}
                                            onChange={(e) => setLobbyIso(e.target.value)}
                                            aria-label="Choose nation">
                                        {GREAT_POWERS.map((iso) => <option key={iso} value={iso}>{iso}</option>)}
                                    </select>
                                ) : <span className="gd-lobby-select-static">{m.iso}</span>}
                                {own ? (
                                    <button className={`gd-lobby-ready ${m.ready ? "on" : ""}`}
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
                    {humans} commanders · {aiSlots} AI · {openSeats} open seats
                </div>

                {isHost && (
                    <div className="gd-lobby-host">
                        <div className="gd-lobby-stepper">
                            <span className="gd-label">AI Opponents</span>
                            <div className="gd-lobby-stepper-row">
                                <button className="gd-mini" aria-label="Fewer AI opponents"
                                        disabled={aiSlots <= 0} onClick={() => changeAi(-1)}>−
                                </button>
                                <span className="gd-lobby-stepper-val">{aiSlots}</span>
                                <button className="gd-mini" aria-label="More AI opponents"
                                        disabled={aiSlots >= lobby.max_players - humans}
                                        onClick={() => changeAi(1)}>+
                                </button>
                            </div>
                        </div>
                        <button className="gd-btn primary" disabled={!othersReady} onClick={doStart}>
                            Launch War
                        </button>
                        {launchErr && <p className="gd-friends-err">{launchErr}</p>}
                    </div>
                )}
                {!isHost && <p className="gd-lobby-hint">Waiting for the host to launch…</p>}

                <button className="gd-btn block mt" disabled={leaving} onClick={doLeave}>
                    {leaving ? "Leaving…" : "Leave"}
                </button>
            </div>
        </div>
    );
}
