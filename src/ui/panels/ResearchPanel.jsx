import { TECHS, TECH_PATHS, canQueue } from "../../game/engine.js";

export default function ResearchPanel({ world, api, mySlot }) {
  const n = world.nations.find((x) => x.slot === mySlot);
  const rr = n?.research || { queue: [], done: [], current: null };
  const cur = rr.current;
  const points = n?.points ?? 0;
  return (
    <div className="gd-panel-body">
      <div className="gd-panel-title">Research{cur ? ` · ${Math.floor(cur.progress * 100)}%` : ""}</div>
      {cur && <div className="gd-research-cur"><div className="gd-research-label">{TECHS[cur.id].name}</div><div className="gd-progress"><span style={{ width: `${Math.min(100, cur.progress * 100)}%` }} /></div></div>}
      {rr.queue.length > 0 && (
        <div className="gd-queue">
          {rr.queue.map((id, i) => <button key={id} className="gd-queue-item" title="Remove from queue" onClick={() => api.unqueue(id)}><span className="gd-queue-n">{i + 1}</span>{TECHS[id].name}<b>×</b></button>)}
        </div>
      )}
      {TECH_PATHS.map((path) => (
        <div key={path.id} className="gd-techpath">
          <div className="gd-techpath-h"><span className="gd-arsenal-glyph" data-kind="support">{path.glyph}</span>{path.name}</div>
          {Object.entries(TECHS).filter(([, t]) => t.path === path.id).map(([id, t]) => {
            const done = rr.done.includes(id); const isCur = cur?.id === id; const qi = rr.queue.indexOf(id); const avail = canQueue(n, id);
            const locked = !done && !isCur && qi < 0 && !avail;
            return (
              <div key={id} className={`gd-tech ${done ? "done" : ""} ${isCur ? "cur" : ""} ${locked ? "locked" : ""}`}>
                <div className="gd-arsenal-info"><b>{t.name}</b><span>{t.desc}</span></div>
                {done ? <span className="gd-tech-done">✓</span>
                  : isCur ? <span className="gd-tech-badge">…</span>
                  : qi >= 0 ? <span className="gd-tech-q">#{qi + 1}</span>
                  : avail ? <button className="gd-mini" disabled={points < t.cost} onClick={() => api.research(id)}>{t.cost}</button>
                  : <span className="gd-tech-lock" title="Requires previous tech">Locked</span>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
