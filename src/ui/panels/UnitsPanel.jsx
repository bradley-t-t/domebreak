import { UNITS, UNIT_ICON, unitLabel, incomeOf, upkeepOf } from "../../game/engine.js";
import UnitIcon from "../UnitIcon.jsx";

export default function UnitsPanel({ world, mySlot, placing, setPlacing }) {
  const me = world.nations.find((n) => n.slot === mySlot);
  const points = me?.points ?? 0;
  const mine = world.units.filter((u) => u.slot === mySlot);
  const counts = {};
  for (const u of mine) counts[u.type] = (counts[u.type] || 0) + 1;
  const income = incomeOf(world, mySlot), upkeep = upkeepOf(world, mySlot), net = income - upkeep;
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
      {placing && <div className="gd-place-hint">Placing <b>{unitLabel(placing, mySlot)}</b> — click inside your territory. <button className="gd-mini" onClick={() => setPlacing(null)}>Cancel</button></div>}
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
