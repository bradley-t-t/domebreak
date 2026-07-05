import { useEffect, useMemo, useRef, useState } from "react";
import WorldMap from "../map/WorldMap.jsx";
import LiveHud from "./LiveHud.jsx";
import Console from "./Console.jsx";
import UnitIcon from "./UnitIcon.jsx";
import Missile from "./Missile.jsx";
import Interceptor from "./Interceptor.jsx";
import Explosion from "./Explosion.jsx";
import ContextMenu from "./ContextMenu.jsx";
import PinnedBar from "./PinnedBar.jsx";
import { Marker, Source, Layer } from "react-map-gl/maplibre";
import { useEngine } from "../game/useEngine.js";
import { UNITS, UNIT_ICON, unitLabel, defenseRange, TERRITORY_RADIUS } from "../game/engine.js";
import { circle, gcTrail } from "../game/geo.js";
import { SLOT_COLOR } from "../game/constants.js";

const CITY_LAYERS = ["live-cities"];
const fmtPop = (p) => (p >= 1e9 ? (p / 1e9).toFixed(2) + "B" : p >= 1e6 ? (p / 1e6).toFixed(0) + "M" : p >= 1e3 ? (p / 1e3).toFixed(0) + "K" : "" + Math.round(p || 0));

export default function LiveGame({ world, globe, onToggleGlobe, onPause, backdrop }) {
  const [w, api] = useEngine(world);
  const mySlot = w.mySlot;
  const myNation = w.nations.find((n) => n.slot === mySlot);
  const mapRef = useRef(null);

  const [tab, setTab] = useState("units");
  const [placing, setPlacing] = useState(null);
  const [moving, setMoving] = useState(null);
  const [selUnit, setSelUnit] = useState(null);
  const [selCity, setSelCity] = useState(null);
  const [attackMode, setAttackMode] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [explosions, setExplosions] = useState([]);
  const [menu, setMenu] = useState(null);
  const [details, setDetails] = useState(null);
  const [pins, setPins] = useState([]);
  const [err, setErr] = useState(null);
  const seen = useRef(new Set());

  const relation = (slot) => (myNation?.relations[slot] === "war" ? "war" : "peace");
  const nationName = (slot) => w.nations.find((n) => n.slot === slot)?.name || `Nation ${slot}`;
  const flash = (m) => { setErr(m); setTimeout(() => setErr(null), 1800); };

  useEffect(() => {
    const fresh = [];
    for (const e of w.events) {
      if (seen.current.has(e.id)) continue;
      seen.current.add(e.id);
      if (e.type === "intercept") fresh.push({ id: e.id, lng: e.lng, lat: e.lat, kind: "intercept" });
      else if (e.type === "hit" || e.type === "destroy") fresh.push({ id: e.id, lng: e.lng, lat: e.lat, kind: e.type });
    }
    if (seen.current.size > 500) seen.current = new Set(w.events.map((e) => e.id));
    if (!fresh.length) return;
    setExplosions((list) => [...list, ...fresh]);
    for (const e of fresh) { const id = e.id; setTimeout(() => setExplosions((list) => list.filter((x) => x.id !== id)), 850); }
  }, [w.time]);

  useEffect(() => {
    const h = (e) => {
      if (e.key !== "Escape") return;
      if (menu) setMenu(null); else if (details) setDetails(null); else if (moving) setMoving(null);
      else if (placing) setPlacing(null); else if (attackMode) setAttackMode(false); else onPause?.();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [menu, details, moving, placing, attackMode, onPause]);

  const backdropFC = useMemo(() => ({ type: "FeatureCollection", features: (backdrop || []).map((c) => ({ type: "Feature", properties: { cap: c.cap ? 1 : 0 }, geometry: { type: "Point", coordinates: [c.lng, c.lat] } })) }), [backdrop]);
  const showTerr = !!(placing || moving);
  const territoryFC = useMemo(() => showTerr ? ({ type: "FeatureCollection", features: w.cities.filter((c) => c.slot === mySlot && c.alive).map((c) => circle(c.lng, c.lat, TERRITORY_RADIUS, 40)) }) : { type: "FeatureCollection", features: [] }, [showTerr, mySlot, w.cities]);

  const liveFC = useMemo(() => ({ type: "FeatureCollection", features: w.cities.map((c) => ({ type: "Feature", properties: { id: c.id, cap: c.cap ? 1 : 0, mine: c.slot === mySlot ? 1 : 0, color: c.alive ? SLOT_COLOR[c.slot] : "#3a3a3a" }, geometry: { type: "Point", coordinates: [c.lng, c.lat] } })) }), [w.cities, w.time, mySlot]);

  const ranges = useMemo(() => {
    const f = [];
    for (const u of w.units) {
      if (u.slot !== mySlot) continue;
      const def = UNITS[u.type];
      let radius = null, isRadar = 0;
      if (def.kind === "defense") radius = defenseRange(w, u);
      else if (def.kind === "support") { radius = def.range; isRadar = 1; }
      if (radius && radius <= 4000) { const c = circle(u.lng, u.lat, radius); c.properties = { color: SLOT_COLOR[mySlot], sel: u.id === selUnit ? 1 : 0, radar: isRadar }; f.push(c); }
    }
    if (placing && cursor && UNITS[placing].kind !== "offense" && UNITS[placing].range <= 4000) { const c = circle(cursor.lng, cursor.lat, UNITS[placing].range); c.properties = { color: "#f4c02a", sel: 1, radar: UNITS[placing].kind === "support" ? 1 : 0 }; f.push(c); }
    return { type: "FeatureCollection", features: f };
  }, [w.units, w.time, placing, cursor, selUnit, mySlot]);

  const cmdLines = useMemo(() => ({ type: "FeatureCollection", features: w.units.filter((u) => u.slot === mySlot && u.targetId).map((u) => { const t = w.cities.find((c) => c.id === u.targetId) || w.units.find((x) => x.id === u.targetId); return t ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: gcTrail(u.lng, u.lat, t.lng, t.lat, 1, 18) } } : null; }).filter(Boolean) }), [w.units, w.time, mySlot]);
  const trails = useMemo(() => ({ type: "FeatureCollection", features: w.projectiles.map((p) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: gcTrail(p.fromLng, p.fromLat, p.toLng, p.toLat, p.progress) } })) }), [w.projectiles, w.time]);
  const intTrails = useMemo(() => ({ type: "FeatureCollection", features: w.interceptors.map((it) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[it.fromLng, it.fromLat], [it.lng, it.lat]] } })) }), [w.interceptors, w.time]);

  const onMapClick = (e) => {
    if (moving) { const r = api.move(moving, e.lngLat.lng, e.lngLat.lat); if (r.error) flash(r.error); else setMoving(null); return; }
    if (placing) { const r = api.buyPlace(placing, e.lngLat.lng, e.lngLat.lat); if (r.error) flash(r.error); return; }
    const feat = e.features?.find((f) => f.layer.id === "live-cities");
    if (feat) { onCityClick(feat.properties.id); return; }
    setSelUnit(null); setSelCity(null); setAttackMode(false); setMenu(null);
  };
  const onCityClick = (id) => {
    const c = w.cities.find((x) => x.id === id); if (!c) return;
    if (attackMode && selUnit && c.slot !== mySlot) { const r = api.commandAttack(selUnit, c.id); if (r.error) flash(r.error); else setAttackMode(false); return; }
    setSelCity(id); setSelUnit(null);
  };
  const onCtx = (e) => { const feat = e.features?.find((f) => f.layer.id === "live-cities"); if (feat) openCityMenu(feat.properties.id, e.originalEvent); else setMenu(null); };

  const addPin = (type, ent) => { const key = `${type}-${ent.id}`; setPins((p) => p.some((x) => x.key === key) ? p : [...p, { key, type, id: ent.id, label: type === "city" ? ent.name : unitLabel(ent.type, ent.slot), lng: ent.lng, lat: ent.lat, color: SLOT_COLOR[ent.slot] }]); };
  const goPin = (p) => mapRef.current?.flyTo?.({ center: [p.lng, p.lat], zoom: 4, duration: 800 });

  const openCityMenu = (id, ev) => {
    const c = w.cities.find((x) => x.id === id); if (!c) return;
    const mine = c.slot === mySlot; const rel = relation(c.slot); const sel = w.units.find((u) => u.id === selUnit);
    const items = [{ label: "Details", onClick: () => setDetails({ type: "city", id }) }];
    if (!mine) {
      if (rel === "war") items.push({ label: "Target with selected", disabled: !(sel && UNITS[sel.type].kind === "offense"), onClick: () => { const r = api.commandAttack(selUnit, c.id); if (r.error) flash(r.error); } });
      else items.push({ label: `Declare war on ${nationName(c.slot)}`, danger: true, onClick: () => api.declareWar(c.slot) });
    }
    items.push({ label: "Pin", onClick: () => addPin("city", c) });
    setMenu({ title: `${c.name}${c.state ? " · " + c.state : ""}`, items, x: ev.clientX, y: ev.clientY });
  };
  const openUnitMenu = (u, ev) => {
    ev.preventDefault();
    const mine = u.slot === mySlot; const off = UNITS[u.type].kind === "offense";
    const items = [{ label: "Details", onClick: () => setDetails({ type: "unit", id: u.id }) }];
    if (mine && off) items.push(u.targetId ? { label: "Hold fire", onClick: () => api.commandAttack(u.id, null) } : { label: "Command attack", onClick: () => { setSelUnit(u.id); setAttackMode(true); } });
    if (mine) items.push({ label: "Move (relocate)", onClick: () => { setMoving(u.id); setPlacing(null); setSelUnit(u.id); } });
    if (mine) items.push({ label: "Dismantle (sell +50%)", danger: true, onClick: () => { api.scrap(u.id); if (selUnit === u.id) setSelUnit(null); } });
    items.push({ label: "Pin", onClick: () => addPin("unit", u) });
    setMenu({ title: unitLabel(u.type, u.slot), items, x: ev.clientX, y: ev.clientY });
  };
  const onUnitClick = (u, ev) => {
    ev?.stopPropagation?.();
    if (attackMode && selUnit) { if (u.slot === mySlot) return; const r = api.commandAttack(selUnit, u.id); if (r.error) flash(r.error); else setAttackMode(false); return; }
    if (u.slot === mySlot) setSelUnit(u.id);
  };

  const selectedUnit = w.units.find((u) => u.id === selUnit);
  const selectedCity = w.cities.find((c) => c.id === selCity);
  const detailTarget = details && (details.type === "unit" ? w.units.find((u) => u.id === details.id) : w.cities.find((c) => c.id === details.id));

  return (
    <>
      <WorldMap globe={globe} onMap={(m) => (mapRef.current = m)} interactiveLayerIds={CITY_LAYERS}
        onMapClick={onMapClick} onContextMenu={onCtx}
        onMouseMove={(placing || moving) ? (ll) => setCursor(ll) : undefined}
        cursor={placing || moving || attackMode ? "crosshair" : "grab"}>
        <Source id="backdrop-src" type="geojson" data={backdropFC}><Layer id="backdrop-cities" type="circle" paint={{ "circle-radius": ["case", ["==", ["get", "cap"], 1], 2.3, 1.3], "circle-color": "#63769a", "circle-opacity": 0.5 }} /></Source>
        <Source id="terr-src" type="geojson" data={territoryFC}>
          <Layer id="terr-fill" type="fill" paint={{ "fill-color": "#f4c02a", "fill-opacity": 0.05 }} />
          <Layer id="terr-line" type="line" paint={{ "line-color": "#f4c02a", "line-opacity": 0.35, "line-width": 1, "line-dasharray": [2, 2] }} />
        </Source>
        <Source id="ranges" type="geojson" data={ranges}>
          <Layer id="range-fill" type="fill" filter={["!=", ["get", "radar"], 1]} paint={{ "fill-color": ["get", "color"], "fill-opacity": ["case", ["==", ["get", "sel"], 1], 0.14, 0.05] }} />
          <Layer id="range-line" type="line" filter={["!=", ["get", "radar"], 1]} paint={{ "line-color": ["get", "color"], "line-width": ["case", ["==", ["get", "sel"], 1], 1.6, 0.7], "line-opacity": 0.6 }} />
          <Layer id="radar-ring" type="line" filter={["==", ["get", "radar"], 1]} paint={{ "line-color": ["get", "color"], "line-width": 0.9, "line-opacity": 0.5, "line-dasharray": [3, 3] }} />
        </Source>
        <Source id="cmd" type="geojson" data={cmdLines}><Layer id="cmd-line" type="line" paint={{ "line-color": SLOT_COLOR[mySlot], "line-width": 1.4, "line-opacity": 0.5, "line-dasharray": [2, 3] }} /></Source>
        <Source id="trail" type="geojson" data={trails} lineMetrics>
          <Layer id="trail-glow" type="line" paint={{ "line-color": "#cfe2ff", "line-width": 6, "line-blur": 4, "line-opacity": 0.12 }} />
          <Layer id="trail-line" type="line" paint={{ "line-width": 2.4, "line-gradient": ["interpolate", ["linear"], ["line-progress"], 0, "rgba(230,240,255,0)", 0.7, "rgba(230,240,255,0.32)", 1, "rgba(245,250,255,0.9)"] }} />
        </Source>
        <Source id="inttrail" type="geojson" data={intTrails}><Layer id="inttrail-line" type="line" paint={{ "line-color": "#8dffbf", "line-width": 1.5, "line-opacity": 0.6 }} /></Source>
        <Source id="live-src" type="geojson" data={liveFC}><Layer id="live-cities" type="circle" paint={{ "circle-radius": ["case", ["==", ["get", "cap"], 1], 5, 3], "circle-color": ["get", "color"], "circle-stroke-color": ["case", ["==", ["get", "mine"], 1], "#ffffff", "#05070c"], "circle-stroke-width": ["case", ["==", ["get", "mine"], 1], 1.4, 0.6] }} /></Source>

        {selectedCity && <Marker longitude={selectedCity.lng} latitude={selectedCity.lat} anchor="center"><div className="gd-city-sel" /></Marker>}
        {w.units.map((u) => (
          <Marker key={u.id} longitude={u.lng} latitude={u.lat} anchor="center">
            <div className={`gd-unit ${u.slot === mySlot ? "mine" : "enemy"} ${u.id === selUnit ? "sel" : ""}`} title={unitLabel(u.type, u.slot)} onClick={(e) => onUnitClick(u, e)} onContextMenu={(e) => openUnitMenu(u, e)}>
              <UnitIcon name={UNIT_ICON[u.type]} color={SLOT_COLOR[u.slot]} size={22} />
            </div>
          </Marker>
        ))}
        {w.projectiles.map((p) => <Missile key={p.id} p={p} />)}
        {w.interceptors.map((it) => <Interceptor key={it.id} it={it} />)}
        {explosions.map((x) => <Marker key={x.id} longitude={x.lng} latitude={x.lat} anchor="center"><Explosion kind={x.kind} /></Marker>)}
      </WorldMap>

      <div className="gd-topbtns">
        <button className="gd-iconbtn" onClick={onToggleGlobe} title="Globe / Flat">{globe ? "◐" : "▦"}</button>
        <button className="gd-iconbtn" onClick={onPause} title="Menu (Esc)">☰</button>
      </div>

      <LiveHud world={w} api={api} myNation={myNation} />
      {!w.over && <Console world={w} api={api} mySlot={mySlot} active={tab} setActive={setTab} placing={placing} setPlacing={(t) => { setPlacing(t); setMoving(null); setSelUnit(null); }} />}
      <PinnedBar pins={pins} onGo={goPin} onRemove={(key) => setPins((p) => p.filter((x) => x.key !== key))} />

      {moving && <div className="gd-move-hint">Relocating <b>{unitLabel(w.units.find((u) => u.id === moving)?.type, mySlot)}</b> — click inside your territory. <button className="gd-mini" onClick={() => setMoving(null)}>Cancel</button></div>}

      {selectedUnit && !w.over && (
        <div className="gd-selpanel">
          <div className="gd-selname"><UnitIcon name={UNIT_ICON[selectedUnit.type]} color={SLOT_COLOR[mySlot]} size={18} />{unitLabel(selectedUnit.type, selectedUnit.slot)}</div>
          <div className="gd-selmeta">range {Math.round(UNITS[selectedUnit.type].kind === "defense" ? defenseRange(w, selectedUnit) : UNITS[selectedUnit.type].range).toLocaleString()}km · hp {Math.round(selectedUnit.hp)} · {UNITS[selectedUnit.type].upkeep}/s</div>
          {UNITS[selectedUnit.type].kind === "offense" && (selectedUnit.targetId
            ? <button className="gd-btn" onClick={() => api.commandAttack(selectedUnit.id, null)}>Hold fire</button>
            : <button className={`gd-btn ${attackMode ? "primary" : ""}`} onClick={() => setAttackMode((v) => !v)}>{attackMode ? "Pick a target…" : "Command attack"}</button>)}
        </div>
      )}
      {selectedCity && !details && !w.over && (
        <div className="gd-selpanel">
          <div className="gd-selname"><span className="gd-slot-dot" style={{ background: SLOT_COLOR[selectedCity.slot] }} />{selectedCity.name}</div>
          <div className="gd-selmeta">{nationName(selectedCity.slot)}{selectedCity.state ? " · " + selectedCity.state : ""} · pop {fmtPop(selectedCity.pop)} · {Math.max(0, Math.round(selectedCity.hp))} hp{selectedCity.slot === mySlot ? " · yours" : " · " + relation(selectedCity.slot)}</div>
          {selectedCity.slot !== mySlot && relation(selectedCity.slot) !== "war" && <button className="gd-btn primary" onClick={() => api.declareWar(selectedCity.slot)}>Declare war</button>}
        </div>
      )}

      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}

      {detailTarget && (
        <div className="gd-overlay center" onClick={() => setDetails(null)}>
          <div className="gd-card" onClick={(e) => e.stopPropagation()}>
            {details.type === "unit" ? (<>
              <div className="gd-selname"><UnitIcon name={UNIT_ICON[detailTarget.type]} color={SLOT_COLOR[detailTarget.slot]} size={20} />{unitLabel(detailTarget.type, detailTarget.slot)}</div>
              <div className="gd-detail-grid">
                <div><span>Owner</span><b>{nationName(detailTarget.slot)}</b></div>
                <div><span>Class</span><b>{UNITS[detailTarget.type].kind}</b></div>
                <div><span>Range</span><b>{Math.round(UNITS[detailTarget.type].kind === "defense" ? defenseRange(w, detailTarget) : UNITS[detailTarget.type].range).toLocaleString()} km</b></div>
                <div><span>HP</span><b>{Math.round(detailTarget.hp)}</b></div>
                <div><span>Upkeep</span><b>{UNITS[detailTarget.type].upkeep}/s</b></div>
                <div><span>Target</span><b>{detailTarget.targetId ? "engaged" : "—"}</b></div>
              </div>
            </>) : (<>
              <div className="gd-selname"><span className="gd-slot-dot" style={{ background: SLOT_COLOR[detailTarget.slot] }} />{detailTarget.name}</div>
              <div className="gd-detail-grid">
                <div><span>Nation</span><b>{nationName(detailTarget.slot)}</b></div>
                <div><span>State</span><b>{detailTarget.state || "—"}</b></div>
                <div><span>Population</span><b>{fmtPop(detailTarget.pop)}</b></div>
                <div><span>Type</span><b>{detailTarget.cap ? "Capital" : "City"}</b></div>
                <div><span>HP</span><b>{Math.max(0, Math.round(detailTarget.hp))}/{detailTarget.maxHp}</b></div>
                <div><span>Status</span><b>{detailTarget.alive ? "standing" : "destroyed"}</b></div>
              </div>
            </>)}
            <button className="gd-btn" style={{ marginTop: 14, width: "100%" }} onClick={() => setDetails(null)}>Close</button>
          </div>
        </div>
      )}

      {err && <div className="gd-toast">{err}</div>}
      {w.over && (
        <div className="gd-overlay center">
          <div className="gd-card wide gd-pop">
            <div className={`gd-outcome ${w.winnerSlot === mySlot ? "win" : w.winnerSlot === null ? "draw" : "loss"}`}>{w.winnerSlot === mySlot ? "Victory" : w.winnerSlot === null ? "Annihilation" : "Defeated"}</div>
            <p className="gd-sub">{w.winnerSlot === mySlot ? "You are the last power standing." : "The war is over."}</p>
            <button className="gd-btn primary" onClick={onPause}>Menu</button>
          </div>
        </div>
      )}
    </>
  );
}
