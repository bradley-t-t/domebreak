import {useMemo} from "react";
import {armamentOf, nationName, solvePlan, UNITS, unitLabel} from "../../game/engine.js";
import {BATTLE_PLAN} from "../../game/data/constants.js";
import {cn} from "../lib/cn.js";
import {miniButton} from "../lib/variants.js";

// Left-docked Battle Planning command panel. The player authors one or more attack
// plans here: a roster of offensive units, a set of enemy targets, an engagement
// range, and the standing/one-shot + overkill + auto-build toggles. The panel is
// presentation only — it reads the pure solver for live status and edits plan
// INTENT through the useBattlePlans handlers (`bp`); the reconciler is what turns
// intent into real orders. Collapsing minimizes the panel to a strip so the globe
// preview (drawn by MapLayers) reads clearly behind it. See design/gdd/battle-planning.md.

// Small inline on/off switch matching the HUD's mini-control vocabulary.
function Toggle({on, onClick, label, title, accent}) {
    return (
        <button type="button" onClick={onClick} title={title} role="switch" aria-checked={on}
                className={cn("flex items-center justify-between gap-2 w-full px-2.5 py-[7px] rounded-sm border text-[11.5px] font-semibold transition-[border-color,background,color] duration-150 ease-out-db",
                    on ? "border-gold-line bg-gold-soft text-gold" : "border-line bg-sunk text-dim hover:border-line-soft hover:text-text",
                    accent && on && "border-[rgba(224,87,79,0.5)] bg-[rgba(224,87,79,0.12)] text-[#ffb3bc]")}>
            <span className="tracking-[0.4px] uppercase">{label}</span>
            <span className={cn("relative w-8 h-[15px] rounded-full transition-colors flex-none", on ? "bg-gold" : "bg-hair")}>
                <span className={cn("absolute top-[2px] w-[11px] h-[11px] rounded-full bg-[#0b0d10] transition-[left] duration-150 ease-out-db", on ? "left-[19px]" : "left-[2px]")}/>
            </span>
        </button>
    );
}

const fmtKm = (km) => `${Math.round(km).toLocaleString()} km`;

export default function BattlePlanPanel({world: w, mySlot, bp, planPick, setPlanPick, collapsed, setCollapsed, onFocus}) {
    const {plans, active, activeId, setActiveId} = bp;

    // My live, commandable offensive platforms — the only things a plan can task.
    const offense = useMemo(
        () => w.units.filter((u) => u.slot === mySlot && u.hp > 0 && UNITS[u.type]?.kind === "offense"),
        [w.units, w.time, mySlot]
    );
    // unitId -> the plan that currently owns it (rosters are exclusive), for the badge.
    const ownerOf = useMemo(() => {
        const m = new Map();
        for (const p of plans) for (const id of p.attackers) m.set(id, p);
        return m;
    }, [plans]);
    // Offense grouped by type, for the roster list and the quick-add-by-type buttons.
    const byType = useMemo(() => {
        const g = new Map();
        for (const u of offense) (g.get(u.type) || g.set(u.type, []).get(u.type)).push(u);
        return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    }, [offense]);

    // Live solve for the active plan — drives the status readout and the arm/execute
    // gating. Pure; recomputed each tick as units move, targets die, or edits land.
    const solved = useMemo(() => (active ? solvePlan(w, active, mySlot) : null), [w, mySlot, active]);

    const targetLabel = (id) => {
        const c = w.cities.find((x) => x.id === id);
        if (c) return c.name || "City";
        const u = w.units.find((x) => x.id === id);
        if (u) return `${nationName(w, u.slot)} ${unitLabel(u.type)}`;
        return "—";
    };

    const armed = !!active?.armed;
    const canFire = !!solved && solved.firing > 0;

    return (
        <aside
            className="w-[268px] max-h-[calc(100vh-132px)] flex flex-col bg-panel border border-line rounded-lg shadow-[var(--shadow),inset_0_1px_0_var(--hair)] backdrop-blur-[14px] pointer-events-auto overflow-hidden motion-safe:animate-[dbDropIn_300ms_var(--ease-drawer)]"
            aria-label="Battle planning">
            {/* Header */}
            <div className="flex items-center gap-[10px] px-3 py-[10px] border-b border-hair">
                <span className="text-gold text-[15px] leading-none" aria-hidden="true">✷</span>
                <div className="flex flex-col leading-[1.15] min-w-0 flex-1">
                    <span className="font-display text-[14px] font-bold text-text">Battle Planning</span>
                    <span className="text-[9px] tracking-[1px] uppercase text-faint">{plans.length} plan{plans.length === 1 ? "" : "s"}</span>
                </div>
                <button className={cn(miniButton(), "px-2 py-1")} onClick={bp.addPlan}
                        disabled={plans.length >= BATTLE_PLAN.maxPlans} title="New plan" aria-label="New plan">＋
                </button>
                <button
                    className="w-6 h-6 border border-line rounded-sm bg-transparent text-dim text-[11px] flex-none transition-[border-color,color] duration-150 ease-out-db hover:text-text hover:border-line-soft"
                    onClick={() => setCollapsed((v) => !v)} title={collapsed ? "Expand" : "Minimize to preview"}
                    aria-label={collapsed ? "Expand battle planning" : "Minimize battle planning"}>
                    {collapsed ? "▸" : "▾"}
                </button>
            </div>

            {/* Plan tabs */}
            {plans.length > 0 && (
                <div className="db-scroll flex gap-1.5 px-2.5 py-2 overflow-x-auto border-b border-hair">
                    {plans.map((p) => (
                        <button key={p.id} onClick={() => setActiveId(p.id)}
                                className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold whitespace-nowrap transition-[border-color,background] duration-150 ease-out-db",
                                    p.id === activeId ? "border-gold-line bg-gold-soft text-text" : "border-line bg-sunk text-dim hover:border-line-soft")}>
                            <span className="w-2 h-2 rounded-full flex-none" style={{background: p.color}}/>
                            <span className="max-w-[110px] overflow-hidden text-ellipsis">{p.name}</span>
                            {p.armed && <span className="w-1.5 h-1.5 rounded-full bg-red flex-none animate-pulse" title="Armed"/>}
                        </button>
                    ))}
                </div>
            )}

            {plans.length === 0 && (
                <div className="px-4 py-6 text-center flex flex-col gap-3 items-center">
                    <p className="text-faint text-xs leading-[1.5]">Author a plan of attack — pick your launchers, choose targets, and let it fly.</p>
                    <button className={cn(miniButton(), "px-3 py-1.5")} onClick={bp.addPlan}>New plan</button>
                </div>
            )}

            {/* Active plan editor (hidden while minimized) */}
            {active && !collapsed && (
                <div className="db-scroll flex-1 overflow-y-auto">
                    {/* Name + plan actions */}
                    <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-hair">
                        <input value={active.name} onChange={(e) => bp.renamePlan(active.id, e.target.value)}
                               className="flex-1 min-w-0 bg-sunk border border-line rounded-sm px-2 py-1 text-[12.5px] text-text outline-none focus:border-text"
                               aria-label="Plan name"/>
                        <button className={cn(miniButton(), "px-2 py-1")} onClick={() => bp.duplicatePlan(active.id)}
                                title="Duplicate plan" aria-label="Duplicate plan">⧉
                        </button>
                        <button className={cn(miniButton({danger: true}), "px-2 py-1")} onClick={() => bp.removePlan(active.id)}
                                title="Delete plan" aria-label="Delete plan">✕
                        </button>
                    </div>

                    {/* Mode */}
                    <div className="flex gap-1 px-2.5 pt-2.5">
                        {[["standing", "Standing"], ["oneshot", "One-shot"]].map(([m, lbl]) => (
                            <button key={m} onClick={() => bp.patchPlan(active.id, {mode: m})}
                                    className={cn("flex-1 px-2 py-1.5 rounded-sm border text-[11px] font-semibold uppercase tracking-[0.4px] transition-[border-color,background,color] duration-150 ease-out-db",
                                        active.mode === m ? "border-gold-line bg-gold-soft text-gold" : "border-line bg-sunk text-dim hover:text-text")}>
                                {lbl}
                            </button>
                        ))}
                    </div>
                    <p className="px-2.5 pt-1 text-[10px] text-faint leading-[1.4]">
                        {active.mode === "standing" ? "Auto-manages orders while armed — reassigns as targets fall." : "Applies the current solve once when you Execute."}
                    </p>

                    {/* Attackers */}
                    <div className="px-2.5 pt-3 pb-1 flex items-center justify-between">
                        <span className="text-[10px] tracking-[1px] uppercase text-faint">Attackers · {active.attackers.length}</span>
                        <div className="flex gap-1">
                            <button onClick={() => setPlanPick(planPick === "attackers" ? null : "attackers")}
                                    className={cn(miniButton(), "px-2 py-0.5 text-[10px]", planPick === "attackers" && "border-gold-line text-gold bg-gold-soft")}
                                    title="Click your units on the map to add them">
                                {planPick === "attackers" ? "Picking…" : "Pick on map"}
                            </button>
                            {active.attackers.length > 0 &&
                                <button onClick={() => bp.clearAttackers(active.id)} className={cn(miniButton(), "px-2 py-0.5 text-[10px]")}>Clear</button>}
                        </div>
                    </div>
                    {/* Quick add-all by type */}
                    {byType.length > 0 && (
                        <div className="flex flex-wrap gap-1 px-2.5 pb-1.5">
                            {byType.map(([type, units]) => {
                                const inPlan = units.filter((u) => active.attackers.includes(u.id)).length;
                                return (
                                    <button key={type} onClick={() => bp.addAttackers(active.id, units.map((u) => u.id))}
                                            className={cn(miniButton(), "px-2 py-0.5 text-[10px]")}
                                            title={`Add all ${unitLabel(type)}`}>
                                        + {unitLabel(type)} <span className="text-faint">{inPlan}/{units.length}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    {/* Roster */}
                    <div className="px-1.5 pb-1 max-h-[168px] overflow-y-auto db-scroll">
                        {offense.length === 0 && <div className="px-2 py-2 text-center text-faint text-[11px]">No offensive units yet — build silos or launchers.</div>}
                        {offense.map((u) => {
                            const owner = ownerOf.get(u.id);
                            const mine = owner?.id === active.id;
                            const elsewhere = owner && !mine;
                            return (
                                <button key={u.id} onClick={() => bp.toggleAttacker(active.id, u.id)}
                                        className={cn("flex items-center gap-2 w-full px-2 py-[6px] rounded-sm text-left transition-[background] duration-150 ease-out-db hover:bg-hair",
                                            mine && "bg-hair")}
                                        title={elsewhere ? `Currently in ${owner.name} — moves here` : undefined}>
                                    <span className={cn("w-3.5 h-3.5 rounded-[3px] border flex-none grid place-items-center text-[9px]",
                                        mine ? "bg-gold border-gold text-gold-contrast" : "border-line text-transparent")}>✓</span>
                                    <span className="text-[13px] leading-none flex-none" aria-hidden="true">{UNITS[u.type].glyph}</span>
                                    <span className="flex flex-col leading-[1.15] min-w-0 flex-1">
                                        <span className="text-[12px] text-text truncate">{unitLabel(u.type)}</span>
                                        {armamentOf(u.type) && <span className="text-[9.5px] text-faint">{armamentOf(u.type)}</span>}
                                    </span>
                                    {elsewhere && <span className="text-[9px] px-1.5 py-px rounded-full border border-line text-faint flex-none" style={{color: owner.color}}>{owner.name}</span>}
                                </button>
                            );
                        })}
                    </div>

                    {/* Targets */}
                    <div className="px-2.5 pt-2.5 pb-1 flex items-center justify-between border-t border-hair mt-1">
                        <span className="text-[10px] tracking-[1px] uppercase text-faint">Targets · {active.targets.length}</span>
                        <div className="flex gap-1">
                            <button onClick={() => setPlanPick(planPick === "targets" ? null : "targets")}
                                    className={cn(miniButton(), "px-2 py-0.5 text-[10px]", planPick === "targets" && "border-gold-line text-gold bg-gold-soft")}
                                    title="Click enemy cities or units on the map to add them">
                                {planPick === "targets" ? "Picking…" : "Pick on map"}
                            </button>
                            {active.targets.length > 0 &&
                                <button onClick={() => bp.clearTargets(active.id)} className={cn(miniButton(), "px-2 py-0.5 text-[10px]")}>Clear</button>}
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-1 px-2.5 pb-2">
                        {active.targets.length === 0 &&
                            <span className="text-[10.5px] text-faint py-1">Turn on “Pick on map”, then click enemy targets.</span>}
                        {active.targets.map((id) => (
                            <span key={id} className="flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full border border-line bg-sunk text-[11px] text-dim">
                                <button onClick={() => onFocus?.(id)} className="max-w-[128px] truncate hover:text-text" title="Focus on map">{targetLabel(id)}</button>
                                <button onClick={() => bp.toggleTarget(active.id, id)} className="text-faint hover:text-danger px-0.5" aria-label="Remove target">✕</button>
                            </span>
                        ))}
                    </div>

                    {/* Engagement range */}
                    <div className="px-2.5 pt-1 pb-2 border-t border-hair">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] tracking-[1px] uppercase text-faint">Engagement range</span>
                            <span className="font-mono text-[11px] text-dim">{fmtKm(active.engagementKm)}</span>
                        </div>
                        <input type="range" min={BATTLE_PLAN.minEngagementKm} max={BATTLE_PLAN.maxEngagementKm}
                               step={BATTLE_PLAN.engagementStepKm} value={active.engagementKm}
                               onChange={(e) => bp.patchPlan(active.id, {engagementKm: Number(e.target.value)})}
                               className="w-full accent-gold cursor-pointer" aria-label="Engagement range"/>
                        <p className="text-[9.5px] text-faint mt-0.5 leading-[1.4]">Attackers hold fire past this range, up to each platform's own reach.</p>
                    </div>

                    {/* Toggles */}
                    <div className="flex flex-col gap-1.5 px-2.5 pb-2 border-t border-hair pt-2">
                        <Toggle on={active.overkill} onClick={() => bp.patchPlan(active.id, {overkill: !active.overkill})}
                                label="Overkill" accent title="Keep stacking fire on a target past what kills it"/>
                        <Toggle on={active.autoBuild} onClick={() => bp.patchPlan(active.id, {autoBuild: !active.autoBuild})}
                                label="Auto-build munitions" title="Keep your warhead stock topped up for this plan"/>
                    </div>

                    {/* Status + action */}
                    {solved && (
                        <div className="px-2.5 pb-3 pt-1 border-t border-hair flex flex-col gap-2">
                            <div className="text-[10.5px] text-dim leading-[1.5]">
                                <span className="text-good font-semibold">{solved.firing} firing</span>
                                {solved.idle.length > 0 && <span className="text-faint"> · {solved.idle.length} idle</span>}
                                {solved.outOfRange.length > 0 && <span className="text-faint"> · {solved.outOfRange.length} out of range</span>}
                                <span className="text-faint"> · {solved.targetsCovered}/{solved.targetsLive} targets covered</span>
                            </div>
                            {active.mode === "standing" ? (
                                <button onClick={() => bp.patchPlan(active.id, {armed: !armed})} disabled={!canFire && !armed}
                                        className={cn("w-full px-3 py-2 rounded-sm border font-display text-[12px] font-semibold tracking-[1.2px] uppercase transition-[border-color,background,color,filter] duration-150 ease-out-db disabled:opacity-50 disabled:cursor-not-allowed",
                                            armed ? "border-[rgba(224,87,79,0.6)] bg-[rgba(224,87,79,0.16)] text-[#ffb3bc] hover:brightness-110" : "border-[rgba(0,0,0,0.25)] bg-gold text-gold-contrast enabled:hover:brightness-105")}>
                                    {armed ? "◼ Disarm" : "▶ Arm plan"}
                                </button>
                            ) : (
                                <button onClick={() => bp.executePlan(active.id)} disabled={!canFire}
                                        className="w-full px-3 py-2 rounded-sm border border-[rgba(0,0,0,0.25)] bg-gold text-gold-contrast font-display text-[12px] font-semibold tracking-[1.2px] uppercase enabled:hover:brightness-105 transition-[filter] duration-150 disabled:opacity-50 disabled:cursor-not-allowed">
                                    ⚡ Execute strike
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Minimized: keep a compact arm/execute for the active plan while previewing. */}
            {active && collapsed && solved && (
                <div className="px-2.5 py-2 flex items-center gap-2">
                    <span className="text-[10.5px] text-dim flex-1 truncate"><span className="text-good font-semibold">{solved.firing}</span> firing · {solved.targetsCovered}/{solved.targetsLive}</span>
                    {active.mode === "standing"
                        ? <button onClick={() => bp.patchPlan(active.id, {armed: !armed})} disabled={!canFire && !armed}
                                  className={cn(miniButton(), "px-2.5 py-1", armed && "border-[rgba(224,87,79,0.6)] text-[#ffb3bc]")}>{armed ? "Disarm" : "Arm"}</button>
                        : <button onClick={() => bp.executePlan(active.id)} disabled={!canFire} className={cn(miniButton(), "px-2.5 py-1")}>Execute</button>}
                </div>
            )}
        </aside>
    );
}
