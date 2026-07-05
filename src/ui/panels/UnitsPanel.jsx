import { UNITS, UNIT_ICON, unitLabel, incomeOf, upkeepOf, WARHEADS, WARHEAD_ORDER } from "../../game/engine.js";
import UnitIcon from "../UnitIcon.jsx";

export default function UnitsPanel({ world, api, mySlot, placing, setPlacing }) {
  const me = world.nations.find((n) => n.slot === mySlot);
  const points = me?.points ?? 0;
  const mine = world.units.filter((u) => u.slot === mySlot);
  const counts = {};
  for (const u of mine) counts[u.type] = (counts[u.type] || 0) + 1;
  const income = incomeOf(world, mySlot), upkeep = upkeepOf(world, mySlot), net = income - upkeep;
  const ammo = me?.ammo || {};
  const cur = me?.ammoCur || null;
  const queue = me?.ammoQ || [];
  return (
    <div className="gd-panel-body">
      <div className="gd-econbar">
        <div className="gd-econ-stat"><span>Income</span><b className="pos">+{income.toFixed(0)}</b></div>
        <div className="gd-econ-stat"><span>Upkeep</span><b className="neg">−{upkeep.toFixed(0)}</b></div>
        <div className="gd-econ-stat"><span>Net /s</span><b className={net < 0 ? "neg" : "pos"}>{net >= 0 ? "+" : "−"}{Math.abs(net).toFixed(0)}</b></div>
      </div>
      {net < 0 && <div className="gd-econ-warn">In deficit — dismantle units before building more.</div>}

      <div className="gd-panel-title">Arsenal</div>
      <div className="gd-arsenal-grid">
        {Object.entries(UNITS).map(([key, u]) => {
          const afford = points >= u.cost && net >= 0;
          return (
            <button key={key} className={`gd-acard ${placing === key ? "active" : ""} ${afford ? "" : "poor"}`} onClick={() => setPlacing(placing === key ? null : key)} title={u.hint || `${u.kind} · ${u.range.toLocaleString()}km`}>
              <span className="gd-acard-ico" data-kind={u.kind}><UnitIcon name={UNIT_ICON[key]} size={26} /></span>
              <span className="gd-acard-name">{unitLabel(key, mySlot)}</span>
              <span className="gd-acard-meta">{u.kind} · {u.upkeep}/s</span>
              <span className="gd-acard-cost">◆ {u.cost}</span>
            </button>
          );
        })}
      </div>
      {placing && <div className="gd-place-hint">Placing <b>{unitLabel(placing, mySlot)}</b> — {UNITS[placing].domain === "sea" ? "click in your coastal waters" : "click inside your territory"}.{UNITS[placing].requires ? ` Needs a ${UNITS[UNITS[placing].requires].label}.` : ""} <button className="gd-mini" onClick={() => setPlacing(null)}>Cancel</button></div>}

      <div className="gd-panel-title">Munitions</div>
      <div className="gd-arsenal-hint">Offensive strikes consume warheads — produce them here over time. Defences never run out while their upkeep is paid.</div>
      <div className="gd-ammo-grid">
        {WARHEAD_ORDER.map((k) => {
          const wh = WARHEADS[k]; const stock = ammo[k] || 0; const afford = points >= wh.prodCost;
          const qn = (cur?.type === k ? 1 : 0) + queue.filter((x) => x === k).length;
          return (
            <div key={k} className="gd-ammo-card" style={{ "--flame": wh.flame }}>
              <div className="gd-ammo-name">{wh.name}</div>
              <div className="gd-ammo-stock">{stock}<span>in stock</span></div>
              <div className="gd-ammo-desc">{wh.desc}</div>
              {cur?.type === k && <div className="gd-ammo-bar"><i style={{ width: `${Math.round(cur.progress * 100)}%` }} /></div>}
              <button className="gd-mini2" disabled={!afford} onClick={() => api.produceAmmo(k)}>◆ {wh.prodCost} · Build{qn ? ` (${qn})` : ""}</button>
            </div>
          );
        })}
      </div>
      {(cur || queue.length > 0) && (
        <div className="gd-ammo-queue">
          {cur && <span className="gd-ammoq building" style={{ "--flame": WARHEADS[cur.type].flame }}>{WARHEADS[cur.type].short} {Math.round(cur.progress * 100)}%</span>}
          {queue.map((t, i) => <button key={i} className="gd-ammoq" style={{ "--flame": WARHEADS[t].flame }} title="Cancel — refund" onClick={() => api.cancelAmmo(i)}>{WARHEADS[t].short} ×</button>)}
        </div>
      )}

      <div className="gd-panel-title">Deployed · {mine.length}</div>
      <div className="gd-forces-chips">
        {mine.length === 0 && <div className="gd-empty">No units deployed yet.</div>}
        {Object.entries(counts).map(([type, n]) => (
          <div key={type} className="gd-fchip" title={unitLabel(type, mySlot)}><UnitIcon name={UNIT_ICON[type]} size={15} /><b>{n}</b></div>
        ))}
      </div>
    </div>
  );
}
