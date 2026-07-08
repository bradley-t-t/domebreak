// Battle Planning — React state for the player's authored attack plans. Plans are
// player INTENT, not world state: a plan is a named roster of my offensive units, a
// set of enemy targets, an engagement-range dial, and a few toggles. This hook owns
// only that intent (session-scoped, presentation layer); it never touches game
// state. The reconciler (useBattlePlanReconciler) is what turns an armed/executed
// plan into real orders through the sanctioned engine commands. Attacker rosters are
// EXCLUSIVE — a unit belongs to at most one plan, so every unit draws exactly one
// preview line; target sets may overlap between plans. See design/gdd/battle-planning.md.
import {useCallback, useMemo, useState} from "react";
import {BATTLE_PLAN} from "../../game/data/constants.js";

// Session-monotonic plan id source (UI-only — plans don't persist across matches
// since they reference match-specific unit ids). Kept out of the state updaters so
// those stay pure under React strict-mode double-invocation.
let SEQ = 0;

function makePlan(index) {
    SEQ += 1;
    return {
        id: `plan-${SEQ}`,
        name: `Plan ${index + 1}`,
        color: BATTLE_PLAN.planColors[index % BATTLE_PLAN.planColors.length],
        attackers: [],
        targets: [],
        engagementKm: BATTLE_PLAN.defaultEngagementKm,
        mode: "standing",       // "standing" (auto-manage while armed) | "oneshot" (Execute applies once)
        armed: false,           // standing plans only: continuously reconciled while true
        overkill: false,        // false = stop stacking a target once it's covered
        autoBuild: false,       // keep the nation stocked with the plan's warheads
        fireNonce: 0,           // one-shot trigger: bumped by executePlan, consumed by the reconciler
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
            // A copy inherits the toggles/targets/engagement but NOT the attacker
            // roster — attackers are exclusive, so the clone starts empty and the
            // player re-picks (or steals) units into it.
            return [...prev, {...copy, name: `${src.name} copy`, targets: [...src.targets], engagementKm: src.engagementKm, mode: src.mode, overkill: src.overkill, autoBuild: src.autoBuild, armed: false}];
        });
    }, []);

    const renamePlan = useCallback((id, name) => patchPlan(id, {name}), [patchPlan]);

    // Add unit to plan `id`, removing it from any OTHER plan first (exclusive rosters).
    const addAttacker = useCallback((id, unitId) => {
        setPlans((prev) => prev.map((p) => {
            if (p.id === id) return p.attackers.includes(unitId) ? p : {...p, attackers: [...p.attackers, unitId]};
            return p.attackers.includes(unitId) ? {...p, attackers: p.attackers.filter((x) => x !== unitId)} : p;
        }));
    }, []);

    const addAttackers = useCallback((id, unitIds) => {
        const add = new Set(unitIds);
        setPlans((prev) => prev.map((p) => {
            if (p.id === id) {
                const merged = [...p.attackers];
                for (const u of unitIds) if (!merged.includes(u)) merged.push(u);
                return {...p, attackers: merged};
            }
            return p.attackers.some((x) => add.has(x)) ? {...p, attackers: p.attackers.filter((x) => !add.has(x))} : p;
        }));
    }, []);

    const removeAttacker = useCallback((id, unitId) => {
        setPlans((prev) => prev.map((p) => (p.id === id ? {...p, attackers: p.attackers.filter((x) => x !== unitId)} : p)));
    }, []);

    const toggleAttacker = useCallback((id, unitId) => {
        setPlans((prev) => {
            const has = prev.find((p) => p.id === id)?.attackers.includes(unitId);
            return prev.map((p) => {
                if (p.id === id) return has ? {...p, attackers: p.attackers.filter((x) => x !== unitId)} : {...p, attackers: [...p.attackers, unitId]};
                return (!has && p.attackers.includes(unitId)) ? {...p, attackers: p.attackers.filter((x) => x !== unitId)} : p;
            });
        });
    }, []);

    const toggleTarget = useCallback((id, targetId) => {
        setPlans((prev) => prev.map((p) => {
            if (p.id !== id) return p;
            return {...p, targets: p.targets.includes(targetId) ? p.targets.filter((x) => x !== targetId) : [...p.targets, targetId]};
        }));
    }, []);

    const clearAttackers = useCallback((id) => patchPlan(id, {attackers: []}), [patchPlan]);
    const clearTargets = useCallback((id) => patchPlan(id, {targets: []}), [patchPlan]);

    // One-shot fire: bump the nonce the reconciler watches. Standing plans use `armed`.
    const executePlan = useCallback((id) => patchPlan(id, (p) => ({fireNonce: (p.fireNonce || 0) + 1})), [patchPlan]);

    return {
        plans, active, activeId, setActiveId,
        addPlan, removePlan, duplicatePlan, renamePlan, patchPlan,
        addAttacker, addAttackers, removeAttacker, toggleAttacker,
        toggleTarget, clearAttackers, clearTargets,
        executePlan,
    };
}
