import { useCallback, useMemo, useState } from "react";
import WorldMap from "./map/WorldMap.jsx";
import Hud from "./ui/Hud.jsx";
import Home from "./ui/Home.jsx";
import Lobby from "./ui/Lobby.jsx";
import LiveGame from "./ui/LiveGame.jsx";
import { api } from "./lib/api.js";
import { loadSession, saveSession, clearSession } from "./lib/session.js";
import { useMatch } from "./game/useMatch.js";
import { liveSetup } from "./game/liveSetup.js";

export default function App() {
  const [session, setSession] = useState(loadSession());
  const player = session ? { id: session.playerId, secret: session.secret, handle: session.handle } : null;
  const matchId = session?.matchId || null;

  const { state, refetch } = useMatch(matchId, player);
  const [globe, setGlobe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const match = state?.match;
  const players = state?.players || [];
  const cities = state?.cities || [];
  const me = players.find((p) => p.player_id === player?.id);
  const isHost = !!(match && player && match.created_by === player.id);
  const live = !!(matchId && match?.status === "build");
  const myCityIds = useMemo(
    () => new Set(cities.filter((c) => c.player_id === player?.id).map((c) => c.id)),
    [cities, player?.id],
  );
  const slotByPlayer = useMemo(
    () => Object.fromEntries(players.map((p) => [p.player_id, p.slot])), [players],
  );
  const setup = useMemo(
    () => (live && cities.length && player ? liveSetup(state, player.id) : null),
    [live, cities.length, player?.id, state?.match?.id],
  );

  const guard = useCallback(async (fn) => {
    setBusy(true); setError(null);
    try { return await fn(); }
    catch (e) { setError(String(e.message || e)); }
    finally { setBusy(false); }
  }, []);

  const enter = (r, handle) => {
    const s = { playerId: r.player.id, secret: r.player.secret, handle, matchId: r.match.id };
    setSession(s); saveSession(s);
  };
  const onCreate = (handle, maxSlots) => guard(async () => enter(await api.create(handle, maxSlots), handle));
  const onJoin = (code, handle) => guard(async () => enter(await api.join(code, handle), handle));
  const onStart = () => guard(async () => { await api.start(matchId, player); await refetch(); });
  const onAddAi = (slot) => guard(async () => { await api.addAi(matchId, player, slot); await refetch(); });
  const onRemove = (slot) => guard(async () => { await api.removeParticipant(matchId, player, slot); await refetch(); });
  const onReplaceAi = (slot) => guard(async () => { await api.replaceWithAi(matchId, player, slot); await refetch(); });
  const onSetSlots = (n) => guard(async () => { await api.setMaxSlots(matchId, player, n); await refetch(); });
  const onNewMatch = () => { clearSession(); setSession(null); };

  const phase = !matchId ? null : live ? "War room" : match?.status === "lobby" ? "Lobby" : "Match";

  return (
    <div className="gd-app">
      <Hud phase={phase} handle={player?.handle} globe={globe}
        onToggleGlobe={() => setGlobe((g) => !g)} onQuit={matchId ? onNewMatch : null} />
      <div className="gd-stage">
        {live && setup
          ? <LiveGame key={matchId} setup={setup} globe={globe} onQuit={onNewMatch} />
          : (
            <>
              <WorldMap cities={cities} myCityIds={myCityIds} slotByPlayer={slotByPlayer} globe={globe} />
              {!matchId && <Home onCreate={onCreate} onJoin={onJoin} busy={busy} error={error} />}
              {matchId && match?.status === "lobby" &&
                <Lobby match={match} players={players} isHost={isHost} meId={player?.id} onStart={onStart}
                  onAddAi={onAddAi} onRemove={onRemove} onReplaceAi={onReplaceAi} onSetSlots={onSetSlots}
                  busy={busy} error={error} />}
            </>
          )}
      </div>
    </div>
  );
}
