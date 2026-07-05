import { TECHS } from "../../game/engine.js";

export default function ResearchPanel({ world, api, mySlot }) {
  const me = world.nations.find((n) => n.slot === mySlot);
  const cur = me?.research.current;
  const done = me?.research.done ?? [];
  const points = me?.points ?? 0;
  return (
    <div className="gd-panel-body">
      <div className="gd-panel-title">Research</div>
      {cur && (
        <div className="gd-research-cur">
          <div className="gd-research-label">Researching {TECHS[cur.id].label}</div>
          <div className="gd-progress"><span style={{ width: `${Math.min(100, cur.progress * 100)}%` }} /></div>
        </div>
      )}
      <div className="gd-list">
        {Object.entries(TECHS).map(([id, t]) => {
          const isDone = done.includes(id);
          const isCur = cur?.id === id;
          const afford = points >= t.cost;
          return (
            <div key={id} className={`gd-tech ${isDone ? "done" : ""} ${isCur ? "cur" : ""}`}>
              <span className="gd-arsenal-glyph" data-kind="support">❉</span>
              <span className="gd-arsenal-info"><b>{t.label}</b><span>{t.desc}</span></span>
              {isDone ? <span className="gd-tech-done">✓</span>
                : isCur ? <span className="gd-tech-badge">…</span>
                : <button className="gd-mini" disabled={!!cur || !afford} onClick={() => api.research(id)}>{t.cost}</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
