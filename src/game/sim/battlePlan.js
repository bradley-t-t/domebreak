// Battle Planning — the pure attack-plan solver. A "plan" is player-authored
// intent: a roster of my offensive units, a set of enemy targets, an engagement
// range, and a couple of toggles. This module turns that intent into concrete
// per-unit fire assignments (which the reconciler pushes onto units via the
// commandAttack standing order) plus the munitions the plan wants auto-built.
// Pure and deterministic — it reads world state and the plan and mutates nothing,
// so the tick stays reproducible and the solver is unit-testable. All tuning is
// data-driven (BATTLE_PLAN / UNITS / WARHEADS).
import {haversine} from "../geo/geo.js";
import {BATTLE_PLAN, UNITS, WARHEADS} from "../data/constants.js";
import {initialWarhead} from "../data/warheads.js";
import {atWar} from "./queries.js";
import {cmpStr} from "../../lib/iter.js";

// The warhead an offense unit will actually fire — its loaded payload, or the
// platform's default if it has never been set.
export function loadedWarhead(u) {
    return u.warhead || initialWarhead(u.type);
}

// Effective one-shot damage of an offense unit: base platform damage × the
// loaded warhead's yield multiplier.
export function shotDamage(_w, u) {
    const def = UNITS[u.type];
    const wh = WARHEADS[loadedWarhead(u)] || WARHEADS.standard;
    return (def.damage || 0) * (wh.dmgMult ?? 1);
}

// How far a unit can strike under this plan: its hardware range capped by the
// plan's engagement-range dial. The dial can only ever SHORTEN the reach — never
// extend it past what the platform can physically do.
export function reachKm(_w, u, engagementKm) {
    const hw = UNITS[u.type].range || 0;
    const dial = Number.isFinite(engagementKm) ? engagementKm : BATTLE_PLAN.maxEngagementKm;
    return Math.min(hw, dial);
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
// solve is deterministic regardless of unit order. A plan selects attacker unit TYPES
// (not individual units), so this is every live, owned offensive unit whose type the
// plan includes.
export function planAttackers(w, plan, mySlot) {
    const types = new Set(plan.attackerTypes || []);
    return w.units
        .filter((u) => u.slot === mySlot && u.hp > 0 && UNITS[u.type]?.kind === "offense" && types.has(u.type))
        .sort(cmpStr((u) => u.id));
}

// Which target CATEGORY an at-war entity falls into (BATTLE_PLAN.targetCategories): a
// city is always "city"; a unit maps by its type. Returns null for a unit type in no
// category (e.g. aircraft), which a plan can't target.
export function targetCategoryOf(kind, type) {
    if (kind === "city") return "city";
    for (const cat of BATTLE_PLAN.targetCategories) if (cat.types && cat.types.includes(type)) return cat.id;
    return null;
}

// Resolve a plan's target CATEGORIES to live at-war enemy entities — every enemy city
// (when "city" is selected) and every enemy unit whose type falls in a selected
// category — each annotated with remaining hp and an "allocated damage" tally the
// solver fills in. A live-but-undamaged city has no `hp` yet, so it falls back to maxHp.
// A plan may also scope WHICH enemy nations it hits via `plan.targetNations` (a set of
// nation slots): when non-empty, only entities of those nations are eligible; empty (the
// default) means every nation you're at war with. This never bypasses the at-war gate —
// it only narrows an already-at-war target set, so picking a nation you're still at peace
// with simply yields nothing until war is declared.
export function planTargets(w, plan, mySlot) {
    const cats = new Set(plan.targetTypes || []);
    const nations = plan.targetNations?.length ? new Set(plan.targetNations) : null;
    const nationOk = (slot) => (!nations || nations.has(slot)) && atWar(w, mySlot, slot);
    const out = [];
    if (cats.has("city")) {
        for (const c of w.cities) {
            if (!c.alive || !nationOk(c.slot)) continue;
            out.push({id: c.id, kind: "city", type: undefined, slot: c.slot, lng: c.lng, lat: c.lat, hp: c.hp ?? c.maxHp ?? 0, alloc: 0});
        }
    }
    for (const u of w.units) {
        if (u.hp <= 0 || !nationOk(u.slot)) continue;
        const cat = targetCategoryOf("unit", u.type);
        if (cat && cats.has(cat)) out.push({id: u.id, kind: "unit", type: u.type, slot: u.slot, lng: u.lng, lat: u.lat, hp: u.hp, alloc: 0});
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

// --- Persistence bridge (Battle Planning) -----------------------------------
// Attack plans are authored in the UI (useBattlePlans) but stored on the world so
// they serialize with the save and survive load. These two accessors are the ONLY
// sanctioned way the UI reads/writes that slot — keeping the mutation "through the
// engine" and the world shape owned here.

// The persisted state a plan carries across a save. `fireNonce` is a transient
// one-shot trigger and is deliberately NOT restored (a loaded one-shot must not
// auto-fire); everything else — including `armed` — round-trips so a plan armed
// in peacetime stays armed and engages the moment war begins.
export function readBattlePlans(w) {
    const bp = w?.battlePlans;
    const plans = Array.isArray(bp?.plans) ? bp.plans.map((p) => ({...p, fireNonce: 0})) : [];
    const activeId = bp?.activeId ?? null;
    return {plans, activeId};
}

// Mirror the UI's authored plans back onto the world so the next save captures them.
// Pure data assignment; the tick never reads this field.
export function writeBattlePlans(w, plans, activeId) {
    if (!w) return;
    w.battlePlans = {plans: Array.isArray(plans) ? plans : [], activeId: activeId ?? null};
}
