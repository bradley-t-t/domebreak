// Selected-unit detail card: stats, move/set-sail control, hangar + patrol
// controls for airbases, and the warhead/attack controls for offense units.
// Pulled out of LiveGame.jsx verbatim (same JSX, same classes) as a pure
// presentational component — it reads props only and calls back through the
// same api/setState functions the parent already owns.
import UnitIcon from "../common/UnitIcon.jsx";
import {FALLOUT, hangarCapOf, hangarCount, PATROL_SIZES, UNIT_ICON, UNITS, WARHEAD_ORDER, WARHEADS} from "../../game/engine.js";

export default function SelectionPanel({
                                           selectedUnit,
                                           w,
                                           myNation,
                                           mySlot,
                                           api,
                                           labelOf,
                                           teamColor,
                                           unitStats,
                                           moving,
                                           setMoving,
                                           setPlacing,
                                           attackMode,
                                           setAttackMode,
                                           flash
                                       }) {
    const def = UNITS[selectedUnit.type];
    const hpFrac = Math.max(0, Math.min(1, selectedUnit.hp / def.hp));
    return (
        <div className="gd-selpanel">
            <div className="gd-selname"><UnitIcon name={UNIT_ICON[selectedUnit.type]} color={teamColor(mySlot)}
                                                  size={18}/>{labelOf(selectedUnit.type, selectedUnit.slot)}
            </div>
            <div className="gd-seltags">
                <span className="gd-seltag">{def.kind}</span>
                {def.domain === "sea" ? <span className="gd-seltag">Naval</span> : null}
                {def.airSpeed ? <span className="gd-seltag">Aircraft</span> : null}
                {def.detect ? <span className="gd-seltag">Sensor</span> : null}
                {def.wing ? <span className="gd-seltag">Airbase</span> : null}
            </div>
            {(def.desc || def.hint) && <p className="gd-seldesc">{def.desc || def.hint}</p>}
            <div className="gd-hp">
                <div className="gd-hp-row"><span>Integrity</span><b>{Math.round(selectedUnit.hp)}/{def.hp}</b>
                </div>
                <div className="gd-hp-bar"><i className={hpFrac <= 0.35 ? "low" : ""}
                                              style={{width: `${Math.round(hpFrac * 100)}%`}}/></div>
            </div>
            <div className="gd-detail-grid gd-selstats">
                {unitStats(selectedUnit).map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}
            </div>
            {!!UNITS[selectedUnit.type].navalSpeed && (selectedUnit.dest
                ? <button className="gd-btn" onClick={() => api.stopSail(selectedUnit.id)}>All Stop</button>
                : <button className={`gd-btn ${moving === selectedUnit.id ? "primary" : ""}`} onClick={() => {
                    setMoving(moving === selectedUnit.id ? null : selectedUnit.id);
                    setPlacing(null);
                }}>{moving === selectedUnit.id ? "Pick a Destination…" : "Set Sail"}</button>)}
            {UNITS[selectedUnit.type].wing && (() => {
                return (
                    <div className="gd-wing">
                        <div className="gd-wing-head">Hangar</div>
                        <div className="gd-wing-list">
                            {[...new Set(UNITS[selectedUnit.type].wing)].map((at) => {
                                const cap = hangarCapOf(selectedUnit.type, at);
                                const stock = selectedUnit.hangar?.[at] ?? 0;
                                const airborne = w.units.filter((x) => x.baseId === selectedUnit.id && x.type === at && x.hp > 0).length;
                                const total = hangarCount(w, myNation, selectedUnit.id, at);
                                const full = total >= cap;
                                return (
                                    <div key={at} className="gd-wing-row"
                                         title={`${labelOf(at, mySlot)} · ◆ ${UNITS[at].cost} · ${UNITS[at].buildTime}s${airborne ? ` · ${airborne} Airborne` : ""}`}>
                                        <UnitIcon name={UNIT_ICON[at]} color={teamColor(mySlot)} size={14}/>
                                        <span className="gd-wing-name">{labelOf(at, mySlot)}</span>
                                        {airborne > 0 && <span className="gd-wing-air">{airborne}▲</span>}
                                        <span className="gd-wing-count">{stock}/{cap}</span>
                                        <button className="gd-wing-add" disabled={full}
                                                title={full ? "The hangar is at capacity for that type." : `Order one — ◆ ${UNITS[at].cost}, ${UNITS[at].buildTime}s on the line. Shift-click: ×5.`}
                                                onClick={(e) => {
                                                    // Shift-click orders five; capacity/points stop the run early.
                                                    let queued = 0, err = null;
                                                    for (let i = 0, n = e.shiftKey ? 5 : 1; i < n; i++) {
                                                        const r = api.queueAircraft(selectedUnit.id, at);
                                                        if (r.error) {
                                                            err = r.error;
                                                            break;
                                                        }
                                                        queued++;
                                                    }
                                                    flash(queued ? `${queued > 1 ? `${queued}× ` : ""}${labelOf(at, mySlot)} added to the production queue.` : err,
                                                        queued ? "info" : "err");
                                                }}>+
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                        {(() => {
                            const cur = myNation?.prod?.current;
                            const curHere = cur?.item?.forBase === selectedUnit.id ? cur : null;
                            const queuedHere = (myNation?.prod?.queue || []).filter((it) => it.forBase === selectedUnit.id);
                            if (!curHere && queuedHere.length === 0) return null;
                            return (
                                <div className="gd-wing-prod">
                                    {curHere && <>
                                        <div className="gd-wing-prod-row">
                                            <span>Building {labelOf(curHere.item.type, mySlot)}</span>
                                            <b>{Math.round(curHere.progress * 100)}%</b>
                                        </div>
                                        <div className="gd-ammo-bar"><i
                                            style={{width: `${Math.round(curHere.progress * 100)}%`}}/></div>
                                    </>}
                                    {queuedHere.length > 0 && <div className="gd-wing-prod-row dim">
                                        <span>In Queue</span><b>{queuedHere.map((it) => labelOf(it.type, mySlot)).join(", ")}</b>
                                    </div>}
                                </div>
                            );
                        })()}
                        <div className="gd-wing-head">Fighter Patrol</div>
                        <div className="gd-seg gd-patrol-seg">
                            {PATROL_SIZES.map((n) => (
                                <button key={n} className={(selectedUnit.patrolSize || 0) === n ? "active" : ""}
                                        title={n === 0 ? "Stand the patrol down." : `Keep a ${n}-ship on station.`}
                                        onClick={() => api.setPatrolSize(selectedUnit.id, n)}>{n === 0 ? "Off" : `${n}-Ship`}</button>
                            ))}
                        </div>
                        {hangarCapOf(selectedUnit.type, "awacs") > 0 && (
                            <button className={`gd-btn ${selectedUnit.awacsPatrol ? "primary" : ""}`}
                                    disabled={!selectedUnit.awacsPatrol && (selectedUnit.hangar?.awacs ?? 0) === 0 && w.units.filter((x) => x.baseId === selectedUnit.id && x.type === "awacs" && x.hp > 0).length === 0}
                                    title={(selectedUnit.hangar?.awacs ?? 0) === 0 ? "No AWACS available — order one above." : "A wide surveillance orbit over the base."}
                                    onClick={() => api.setAwacsPatrol(selectedUnit.id)}>{selectedUnit.awacsPatrol ? "AWACS Patrol · On" : "AWACS Patrol · Off"}</button>
                        )}
                    </div>
                );
            })()}
            {UNITS[selectedUnit.type].kind === "offense" && (
                <>
                    {/* Warhead selector is only for missile units that draw the strategic
                        arsenal (silo, launcher, etc.). Conventional units — tanks, aircraft,
                        ships — fire their own munitions and get no warhead picker. */}
                    {UNITS[selectedUnit.type].warheads && (
                        <div className="gd-wh-row">
                            {WARHEAD_ORDER.map((k) => {
                                const wh = WARHEADS[k];
                                const stock = myNation?.ammo?.[k] || 0;
                                const cur = (selectedUnit.warhead || "standard") === k;
                                return <button key={k} className={`gd-wh-chip ${cur ? "on" : ""}`}
                                               style={{["--flame"]: wh.flame}}
                                               title={`${wh.name} — ${wh.desc}${FALLOUT.warheads.includes(k) ? " · Leaves radioactive fallout" : ""}`}
                                               onClick={() => api.setWarhead(selectedUnit.id, k)}><span
                                    className="gd-wh-dot"/>{wh.short}<b>{stock}</b></button>;
                            })}
                        </div>
                    )}
                    {selectedUnit.targetId
                        ?
                        <button className="gd-btn" onClick={() => api.commandAttack(selectedUnit.id, null)}>Hold
                            fire</button>
                        : <button className={`gd-btn ${attackMode ? "primary" : ""}`}
                                  onClick={() => setAttackMode((v) => !v)}>{attackMode ? "Pick a Target…" : "Command Attack"}</button>}
                </>
            )}
        </div>
    );
}
