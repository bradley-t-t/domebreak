// Battle Planning reconciler: turns player plans (from useBattlePlans) into real orders
// through the same sanctioned commands the UI uses (commandAttack, produceAmmo), never
// mutating world state directly. Everything is diffed, so a steady state issues zero
// commands. Standing+armed plans re-solve on a fixed cadence, and their orders clear on
// disarm or when a unit drops from the solve (never the player's own orders); one-shot
// plans apply once per executePlan() fireNonce bump.
import {useEffect, useRef} from "react";
import {solvePlan, prodCount} from "../../game/engine.js";
import {BATTLE_PLAN} from "../../game/data/constants.js";
import {useLatestRef} from "../../lib/hooks/useLatestRef.js";

const RECONCILE_MS = 300;   // min wall-clock between full reconcile passes

export function useBattlePlanReconciler({world, api, mySlot, plans, onFired}) {
    const managed = useRef(new Map());    // planId -> Set(unitId) this reconciler currently orders (standing)
    const nonces = useRef(new Map());     // planId -> last one-shot fireNonce applied
    const lastBuild = useRef(new Map());  // planId -> world.time of last auto-resupply queue
    const lastRun = useRef(0);

    // Latest inputs, read inside the throttled effect without making it depend on
    // their identity (the effect runs every commit — ~30fps from useEngine).
    const ref = useLatestRef({world, api, mySlot, plans, onFired});

    useEffect(() => {
        const now = performance.now();
        if (now - lastRun.current < RECONCILE_MS) return;
        lastRun.current = now;

        const {world: w, api, mySlot, plans, onFired} = ref.current;
        if (!w || w.over || mySlot == null) return;
        const n = w.nations.find((x) => x.slot === mySlot);
        if (!n) return;

        // Queue at most one warhead per plan per interval so a plan tops up its
        // stock gradually instead of dumping its whole deficit onto the line.
        const autoBuild = (plan, ammoWanted, force) => {
            const last = lastBuild.current.get(plan.id) ?? -Infinity;
            if (!force && w.time - last < BATTLE_PLAN.autoBuildIntervalSec) return;
            for (const [wh, wantShots] of Object.entries(ammoWanted)) {
                const have = (n.ammo?.[wh] || 0) + prodCount(n, "ammo", wh);
                if (have < wantShots) {
                    const r = api.produceAmmo(wh);
                    if (r && !r.error) lastBuild.current.set(plan.id, w.time);
                    break;
                }
            }
        };

        // --- Standing plans: union of desired orders, then diff-apply. ---
        const desired = new Map();            // unitId -> targetId
        const managedNow = new Map();         // planId -> Set(unitId)
        for (const p of plans) {
            if (p.mode !== "standing" || !p.armed) continue;
            const {assignments, ammoWanted} = solvePlan(w, p, mySlot);
            const set = new Set();
            for (const [uid, tid] of assignments) {
                desired.set(uid, tid);
                set.add(uid);
            }
            managedNow.set(p.id, set);
            if (p.autoBuild) autoBuild(p, ammoWanted, false);
        }
        for (const [uid, tid] of desired) {
            const u = w.units.find((x) => x.id === uid);
            if (u && u.targetId !== tid) api.commandAttack(uid, tid);
        }
        // Release units a standing plan no longer commands (disarmed, removed, idle,
        // or out of range) — unless another standing plan now owns them.
        for (const [planId, prevSet] of managed.current) {
            const nowSet = managedNow.get(planId) || new Set();
            for (const uid of prevSet) {
                if (nowSet.has(uid) || desired.has(uid)) continue;
                const u = w.units.find((x) => x.id === uid);
                if (u && u.targetId != null) api.commandAttack(uid, null);
            }
        }
        managed.current = managedNow;

        // --- One-shot plans: apply once per fireNonce bump. ---
        for (const p of plans) {
            if (p.mode !== "oneshot") continue;
            const last = nonces.current.get(p.id) || 0;
            if ((p.fireNonce || 0) <= last) continue;
            nonces.current.set(p.id, p.fireNonce || 0);
            const {assignments, ammoWanted} = solvePlan(w, p, mySlot);
            for (const [uid, tid] of assignments) api.commandAttack(uid, tid);
            if (p.autoBuild) autoBuild(p, ammoWanted, true);
            onFired?.(p.id, assignments.size);
        }
    });
}
