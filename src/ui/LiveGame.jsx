import { useEffect, useMemo, useRef, useState } from "react";
import WorldMap from "../map/WorldMap.jsx";
import LiveHud from "./LiveHud.jsx";
import Console from "./Console.jsx";
import { Marker, Source, Layer } from "react-map-gl/maplibre";
import { useEngine } from "../game/useEngine.js";
import { UNITS } from "../game/engine.js";
import { circle } from "../game/geo.js";
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
  const [err, setErr] = useState(null);
  const lastEid = useRef(0);

  const relation = (slot) => (myNation?.relations[slot] === "war" ? "war" : "peace");
  const flash = (m) => { setErr(m); setTimeout(() => setErr(null), 1800); };

  // Impact flashes on cities, driven by fresh combat events (real-time timeout).
  useEffect(() => {
    let maxId = lastEid.current;
    const fresh = [];
    for (const e of world.events) {
      if (e.id > lastEid.current && e.cityId && (e.type === "hit" || e.type === "destroy" || e.type === "intercept")) fresh.push(e);
      if (e.id > maxId) maxId = e.id;
    }
    lastEid.current = maxId;
    if (!fresh.length) return;
    setFlashes((f) => { const n = { ...f }; for (const e of fresh) n[e.cityId] = e.type; return n; });
    for (const e of fresh) {
      const cid = e.cityId, ty = e.type;
      setTimeout(() => setFlashes((f) => { if (f[cid] !== ty) return f; const n = { ...f }; delete n[cid]; return n; }), 520);
    }
  }, [world.time]);

  const ranges = useMemo(() => {
    const f = [];
    for (const u of world.units) {
      if (u.slot !== mySlot) continue;
      const def = UNITS[u.type];
      if ((def.kind === "defense" || def.kind === "support") && def.range <= 4000) {
        const c = circle(u.lng, u.lat, def.range);
        c.properties = { color: SLOT_COLOR[mySlot], sel: u.id === selUnit ? 1 : 0 };
        f.push(c);
      }
    }
    if (placing && cursor && UNITS[placing].range <= 4000) {
      const c = circle(cursor.lng, cursor.lat, UNITS[placing].range);
      c.properties = { color: "#f4c02a", sel: 1 };
      f.push(c);
    }
    return { type: "FeatureCollection", features: f };
  }, [world.units, placing, cursor, selUnit, mySlot]);

  const lines = useMemo(() => {
    const f = [];
    for (const u of world.units) {
      if (u.slot === mySlot && u.targetId) {
        const t = world.cities.find((c) => c.id === u.targetId) || world.units.find((x) => x.id === u.targetId);
        if (t) f.push({ type: "Feature", properties: { color: SLOT_COLOR[mySlot] },
          geometry: { type: "LineString", coordinates: [[u.lng, u.lat], [t.lng, t.lat]] } });
      }
    }
    for (const p of world.projectiles) {
      f.push({ type: "Feature", properties: { color: SLOT_COLOR[p.slot] || "#fff" },
        geometry: { type: "LineString", coordinates: [[p.fromLng, p.fromLat], [p.lng, p.lat]] } });
    }
    return { type: "FeatureCollection", features: f };
  }, [world.units, world.projectiles, mySlot]);

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
          <Layer id="range-fill" type="fill" paint={{ "fill-color": ["get", "color"], "fill-opacity": ["case", ["==", ["get", "sel"], 1], 0.14, 0.05] }} />
          <Layer id="range-line" type="line" paint={{ "line-color": ["get", "color"], "line-width": ["case", ["==", ["get", "sel"], 1], 1.6, 0.7], "line-opacity": 0.6 }} />
        </Source>
        <Source id="lines" type="geojson" data={lines}>
          <Layer id="cmd-line" type="line" paint={{ "line-color": ["get", "color"], "line-width": 1.6, "line-opacity": 0.85, "line-dasharray": [2, 2] }} />
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
            <div className={`gd-unit ${u.slot === mySlot ? "mine" : "enemy"} ${u.id === selUnit ? "sel" : ""}`}
              style={{ color: SLOT_COLOR[u.slot] }} title={UNITS[u.type].label}>{UNITS[u.type].glyph}</div>
          </Marker>
        ))}

        {world.projectiles.map((p) => (
          <Marker key={p.id} longitude={p.lng} latitude={p.lat} anchor="center">
            <div className="gd-proj" style={{ background: SLOT_COLOR[p.slot] || "#fff" }} />
          </Marker>
        ))}
      </WorldMap>

      <LiveHud world={world} api={api} myNation={myNation} />
      {!world.over &&
        <Console world={world} api={api} mySlot={mySlot} active={tab} setActive={setTab}
          placing={placing} setPlacing={(t) => { setPlacing(t); setSelUnit(null); }} />}

      {selectedUnit && !world.over && (
        <div className="gd-selpanel">
          <div className="gd-selname">{UNITS[selectedUnit.type].label}</div>
          <div className="gd-selmeta">range {UNITS[selectedUnit.type].range.toLocaleString()}km · hp {Math.round(selectedUnit.hp)}</div>
          {UNITS[selectedUnit.type].kind === "offense" && (
            selectedUnit.targetId
              ? <button className="gd-btn" onClick={() => api.commandAttack(selectedUnit.id, null)}>Hold fire</button>
              : <button className={`gd-btn ${attackMode ? "primary" : ""}`} onClick={() => setAttackMode((v) => !v)}>
                  {attackMode ? "Pick a target…" : "Command attack"}
                </button>
          )}
          {UNITS[selectedUnit.type].kind !== "offense" && <div className="gd-selmeta hint">Auto-defends nearby.</div>}
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
