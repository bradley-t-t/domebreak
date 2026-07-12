import {useMemo} from "react";
import {armamentOf, atWar, isAttacker, planAttackerTypeOptions, solvePlan, UNIT_ICON, UNITS, unitLabel} from "../../game/engine.js";
import {BATTLE_PLAN, colorForSlot} from "../../game/data/constants.js";
import ScreenFrame from "./ScreenFrame.jsx";
import Flag from "../common/Flag.jsx";
import Icon from "../common/Icon.jsx";
import UnitIcon from "../common/UnitIcon.jsx";
import {cn} from "../lib/cn.js";
import {miniButton} from "../lib/variants.js";
import {cmpStr, countBy} from "../../lib/iter.js";
import {fmtKm} from "../lib/format.js";

// Full-screen Battle Planning console. The player authors attack plans by picking
// attacker unit TYPES → target CATEGORIES (type → type) — no clicking individual units
// on the map. Presentation only: it reads the pure solver for live status and edits
// plan intent through the useBattlePlans handlers (`bp`); the reconciler turns intent
// into real orders.
//
// The world is mutated in place; the memos below derive from w keyed on w.time (the
// tick counter) — a trigger exhaustive-deps can't model, so it's off for this file.
/* eslint-disable react-hooks/exhaustive-deps */

function Toggle({on, onClick, label, hint, accent}) {
    return (
        <button type="button" onClick={onClick} role="switch" aria-checked={on} title={hint}
                className={cn("flex items-center justify-between gap-3 w-full px-3 py-2 rounded-sm border text-[12px] font-semibold transition-[border-color,background,color] duration-150 ease-out-db",
                    on ? "border-gold-line bg-gold-soft text-gold" : "border-line bg-sunk text-dim hover:border-line-soft hover:text-text",
                    accent && on && "border-[rgba(224,87,79,0.5)] bg-[rgba(224,87,79,0.12)] text-[#ffb3bc]")}>
            <span className="tracking-[0.4px] uppercase">{label}</span>
            <span className={cn("relative w-9 h-4 rounded-full transition-colors flex-none", on ? "bg-gold" : "bg-hair")}>
                <span className={cn("absolute top-[2px] w-3 h-3 rounded-full bg-[#0b0d10] transition-[left] duration-150 ease-out-db", on ? "left-[22px]" : "left-[2px]")}/>
            </span>
        </button>
    );
}

export default function BattlePlanScreen({world: w, mySlot, bp, onClose}) {
    const {plans, active, activeId, setActiveId} = bp;

    // My live offensive platforms, tallied by type — the ×N badge per option.
    const typeCounts = useMemo(() => {
        const live = w.units.filter((u) => u.slot === mySlot && u.hp > 0 && isAttacker(UNITS[u.type]));
        return Object.fromEntries(countBy(live, (u) => u.type));
    }, [w.units, w.time, mySlot]);
    // The attacker options — everything the nation could field (owned, on the
    // production line, or buildable now), not just what it currently owns, so a
    // plan can be drawn up and armed around platforms still being built.
    const offenseTypes = useMemo(() => planAttackerTypeOptions(w, mySlot, plans), [w.units, w.time, mySlot, plans]);
    // type -> the plan that currently commands it (attacker types are exclusive).
    const ownerOfType = useMemo(() => {
        const m = new Map();
        for (const p of plans) for (const t of p.attackerTypes) m.set(t, p);
        return m;
    }, [plans]);

    // The enemy powers a plan may be scoped to: every ACTIVE (participating) nation but
    // me. Neutrals never appear — they can't be warred or struck. Each carries whether
    // I'm currently at war with it so the picker can flag live vs. pre-planned targets.
    const enemyNations = useMemo(() => w.nations
        .filter((n) => n.active !== false && n.slot !== mySlot)
        .map((n) => ({slot: n.slot, name: n.name, iso: n.iso, color: n.color || colorForSlot(n.slot), war: atWar(w, mySlot, n.slot)}))
        .sort((a, b) => (b.war - a.war) || cmpStr((n) => n.name)(a, b)),
        [w.nations, w.time, mySlot]);

    // Live solve for the active plan — drives the status readout + arm/execute gating.
    const solved = useMemo(() => (active ? solvePlan(w, active, mySlot) : null), [w, mySlot, active]);
    const armed = !!active?.armed;
    // A plan can be ARMED as soon as it's fully drawn up (attackers + targets chosen) —
    // no war required. It sits standing by and engages the moment a valid target exists.
    const canArm = !!active && active.attackerTypes.length > 0 && active.targetTypes.length > 0;
    // A ONE-SHOT strike still needs something to fire at right now.
    const canFire = !!solved && solved.firing > 0;
    // Explains what the plan is (or isn't) doing under the Arm/Execute control.
    const reason = !active || !solved ? null
        : active.attackerTypes.length === 0 ? "Pick one or more attacker unit types on the left."
        : active.targetTypes.length === 0 ? "Pick one or more target types on the right."
        : solved.attackerCount === 0 ? "You own no units of the selected types yet — arm it now and it fires once you build them."
        : solved.targetsLive === 0 ? (active.mode === "standing"
            ? "No active wars yet — arm this plan and it engages the moment you go to war."
            : "No active wars yet — a one-shot strike needs a nation you're at war with.")
        : solved.firing === 0 ? "No attackers in range — widen the engagement range or choose nearer targets."
        : null;

    return (
        <ScreenFrame title="BATTLE PLANNING" subtitle="Author plans of attack — unit types → target types" wide onClose={onClose}>
            {plans.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-16 text-center">
                    <Icon name="battle-plan" size={38} className="text-gold" strokeWidth={1.4}/>
                    <p className="text-dim text-sm max-w-[420px]">Draw up a plan of attack: pick which of your platforms fire, choose what they hit, set the reach, and arm it. No hunting for units on the map.</p>
                    <button className={cn(miniButton(), "px-4 py-2")} onClick={bp.addPlan}>New plan</button>
                </div>
            ) : (
                <div className="flex flex-col gap-4">
                    {/* Plan tabs */}
                    <div className="flex items-center gap-2 flex-wrap">
                        {plans.map((p) => (
                            <button key={p.id} onClick={() => setActiveId(p.id)}
                                    className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full border text-[12px] font-semibold whitespace-nowrap transition-[border-color,background] duration-150 ease-out-db",
                                        p.id === activeId ? "border-gold-line bg-gold-soft text-text" : "border-line bg-sunk text-dim hover:border-line-soft")}>
                                <span className="w-2.5 h-2.5 rounded-full flex-none" style={{background: p.color}}/>
                                <span className="max-w-[160px] overflow-hidden text-ellipsis">{p.name}</span>
                                {p.armed && <span className="w-1.5 h-1.5 rounded-full bg-red flex-none animate-pulse" title="Armed"/>}
                            </button>
                        ))}
                        <button className={cn(miniButton(), "px-2.5 py-1")} onClick={bp.addPlan}
                                disabled={plans.length >= BATTLE_PLAN.maxPlans} title="New plan">＋ Plan
                        </button>
                    </div>

                    {active && (
                        <>
                            {/* Name + plan actions */}
                            <div className="flex items-center gap-2">
                                <input value={active.name} onChange={(e) => bp.renamePlan(active.id, e.target.value)}
                                       className="flex-1 min-w-0 bg-sunk border border-line rounded-sm px-3 py-2 text-[14px] text-text outline-none focus:border-text"
                                       aria-label="Plan name"/>
                                <div className="flex gap-1 flex-none">
                                    {[["standing", "Standing"], ["oneshot", "One-shot"]].map(([m, lbl]) => (
                                        <button key={m} onClick={() => bp.patchPlan(active.id, {mode: m})}
                                                className={cn("px-3 py-2 rounded-sm border text-[11px] font-semibold uppercase tracking-[0.4px] transition-[border-color,background,color] duration-150 ease-out-db",
                                                    active.mode === m ? "border-gold-line bg-gold-soft text-gold" : "border-line bg-sunk text-dim hover:text-text")}>
                                            {lbl}
                                        </button>
                                    ))}
                                </div>
                                <button className={cn(miniButton(), "px-2.5 py-1.5")} onClick={() => bp.duplicatePlan(active.id)} title="Duplicate plan">⧉</button>
                                <button className={cn(miniButton({danger: true}), "px-2.5 py-1.5")} onClick={() => bp.removePlan(active.id)} title="Delete plan" aria-label="Delete plan"><Icon name="close" size={13}/></button>
                            </div>

                            {/* Two columns: attacker types → target types */}
                            <div className="grid grid-cols-2 gap-4">
                                {/* Attackers */}
                                <div className="flex flex-col gap-2 rounded-md border border-line bg-sunk/40 p-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] tracking-[1px] uppercase text-faint">Attackers · unit types</span>
                                        {active.attackerTypes.length > 0 &&
                                            <button onClick={() => bp.clearAttackerTypes(active.id)} className={cn(miniButton(), "px-2 py-0.5 text-[10px]")}>Clear</button>}
                                    </div>
                                    {offenseTypes.length === 0 && <div className="text-faint text-[12px] py-3 text-center">No offensive platforms yet — build silos, launchers, or ground forces.</div>}
                                    <div className="flex flex-col gap-1.5">
                                        {offenseTypes.map((type) => {
                                            const owner = ownerOfType.get(type);
                                            const mine = owner?.id === active.id;
                                            const elsewhere = owner && !mine;
                                            return (
                                                <button key={type} onClick={() => bp.toggleAttackerType(active.id, type)}
                                                        title={elsewhere ? `In ${owner.name} — moves here` : undefined}
                                                        className={cn("flex items-center gap-2.5 w-full px-2.5 py-2 rounded-sm border text-left transition-[border-color,background] duration-150 ease-out-db",
                                                            mine ? "border-gold-line bg-gold-soft" : "border-line bg-sunk hover:border-line-soft")}>
                                                    <span className={cn("w-4 h-4 rounded-[3px] border flex-none grid place-items-center", mine ? "bg-gold border-gold text-gold-contrast" : "border-line")}>{mine && <Icon name="check" size={11} strokeWidth={2.4}/>}</span>
                                                    <UnitIcon name={UNIT_ICON[type]} size={16} className="flex-none text-dim"/>
                                                    <span className="flex flex-col leading-[1.15] min-w-0 flex-1">
                                                        <span className="text-[13px] text-text">{unitLabel(type)}</span>
                                                        {armamentOf(type) && <span className="text-[10px] text-faint">{armamentOf(type)}</span>}
                                                    </span>
                                                    <span className="font-mono text-[12px] text-dim flex-none">×{typeCounts[type] || 0}</span>
                                                    {elsewhere && <span className="text-[9px] px-1.5 py-px rounded-full border border-line flex-none" style={{color: owner.color}}>{owner.name}</span>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Targets: which nations, then which asset types */}
                                <div className="flex flex-col gap-2.5 rounded-md border border-line bg-sunk/40 p-3">
                                    {/* Nation scope */}
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] tracking-[1px] uppercase text-faint">Target nations</span>
                                            {active.targetNations.length > 0 &&
                                                <button onClick={() => bp.clearTargetNations(active.id)} className={cn(miniButton(), "px-2 py-0.5 text-[10px]")}>Any</button>}
                                        </div>
                                        {enemyNations.length === 0
                                            ? <div className="text-faint text-[12px] py-2 text-center">No rival powers in this match.</div>
                                            : (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {enemyNations.map((n) => {
                                                        const on = active.targetNations.includes(n.slot);
                                                        return (
                                                            <button key={n.slot} onClick={() => bp.toggleTargetNation(active.id, n.slot)}
                                                                    title={n.war ? "At war — live target" : "At peace — this plan engages it if war breaks out"}
                                                                    className={cn("flex items-center gap-1.5 px-2 py-1 rounded-full border text-[12px] font-semibold transition-[border-color,background,color] duration-150 ease-out-db",
                                                                        on ? "border-gold-line bg-gold-soft text-text" : "border-line bg-sunk text-dim hover:border-line-soft hover:text-text")}>
                                                                <span className="flex-none w-[20px] h-[13px] grid place-items-center overflow-hidden border rounded-[2px] [&>*]:w-full [&>*]:h-full [&>*]:object-cover" style={{borderColor: n.color}}>
                                                                    <Flag iso={n.iso}/>
                                                                </span>
                                                                <span className="whitespace-nowrap max-w-[120px] overflow-hidden text-ellipsis">{n.name}</span>
                                                                <span className={cn("w-1.5 h-1.5 rounded-full flex-none", n.war ? "bg-red" : "bg-hair")} title={n.war ? "At war" : "At peace"}/>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        <p className="text-[10px] text-faint leading-[1.4]">{active.targetNations.length === 0
                                            ? "Any nation you're at war with. Pick specific powers to strike only them; neutrals are never targeted."
                                            : "Only the selected powers are struck — and only once you're at war with them."}</p>
                                    </div>

                                    {/* Asset-type categories */}
                                    <div className="flex flex-col gap-1.5 border-t border-hair pt-2.5">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] tracking-[1px] uppercase text-faint">Target types</span>
                                            {active.targetTypes.length > 0 &&
                                                <button onClick={() => bp.clearTargetTypes(active.id)} className={cn(miniButton(), "px-2 py-0.5 text-[10px]")}>Clear</button>}
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            {BATTLE_PLAN.targetCategories.map((cat) => {
                                                const on = active.targetTypes.includes(cat.id);
                                                return (
                                                    <button key={cat.id} onClick={() => bp.toggleTargetType(active.id, cat.id)}
                                                            className={cn("flex items-center gap-2.5 w-full px-2.5 py-2 rounded-sm border text-left transition-[border-color,background] duration-150 ease-out-db",
                                                                on ? "border-gold-line bg-gold-soft" : "border-line bg-sunk hover:border-line-soft")}>
                                                        <span className={cn("w-4 h-4 rounded-[3px] border flex-none grid place-items-center", on ? "bg-gold border-gold text-gold-contrast" : "border-line")}>{on && <Icon name="check" size={11} strokeWidth={2.4}/>}</span>
                                                        <span className="text-[13px] text-text flex-1">{cat.label}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Engagement + toggles */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="rounded-md border border-line bg-sunk/40 p-3">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-[11px] tracking-[1px] uppercase text-faint">Engagement range</span>
                                        <span className="font-mono text-[12px] text-dim">{fmtKm(active.engagementKm)}</span>
                                    </div>
                                    <input type="range" min={BATTLE_PLAN.minEngagementKm} max={BATTLE_PLAN.maxEngagementKm}
                                           step={BATTLE_PLAN.engagementStepKm} value={active.engagementKm}
                                           onChange={(e) => bp.patchPlan(active.id, {engagementKm: Number(e.target.value)})}
                                           className="w-full accent-gold cursor-pointer" aria-label="Engagement range"/>
                                    <p className="text-[10px] text-faint mt-1 leading-[1.4]">Attackers hold fire past this range, up to each platform's own reach.</p>
                                </div>
                                <div className="flex flex-col gap-2 justify-center">
                                    <Toggle on={active.overkill} onClick={() => bp.patchPlan(active.id, {overkill: !active.overkill})}
                                            label="Overkill" accent hint="Keep stacking fire on a target past what kills it"/>
                                    <Toggle on={active.autoBuild} onClick={() => bp.patchPlan(active.id, {autoBuild: !active.autoBuild})}
                                            label="Auto-build munitions" hint="Keep your warhead stock topped up for this plan"/>
                                </div>
                            </div>

                            {/* Status + action */}
                            {solved && (
                                <div className="flex flex-col gap-2 border-t border-hair pt-3">
                                    <div className="flex items-center gap-4">
                                    <div className="text-[12px] text-dim flex-1 leading-[1.5]">
                                        <span className="text-good font-semibold">{solved.firing} firing</span>
                                        {solved.idle.length > 0 && <span className="text-faint"> · {solved.idle.length} idle</span>}
                                        {solved.outOfRange.length > 0 && <span className="text-faint"> · {solved.outOfRange.length} out of range</span>}
                                        <span className="text-faint"> · {solved.targetsCovered}/{solved.targetsLive} targets covered</span>
                                    </div>
                                    {active.mode === "standing" ? (
                                        <button onClick={() => bp.patchPlan(active.id, {armed: !armed})} disabled={!canArm && !armed}
                                                className={cn("px-5 py-2.5 rounded-sm border font-display text-[13px] font-semibold tracking-[1.2px] uppercase transition-[border-color,background,color,filter] duration-150 ease-out-db disabled:opacity-50 disabled:cursor-not-allowed",
                                                    armed ? "border-[rgba(224,87,79,0.6)] bg-[rgba(224,87,79,0.16)] text-[#ffb3bc] hover:brightness-110" : "border-[rgba(0,0,0,0.25)] bg-gold text-gold-contrast enabled:hover:brightness-105")}>
                                            <span className="inline-flex items-center gap-2"><Icon name={armed ? "stop" : "play"} size={13}/>{armed ? "Disarm" : "Arm plan"}</span>
                                        </button>
                                    ) : (
                                        <button onClick={() => bp.executePlan(active.id)} disabled={!canFire}
                                                className="px-5 py-2.5 rounded-sm border border-[rgba(0,0,0,0.25)] bg-gold text-gold-contrast font-display text-[13px] font-semibold tracking-[1.2px] uppercase enabled:hover:brightness-105 transition-[filter] duration-150 disabled:opacity-50 disabled:cursor-not-allowed">
                                            <span className="inline-flex items-center gap-2"><Icon name="bolt" size={13}/>Execute strike</span>
                                        </button>
                                    )}
                                    </div>
                                    {armed
                                        ? solved.firing === 0 &&
                                            <p className="text-[11px] text-dim leading-[1.4]">Armed · standing by — engages automatically once a valid target is in play.</p>
                                        : reason && <p className="text-[11px] text-[#d79a3f] leading-[1.4]">{reason}</p>}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </ScreenFrame>
    );
}
