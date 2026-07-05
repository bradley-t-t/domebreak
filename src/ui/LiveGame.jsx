import { useEffect, useMemo, useRef, useState } from "react";
import WorldMap from "../map/WorldMap.jsx";
import LiveHud from "./LiveHud.jsx";
import Console from "./Console.jsx";
import UnitIcon from "./UnitIcon.jsx";
import Missile from "./Missile.jsx";
import Interceptor from "./Interceptor.jsx";
import Explosion from "./Explosion.jsx";
import { Marker, Source, Layer } from "react-map-gl/maplibre";
import { useEngine } from "../game/useEngine.js";
import { UNITS, UNIT_ICON, unitLabel, defenseRange } from "../game/engine.js";
import { circle, gcTrail } from "../game/geo.js";
import { SLOT_COLOR } from "../game/constants.js";

export default function LiveGame({ setup, globe, onQuit }) {
  const [world, api] = useEngine(setup);
  const mySlot = world.mySlot;
  const myNation = world.nations.find((n) => n.slot === mySlot);

  const [tab, setTab] = useState("diplomacy");
  const [placing, setPlacing] = useState(null);
  const [selUnit, setSelUnit] = useState(null);
  const [attackMode, setAttackMode] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [flashes, setFlashes] = useState({});
  const [intercepts, setIntercepts] = useState([]);
  const [explosions, setExplosions] = useState([]);
  const [err, setErr] = useState(null);
  const seen = useRef(new Set());

  const relation = (slot) => (myNation?.relations[slot] === "war" ? "war" : "peace");
  const flash = (m) => { setErr(m); setTimeout(() => setErr(null), 1800); };

  useEffect(() => {
    const fFlash = [], fInt = [];
    for (const e of world.events) {
      if (seen.current.has(e.id)) continue;
      seen.current.add(e.id);
      if (e.type === "intercept") fInt.push(e);
      else if (e.cityId && (e.type === "hit" || e.type === "destroy")) fFlash.push(e);
    }
    if (seen.current.size > 500) seen.current = new Set(world.events.map((e) => e.id));
    if (fFlash.length) {
      setFlashes((f) => { const n = { ...f }; for (const e of fFlash) n[e.cityId] = e.type; return n; });
      for (const e of fFlash) { const cid = e.cityId, ty = e.type; setTimeout(() => setFlashes((f) => { if (f[cid] !== ty) return f; const n = { ...f }; delete n[cid]; return n; }), 520); }
      setExplosions((list) => [...list, ...fFlash.map((e) => ({ id: e.id, lng: e.lng, lat: e.lat, kind: e.type }))]);
      for (const e of fFlash) { const id = e.id; setTimeout(() => setExplosions((list) => list.filter((x) => x.id !== id)), 800); }
    }
    if (fInt.length) {
      setIntercepts((list) => [...list, ...fInt.map((e) => ({ id: e.id, lng: e.lng, lat: e.lat }))]);
      for (const e of fInt) { const id = e.id; setTimeout(() => setIntercepts((list) => list.filter((x) => x.id !== id)), 650); }
    }
  }, [world.time]);

  const ranges = useMemo(() => {
    const f = [];
    for (const u of world.units) {
      if (u.slot !== mySlot) continue;
      const def = UNITS[u.type];
      let radius = null, isRadar = 0;
      if (def.kind === "defense") radius = defenseRange(world, u);
      else if (def.kind === "support") { radius = def.range; isRadar = 1; }
      if (radius && radius <= 4000) {
        const c = circle(u.lng, u.lat, radius);
        c.properties = { color: SLOT_COLOR[mySlot], sel: u.id === selUnit ? 1 : 0, radar: isRadar };
        f.push(c);
      }
    }
    if (placing && cursor && UNITS[placing].kind !== "offense" && UNITS[placing].range <= 4000) {
      const c = circle(cursor.lng, cursor.lat, UNITS[placing].range);
      c.properties = { color: "#f4c02a", sel: 1, radar: UNITS[placing].kind === "support" ? 1 : 0 };
      f.push(c);
    }
    return { type: "FeatureCollection", features: f };
  }, [world.units, placing, cursor, selUnit, mySlot]);

  const cmdLines = useMemo(() => {
    const f = [];
    for (const u of world.units) {
      if (u.slot === mySlot && u.targetId) {
        const t = world.cities.find((c) => c.id === u.targetId) || world.units.find((x) => x.id === u.targetId);
        if (t) f.push({ type: "Feature", properties: { color: SLOT_COLOR[mySlot] },
          geometry: { type: "LineString", coordinates: gcTrail(u.lng, u.lat, t.lng, t.lat, 1, 20) } });
      }
    }
    return { type: "FeatureCollection", features: f };
  }, [world.units, mySlot]);

  const trails = useMemo(() => ({
    type: "FeatureCollection",
    features: world.projectiles.map((p) => ({ type: "Feature", properties: {},
      geometry: { type: "LineString", coordinates: gcTrail(p.fromLng, p.fromLat, p.toLng, p.toLat, p.progress) } })),
  }), [world.projectiles]);

  const intTrails = useMemo(() => ({
    type: "FeatureCollection",
    features: world.interceptors.map((it) => ({ type: "Feature", properties: {},
      geometry: { type: "LineString", coordinates: [[it.fromLng, it.fromLat], [it.lng, it.lat]] } })),
  }), [world.interceptors]);

  const onMapClick = (lngLat) => {
    if (placing) { const r = api.buyPlace(placing, lngLat.lng, lngLat.lat); if (r.error) flash(r.error); return; }
    setSelUnit(null); setAttackMode(false);
  };
  const onUnitClick = (u) => {
    if (attackMode && selUnit) {
      if (u.slot === mySlot) return;
      const r = api.commandAttack(selUnit, u.id); if (r.error) flash(r.error); else setAttackMode(false);
      return;
    }
    if (u.slot === mySlot) setSelUnit(u.id);
  };
  const onCityClick = (c) => {
    if (attackMode && selUnit && c.slot !== mySlot) {
      const r = api.commandAttack(selUnit, c.id); if (r.error) flash(r.error); else setAttackMode(false);
    }
  };

  const selectedUnit = world.units.find((u) => u.id === selUnit);

  return (
    <>
      <WorldMap globe={globe} onMapClick={onMapClick}
        onMouseMove={placing ? (ll) => setCursor(ll) : undefined}
        cursor={placing || attackMode ? "crosshair" : "grab"}>
        <Source id="ranges" type="geojson" data={ranges}>
          <Layer id="range-fill" type="fill" filter={["!=", ["get", "radar"], 1]} paint={{ "fill-color": ["get", "color"], "fill-opacity": ["case", ["==", ["get", "sel"], 1], 0.14, 0.05] }} />
          <Layer id="range-line" type="line" filter={["!=", ["get", "radar"], 1]} paint={{ "line-color": ["get", "color"], "line-width": ["case", ["==", ["get", "sel"], 1], 1.6, 0.7], "line-opacity": 0.6 }} />
          <Layer id="radar-ring" type="line" filter={["==", ["get", "radar"], 1]} paint={{ "line-color": ["get", "color"], "line-width": 0.9, "line-opacity": 0.5, "line-dasharray": [3, 3] }} />
        </Source>
        <Source id="cmd" type="geojson" data={cmdLines}>
          <Layer id="cmd-line" type="line" paint={{ "line-color": ["get", "color"], "line-width": 1.4, "line-opacity": 0.5, "line-dasharray": [2, 3] }} />
        </Source>
        <Source id="trail" type="geojson" data={trails} lineMetrics>
          <Layer id="trail-glow" type="line" paint={{ "line-color": "#cfe2ff", "line-width": 6, "line-blur": 4, "line-opacity": 0.12 }} />
          <Layer id="trail-line" type="line" paint={{ "line-width": 2.4, "line-gradient": ["interpolate", ["linear"], ["line-progress"], 0, "rgba(230,240,255,0)", 0.7, "rgba(230,240,255,0.32)", 1, "rgba(245,250,255,0.9)"] }} />
        </Source>
        <Source id="inttrail" type="geojson" data={intTrails}>
          <Layer id="inttrail-line" type="line" paint={{ "line-color": "#8dffbf", "line-width": 1.5, "line-opacity": 0.6 }} />
        </Source>

        {world.cities.map((c) => {
          const mine = c.slot === mySlot;
          const color = c.alive ? SLOT_COLOR[c.slot] : "#3a3a3a";
          const targetable = attackMode && !mine && c.alive && relation(c.slot) === "war";
          const fl = flashes[c.id];
          return (
            <Marker key={c.id} longitude={c.lng} latitude={c.lat} anchor="center"
              onClick={(e) => { e.originalEvent.stopPropagation(); onCityClick(c); }}>
              <div className={`gd-city ${mine ? "mine" : "enemy"} ${!c.alive ? "dead" : ""} ${targetable ? "targetable" : ""} ${fl ? "flash-" + fl : ""}`} title={`${c.name} — ${Math.max(0, Math.round(c.hp))} hp`}>
                <span className="gd-city-dot" style={{ background: color }} />
                <span className="gd-hpbar"><span style={{ width: `${Math.max(0, c.hp)}%`, background: color }} /></span>
                <span className="gd-city-name">{c.name}</span>
              </div>
            </Marker>
          );
        })}

        {world.units.map((u) => (
          <Marker key={u.id} longitude={u.lng} latitude={u.lat} anchor="center"
            onClick={(e) => { e.originalEvent.stopPropagation(); onUnitClick(u); }}>
            <div className={`gd-unit ${u.slot === mySlot ? "mine" : "enemy"} ${u.id === selUnit ? "sel" : ""}`} title={unitLabel(u.type, u.slot)}>
              <UnitIcon name={UNIT_ICON[u.type]} color={SLOT_COLOR[u.slot]} size={22} />
            </div>
          </Marker>
        ))}

        {world.projectiles.map((p) => <Missile key={p.id} p={p} />)}
        {world.interceptors.map((it) => <Interceptor key={it.id} it={it} />)}

        {intercepts.map((i) => (
          <Marker key={i.id} longitude={i.lng} latitude={i.lat} anchor="center">
            <Explosion kind="intercept" />
          </Marker>
        ))}

        {explosions.map((x) => (
          <Marker key={x.id} longitude={x.lng} latitude={x.lat} anchor="center">
            <Explosion kind={x.kind} />
          </Marker>
        ))}
      </WorldMap>

      <LiveHud world={world} api={api} myNation={myNation} />
      {!world.over &&
        <Console world={world} api={api} mySlot={mySlot} active={tab} setActive={setTab}
          placing={placing} setPlacing={(t) => { setPlacing(t); setSelUnit(null); }} />}

      {selectedUnit && !world.over && (
        <div className="gd-selpanel">
          <div className="gd-selname"><UnitIcon name={UNIT_ICON[selectedUnit.type]} color={SLOT_COLOR[mySlot]} size={18} />{unitLabel(selectedUnit.type, selectedUnit.slot)}</div>
          <div className="gd-selmeta">range {UNITS[selectedUnit.type].range.toLocaleString()}km · hp {Math.round(selectedUnit.hp)} · {UNITS[selectedUnit.type].upkeep}/s</div>
          {UNITS[selectedUnit.type].kind === "offense" && (
            selectedUnit.targetId
              ? <button className="gd-btn" onClick={() => api.commandAttack(selectedUnit.id, null)}>Hold fire</button>
              : <button className={`gd-btn ${attackMode ? "primary" : ""}`} onClick={() => setAttackMode((v) => !v)}>
                  {attackMode ? "Pick a target…" : "Command attack"}
                </button>
          )}
          {UNITS[selectedUnit.type].kind !== "offense" && <div className="gd-selmeta hint">Fires interceptors at hostile missiles in range.</div>}
        </div>
      )}

      {err && <div className="gd-toast">{err}</div>}

      {world.over && (
        <div className="gd-overlay center">
          <div className="gd-card wide gd-pop">
            <div className={`gd-outcome ${world.winnerSlot === mySlot ? "win" : world.winnerSlot === null ? "draw" : "loss"}`}>
              {world.winnerSlot === mySlot ? "Victory" : world.winnerSlot === null ? "Annihilation" : "Defeated"}
            </div>
            <p className="gd-sub">{world.winnerSlot === mySlot ? "You are the last nation standing." : "The war is over."}</p>
            <button className="gd-btn primary" onClick={onQuit}>New match</button>
          </div>
        </div>
      )}
    </>
  );
}
