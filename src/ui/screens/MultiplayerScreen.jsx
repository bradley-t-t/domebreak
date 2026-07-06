import {useEffect, useState} from "react";
import {createLobby, fetchOpenLobbies, findGame, joinLobby, watchLobbies} from "../../account/lobby.js";

// Joint Operations: matchmake into an open war, host a fresh one, or browse
// and join a specific lobby by hand.
export default function MultiplayerScreen({onEnterLobby, onBack}) {
    const [lobbies, setLobbies] = useState([]);
    const [finding, setFinding] = useState(false);
    const [creating, setCreating] = useState(false);
    const [joiningId, setJoiningId] = useState(null);
    const [rowErr, setRowErr] = useState(null);
    const [err, setErr] = useState(null);

    const refresh = () => fetchOpenLobbies().then(setLobbies);

    useEffect(() => {
        refresh();
        const unsub = watchLobbies(refresh);
        return unsub;
    }, []);

    const doFind = async () => {
        if (finding || creating) return;
        setFinding(true);
        setErr(null);
        const r = await findGame();
        setFinding(false);
        if (r?.error) setErr(r.error); else if (r?.lobbyId) onEnterLobby(r.lobbyId);
    };
    const doCreate = async () => {
        if (finding || creating) return;
        setCreating(true);
        setErr(null);
        const r = await createLobby();
        setCreating(false);
        if (r?.error) setErr(r.error); else if (r?.lobbyId) onEnterLobby(r.lobbyId);
    };
    const doJoin = async (id) => {
        if (joiningId) return;
        setJoiningId(id);
        setRowErr(null);
        const r = await joinLobby(id);
        setJoiningId(null);
        if (r?.error) setRowErr({id, msg: r.error}); else onEnterLobby(id);
    };

    return (
        <div className="gd-menu-screen">
            <div className="gd-menu-bg"/>
            <div className="gd-menu-inner gd-mp">
                <h1 className="gd-menu-title sm">JOINT OPERATIONS</h1>
                <div className="gd-row">
                    <button className="gd-btn primary" disabled={finding || creating} onClick={doFind}>
                        {finding ? "Searching…" : "Find Game"}
                    </button>
                    <button className="gd-btn" disabled={finding || creating} onClick={doCreate}>
                        {creating ? "Creating…" : "Create Lobby"}
                    </button>
                </div>
                {err && <p className="gd-friends-err">{err}</p>}

                <div className="gd-label mt">Open Wars</div>
                <div className="gd-mp-list">
                    {lobbies.length === 0 && <p className="gd-sub">No open wars. Start one.</p>}
                    {lobbies.map((l) => {
                        const seats = `${l.humans}${l.ai_slots ? `+${l.ai_slots}AI` : ""} / ${l.max_players}`;
                        return (
                            <div key={l.id} className="gd-mp-row">
                                <div className="gd-mp-info">
                                    <b>{l.name || "Untitled War"}</b>
                                    <span>{seats} Commanders</span>
                                </div>
                                {rowErr?.id === l.id && <span className="gd-mp-rowerr">{rowErr.msg}</span>}
                                <button className="gd-mini" disabled={joiningId === l.id}
                                        onClick={() => doJoin(l.id)}>
                                    {joiningId === l.id ? "Joining…" : "Join"}
                                </button>
                            </div>
                        );
                    })}
                </div>

                <button className="gd-btn block mt" onClick={onBack}>Back</button>
            </div>
        </div>
    );
}
