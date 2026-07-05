import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import WorldMap from "./map/WorldMap.jsx";
import Hud from "./ui/Hud.jsx";
import Home from "./ui/Home.jsx";
import Lobby from "./ui/Lobby.jsx";
import Roster from "./ui/Roster.jsx";
import BuildBar from "./ui/BuildBar.jsx";
import ResultOverlay from "./ui/ResultOverlay.jsx";
import { api } from "./lib/api.js";
import { loadSession, saveSession, clearSession } from "./lib/session.js";
import { useMatch } from "./game/useMatch.js";
import { TOOLS, SLOT_COLOR } from "./game/constants.js";

export default function App() {
  const [session, setSession] = useState(loadSession());
  const player = session ? { id: session.playerId, secret: session.secret, handle: session.handle } : null;
  const matchId = session?.matchId || null;

  const { state, refetch } = useMatch(matchId, player);
  const [tool, setTool] = useState(null);
  const [globe, setGlobe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [arcs, setArcs] = useState([]);
  const [flashes, setFlashes] = useState({});
  const [now, setNow] = useState(Date.now());

  const match = state?.match;
  const players = state?.players || [];
  const cities = state?.cities || [];
  const myPlacements = state?.placements || [];
  const result = state?.result;
  const me = players.find((p) => p.player_id === player?.id);
  const mySlot = me?.slot ?? 0;
  const isHost = !!(match && player && match.created_by === player.id);
  const myCityIds = useMemo(
    () => new Set(cities.filter((c) => c.player_id === player?.id).map((c) => c.id)),
    [cities, player?.id],
  );
  const slotByPlayer = useMemo(
    () => Object.fromEntries(players.map((p) => [p.player_id, p.slot])), [players],
  );

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

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
  const onReady = () => guard(async () => { await api.ready(matchId, player); await refetch(); });
  const onAddAi = (slot) => guard(async () => { await api.addAi(matchId, player, slot); await refetch(); });
  const onRemove = (slot) => guard(async () => { await api.removeParticipant(matchId, player, slot); await refetch(); });
  const onReplaceAi = (slot) => guard(async () => { await api.replaceWithAi(matchId, player, slot); await refetch(); });
  const onSetSlots = (n) => guard(async () => { await api.setMaxSlots(matchId, player, n); await refetch(); });
  const onNewMatch = () => { clearSession(); setSession(null); setArcs([]); setFlashes({}); setTool(null); };

  const placeDefense = (lngLat) => {
    if (!tool || tool === "silo" || !me) return;
    if ((me.budget - me.spent) < TOOLS[tool].cost) { setError("Not enough budget"); return; }
    guard(async () => { await api.place(matchId, player, tool, lngLat.lng, lngLat.lat); await refetch(); });
  };
  const targetCity = (city) => {
    if (tool !== "silo" || !me) return;
    if (myCityIds.has(city.id)) return;
    if ((me.budget - me.spent) < TOOLS.silo.cost) { setError("Not enough budget"); return; }
    guard(async () => {
      await api.place(matchId, player, "silo", me.home_lng ?? city.lng, me.home_lat ?? city.lat, city.id);
      await refetch();
    });
  };

  const secondsLeft = match?.build_ends_at
    ? Math.round((new Date(match.build_ends_at).getTime() - now) / 1000) : 0;
  const resolvedRef = useRef(false);
  useEffect(() => {
    if (match?.status === "build" && secondsLeft <= 0 && !resolvedRef.current) {
      resolvedRef.current = true;
      api.resolve(matchId, player).then(refetch).catch(() => {});
    }
    if (match?.status !== "build") resolvedRef.current = false;
  }, [match?.status, secondsLeft, matchId]);

  useEffect(() => {
    if (match?.status !== "done" || !result?.replay) return;
    setArcs([]); setFlashes({});
    const events = [...result.replay].sort((a, b) => a.t - b.t);
    const timers = events.map((e, i) => setTimeout(() => {
      if (e.type === "launch") {
        setArcs((a) => [...a, {
          type: "Feature", properties: { color: SLOT_COLOR[e.attackerSlot] || "#fff" },
          geometry: { type: "LineString", coordinates: [[e.fromLng, e.fromLat], [e.toLng, e.toLat]] },
        }]);
      } else {
        setFlashes((f) => ({ ...f, [e.cityId]: e.type }));
      }
    }, i * 450));
    return () => timers.forEach(clearTimeout);
  }, [match?.status, result]);

  const phase = !matchId ? null
    : match?.status === "lobby" ? "Lobby"
    : match?.status === "build" ? "Build phase"
    : match?.status === "combat" ? "Combat" : "Result";

  return (
    <div className="gd-app">
      <Hud phase={phase} handle={player?.handle} globe={globe}
        onToggleGlobe={() => setGlobe((g) => !g)} onQuit={matchId ? onNewMatch : null} />
      <div className="gd-stage">
        <WorldMap
          cities={cities} myCityIds={myCityIds} slotByPlayer={slotByPlayer} placements={myPlacements}
          tool={tool} mySlot={mySlot} onMapClick={placeDefense} onCityClick={targetCity}
          arcs={arcs} flashes={flashes} globe={globe} />
        {matchId && match?.status === "build" &&
          <Roster players={players} meId={player?.id} isHost={isHost} onReplaceAi={onReplaceAi} busy={busy} />}
        {!matchId && <Home onCreate={onCreate} onJoin={onJoin} busy={busy} error={error} />}
        {matchId && match?.status === "lobby" &&
          <Lobby match={match} players={players} isHost={isHost} meId={player?.id} onStart={onStart}
            onAddAi={onAddAi} onRemove={onRemove} onReplaceAi={onReplaceAi} onSetSlots={onSetSlots}
            busy={busy} error={error} />}
        {matchId && match?.status === "build" &&
          <BuildBar me={me} tool={tool} setTool={setTool} secondsLeft={secondsLeft}
            ready={me?.ready} onReady={onReady} busy={busy} error={error} />}
        {matchId && match?.status === "done" &&
          <ResultOverlay result={result} mySlot={mySlot} players={players} onNewMatch={onNewMatch} />}
      </div>
    </div>
  );
}
