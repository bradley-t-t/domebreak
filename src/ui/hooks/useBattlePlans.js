// Battle Planning: React state for the player's authored attack plans. A plan is player
// INTENT — attacker unit types, target categories, an engagement range, and a few toggles.
// Plans can be drafted and armed in peacetime; an armed standing plan engages automatically
// once war begins. Plans persist across save/load, seeded from the world on mount and
// mirrored back on every change via readBattlePlans/writeBattlePlans. Attacker unit TYPES
// are EXCLUSIVE across plans (a type serves at most one plan); target categories may
// overlap. The reconciler (useBattlePlanReconciler) turns plans into real orders.
import {useCallback, useEffect, useMemo, useState} from "react";
import {BATTLE_PLAN} from "../../game/data/constants.js";
import {readBattlePlans, writeBattlePlans} from "../../game/engine.js";
import {byId} from "../../lib/iter.js";

// Monotonic plan id source (UI-only), kept out of the state updaters so those stay pure
// under React strict-mode double-invocation. Seeded past any restored plan id (seedSeq)
// so a fresh session never mints an id that collides with a saved one.
let SEQ = 0;

// Bump SEQ past the highest numeric suffix among restored plan ids (e.g. "plan-7" → 7),
// so newly-added plans keep unique ids after a load.
function seedSeq(plans) {
    for (const p of plans) {
        const m = /^plan-(\d+)$/.exec(p.id || "");
        if (m) SEQ = Math.max(SEQ, Number(m[1]));
    }
}

function makePlan(index) {
    SEQ += 1;
    return {
        id: `plan-${SEQ}`,
        name: `Plan ${index + 1}`,
        color: BATTLE_PLAN.planColors[index % BATTLE_PLAN.planColors.length],
        attackerTypes: [],   // my offensive unit types this plan commands (exclusive across plans)
        targetTypes: [],     // target category ids (BATTLE_PLAN.targetCategories)
        targetNations: [],   // enemy nation slots this plan strikes; [] = every nation I'm at war with
        engagementKm: BATTLE_PLAN.defaultEngagementKm,
        mode: "standing",    // "standing" (auto-manage while armed) | "oneshot" (Execute applies once)
        armed: false,        // standing plans only: continuously reconciled while true
        overkill: false,     // false = stop stacking a target once it's covered
        autoBuild: false,    // keep the nation stocked with the plan's warheads
        fireNonce: 0,        // one-shot trigger: bumped by executePlan, consumed by the reconciler
    };
}

export function useBattlePlans(world) {
    // Seed from the world once per session (a new match or a loaded save mounts a fresh
    // LiveGame, so lazy init reads that world's persisted plans exactly once).
    const [plans, setPlans] = useState(() => {
        const restored = readBattlePlans(world);
        seedSeq(restored.plans);
        return restored.plans;
    });
    const [activeId, setActiveId] = useState(() => readBattlePlans(world).activeId);

    // Mirror authored plans back onto the world so the next autosave / quit-save
    // captures them. Cheap data assignment through the engine accessor; the tick never
    // reads this slot, so it cannot affect determinism.
    useEffect(() => {
        writeBattlePlans(world, plans, activeId);
    }, [world, plans, activeId]);

    const active = useMemo(() => byId(plans, activeId) || null, [plans, activeId]);

    const patchPlan = useCallback((id, patch) => {
        setPlans((prev) => prev.map((p) => (p.id === id ? {...p, ...(typeof patch === "function" ? patch(p) : patch)} : p)));
    }, []);

    const addPlan = useCallback(() => {
        if (plans.length >= BATTLE_PLAN.maxPlans) return null;
        const p = makePlan(plans.length);
        setPlans((prev) => [...prev, p]);
        setActiveId(p.id);
        return p;
    }, [plans.length]);

    const removePlan = useCallback((id) => {
        setPlans((prev) => prev.filter((p) => p.id !== id));
        setActiveId((cur) => (cur === id ? null : cur));
    }, []);

    const duplicatePlan = useCallback((id) => {
        setPlans((prev) => {
            const src = prev.find((p) => p.id === id);
            if (!src || prev.length >= BATTLE_PLAN.maxPlans) return prev;
            const copy = makePlan(prev.length);
            // A clone inherits the targets + toggles but NOT the attacker types — those
            // are exclusive, so the copy starts empty and the player re-picks into it.
            return [...prev, {...copy, name: `${src.name} copy`, targetTypes: [...src.targetTypes], targetNations: [...src.targetNations], engagementKm: src.engagementKm, mode: src.mode, overkill: src.overkill, autoBuild: src.autoBuild}];
        });
    }, []);

    const renamePlan = useCallback((id, name) => patchPlan(id, {name}), [patchPlan]);

    // Switch a plan's fire mode. Leaving "standing" disarms it: `armed` is a
    // standing-only state, and one-shot mode has no Disarm control — so a plan
    // carried into one-shot while armed would show a stuck "armed" indicator with
    // no way to clear it (and would re-engage if switched back to standing).
    const setPlanMode = useCallback((id, mode) => patchPlan(id, mode === "standing" ? {mode} : {mode, armed: false}), [patchPlan]);

    // Toggle an attacker unit TYPE into/out of plan `id`. Exclusive: adding a type to
    // one plan removes it from every other, so a platform type serves a single plan.
    const toggleAttackerType = useCallback((id, type) => {
        setPlans((prev) => {
            const has = prev.find((p) => p.id === id)?.attackerTypes.includes(type);
            return prev.map((p) => {
                if (p.id === id) return has ? {...p, attackerTypes: p.attackerTypes.filter((x) => x !== type)} : {...p, attackerTypes: [...p.attackerTypes, type]};
                return (!has && p.attackerTypes.includes(type)) ? {...p, attackerTypes: p.attackerTypes.filter((x) => x !== type)} : p;
            });
        });
    }, []);

    // Toggle a target CATEGORY into/out of plan `id` (categories may overlap between plans).
    const toggleTargetType = useCallback((id, cat) => {
        setPlans((prev) => prev.map((p) => {
            if (p.id !== id) return p;
            return {...p, targetTypes: p.targetTypes.includes(cat) ? p.targetTypes.filter((x) => x !== cat) : [...p.targetTypes, cat]};
        }));
    }, []);

    // Toggle an enemy nation (by slot) into/out of plan `id`'s target scope. Nation
    // scopes may overlap between plans, just like target categories. An empty scope means
    // the plan hits every nation you're at war with; adding slots narrows it to those.
    const toggleTargetNation = useCallback((id, slot) => {
        setPlans((prev) => prev.map((p) => {
            if (p.id !== id) return p;
            const has = p.targetNations.includes(slot);
            return {...p, targetNations: has ? p.targetNations.filter((x) => x !== slot) : [...p.targetNations, slot]};
        }));
    }, []);

    const clearAttackerTypes = useCallback((id) => patchPlan(id, {attackerTypes: []}), [patchPlan]);
    const clearTargetTypes = useCallback((id) => patchPlan(id, {targetTypes: []}), [patchPlan]);
    const clearTargetNations = useCallback((id) => patchPlan(id, {targetNations: []}), [patchPlan]);

    // One-shot fire: bump the nonce the reconciler watches. Standing plans use `armed`.
    const executePlan = useCallback((id) => patchPlan(id, (p) => ({fireNonce: (p.fireNonce || 0) + 1})), [patchPlan]);

    return {
        plans, active, activeId, setActiveId,
        addPlan, removePlan, duplicatePlan, renamePlan, patchPlan, setPlanMode,
        toggleAttackerType, toggleTargetType, toggleTargetNation,
        clearAttackerTypes, clearTargetTypes, clearTargetNations,
        executePlan,
    };
}
