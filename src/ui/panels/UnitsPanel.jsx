import { UNITS, UNIT_ICON, unitLabel, incomeOf, upkeepOf } from "../../game/engine.js";
import UnitIcon from "../UnitIcon.jsx";

export default function UnitsPanel({ world, mySlot, placing, setPlacing }) {
  const me = world.nations.find((n) => n.slot === mySlot);
  const points = me?.points ?? 0;
  const mine = world.units.filter((u) => u.slot === mySlot);
  const counts = {};
  for (const u of mine) counts[u.type] = (counts[u.type] || 0) + 1;
  const income = incomeOf(world, mySlot);
  const upkeep = upkeepOf(world, mySlot);
  const net = income - upkeep;
  return (
    <div className="gd-panel-body">
      <div className="gd-panel-title">Economy</div>
      <div className="gd-econ">
        <div className="gd-econ-row"><span>Income</span><b className="pos">+{income.toFixed(1)}/s</b></div>
        <div className="gd-econ-row"><span>Ammo upkeep</span><b className="neg">−{upkeep.toFixed(1)}/s</b></div>
        <div className="gd-econ-row net"><span>Net</span><b className={net < 0 ? "neg" : "pos"}>{net >= 0 ? "+" : "−"}{Math.abs(net).toFixed(1)}/s</b></div>
        {net < 0 && <div className="gd-econ-warn">Deficit — points draining. Scale back or take more cities.</div>}
      </div>

      <div className="gd-panel-title">Arsenal</div>
      <div className="gd-list">
        {Object.entries(UNITS).map(([key, u]) => {
          const afford = points >= u.cost;
          return (
            <button key={key} className={`gd-arsenal-item ${placing === key ? "active" : ""} ${afford ? "" : "poor"}`}
              onClick={() => setPlacing(placing === key ? null : key)}>
              <span className="gd-arsenal-glyph" data-kind={u.kind}><UnitIcon name={UNIT_ICON[key]} size={22} /></span>
              <span className="gd-arsenal-info"><b>{unitLabel(key, mySlot)}</b><span>{u.kind} · {u.range.toLocaleString()}km · {u.upkeep}/s</span></span>
              <span className="gd-arsenal-cost">{u.cost}</span>
            </button>
          );
        })}
      </div>
      {placing && (
        <div className="gd-place-hint">
          Placing <b>{unitLabel(placing, mySlot)}</b> — click the map.
          <button className="gd-mini" onClick={() => setPlacing(null)}>Cancel</button>
        </div>
      )}
      <div className="gd-panel-title">Your forces · {mine.length}</div>
      <div className="gd-list">
        {mine.length === 0 && <div className="gd-empty">Nothing deployed yet. Buy from the arsenal, then click the map.</div>}
        {Object.entries(counts).map(([type, n]) => (
          <div key={type} className="gd-force-row">
            <span className="gd-arsenal-glyph" data-kind={UNITS[type].kind}><UnitIcon name={UNIT_ICON[type]} size={20} /></span>
            <span className="gd-force-name">{unitLabel(type, mySlot)}</span>
            <span className="gd-force-count">×{n} · {(n * UNITS[type].upkeep).toFixed(0)}/s</span>
          </div>
        ))}
      </div>
    </div>
  );
}
