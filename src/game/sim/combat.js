// Missile flight tracking, launch/impact resolution, and MIRV bus reentry.
// Target resolution (findTarget) also lives here since launch/impact/attack
// orders all need the same city-or-unit lookup.
import {haversine, interpGC} from "../geo/geo.js";
import {BLAST, FALLOUT, LEADERSHIP, MISSILE_SPEED, UNITS, WARHEADS} from "../data/constants.js";
import {nextId, rand} from "./worldState.js";
import {atWar, sensedBy} from "./queries.js";
import {cosLatSafe, unwrapLng} from "../../lib/geo.js";
import {clamp, clamp01} from "../../lib/math.js";
import {byId} from "../../lib/iter.js";
import {jitter, randRange} from "../../lib/random.js";

// Resolves an order/attack target id to either a city or a unit, with a uniform
// {kind, ref, slot, alive, lng, lat} shape. Shared by production orders and combat.
export function findTarget(w, id) {
    const c = byId(w.cities, id);
    if (c) return {
        kind: "city", ref: c, slot: c.slot, get alive() {
            return c.alive;
        }, lng: c.lng, lat: c.lat
    };
    const u = byId(w.units, id);
    if (u) return {
        kind: "unit", ref: u, slot: u.slot, get alive() {
            return u.hp > 0;
        }, lng: u.lng, lat: u.lat
    };
    return null;
}

// Predicted-intercept aim point: where a pursuer at {lng,lat,speed} should steer
// to *meet* moving projectile p, rather than chasing where p is right now. Solves
// time-to-intercept by fixed-point iteration (tau = range / pursuerSpeed, re-sample
// the target's future track point, repeat — converges in a few steps for any
// closing geometry) and returns that future track point. When the pursuer is too
// slow to catch up, tau grows, the future fraction clamps to 1, and the aim point
// settles on the target's impact point — a sane lead-toward-the-endpoint fallback.
export function leadInterceptPoint(it, p) {
    const pursuerSpeed = it.speed || 1;
    const tgtSpeed = p.speed ?? MISSILE_SPEED;
    const total = p.dist || 1;
    let tau = haversine(it.lng, it.lat, p.lng, p.lat) / pursuerSpeed;
    let aim = [p.lng, p.lat];
    for (let k = 0; k < 4; k++) {
        const f = Math.min(1, p.progress + (tgtSpeed * tau) / total);
        aim = trackPoint(p, f);
        tau = haversine(it.lng, it.lat, aim[0], aim[1]) / pursuerSpeed;
    }
    return aim;
}

// Ground track of a projectile at flight fraction f: the great circle from
// launch to aim point, plus — for MIRVs — a lateral bow (spreadKm, signed per
// sub) that fans the pattern out after release and converges it back onto the
// target for the terminal dive. Shared by the engine tick and the sky renderer
// so the physics and the drawn trail can never disagree.
export function trackPoint(p, f) {
    const base = interpGC(p.fromLng, p.fromLat, p.toLng, p.toLat, f);
    if (!p.spreadKm) return base;
    const ahead = interpGC(p.fromLng, p.fromLat, p.toLng, p.toLat, Math.min(1, f + 0.02));
    const dLng = unwrapLng(ahead[0] - base[0], 0);
    const cos = cosLatSafe(base[1]);
    const dx = dLng * cos, dy = ahead[1] - base[1];
    const len = Math.hypot(dx, dy) || 1;
    // Perpendicular offset peaking mid-flight, zero at release and at impact.
    const off = p.spreadKm * Math.sin(Math.PI * clamp01(f));
    // interpGC keeps base within ±90, but this lateral bow is a raw-degree nudge
    // that can push a sub-warhead past a pole near high latitudes. Clamp so the
    // shared track never yields an impossible latitude — an unclamped value crashes
    // map.project() (Invalid LngLat) and takes the whole match view down.
    const bowLat = clamp(base[1] + ((dx / len) * off) / 111, -90, 90);
    return [base[0] + ((-dy / len) * off) / (111 * cos), bowLat];
}

// Fires one projectile from an offensive unit at a resolved target. Records who
// saw the launch (the shooter always; anyone else only if a sensor covers the
// launch point — this is what an OTH array buys, visibility into the boost phase).
export function launch(w, unit, target, warhead) {
    const udef = UNITS[unit.type];
    const dist = haversine(unit.lng, unit.lat, target.lng, target.lat);
    const seenBy = [unit.slot];
    for (const nn of w.nations) {
        if (!nn.alive || nn.slot === unit.slot) continue;
        if (sensedBy(w, nn.slot, unit.lng, unit.lat)) seenBy.push(nn.slot);
    }
    // An orbital strike is a rod-from-god drop from orbit: the projectile starts
    // at its parent sat's altitude and falls into the target. Feeding altStart to
    // the projectile makes tickPhases.stepCombat descend it from that altitude
    // (see p.altStart handling), and SkyLayer's projGeom lifts the trail off the
    // ground track by that fraction. A ground-launched round leaves altStart null
    // and keeps the classic sine-arc trajectory it always had.
    const altStart = udef.orbital ? (udef.orbitLift ? Math.min(1, udef.orbitLift) : 0.9) : undefined;
    w.projectiles.push({
        seenBy,
        id: nextId(w, "p"),
        slot: unit.slot,
        type: unit.type,
        warhead: warhead || "standard",
        damage: udef.damage * (WARHEADS[warhead] || WARHEADS.standard).dmgMult,
        // Intercept-evasion: inherent on the launcher's unit type plus the loaded
        // warhead (an HGV payload is hard to intercept whatever fires it). The
        // defender subtracts this from its interceptor hit probability (tick.js).
        evasion: (udef.evasion ?? 0) + (WARHEADS[warhead]?.evasion ?? 0),
        // Boost-glide rounds (HGV) overspeed the platform's baseline; speedMult is
        // data-driven on the warhead so a hypersonic payload is fast whatever fires it.
        speed: (udef.speed ?? MISSILE_SPEED) * (WARHEADS[warhead]?.speedMult ?? 1),
        tried: [],
        altNorm: altStart ?? 0,
        ...(altStart != null ? {altStart} : {}),
        fromLng: unit.lng,
        fromLat: unit.lat,
        toLng: target.lng,
        toLat: target.lat,
        lng: unit.lng,
        lat: unit.lat,
        aheadLng: unit.lng,
        aheadLat: unit.lat,
        targetId: target.ref.id,
        dist,
        travelled: 0,
        progress: 0
    });
    w.events.push({
        id: nextId(w, "e"), t: w.time, type: "launch", lng: unit.lng, lat: unit.lat,
        slot: unit.slot, tgtSlot: target.slot, seen: [...seenBy]
    });
}

// The Leadership Bunker is hardened (see LEADERSHIP.bunkerKillWarheads): it shrugs
// off every incoming strike except a DIRECT hit from a thermonuclear-class warhead,
// which destroys it outright. Blast, fallout, and ground fire never touch it. Emits
// the usual hit/destroy event (flagged `bunker`) so map FX and the news ticker fire;
// a deflected hit carries `shielded:1` so the UI can say "the bunker holds". `warhead`
// is null for ground fire (never lethal). Callers early-return after invoking it
// instead of applying generic damage.
function resolveBunkerStrike(w, ref, warhead, slot) {
    const lethal = warhead != null && LEADERSHIP.bunkerKillWarheads.includes(warhead);
    if (lethal) ref.hp = 0;
    w.events.push({
        id: nextId(w, "e"), t: w.time, type: lethal ? "destroy" : "hit", kind: "unit",
        cityId: ref.id, lng: ref.lng, lat: ref.lat, slot, bunker: 1, ...(lethal ? {} : {shielded: 1})
    });
}

// Direct fire: ground combatants (infantry/tank/artillery — targets:"land") deal
// their damage straight onto the target instead of lofting an interceptable
// projectile through the missile-defense loop. A tank shell is not something a
// SAM battery shoots down. Reuses the same hit/destroy event contract as
// resolveHit, so map explosions, kill toasts, and the news ticker all fire —
// only the in-flight, interceptable phase is skipped. Deterministic (no rng).
export function directFire(w, unit, target) {
    // The bunker is immune to ground fire — it can only be captured, or vaporized by
    // a direct thermonuclear strike. A tank round bounces off.
    if (target.kind === "unit" && target.ref.type === "bunker") {
        resolveBunkerStrike(w, target.ref, null, unit.slot);
        return;
    }
    const dmg = UNITS[unit.type].damage || 0;
    target.ref.hp -= dmg;
    const dead = target.ref.hp <= 0;
    if (dead) {
        target.ref.hp = 0;
        if (target.kind === "city") target.ref.alive = false;
    }
    w.events.push({
        id: nextId(w, "e"),
        t: w.time,
        type: dead ? "destroy" : "hit",
        kind: target.kind,
        cityId: target.ref.id,
        lng: target.lng,
        lat: target.lat,
        slot: unit.slot
    });
}

// Ground-zero blast wave. Every living unit within the warhead's blastKm takes a
// share of its yield — full at the core, falling linearly to BLAST.edgeFrac at the
// edge — friend or foe alike, the way fallout irradiates indiscriminately. The
// direct target (excludeId) is skipped since it absorbs the full hit separately,
// and cluster sub-warheads (blastKm 0 / p.sub) contribute no extra blast because
// their area already comes from the MIRV pattern. Cities are untouched by blast so
// the existing scoring/economy balance holds. Deterministic — no rng.
function applyBlast(w, p, lng, lat, excludeId) {
    const bk = WARHEADS[p.warhead]?.blastKm || 0;
    if (bk <= 0 || p.sub) return;
    const peak = p.damage * BLAST.aoeShare;
    for (const u of w.units) {
        // The bunker is blast-proof — only a direct thermonuclear hit (or capture)
        // can take it down, never a near-miss shockwave.
        if (u.hp <= 0 || u.id === excludeId || u.type === "bunker") continue;
        const d = haversine(lng, lat, u.lng, u.lat);
        if (d > bk) continue;
        const dmg = peak * (1 - (1 - BLAST.edgeFrac) * (d / bk));
        if (dmg <= 0) continue;
        u.hp -= dmg;
        if (u.hp <= 0) {
            u.hp = 0;
            w.events.push({
                id: nextId(w, "e"), t: w.time, type: "destroy", kind: "unit",
                cityId: u.id, lng: u.lng, lat: u.lat, slot: p.slot
            });
        }
    }
}

// Projectile arrival: applies damage to the target city/unit, kills it at 0 hp
// (cities permanently — alive=false), spreads a ground-zero blast to nearby units,
// and emits the hit/destroy/fizzle event.
export function resolveHit(w, p) {
    const target = findTarget(w, p.targetId);
    // Ground zero: the live target's spot, or the aim point if nothing survived to
    // absorb the hit. Fallout and blast are both sited here, before the fizzle
    // bail-out — a warhead detonates on the ground whether or not a target remains.
    const gzLng = target ? target.lng : p.toLng, gzLat = target ? target.lat : p.toLat;
    if (FALLOUT.warheads.includes(p.warhead)) spawnFallout(w, gzLng, gzLat, p.slot);
    applyBlast(w, p, gzLng, gzLat, target && target.kind === "unit" ? target.ref.id : null);
    if (!target || !target.alive) {
        w.events.push({id: nextId(w, "e"), t: w.time, type: "fizzle", lng: p.toLng, lat: p.toLat});
        return;
    }
    // The Leadership Bunker only falls to a direct thermonuclear-class hit; any other
    // warhead is deflected (see resolveBunkerStrike). This is a DIRECT hit — the
    // bunker is the projectile's own target — so the thermo rule applies here.
    if (target.kind === "unit" && target.ref.type === "bunker") {
        resolveBunkerStrike(w, target.ref, p.warhead, p.slot);
        return;
    }
    target.ref.hp -= p.damage;
    const dead = target.ref.hp <= 0;
    if (dead) {
        target.ref.hp = 0;
        if (target.kind === "city") target.ref.alive = false;
    }
    w.events.push({
        id: nextId(w, "e"),
        t: w.time,
        type: dead ? "destroy" : "hit",
        kind: target.kind,
        cityId: target.ref.id,
        lng: target.lng,
        lat: target.lat,
        slot: p.slot
    });
}

// Seeds a radioactive fallout cloud at a ground-zero point. The cloud is a
// long-lived world effect (w.effects) the tick ages, drifts, and reads for
// damage-over-time; the map renders its footprint and epicenter. Deterministic —
// no rng — so replays and tests stay stable.
export function spawnFallout(w, lng, lat, slot) {
    if (!w.effects) w.effects = []; // legacy saves predate fallout
    w.effects.push({
        id: nextId(w, "fx"),
        type: "fallout",
        lng,
        lat,
        radiusKm: FALLOUT.radiusKm,
        age: 0,
        slot,
    });
    w.events.push({id: nextId(w, "e"), t: w.time, type: "fallout", lng, lat, slot});
}

// Cluster bus reentry: release subCount MIRVs from the bus position. Half dive
// on the primary target on scattered trajectories; the rest fan out to other
// hostile targets within the warhead's spread radius (or pile onto the primary
// when nothing else is close). Each MIRV carries damage/4 — a lone target still
// eats the bus's full yield, with the fan-out as a bonus against clusters.
export function mirvSplit(w, p) {
    const cwh = WARHEADS[p.warhead];
    const primary = findTarget(w, p.targetId);
    if (!primary || !primary.alive) return;
    const count = cwh.subCount || 8, radius = cwh.splash || 240;
    const nearby = [];
    for (const c of w.cities) {
        if (!c.alive || c.id === primary.ref.id || !atWar(w, p.slot, c.slot)) continue;
        if (haversine(primary.lng, primary.lat, c.lng, c.lat) <= radius) nearby.push(c);
    }
    for (const u of w.units) {
        if (u.hp <= 0 || u.id === primary.ref.id || !atWar(w, p.slot, u.slot)) continue;
        if (haversine(primary.lng, primary.lat, u.lng, u.lat) <= radius) nearby.push(u);
    }
    const subs = [];
    for (let i = 0; i < count; i++) {
        const primaries = Math.ceil(count * (cwh.primaryShare ?? 0.5));
        const alt = i >= primaries && nearby.length ? nearby[(i - primaries) % nearby.length] : null;
        const tgt = alt || primary.ref;
        // Small aim scatter so the sub trajectories visibly diverge on the way down.
        const jLng = jitter(rand(w), 0.5), jLat = jitter(rand(w), 0.5);
        const dist = Math.max(20, haversine(p.lng, p.lat, tgt.lng + jLng, tgt.lat + jLat));
        // Each sub flies its own lane: a signed lateral bow spread evenly across
        // the pattern width, so the volley fans out wide then closes on the target.
        const lane = count > 1 ? (i / (count - 1)) * 2 - 1 : 0;
        subs.push({
            id: nextId(w, "p"), slot: p.slot, type: p.type, warhead: p.warhead, sub: true,
            evasion: p.evasion ?? 0,
            spreadKm: lane * (cwh.spread || 0) * randRange(rand(w), 0.7, 0.6),
            seenBy: [...(p.seenBy || [])],
            damage: p.damage * (cwh.subDmgFrac ?? 0.25), speed: p.speed ?? MISSILE_SPEED, tried: [],
            altStart: p.altNorm ?? 0.8, altNorm: p.altNorm ?? 0.8,
            fromLng: p.lng, fromLat: p.lat, toLng: tgt.lng + jLng, toLat: tgt.lat + jLat,
            lng: p.lng, lat: p.lat, aheadLng: p.lng, aheadLat: p.lat,
            targetId: tgt.id, dist, travelled: 0, progress: 0,
        });
    }
    w.projectiles.push(...subs);
    w.events.push({
        id: nextId(w, "e"), t: w.time, type: "mirv", lng: p.lng, lat: p.lat,
        alt: p.altNorm ?? 0.8, seen: [...(p.seenBy || [])]
    });
}
