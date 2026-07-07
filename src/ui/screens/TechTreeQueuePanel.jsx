// Research queue panel — extracted from TechTree.jsx. Floats over the
// top-right of the tech atlas, showing the project currently being
// researched plus the queued techs behind it. Presentation only: state
// still flows through the engine via api.unqueue.
import {TECH_PATHS, TECHS} from "../../game/engine.js";

export default function TechTreeQueuePanel({rr, api}) {
    return (
        <div className="absolute top-3.5 right-3.5 z-[3] w-[260px] max-h-[calc(100%-28px)] flex flex-col rounded border border-line bg-panel-solid shadow-[0_8px_28px_rgba(0,0,0,0.45)] overflow-hidden"
             id="db-tt-queue-panel"
             role="region" aria-label="Research queue">
            <div className="font-mono text-[11px] tracking-[2px] uppercase text-dim px-3 py-2.5 border-b border-line-soft">
                Research Queue
            </div>
            <ul className="db-scroll list-none m-0 p-1.5 overflow-y-auto flex flex-col gap-1">
                {rr.current && (() => {
                    const t = TECHS[rr.current.id];
                    if (!t) return null;
                    const glyph = TECH_PATHS.find((p) => p.id === t.path)?.glyph;
                    const pct = Math.floor((rr.current.progress ?? 0) * 100);
                    return (
                        <li key="__current">
                            <div className="relative overflow-hidden flex items-center gap-2 w-full px-[9px] py-[7px] rounded-sm border border-gold bg-btn-bg cursor-default"
                                 aria-label={`Now researching ${t.name}, ${pct} percent complete.`}>
                                <i className="absolute inset-y-0 left-0 right-auto z-0 bg-gold opacity-[0.16] pointer-events-none"
                                   style={{width: `${pct}%`}}
                                   aria-hidden="true"/>
                                <span className="relative z-[1] font-mono text-[11px] min-w-[22px] text-center text-gold"
                                      aria-hidden="true">▶</span>
                                <span className="relative z-[1] text-[13px] text-dim" aria-hidden="true">{glyph}</span>
                                <span className="relative z-[1] flex-1 text-xs whitespace-nowrap overflow-hidden text-ellipsis">{t.name}</span>
                                <span className="relative z-[1] font-mono text-[11px] text-gold">{pct}%</span>
                            </div>
                        </li>
                    );
                })()}
                {rr.queue.map((qid, i) => {
                    const t = TECHS[qid];
                    if (!t) return null;
                    const glyph = TECH_PATHS.find((p) => p.id === t.path)?.glyph;
                    return (
                        <li key={qid}>
                            <button className="flex items-center gap-2 w-full px-[9px] py-[7px] rounded-sm border border-transparent bg-btn-bg text-text text-left cursor-pointer transition-[border-color,background] duration-150 ease-out-db hover:border-danger hover:bg-panel"
                                    onClick={() => api.unqueue(qid)}
                                    title={`Remove ${t.name} from the queue`}
                                    aria-label={`Queue position ${i + 1}: ${t.name}, ${t.cost} points. Remove from queue.`}>
                                <span className="font-mono text-[11px] text-faint min-w-[22px]">#{i + 1}</span>
                                <span className="text-[13px] text-dim" aria-hidden="true">{glyph}</span>
                                <span className="flex-1 text-xs whitespace-nowrap overflow-hidden text-ellipsis">{t.name}</span>
                                <span className="font-mono text-[11px] text-gold">◆ {t.cost}</span>
                            </button>
                        </li>
                    );
                })}
                {!rr.queue.length && (
                    <li className="list-none font-mono text-[10px] tracking-[0.4px] text-faint px-2.5 pt-2 pb-1.5">
                        Queue a tech to line it up next.
                    </li>
                )}
            </ul>
        </div>
    );
}
