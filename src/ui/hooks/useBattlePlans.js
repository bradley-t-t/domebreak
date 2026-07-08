// Battle Planning — React state for the player's authored attack plans. A plan is
// player INTENT (session state, never world state): a set of attacker unit TYPES, a
// set of target CATEGORIES, an engagement range, and a few toggles. The reconciler
// (useBattlePlanReconciler) turns an armed/executed plan into real orders through the
// sanctioned engine commands. Attacker unit TYPES are EXCLUSIVE across plans — a type
// belongs to at most one plan, so a given platform is only ever driven by one plan;
// target categories may overlap. See design/gdd/battle-planning.md.
import {useCallback, useMemo, useState} from "react";
import {BATTLE_PLAN} from "../../game/data/constants.js";

// Session-monotonic plan id source (UI-only). Kept out of the state updaters so those
// stay pure under React strict-mode double-invocation.
let SEQ = 0;

function makePlan(index) {
    SEQ += 1;
    return {
        id: `plan-${SEQ}`,
        name: `Plan ${index + 1}`,
        color: BATTLE_PLAN.planColors[index % BATTLE_PLAN.planColors.length],
        attackerTypes: [],   // my offensive unit types this plan commands (exclusive across plans)
        targetTypes: [],     // target category ids (BATTLE_PLAN.targetCategories)
        engagementKm: BATTLE_PLAN.defaultEngagementKm,
        mode: "standing",    // "standing" (auto-manage while armed) | "oneshot" (Execute applies once)
        armed: false,        // standing plans only: continuously reconciled while true
        overkill: false,     // false = stop stacking a target once it's covered
        autoBuild: false,    // keep the nation stocked with the plan's warheads
        fireNonce: 0,        // one-shot trigger: bumped by executePlan, consumed by the reconciler
    };
}

export function useBattlePlans() {
    const [plans, setPlans] = useState([]);
    const [activeId, setActiveId] = useState(null);

    const active = useMemo(() => plans.find((p) => p.id === activeId) || null, [plans, activeId]);

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
            return [...prev, {...copy, name: `${src.name} copy`, targetTypes: [...src.targetTypes], engagementKm: src.engagementKm, mode: src.mode, overkill: src.overkill, autoBuild: src.autoBuild}];
        });
    }, []);

    const renamePlan = useCallback((id, name) => patchPlan(id, {name}), [patchPlan]);

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

    const clearAttackerTypes = useCallback((id) => patchPlan(id, {attackerTypes: []}), [patchPlan]);
    const clearTargetTypes = useCallback((id) => patchPlan(id, {targetTypes: []}), [patchPlan]);

    // One-shot fire: bump the nonce the reconciler watches. Standing plans use `armed`.
    const executePlan = useCallback((id) => patchPlan(id, (p) => ({fireNonce: (p.fireNonce || 0) + 1})), [patchPlan]);

    return {
        plans, active, activeId, setActiveId,
        addPlan, removePlan, duplicatePlan, renamePlan, patchPlan,
        toggleAttackerType, toggleTargetType, clearAttackerTypes, clearTargetTypes,
        executePlan,
    };
}
