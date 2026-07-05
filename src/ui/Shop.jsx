import { UNITS } from "../game/engine.js";

export default function Shop({ points, placing, onPick, onCancel }) {
  return (
    <div className="gd-shop">
      <div className="gd-shop-title">Arsenal</div>
      <div className="gd-shop-items">
        {Object.entries(UNITS).map(([key, u]) => {
          const afford = points >= u.cost;
          return (
            <button key={key} className={`gd-shopitem ${placing === key ? "active" : ""} ${afford ? "" : "poor"}`}
              onClick={() => onPick(key)} title={`${u.kind} · range ${u.range}km`}>
              <span className="gd-shop-glyph" data-kind={u.kind}>{u.glyph}</span>
              <span className="gd-shop-name">{u.label}</span>
              <span className="gd-shop-cost">{u.cost}</span>
            </button>
          );
        })}
      </div>
      {placing && <button className="gd-mini" onClick={onCancel}>Cancel placing ({placing})</button>}
    </div>
  );
}
