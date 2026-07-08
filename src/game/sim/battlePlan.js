// Battle Planning — the pure attack-plan solver. A "plan" is player-authored
// intent: a roster of my offensive units, a set of enemy targets, an engagement
// range, and a couple of toggles. This module turns that intent into concrete
// per-unit fire assignments (which the reconciler pushes onto units via the
// existing commandAttack standing order) plus the munitions the plan wants
// auto-built. Pure and deterministic — it reads world state and the plan and
// mutates nothing, so the tick stays reproducible and the solver is unit-testable.
// All tuning is data-driven (BATTLE_PLAN / UNITS / WARHEADS). See
// design/gdd/battle-planning.md and docs/architecture/adr-007-battle-plan-reconciler.md.
import {haversine} from "../geo/geo.js";
import {BATTLE_PLAN, UNITS, WARHEADS} from "../data/constants.js";
import {initialWarhead} from "../data/warheads.js";
import {nationOf} from "./worldState.js";
import {atWar} from "./queries.js";
import {findTarget} from "./combat.js";

// The warhead an offense unit will actually fire — its loaded payload, or the
// platform's default if it has never been set.
export function loadedWarhead(u) {
    return u.warhead || initialWarhead(u.type);
}

// Effective one-shot damage of an offense unit for its nation: base platform
// damage × national damage research × the loaded warhead's yield multiplier.
export function shotDamage(w, u) {
    const n = nationOf(w, u.slot);
    const def = UNITS[u.type];
    const wh = WARHEADS[loadedWarhead(u)] || WARHEADS.standard;
    return (def.damage || 0) * (n?.dmgMult ?? 1) * (wh.dmgMult ?? 1);
}

// How far a unit can strike under this plan: its hardware range (× national range
// research) capped by the plan's engagement-range dial. The dial can only ever
// SHORTEN the reach — never extend it past what the platform can physically do.
export function reachKm(w, u, engagementKm) {
    const n = nationOf(w, u.slot);
    const hw = (UNITS[u.type].range || 0) * (n?.rangeMult ?? 1);
    const dial = Number.isFinite(engagementKm) ? engagementKm : BATTLE_PLAN.maxEngagementKm;
    return Math.min(hw, dial);
}

// Remaining hit points of a resolved target. A live-but-undamaged city carries no
// `hp` field yet (it's stamped on first damage), so fall back to its maxHp.
function remainingHp(t) {
    if (t.kind === "city") return t.ref.hp ?? t.ref.maxHp ?? 0;
    return t.ref.hp ?? 0;
}

// Ground-war engagement rule, mirrored from commandAttack: units that fight the
// ground war (targets:"land") may never be tasked against naval or air targets.
function canEngage(u, tgt) {
    if (UNITS[u.type].targets !== "land") return true;
    if (tgt.kind !== "unit") return true;           // cities / land assets are fine
    const td = UNITS[tgt.type];
    return !(td?.domain === "sea" || td?.airSpeed);
}

// Resolve a plan's attacker ids to live, owned, offensive units — the only
// platforms the engine can be given a standing strike order. Sorted by id so the
// solve is deterministic regardless of roster insertion order.
export function planAttackers(w, plan, mySlot) {
    return (plan.attackers || [])
        .map((id) => w.units.find((u) => u.id === id && u.slot === mySlot && u.hp > 0 && UNITS[u.type]?.kind === "offense"))
        .filter(Boolean)
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// Resolve a plan's target ids to live enemy entities we're at war with, each
// annotated with remaining hp, its owning nation, and a running "allocated
// damage" tally the solver fills in.
export function planTargets(w, plan, mySlot) {
    const out = [];
    for (const id of plan.targets || []) {
        const t = findTarget(w, id);
        if (!t || !t.alive || !atWar(w, mySlot, t.slot)) continue;
        out.push({id: t.ref.id, kind: t.kind, type: t.ref.type, slot: t.slot, lng: t.lng, lat: t.lat, hp: remainingHp(t), alloc: 0});
    }
    return out;
}

// The core solver. Assigns each attacker to at most one target under two rules:
//   • No-overkill — attackers stack on a target only until their combined shot
//     damage covers its remaining hp; past that the target is "saturated" and no
//     further attackers commit to it (unless plan.overkill is on).
//   • Fair spread — when several enemy NATIONS are targeted, each attacker prefers
//     the enemy nation that has drawn the least firepower so far, so no single
//     enemy is dogpiled while another is ignored. Ties break to the nearest
//     target, then to the one with the most hp still standing.
// Attackers with no reachable target are reported out-of-range; attackers whose
// every in-reach target is already saturated are reported idle. Returns the
// assignments plus `ammoWanted` (one desired round per assigned warhead-capable
// attacker, keyed by loaded payload) for the auto-resupply loop.
export function solvePlan(w, plan, mySlot) {
    const attackers = planAttackers(w, plan, mySlot);
    const targets = planTargets(w, plan, mySlot);
    const assignments = new Map();          // unitId -> targetId
    const idle = [], outOfRange = [];
    const allocByNation = new Map();        // enemy slot -> total damage committed

    for (const u of attackers) {
        const reach = reachKm(w, u, plan.engagementKm);
        const dmg = shotDamage(w, u);
        const inReach = targets.filter((t) => canEngage(u, t) && haversine(u.lng, u.lat, t.lng, t.lat) <= reach);
        if (!inReach.length) {
            outOfRange.push(u.id);
            continue;
        }
        const pool = plan.overkill ? inReach : inReach.filter((t) => t.alloc < t.hp);
        if (!pool.length) {
            idle.push(u.id);
            continue;
        }
        pool.sort((a, b) => {
            const na = allocByNation.get(a.slot) || 0, nb = allocByNation.get(b.slot) || 0;
            if (na !== nb) return na - nb;                              // least-hit enemy nation first
            const da = haversine(u.lng, u.lat, a.lng, a.lat), db = haversine(u.lng, u.lat, b.lng, b.lat);
            if (Math.abs(da - db) > 1e-6) return da - db;              // then nearest
            return (b.hp - b.alloc) - (a.hp - a.alloc);               // then most-still-standing
        });
        const t = pool[0];
        assignments.set(u.id, t.id);
        t.alloc += dmg;
        allocByNation.set(t.slot, (allocByNation.get(t.slot) || 0) + dmg);
    }

    const ammoWanted = {};                  // warhead type -> shots the plan wants ready
    for (const u of attackers) {
        if (!assignments.has(u.id) || !UNITS[u.type].warheads) continue;
        const wh = loadedWarhead(u);
        ammoWanted[wh] = (ammoWanted[wh] || 0) + 1;
    }

    return {
        assignments,
        ammoWanted,
        idle,
        outOfRange,
        attackerCount: attackers.length,
        firing: assignments.size,
        targetsLive: targets.length,
        targetsTotal: (plan.targets || []).length,
        targetsCovered: targets.filter((t) => t.alloc > 0).length,
    };
}

// Preview geometry for the globe overlay, derived from the SAME solve the
// reconciler fires — so what the player sees is exactly what will shoot. Returns
// attacker→target great-circle arcs, the live target points, and each attacker's
// point + reach so the layer can dot and ring them.
export function planPreview(w, plan, mySlot) {
    const attackers = planAttackers(w, plan, mySlot);
    const targets = planTargets(w, plan, mySlot);
    const {assignments} = solvePlan(w, plan, mySlot);
    const byId = new Map(attackers.map((u) => [u.id, u]));
    const tById = new Map(targets.map((t) => [t.id, t]));
    const arcs = [];
    for (const [uid, tid] of assignments) {
        const u = byId.get(uid), t = tById.get(tid);
        if (u && t) arcs.push({from: [u.lng, u.lat], to: [t.lng, t.lat]});
    }
    return {
        arcs,
        attackers: attackers.map((u) => ({
            id: u.id, lng: u.lng, lat: u.lat,
            reachKm: reachKm(w, u, plan.engagementKm),
            assigned: assignments.has(u.id),
        })),
        targets: targets.map((t) => ({id: t.id, lng: t.lng, lat: t.lat})),
    };
}
