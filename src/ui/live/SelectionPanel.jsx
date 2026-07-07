// Selected-unit detail card: stats, move/set-sail control, hangar + patrol
// controls for airbases, and the warhead/attack controls for offense units.
// Pulled out of LiveGame.jsx verbatim (same JSX, same classes) as a pure
// presentational component — it reads props only and calls back through the
// same api/setState functions the parent already owns.
import UnitIcon from "../common/UnitIcon.jsx";
import {allowedAmmo, atWar, FALLOUT, hangarCapOf, hangarCount, haversine, initialWarhead, leadershipStatus, PATROL_FIGHTER, PATROL_SIZES, UNIT_ICON, UNITS, WARHEADS} from "../../game/engine.js";
import {CAPTURE, WARHEAD_ICON} from "../../game/data/constants.js";
import {button} from "../lib/variants.js";
import {cn} from "../lib/cn.js";

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
        <div className="db-selpanel absolute bottom-[84px] right-[22px] z-5 w-[276px] bg-panel-2 border border-line rounded p-[15px] shadow-[var(--shadow),inset_0_1px_0_var(--hair)] backdrop-blur-[14px] pointer-events-auto motion-safe:animate-[dbPop_220ms_var(--ease-out)]">
            <div className="font-display font-bold text-[15px] flex items-center gap-2"><UnitIcon name={UNIT_ICON[selectedUnit.type]} color={teamColor(mySlot)}
                                                  size={18}/>{labelOf(selectedUnit.type, selectedUnit.slot)}
            </div>
            <div className="flex flex-wrap gap-[5px] mt-[7px]">
                <span className="font-display text-[9px] tracking-[1.2px] uppercase text-dim bg-btn-bg-2 border border-line rounded-sm px-1.5 py-0.5">{def.kind}</span>
                {def.domain === "sea" ? <span className="font-display text-[9px] tracking-[1.2px] uppercase text-dim bg-btn-bg-2 border border-line rounded-sm px-1.5 py-0.5">Naval</span> : null}
                {def.airSpeed ? <span className="font-display text-[9px] tracking-[1.2px] uppercase text-dim bg-btn-bg-2 border border-line rounded-sm px-1.5 py-0.5">Aircraft</span> : null}
                {def.detect ? <span className="font-display text-[9px] tracking-[1.2px] uppercase text-dim bg-btn-bg-2 border border-line rounded-sm px-1.5 py-0.5">Sensor</span> : null}
                {def.wing ? <span className="font-display text-[9px] tracking-[1.2px] uppercase text-dim bg-btn-bg-2 border border-line rounded-sm px-1.5 py-0.5">Airbase</span> : null}
            </div>
            {(def.desc || def.hint) && <p className="text-[11.5px] leading-[1.5] text-dim mt-[9px] mb-0">{def.desc || def.hint}</p>}
            <div className="mt-[11px]">
                <div className="flex justify-between items-baseline mb-1"><span className="text-[10px] tracking-[0.5px] uppercase text-faint">Integrity</span><b className="text-xs font-mono">{Math.round(selectedUnit.hp)}/{def.hp}</b>
                </div>
                <div className="h-[3px] bg-line rounded-[2px] overflow-hidden" role="progressbar" aria-label="Integrity"
                     aria-valuenow={Math.round(hpFrac * 100)} aria-valuemin={0} aria-valuemax={100}>
                    <i className={cn("block h-full rounded-[2px] transition-[width] duration-200 ease-out-db", hpFrac <= 0.35 ? "bg-danger" : "bg-good")}
                       style={{width: `${Math.round(hpFrac * 100)}%`}}/></div>
            </div>
            <div className="grid grid-cols-2 [&>div]:flex [&>div]:flex-col [&_span]:text-[10px] [&_span]:tracking-[0.5px] [&_span]:uppercase [&_span]:text-faint [&_b]:font-mono mt-3 mb-3 gap-x-[14px] gap-y-[9px] [&_b]:text-[12.5px]">
                {unitStats(selectedUnit).map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}
            </div>
            {!!UNITS[selectedUnit.type].navalSpeed && (selectedUnit.dest
                ? <button className={cn(button(), "w-full")} onClick={() => api.stopSail(selectedUnit.id)}>All Stop</button>
                : <button className={cn(button({variant: moving === selectedUnit.id ? "primary" : "default"}), "w-full")} onClick={() => {
                    setMoving(moving === selectedUnit.id ? null : selectedUnit.id);
                    setPlacing(null);
                }}>{moving === selectedUnit.id ? "Pick a Destination…" : "Set Sail"}</button>)}
            {UNITS[selectedUnit.type].wing && (() => {
                // Patrol wording follows the base's craft: fixed-wing bases fly a
                // fighter CAP, the Army Base flies a helicopter patrol. Never "ship"
                // — this game has actual naval ships, so the word is reserved for them.
                const rotaryPatrol = !!UNITS[PATROL_FIGHTER[selectedUnit.type]]?.rotary;
                const craftWord = rotaryPatrol ? "Helo" : "Aircraft";
                const patrolTitle = rotaryPatrol ? "Helicopter Patrol" : "Fighter Patrol";
                const patrolTerm = rotaryPatrol ? "Patrol" : "CAP";
                const hasAwacs = hangarCapOf(selectedUnit.type, "awacs") > 0;
                return (
                    <div className="my-1 mb-[10px]">
                        <div className="font-display text-[10px] tracking-[1.5px] uppercase text-faint mb-1.5">Hangar</div>
                        <div className="flex flex-col gap-1 mb-2">
                            {[...new Set(UNITS[selectedUnit.type].wing)].map((at) => {
                                const cap = hangarCapOf(selectedUnit.type, at);
                                const stock = selectedUnit.hangar?.[at] ?? 0;
                                const airborne = w.units.filter((x) => x.baseId === selectedUnit.id && x.type === at && x.hp > 0).length;
                                const total = hangarCount(w, myNation, selectedUnit.id, at);
                                const full = total >= cap;
                                return (
                                    <div key={at} className="group flex items-center gap-2 py-1.5 px-2 bg-btn-bg border border-line rounded-sm"
                                         title={`${labelOf(at, mySlot)} · ◆ ${UNITS[at].cost} · ${UNITS[at].buildTime}s${airborne ? ` · ${airborne} Airborne` : ""}`}>
                                        <UnitIcon name={UNIT_ICON[at]} color={teamColor(mySlot)} size={14}/>
                                        <span className="flex-1 text-[11px] whitespace-nowrap overflow-hidden text-ellipsis">{labelOf(at, mySlot)}</span>
                                        {airborne > 0 && <span className="font-mono text-[10px] text-text bg-[rgba(255,255,255,0.08)] border border-line rounded-full px-1.5 leading-[15px]">{airborne}▲</span>}
                                        <span className="font-mono text-[11px] text-dim">{stock}/{cap}</span>
                                        {!full &&
                                            <span className="font-mono text-[9px] tracking-[0.5px] text-faint opacity-60 transition-[opacity,color] duration-[140ms] ease-out-db group-hover:opacity-100 group-hover:text-dim" aria-hidden="true">⇧×5</span>}
                                        <button className="w-[22px] h-[22px] grid place-items-center text-sm leading-none text-text bg-transparent border border-line rounded-sm transition-[background,color,border-color] duration-[120ms] ease-out-db enabled:hover:bg-text enabled:hover:text-panel-solid enabled:hover:border-text disabled:opacity-35 disabled:cursor-default" disabled={full}
                                                aria-label={full ? `${labelOf(at, mySlot)} hangar full` : `Order ${labelOf(at, mySlot)} — ${UNITS[at].cost} points, ${UNITS[at].buildTime}s. Shift-click orders five.`}
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
                                <div className="my-2 pt-[7px] border-t border-line-soft flex flex-col gap-[5px]">
                                    {curHere && <>
                                        <div className="flex items-center justify-between text-[10.5px] text-text">
                                            <span>Building {labelOf(curHere.item.type, mySlot)}</span>
                                            <b className="font-mono font-semibold">{Math.round(curHere.progress * 100)}%</b>
                                        </div>
                                        <div className="h-[3px] bg-line rounded-[2px] overflow-hidden"><i
                                            className="block h-full bg-[var(--flame,#ff8a1a)]"
                                            style={{width: `${Math.round(curHere.progress * 100)}%`}}/></div>
                                    </>}
                                    {queuedHere.length > 0 && <div className="flex items-center justify-between text-[10.5px] text-dim">
                                        <span>In Queue</span><b className="font-mono font-semibold">{queuedHere.map((it) => labelOf(it.type, mySlot)).join(", ")}</b>
                                    </div>}
                                </div>
                            );
                        })()}
                        <div className="font-display text-[10px] tracking-[1.5px] uppercase text-faint mb-1.5">{patrolTitle}</div>
                        <p className="mt-0 mb-1.5 font-mono text-[10px] tracking-[0.6px] text-dim">
                            {(selectedUnit.patrolSize || 0) === 0 ? "Patrol Stood Down" : `${selectedUnit.patrolSize}-${craftWord} ${patrolTerm}`}
                            {hasAwacs && <>{" · "}AWACS {selectedUnit.awacsPatrol ? "On" : "Off"}</>}
                        </p>
                        <div className="flex gap-1 mb-2">
                            {PATROL_SIZES.map((n) => (
                                <button key={n} className={cn(
                                    "flex-1 min-w-10 py-1.5 px-2 border border-line bg-btn-bg text-dim rounded font-mono text-xs",
                                    (selectedUnit.patrolSize || 0) === n && "bg-gold text-gold-contrast border-transparent"
                                )}
                                        aria-pressed={(selectedUnit.patrolSize || 0) === n}
                                        aria-label={n === 0 ? "Stand patrol down" : `Keep a ${n}-${craftWord.toLowerCase()} patrol on station`}
                                        title={n === 0 ? "Stand the patrol down." : `Keep ${n} ${craftWord.toLowerCase()}s on station.`}
                                        onClick={() => api.setPatrolSize(selectedUnit.id, n)}>{n === 0 ? "Off" : `×${n}`}</button>
                            ))}
                        </div>
                        {hangarCapOf(selectedUnit.type, "awacs") > 0 && (
                            <button className={cn(button({variant: selectedUnit.awacsPatrol ? "primary" : "default"}), "w-full")}
                                    aria-pressed={!!selectedUnit.awacsPatrol}
                                    disabled={!selectedUnit.awacsPatrol && (selectedUnit.hangar?.awacs ?? 0) === 0 && w.units.filter((x) => x.baseId === selectedUnit.id && x.type === "awacs" && x.hp > 0).length === 0}
                                    title={(selectedUnit.hangar?.awacs ?? 0) === 0 ? "No AWACS available — order one above." : "A wide surveillance orbit over the base."}
                                    onClick={() => api.setAwacsPatrol(selectedUnit.id)}>{selectedUnit.awacsPatrol ? "AWACS Patrol · On" : "AWACS Patrol · Off"}</button>
                        )}
                    </div>
                );
            })()}
            {selectedUnit.type === "bunker" && selectedUnit.slot === mySlot && (() => {
                const lead = leadershipStatus(w, mySlot);
                if (!lead) return null;
                const leadPct = (v) => Math.round((v / (lead.total || 1)) * 100);
                const sheltering = lead.mode === "shelter";
                const releasing = lead.mode === "release";
                const act = (fn) => {
                    const r = fn();
                    if (r?.error) flash(r.error, "err");
                };
                return (
                    <div className="mt-2">
                        <div className="font-display text-[10px] tracking-[1.5px] uppercase text-faint mb-1.5">National Leadership</div>
                        <div className="grid grid-cols-2 [&>div]:flex [&>div]:flex-col [&_span]:text-[10px] [&_span]:tracking-[0.5px] [&_span]:uppercase [&_span]:text-faint [&_b]:font-mono mt-3 mb-3 gap-x-[14px] gap-y-[9px] [&_b]:text-[12.5px]">
                            <div><span>Surviving</span><b>{lead.pct}%</b></div>
                            <div><span>Sheltered</span><b>{leadPct(lead.sheltered)}%</b></div>
                            <div><span>In Cities</span><b>{leadPct(lead.atCity)}%</b></div>
                            <div><span>In Transit</span><b>{leadPct(lead.inTransit)}%</b></div>
                        </div>
                        <button className={cn(button({variant: sheltering ? "primary" : "default"}), "w-full mt-1.5", sheltering && "disabled:opacity-100")}
                                disabled={!lead.exposed || sheltering || !lead.hasAirstrip}
                                title={!lead.hasAirstrip ? "Build an Airstrip to fly the evacuation." : !lead.exposed ? "No leaders are exposed in your cities." : "Airlift exposed leaders into the bunker."}
                                onClick={() => act(api.shelterLeadership)}>{sheltering ? "Sheltering…" : "Shelter Leadership"}</button>
                        <button className={cn(button({variant: releasing ? "primary" : "default"}), "w-full mt-1.5", releasing && "disabled:opacity-100")}
                                disabled={lead.sheltered <= 0 || releasing || !lead.hasAirstrip}
                                title={!lead.hasAirstrip ? "Build an Airstrip to fly them back out." : lead.sheltered <= 0 ? "No leadership is sheltered." : "Fly sheltered leaders back out to your cities."}
                                onClick={() => act(api.releaseLeadership)}>{releasing ? "Releasing…" : "Release Leadership"}</button>
                    </div>
                );
            })()}
            {UNITS[selectedUnit.type].capture && selectedUnit.slot === mySlot && (() => {
                // Ground capture: the nearest enemy city this unit is close enough
                // to seize. Holding it flips the whole state; assaulting it (setting
                // the attack order to the city) drives that flip CAPTURE.assaultMult
                // times faster — the "attack the city to capture it quicker" play.
                let city = null, best = Infinity;
                for (const c of w.cities) {
                    if (!c.alive || c.slot === selectedUnit.slot || !atWar(w, selectedUnit.slot, c.slot)) continue;
                    const d = haversine(selectedUnit.lng, selectedUnit.lat, c.lng, c.lat);
                    if (d <= CAPTURE.holdKm && d < best) {
                        best = d;
                        city = c;
                    }
                }
                if (!city) return (
                    <div className="mt-2 pt-[9px] border-t border-line-soft">
                        <div className="font-display text-[10px] tracking-[1.5px] uppercase text-faint mb-1">Ground Capture</div>
                        <p className="text-[11px] leading-[1.45] text-dim m-0">Move within {CAPTURE.holdKm} km of an enemy city to start taking its state. Clear any garrison first — a nearby defender freezes the capture.</p>
                    </div>
                );
                const holding = city.capture && city.capture.slot === selectedUnit.slot;
                const pct = Math.round((holding ? city.capture.progress : 0) * 100);
                const assaulting = selectedUnit.targetId === city.id;
                return (
                    <div className="mt-2 pt-[9px] border-t border-line-soft">
                        <div className="flex items-center justify-between mb-1">
                            <span className="font-display text-[10px] tracking-[1.5px] uppercase text-faint">Capturing {city.state || city.name}</span>
                            <b className="font-mono text-[11px]">{pct}%</b>
                        </div>
                        <div className="h-[3px] bg-line rounded-[2px] overflow-hidden mb-2" role="progressbar"
                             aria-label="Capture progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                            <i className="block h-full rounded-[2px] transition-[width] duration-200 ease-out-db"
                               style={{width: `${pct}%`, background: teamColor(mySlot)}}/>
                        </div>
                        <button className={cn(button({variant: assaulting ? "primary" : "default"}), "w-full")}
                                aria-pressed={assaulting}
                                title={assaulting ? "Ease off the assault — the capture continues at the normal hold pace." : `Storm ${city.name} — capture roughly ${CAPTURE.assaultMult}× faster while your troops press the assault.`}
                                onClick={() => api.commandAttack(selectedUnit.id, assaulting ? null : city.id)}>
                            {assaulting ? "Assaulting — Ease Off" : "Assault City"}
                        </button>
                    </div>
                );
            })()}
            {UNITS[selectedUnit.type].kind === "offense" && (
                <>
                    {/* Payload picker — only your own warhead-capable platforms (silo,
                        launcher, sub, orbital). Each cleared round shows its real
                        warhead icon, one-word role, and current stock, so the picker
                        itself reads as the platform's identity: a launcher offers the
                        fast HGV, a silo the heavy thermo — never the same generic set. */}
                    {def.warheads && selectedUnit.slot === mySlot && allowedAmmo(selectedUnit.type).length > 1 && (() => {
                        const loaded = selectedUnit.warhead || initialWarhead(selectedUnit.type);
                        const lw = WARHEADS[loaded];
                        const loadedFallout = FALLOUT.warheads.includes(loaded);
                        const sig = def.signature; // the round this platform is built to deliver
                        return (
                            <div className="my-1 mb-[10px]">
                                <div className="flex items-baseline justify-between mb-1.5">
                                    <span className="font-display text-[10px] tracking-[1.5px] uppercase text-faint">Payload</span>
                                    <span className="font-mono text-[10.5px]" style={{color: lw.flame}}>{lw.name}{sig === loaded && <span className="text-faint"> · signature</span>}</span>
                                </div>
                                <div className="flex gap-[5px]">
                                    {allowedAmmo(selectedUnit.type).map((k) => {
                                        const wh = WARHEADS[k];
                                        const stock = myNation?.ammo?.[k] || 0;
                                        const cur = loaded === k;
                                        const empty = stock === 0;
                                        const isSig = sig === k;
                                        return (
                                            <button key={k} className={cn(
                                                "relative flex-1 flex flex-col items-center gap-[3px] py-2 px-1 border border-line bg-transparent rounded-sm transition-[border-color,background] duration-[120ms] ease-out-db",
                                                cur ? "border-[var(--flame,#ff8a1a)] bg-[color-mix(in_srgb,var(--flame,#ff8a1a)_14%,transparent)]" : "enabled:hover:border-blue",
                                                empty && !cur && "opacity-45"
                                            )}
                                                    style={{["--flame"]: wh.flame}}
                                                    aria-pressed={cur}
                                                    aria-label={`${wh.name} — ${stock} in stock${isSig ? " · this platform's signature round" : ""}`}
                                                    title={`${wh.name} — ${wh.desc}${isSig ? " · This platform's signature payload." : ""}${FALLOUT.warheads.includes(k) ? " · Leaves radioactive fallout" : ""}`}
                                                    onClick={() => api.setWarhead(selectedUnit.id, k)}>
                                                {isSig && <span className="absolute top-[3px] right-[4px] text-[9px] leading-none text-[var(--flame,#ff8a1a)]" title="Signature payload">★</span>}
                                                <UnitIcon name={WARHEAD_ICON[k]} color={wh.flame} size={20}/>
                                                <span className={cn("font-mono text-[10.5px] font-bold", cur ? "text-text" : "text-dim")}>{wh.short}</span>
                                                <span className="font-display text-[8px] tracking-[0.5px] uppercase text-faint">{wh.role}</span>
                                                <span className={cn("font-mono text-[10px]", empty ? "text-danger" : "text-dim")}>{stock}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                                <p className="text-[10.5px] leading-[1.45] text-dim mt-1.5 mb-0">
                                    {lw.desc}{loadedFallout && <span className="text-danger"> · Leaves radioactive fallout.</span>}
                                </p>
                            </div>
                        );
                    })()}
                    {selectedUnit.targetId
                        ?
                        <button className={button()} onClick={() => api.commandAttack(selectedUnit.id, null)}>Hold
                            fire</button>
                        : <button className={button({variant: attackMode ? "primary" : "default"})}
                                  onClick={() => setAttackMode((v) => !v)}>{attackMode ? "Pick a Target…" : "Command Attack"}</button>}
                </>
            )}
        </div>
    );
}
