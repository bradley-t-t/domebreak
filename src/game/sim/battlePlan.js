// Battle Planning — the pure attack-plan solver. A "plan" is player-authored
// intent: a roster of my offensive units, a set of enemy targets, an engagement
// range, and a couple of toggles. This module turns that intent into concrete
// per-unit fire assignments (which the reconciler pushes onto units via the
// commandAttack standing order) plus the munitions the plan wants auto-built.
// Pure and deterministic — it reads world state and the plan and mutates nothing,
// so the tick stays reproducible and the solver is unit-testable. All tuning is
// data-driven (BATTLE_PLAN / UNITS / WARHEADS).
import {haversine} from "../geo/geo.js";
import {BATTLE_PLAN, STRIKE, UNITS, WARHEADS, isAttacker} from "../data/constants.js";
import {initialWarhead} from "../data/warheads.js";
import {atWar} from "./queries.js";
import {unitLockReason} from "./production.js";
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
    // A sortie platform (airstrip) has no weapon of its own — its "shot" is the
    // bomber package it launches, so rate it by the package's combined payload.
    if (def.sortieKm) return (UNITS.bomber.damage || 0) * STRIKE.bombersPerSortie;
    const wh = WARHEADS[loadedWarhead(u)] || WARHEADS.standard;
    return (def.damage || 0) * (wh.dmgMult ?? 1);
}

// How far a unit can strike under this plan: its hardware range capped by the
// plan's engagement-range dial. The dial can only ever SHORTEN the reach — never
// extend it past what the platform can physically do.
export function reachKm(_w, u, engagementKm) {
    // A sortie platform reaches as far as its bombers fly (sortieKm), not its
    // runway footprint (range); every other platform uses its hardware range.
    const hw = UNITS[u.type].sortieKm || UNITS[u.type].range || 0;
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
// plan includes. Individual aircraft are excluded: they're commanded through their
// airbase (the airstrip sorties its bombers), never as standalone battle-plan units,
// so only the airstrip surfaces here. `plan.excludeIds` (optional, a Set) drops
// specific units from the roster — the AI's staged multi-plan solve uses it to keep
// an attacker already claimed by a higher-priority plan from phantom-saturating this
// one's targets. Player-authored plans never set it.
export function planAttackers(w, plan, mySlot) {
    const types = new Set(plan.attackerTypes || []);
    return w.units
        .filter((u) => u.slot === mySlot && u.hp > 0 && isAttacker(UNITS[u.type]) && !UNITS[u.type].airSpeed && types.has(u.type)
            && !(plan.excludeIds?.has(u.id)))
        .sort(cmpStr((u) => u.id));
}

// The attacker unit TYPES the Battle Planning screen offers. A plan is intent, not a
// muster roll, so ownership is not required: the picker lists every offensive type the
// nation could field — live platforms, platforms on the production line, and types whose
// build prerequisites are currently met — plus any type an existing plan already selected
// (so a plan never hides a selection the player can no longer toggle off). Aircraft are
// excluded entirely: they fight from airbase hangars and are commanded through their
// base, so the offensive air platform a plan controls is the airstrip (its bomber
// sortie), never an individual jet.
export function planAttackerTypeOptions(w, mySlot, plans = []) {
    const types = new Set();
    for (const u of w.units) {
        if (u.slot === mySlot && u.hp > 0 && isAttacker(UNITS[u.type]) && !UNITS[u.type].airSpeed) types.add(u.type);
    }
    const n = w.nations.find((x) => x.slot === mySlot);
    const line = [...(n?.prod?.current ? [n.prod.current.item] : []), ...(n?.prod?.queue || [])];
    for (const it of line) {
        if (it.kind === "unit" && !it.forBase && isAttacker(UNITS[it.type]) && !UNITS[it.type].airSpeed) types.add(it.type);
    }
    for (const [type, def] of Object.entries(UNITS)) {
        if (isAttacker(def) && !def.airSpeed && !unitLockReason(w, mySlot, type)) types.add(type);
    }
    for (const p of plans) for (const t of p.attackerTypes || []) if (isAttacker(UNITS[t]) && !UNITS[t].airSpeed) types.add(t);
    return [...types].sort();
}

// Which target CATEGORY an at-war entity falls into (BATTLE_PLAN.targetCategories): a
// city is always "city"; a unit maps by its type. Returns null for a unit type in no
// category (e.g. aircraft), which a plan can't target.
export function targetCategoryOf(kind, type) {
    if (kind === "city") return "city";
    for (const cat of BATTLE_PLAN.targetCategories) if (cat.types && cat.types.includes(type)) return cat.id;
    return null;
}

// Live at-war target inventory by category — how many strikeable enemy entities of each
// category exist RIGHT NOW under the given nation scope, independent of what the plan has
// selected. Drives the ×N badges on the Battle Planning target picker so a player sees
// what's actually out there before committing a category. Same at-war + nation gate as
// planTargets, so a category with a live count is one the plan could hit today.
export function liveTargetCounts(w, mySlot, targetNations) {
    const nations = targetNations?.length ? new Set(targetNations) : null;
    const nationOk = (slot) => (!nations || nations.has(slot)) && atWar(w, mySlot, slot);
    const counts = {};
    for (const c of w.cities) if (c.alive && nationOk(c.slot)) counts.city = (counts.city || 0) + 1;
    for (const u of w.units) {
        if (u.hp <= 0 || !nationOk(u.slot)) continue;
        const cat = targetCategoryOf("unit", u.type);
        if (cat) counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
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

    // Sustained firepower and a clear-the-board estimate. damagePerVolley is the total
    // shot damage of every attacker that has ANY target in reach (firing + idle-because-
    // saturated) — the plan's real throughput once saturated targets fall and idle guns
    // pick up the next ones. volleysToClear divides the total live target hp by that
    // throughput: a rough "how many salvoes to level everything" readout for the player.
    const outSet = new Set(outOfRange);
    const targetHpLive = targets.reduce((s, t) => s + Math.max(0, t.hp), 0);
    let damagePerVolley = 0;
    for (const u of attackers) if (!outSet.has(u.id)) damagePerVolley += shotDamage(w, u);
    const volleysToClear = damagePerVolley > 0 && targetHpLive > 0 ? Math.ceil(targetHpLive / damagePerVolley) : null;

    return {
        assignments,
        ammoWanted,
        idle,
        outOfRange,
        attackerCount: attackers.length,
        firing: assignments.size,
        targetsLive: targets.length,
        targetsCovered: targets.filter((t) => t.alloc > 0).length,
        targetHpLive,
        damagePerVolley,
        volleysToClear,
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
    const hit = new Set();                  // target ids an attacker is committed against
    for (const [uid, tid] of assignments) {
        const u = byId.get(uid), t = tById.get(tid);
        if (u && t) {
            arcs.push({from: [u.lng, u.lat], to: [t.lng, t.lat]});
            hit.add(tid);
        }
    }
    return {
        arcs,
        attackers: attackers.map((u) => ({
            id: u.id, lng: u.lng, lat: u.lat,
            reachKm: reachKm(w, u, plan.engagementKm),
            assigned: assignments.has(u.id),
        })),
        // `hit` distinguishes a target a plan is actually firing on from one that's live
        // but unreached (out of range, or saturated) — the overlay draws the two apart.
        targets: targets.map((t) => ({id: t.id, lng: t.lng, lat: t.lat, hit: hit.has(t.id)})),
    };
}

// The tightest engagement dial that still reaches every hardware-reachable target — for
// the "Fit" button. For each live target we take the distance from its NEAREST attacker
// (the closest gun that could hit it), then the plan needs to reach the farthest of those.
// Rounded up to the slider step and clamped to the dial's bounds. Returns null when there
// are no attackers or no reachable targets to fit to (nothing to suggest).
export function suggestEngagementKm(w, plan, mySlot) {
    const attackers = planAttackers(w, plan, mySlot);
    const targets = planTargets(w, plan, mySlot);
    if (!attackers.length || !targets.length) return null;
    let far = 0;
    for (const t of targets) {
        let near = Infinity;
        for (const u of attackers) {
            if (!canEngage(u, t)) continue;
            const hw = reachKm(w, u, BATTLE_PLAN.maxEngagementKm);   // true hardware reach, dial ignored
            const d = haversine(u.lng, u.lat, t.lng, t.lat);
            if (d <= hw) near = Math.min(near, d);
        }
        if (near !== Infinity) far = Math.max(far, near);
    }
    if (far <= 0) return null;
    const step = BATTLE_PLAN.engagementStepKm;
    return Math.min(BATTLE_PLAN.maxEngagementKm, Math.max(BATTLE_PLAN.minEngagementKm, Math.ceil(far / step) * step));
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
    // `armed` is standing-only; force it off for any non-standing plan so a plan
    // saved mid-bug (armed, then switched to one-shot) doesn't restore stuck "on".
    const plans = Array.isArray(bp?.plans) ? bp.plans.map((p) => ({...p, fireNonce: 0, armed: p.mode === "standing" && !!p.armed})) : [];
    const activeId = bp?.activeId ?? null;
    return {plans, activeId};
}

// Mirror the UI's authored plans back onto the world so the next save captures them.
// Pure data assignment; the tick never reads this field.
export function writeBattlePlans(w, plans, activeId) {
    if (!w) return;
    w.battlePlans = {plans: Array.isArray(plans) ? plans : [], activeId: activeId ?? null};
}
