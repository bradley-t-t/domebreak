// Missile flight tracking, launch/impact resolution, and MIRV bus reentry.
// Target resolution (findTarget) also lives here since launch/impact/attack
// orders all need the same city-or-unit lookup.
import {haversine, interpGC} from "../geo/geo.js";
import {FALLOUT, MISSILE_SPEED, UNITS, WARHEADS} from "../data/constants.js";
import {nationOf, nextId, rand} from "./worldState.js";
import {atWar, sensedBy} from "./queries.js";

// Resolves an order/attack target id to either a city or a unit, with a uniform
// {kind, ref, slot, alive, lng, lat} shape. Shared by production orders and combat.
export function findTarget(w, id) {
    const c = w.cities.find((x) => x.id === id);
    if (c) return {
        kind: "city", ref: c, slot: c.slot, get alive() {
            return c.alive;
        }, lng: c.lng, lat: c.lat
    };
    const u = w.units.find((x) => x.id === id);
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
    let dLng = ahead[0] - base[0];
    while (dLng > 180) dLng -= 360;
    while (dLng < -180) dLng += 360;
    const cos = Math.max(0.05, Math.cos((base[1] * Math.PI) / 180));
    const dx = dLng * cos, dy = ahead[1] - base[1];
    const len = Math.hypot(dx, dy) || 1;
    // Perpendicular offset peaking mid-flight, zero at release and at impact.
    const off = p.spreadKm * Math.sin(Math.PI * Math.min(1, Math.max(0, f)));
    return [base[0] + ((-dy / len) * off) / (111 * cos), base[1] + ((dx / len) * off) / 111];
}

// Fires one projectile from an offensive unit at a resolved target. Records who
// saw the launch (the shooter always; anyone else only if a sensor covers the
// launch point — this is what an OTH array buys, visibility into the boost phase).
export function launch(w, unit, target, warhead) {
    const n = nationOf(w, unit.slot);
    const dist = haversine(unit.lng, unit.lat, target.lng, target.lat);
    const seenBy = [unit.slot];
    for (const nn of w.nations) {
        if (!nn.alive || nn.slot === unit.slot) continue;
        if (sensedBy(w, nn.slot, unit.lng, unit.lat)) seenBy.push(nn.slot);
    }
    w.projectiles.push({
        seenBy,
        id: nextId(w, "p"),
        slot: unit.slot,
        type: unit.type,
        warhead: warhead || "standard",
        damage: UNITS[unit.type].damage * (n?.dmgMult ?? 1) * (WARHEADS[warhead] || WARHEADS.standard).dmgMult,
        // Intercept-evasion: the firing nation's hypersonic-glide bonus (off8),
        // stacked with any inherent evasion on the launcher's own unit type. The
        // defender subtracts this from its interceptor hit probability (tick.js).
        evasion: (n?.hypersonicEvasion ?? 0) + (UNITS[unit.type].evasion ?? 0),
        speed: UNITS[unit.type].speed ?? MISSILE_SPEED,
        tried: [],
        altNorm: 0,
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

// Projectile arrival: applies damage to the target city/unit, kills it at 0 hp
// (cities permanently — alive=false), and emits the hit/destroy/fizzle event.
export function resolveHit(w, p) {
    const target = findTarget(w, p.targetId);
    // A qualifying warhead (thermonuclear) contaminates the ground where it goes
    // off, whether or not a live target was there to absorb the blast — so the
    // cloud is sited before the fizzle bail-out, at the impact point.
    if (FALLOUT.warheads.includes(p.warhead)) {
        spawnFallout(w, target ? target.lng : p.toLng, target ? target.lat : p.toLat, p.slot);
    }
    if (!target || !target.alive) {
        w.events.push({id: nextId(w, "e"), t: w.time, type: "fizzle", lng: p.toLng, lat: p.toLat});
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
    if (!w.effects) w.effects = []; // saves from before fallout existed
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
        const jLng = (rand(w) - 0.5) * 0.5, jLat = (rand(w) - 0.5) * 0.5;
        const dist = Math.max(20, haversine(p.lng, p.lat, tgt.lng + jLng, tgt.lat + jLat));
        // Each sub flies its own lane: a signed lateral bow spread evenly across
        // the pattern width, so the volley fans out wide then closes on the target.
        const lane = count > 1 ? (i / (count - 1)) * 2 - 1 : 0;
        subs.push({
            id: nextId(w, "p"), slot: p.slot, type: p.type, warhead: p.warhead, sub: true,
            evasion: p.evasion ?? 0,
            spreadKm: lane * (cwh.spread || 0) * (0.7 + rand(w) * 0.6),
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
