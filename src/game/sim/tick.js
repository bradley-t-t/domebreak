// The main simulation step: research/production progress, unit movement and
// firing, projectile flight and interception, sensor sweeps, and the simple
// opponent AI. This is the tick engine's single entry point (step()).
import {
    AI_TUNING,
    AIRSTRIP_RUNWAY,
    DEFAULT_BUILD_TIME,
    DEFAULT_HIT_PROB,
    DEFAULT_RELOAD,
    HANGAR_SPEC,
    INTERCEPT_CAP,
    INTERCEPT_KILL_RADIUS_KM,
    INTERCEPTOR_SPEED,
    MIRV_SPLIT_AT,
    MISSILE_SPEED,
    TECHS,
    UNITS,
    WARHEADS,
} from "../data/constants.js";
import {haversine} from "../geo/geo.js";
import {nationOf, nextId, rand} from "./worldState.js";
import {
    airborne,
    atWar,
    defenseRange,
    inTerritory,
    netIncomeOf,
    placementBlocked,
    sensorsCover,
    sensorsOf
} from "./queries.js";
import {findTarget, launch, mirvSplit, resolveHit, trackPoint} from "./combat.js";
import {ensureHangar, flyAircraft, polarFrom, runAirbase, steamShip} from "./aircraft.js";
import {canQueue, commandAttack, enqueueResearch, ensureProd, prodCount, queueAmmo, queueUnit, unitLockReason} from "./production.js";
import {replenishmentBuff} from "./queries.js";
import {isSea} from "../geo/seaRoute.js";

// Reload multiplier a hull gets while inside a friendly Replenishment Ship's
// resupplyKm (underway replenishment cuts turnaround). Local tuning knob —
// belongs in data/constants.js once Phase 1's data contract is open to edits.
const REPLENISH_RELOAD_MULT = 0.7;

// Delivers one finished production-line item into the world: a replacement
// aircraft goes straight into its ordering base's hangar stock; a new unit
// gets placed near its reserved spot (nudged if it's since been taken, or
// refunded if nothing nearby fits).
function spawnQueuedUnit(w, n, it) {
    const def = UNITS[it.type];
    // Replacement aircraft: delivered straight into the ordering base's hangar
    // (housed, ready to launch). Refund if the base was lost while it was built.
    if (it.forBase) {
        const base = w.units.find((b) => b.id === it.forBase && b.hp > 0 && b.slot === n.slot);
        if (!base) {
            n.points += it.paid;
            return;
        }
        ensureHangar(w, base);
        base.hangar[it.type] = (base.hangar[it.type] || 0) + 1;
        return;
    }
    // The reserved spot may have been taken while the unit was on the line — nudge
    // around it, and refund if nowhere nearby fits.
    let spot = null;
    for (let k = 0; k < 9 && !spot; k++) {
        const lng = it.lng + (k ? Math.cos(k) * 0.5 * k * 0.35 : 0),
            lat = it.lat + (k ? Math.sin(k) * 0.5 * k * 0.35 : 0);
        if (!placementBlocked(w, lng, lat, null)) spot = {lng, lat};
    }
    if (!spot) {
        n.points += it.paid;
        return;
    }
    const base = {
        id: nextId(w, "u"),
        slot: n.slot,
        type: it.type,
        lng: spot.lng,
        lat: spot.lat,
        hp: def.hp,
        cooldown: 0,
        targetId: null,
        warhead: def.kind === "offense" ? "standard" : null
    };
    if (def.wing) {
        base.hangar = {...HANGAR_SPEC[it.type]};   // full complement in stock
        base.patrolSize = 0;                        // patrols launch on command
        base.awacsPatrol = false;
        base.op = null;
        base.runwayA = it.type === "carrier" ? Math.PI / 2 : AIRSTRIP_RUNWAY;
        if (it.type !== "carrier") base.face = polarFrom(base, 150, base.runwayA); // canted runway icon
    }
    w.units.push(base);
}

// Weighted-by-population target pick (prefers populous enemy cities; skips pop-0 when possible).
function pickTarget(w, enemies) {
    const en = new Set(enemies.map((e) => e.slot));
    let pool = w.cities.filter((c) => c.alive && en.has(c.slot) && (c.pop || 0) > 0);
    if (!pool.length) pool = w.cities.filter((c) => c.alive && en.has(c.slot));
    if (!pool.length) return null;
    const total = pool.reduce((s, c) => s + (c.pop || 1), 0);
    let r = rand(w) * total;
    for (const c of pool) {
        r -= (c.pop || 1);
        if (r <= 0) return c;
    }
    return pool[pool.length - 1];
}

function aiSpot(w, slot, city) {
    for (let k = 0; k < 10; k++) {
        const lng = city.lng + (rand(w) - 0.5) * 2.4, lat = city.lat + (rand(w) - 0.5) * 2.4;
        if (inTerritory(w, slot, lng, lat) && !placementBlocked(w, lng, lat, null)) return {lng, lat};
    }
    return null;
}

// Tech-gated unit types the AI will pursue once unlocked, in build priority.
// Space Command HQ leads so its dependents become buildable; subs and modern
// defenses follow. Purely a build-order preference over data-driven gates —
// each candidate is still validated by queueUnit (tech + prereq + caps).
const AI_UNLOCK_BUILD_ORDER = [
    "spacehq", "sub-ssn", "sub-ssbn", "patriot", "thaad", "aegis",
    "reconsat", "warnsat", "sbi", "orbitallaser", "hypersonicbty", "orbitalstrike",
];

// Builds one freshly-unlocked, tech-gated unit the nation qualifies for. Honors
// the unit's own requiresTech/requiresUnit/maxCount (via queueUnit) plus AI
// reserves: the pricey space platforms wait behind spaceHqReserve, subs behind
// subReserve. Returns true if it queued something (caller should yield the tick).
function aiBuildUnlocked(w, n, myCap) {
    if (rand(w) >= AI_TUNING.unlockedBuildChance) return false;
    for (const type of AI_UNLOCK_BUILD_ORDER) {
        const def = UNITS[type];
        if (!def) continue;
        // Only chase units this nation has actually unlocked.
        if (def.requiresTech && !n.research.done.includes(def.requiresTech)) continue;
        // maxCount / already-satisfied: don't re-queue a one-off (e.g. spacehq).
        const have = w.units.filter((u) => u.slot === n.slot && u.type === type && u.hp > 0).length + prodCount(n, "unit", type);
        if (def.maxCount && have >= def.maxCount) continue;
        if (unitLockReason(w, n.slot, type)) continue; // prereq (spacehq) not up yet
        // Reserve cushion: space platforms are the most expensive commitments.
        const isSpace = def.requiresUnit === "spacehq" || type === "spacehq";
        const isSub = type === "sub-ssn" || type === "sub-ssbn";
        const reserve = isSpace ? AI_TUNING.spaceHqReserve : isSub ? AI_TUNING.subReserve : 0;
        const cost = Math.round(def.cost * (n.buildCostMult ?? 1));
        if (n.points < cost + reserve) continue;
        // Naval hulls launch from coastal water; land/space assets side near the
        // capital like every other structure the AI raises.
        const p = def.domain === "sea" ? aiSeaSpot(w, n.slot, myCap) : aiSpot(w, n.slot, myCap);
        if (!p) continue;
        if (queueUnit(w, n.slot, type, p.lng, p.lat).ok) return true;
    }
    return false;
}

// Coastal-water spot near the capital for naval builds — probes outward until it
// finds sea that isn't blocked. Falls back to null (skip the build) if the
// capital is landlocked within reach.
function aiSeaSpot(w, slot, city) {
    for (let k = 0; k < 24; k++) {
        const r = 1.5 + rand(w) * 6;
        const a = rand(w) * Math.PI * 2;
        const lng = city.lng + Math.cos(a) * r, lat = city.lat + Math.sin(a) * r;
        if (isSea(lng, lat) && inTerritory(w, slot, lng, lat) && !placementBlocked(w, lng, lat, null)) return {lng, lat};
    }
    return null;
}

function aiTick(w, dt) {
    for (const n of w.nations) {
        if (!n.isAi || !n.alive) continue;
        n._ai -= dt;
        if (n._ai > 0) continue;
        n._ai = AI_TUNING.thinkMin + rand(w) * AI_TUNING.thinkSpan;
        ensureProd(n);
        const enemies = w.nations.filter((e) => e.alive && atWar(w, n.slot, e.slot));
        // A launcher stuck on an empty magazine falls back to whatever's stocked.
        for (const u of w.units) {
            if (u.slot !== n.slot || u.hp <= 0 || UNITS[u.type].kind !== "offense") continue;
            const wh = u.warhead || "standard";
            if (!(n.ammo[wh] > 0) && (n.ammo.standard || 0) > 0) u.warhead = "standard";
        }
        // Units come off the production line idle — point one at a target per tick.
        if (enemies.length) {
            const idle = w.units.find((u) => u.slot === n.slot && u.hp > 0 && !u.targetId && UNITS[u.type].kind === "offense");
            if (idle) {
                const tgt = pickTarget(w, enemies);
                if (tgt) {
                    // City-killers only come off the shelf — no conjured warheads.
                    if ((n.ammo.thermo || 0) > 0 && rand(w) < AI_TUNING.thermoChance) idle.warhead = "thermo";
                    commandAttack(w, idle.id, tgt.id);
                }
            }
        }
        const myCap = w.cities.find((c) => c.slot === n.slot && c.alive);
        if (!myCap) continue;
        const net = netIncomeOf(w, n.slot);
        const lineBusy = (n.prod.current ? 1 : 0) + n.prod.queue.length;
        if (lineBusy >= AI_TUNING.queueMax) continue; // keep the line short — the AI plans, it doesn't hoard
        // In the red, everything else waits — industry is the only way back out
        // (the same deficit gate the player lives under, enforced in queueUnit).
        if (net < 0) {
            if (n.points >= UNITS.factory.cost) {
                const p = aiSpot(w, n.slot, myCap);
                if (p && queueUnit(w, n.slot, "factory", p.lng, p.lat).ok) return;
            }
            continue;
        }
        const domes = w.units.filter((u) => u.slot === n.slot && u.type === "dome").length + prodCount(n, "unit", "dome");
        if (domes === 0 && n.points >= UNITS.dome.cost) {
            const p = aiSpot(w, n.slot, myCap);
            if (p && queueUnit(w, n.slot, "dome", p.lng, p.lat).ok) return;
        }
        // Magazines are fed through the same line as everything else — warheads
        // cost the AI the same points and production time they cost the player.
        const hasOffense = w.units.some((u) => u.slot === n.slot && u.hp > 0 && UNITS[u.type].kind === "offense") || prodCount(n, "unit", "silo") > 0 || prodCount(n, "unit", "launcher") > 0;
        const stocked = (t) => (n.ammo[t] || 0) + prodCount(n, "ammo", t);
        if (hasOffense && stocked("standard") < AI_TUNING.stdStockTarget && n.points >= WARHEADS.standard.prodCost + AI_TUNING.stdReserve) {
            if (queueAmmo(w, n.slot, "standard").ok) return;
        }
        if (hasOffense && enemies.length && stocked("thermo") < AI_TUNING.thermoStockTarget && n.points >= WARHEADS.thermo.prodCost + AI_TUNING.thermoReserve && rand(w) < AI_TUNING.thermoChance) {
            if (queueAmmo(w, n.slot, "thermo").ok) return;
        }
        const radars = w.units.filter((u) => u.slot === n.slot && u.type === "radar").length + prodCount(n, "unit", "radar");
        if (domes > 0 && radars === 0 && n.points >= UNITS.radar.cost + AI_TUNING.radarReserve) {
            const p = aiSpot(w, n.slot, myCap);
            if (p && queueUnit(w, n.slot, "radar", p.lng, p.lat).ok) return;
        }
        const oths = w.units.filter((u) => u.slot === n.slot && u.type === "oth").length + prodCount(n, "unit", "oth");
        if (radars > 0 && oths === 0 && n.points >= UNITS.oth.cost + AI_TUNING.othReserve) {
            const p = aiSpot(w, n.slot, myCap);
            if (p && queueUnit(w, n.slot, "oth", p.lng, p.lat).ok) return;
        }
        // Grow the economy alongside the arsenal — a few factories keep the AI solvent.
        const industry = w.units.filter((u) => u.slot === n.slot && UNITS[u.type].kind === "industry").length + prodCount(n, "unit", "factory");
        if (domes > 0 && industry < AI_TUNING.industryTarget && n.points >= UNITS.factory.cost + AI_TUNING.factoryReserve) {
            const p = aiSpot(w, n.slot, myCap);
            if (p && queueUnit(w, n.slot, "factory", p.lng, p.lat).ok) return;
        }
        // Build the units its completed techs have unlocked. Space assets need a
        // standing Space Command HQ first — the AI raises that (and any other
        // requiresUnit prereq) before the assets that depend on it. Reserves keep
        // it from spending itself dry on the expensive endgame hulls/platforms.
        if (aiBuildUnlocked(w, n, myCap)) return;
        // Deeper research: keep pushing tracks toward researchDepthTarget. Modern/
        // Space tiers (>= deepTierGate) cost far more, so they demand the deeper
        // points cushion before the AI commits.
        if (!n.research.current && !n.research.queue.length) {
            const avail = Object.keys(TECHS).filter((t) => canQueue(n, t) && TECHS[t].tier <= AI_TUNING.researchDepthTarget);
            const affordable = avail.filter((t) => {
                const reserve = TECHS[t].tier >= AI_TUNING.deepTierGate ? AI_TUNING.deepReserve : AI_TUNING.researchMinPoints;
                return n.points >= TECHS[t].cost + reserve;
            });
            if (affordable.length && rand(w) < AI_TUNING.researchChance) {
                enqueueResearch(w, n.slot, affordable[Math.floor(rand(w) * affordable.length)]);
                return;
            }
        }
        if (!enemies.length) continue;
        if (n.points >= UNITS.silo.cost + AI_TUNING.siloReserve && net > AI_TUNING.siloMinNet) {
            const p = aiSpot(w, n.slot, myCap);
            if (p) queueUnit(w, n.slot, "silo", p.lng, p.lat);
        }
    }
}

// Advances the world by dt seconds: research/production, unit AI and firing,
// projectile flight and interception, sensor sweeps, opponent AI, and the
// end-of-tick cleanup (dead unit/projectile pruning, win condition).
export function step(w, dt) {
    if (w.over || dt <= 0) return w;
    w.time += dt;
    for (const n of w.nations) if (n.alive) n.points = Math.max(0, n.points + netIncomeOf(w, n.slot) * dt);

    for (const n of w.nations) {
        if (!n.alive) continue;
        const rr = n.research;
        if (!rr.current && rr.queue.length) rr.current = {id: rr.queue.shift(), progress: 0};
        if (rr.current) {
            rr.current.progress += (dt / TECHS[rr.current.id].time) * (n.researchSpeedMult ?? 1);
            if (rr.current.progress >= 1) {
                TECHS[rr.current.id].apply(n);
                rr.done.push(rr.current.id);
                w.events.push({id: nextId(w, "e"), t: w.time, type: "research", slot: n.slot, techId: rr.current.id});
                rr.current = null;
            }
        }
    }

    for (const n of w.nations) {
        if (!n.alive) continue;
        ensureProd(n);
        const pr = n.prod;
        if (!pr.current && pr.queue.length) pr.current = {item: pr.queue.shift(), progress: 0};
        if (pr.current) {
            const it = pr.current.item;
            const t = it.kind === "ammo" ? WARHEADS[it.type].prodTime : (UNITS[it.type].buildTime || DEFAULT_BUILD_TIME);
            pr.current.progress += dt / t;
            if (pr.current.progress >= 1) {
                if (it.kind === "ammo") n.ammo[it.type] = (n.ammo[it.type] || 0) + 1;
                else spawnQueuedUnit(w, n, it);
                w.events.push({
                    id: nextId(w, "e"),
                    t: w.time,
                    type: "built",
                    slot: n.slot,
                    kind: it.kind,
                    unit: it.type
                });
                pr.current = null;
            }
        }
    }

    for (const u of w.units) {
        if (u.hp <= 0) continue;
        u.cooldown = Math.max(0, u.cooldown - dt);
        const def = UNITS[u.type];
        if (def.wing) runAirbase(w, u, dt);
        if ((def.navalSpeed || def.landSpeed) && u.dest) steamShip(u, def, dt);
        else if (def.airSpeed && u.baseId) {
            // Sub-step the flight physics: at 4×–10× game speed a whole tick can
            // be a full second — one turn-rate-limited update per tick makes the
            // heading saw-tooth around the path. Integrating in ≤80 ms slices
            // keeps the nose on the velocity vector at any speed.
            let rem = dt;
            while (rem > 1e-6 && u.hp > 0) {
                const h = Math.min(0.08, rem);
                flyAircraft(w, u, def, h);
                rem -= h;
            }
        }
        if (def.kind === "offense" && u.targetId && u.cooldown <= 0 && airborne(u)) {
            const t = findTarget(w, u.targetId);
            if (!t || !t.alive || !atWar(w, u.slot, t.slot)) {
                u.targetId = null;
                continue;
            }
            const n = nationOf(w, u.slot);
            if (haversine(u.lng, u.lat, t.lng, t.lat) <= def.range * (n?.rangeMult ?? 1)) {
                ensureProd(n);
                // Missile units spend a warhead from the strategic arsenal (and can't
                // fire when it's empty). Conventional units — tanks, aircraft, ships —
                // fire their own munitions and never draw the arsenal.
                const _wh = def.warheads ? (u.warhead || "standard") : "standard";
                if (!def.warheads || (n.ammo[_wh] || 0) > 0) {
                    if (def.warheads) n.ammo[_wh] -= 1;
                    launch(w, u, t, _wh);
                    // Ships rearming under a Replenishment Ship recycle faster.
                    const replen = def.domain === "sea" && replenishmentBuff(w, u) ? REPLENISH_RELOAD_MULT : 1;
                    u.cooldown = def.reload * (n?.reloadMult ?? 1) * replen;
                }
            }
        }
    }

    for (const p of w.projectiles) {
        p.travelled += (p.speed ?? MISSILE_SPEED) * dt;
        p.progress = Math.min(1, p.travelled / (p.dist || 1));
        const pos = trackPoint(p, p.progress);
        p.lng = pos[0];
        p.lat = pos[1];
        const ah = trackPoint(p, Math.min(1, p.progress + 0.03));
        p.aheadLng = ah[0];
        p.aheadLat = ah[1];
        // MIRVs descend from their release altitude; whole missiles fly the sine arc.
        p.altNorm = p.altStart != null ? p.altStart * (1 - p.progress) : Math.sin(p.progress * Math.PI);
        if (p.warhead === "cluster" && !p.sub && !p._dead && p.progress >= MIRV_SPLIT_AT) {
            mirvSplit(w, p);
            p._dead = true;
            continue;
        }
        // Defenses fire interceptors (gated by reload + points). Only ordnance
        // actually inbound on the defender's own nation is engaged — missiles
        // transiting past a third party are not their problem.
        const inboundSlot = findTarget(w, p.targetId)?.slot;
        for (const d of w.units) {
            if (d.hp <= 0 || UNITS[d.type].kind !== "defense") continue;
            // Fighters kill what flies in the air column — not ballistic reentry
            // vehicles screaming down from space. BMD stays with ground/sea defenses.
            if (UNITS[d.type].airSpeed && UNITS[p.type]?.ballistic) continue;
            if (inboundSlot == null || inboundSlot !== d.slot) continue;
            if (d.slot === p.slot || d.cooldown > 0 || p.tried.includes(d.id) || !airborne(d)) continue;
            if (haversine(d.lng, d.lat, p.lng, p.lat) <= defenseRange(w, d)) {
                const dn = nationOf(w, d.slot);
                if (dn.points <= 0 && netIncomeOf(w, d.slot) < 0) continue; // upkeep unmet — interceptors offline
                p.tried.push(d.id);
                // Sea-based defenses (cruiser/destroyer/Aegis afloat) reload faster
                // while replenished by a nearby oiler.
                const dReplen = UNITS[d.type].domain === "sea" && replenishmentBuff(w, d) ? REPLENISH_RELOAD_MULT : 1;
                d.cooldown = (UNITS[d.type].reload || DEFAULT_RELOAD) * dReplen;
                // Hypersonic-evasion: fast boost-glide weapons (off8 / Hypersonic
                // Missile Battery) shave the interceptor's hit probability by the
                // firing nation's evasion. Floored to a small residual chance
                // (derived from INTERCEPT_CAP, no magic number) so evasion makes a
                // strike hard to stop but never truly un-interceptable.
                const baseProb = Math.min(INTERCEPT_CAP, UNITS[d.type].intercept + (dn.interceptAdd ?? 0));
                const evadeFloor = baseProb * (1 - INTERCEPT_CAP);
                const hitProb = Math.max(evadeFloor, baseProb - (p.evasion ?? 0));
                w.interceptors.push({
                    id: nextId(w, "i"),
                    slot: d.slot,
                    targetId: p.id,
                    hitProb,
                    speed: INTERCEPTOR_SPEED * (dn.interceptorSpeedMult ?? 1),
                    altNorm: 0,
                    launchDist: Math.max(1, haversine(d.lng, d.lat, p.lng, p.lat)),
                    fromLng: d.lng,
                    fromLat: d.lat,
                    lng: d.lng,
                    lat: d.lat,
                    toLng: p.lng,
                    toLat: p.lat
                });
            }
        }
        if (!p._dead && p.progress >= 1) {
            resolveHit(w, p);
            p._dead = true;
        }
    }

    // Sensor sweep (~4 Hz): each nation's radars pick up missiles entering their
    // coverage. A track, once held, is never dropped. The intended victim's first
    // pickup of ordnance inbound on them raises the "detected" warning — without
    // OTH coverage of the launch site that's the first they hear of it.
    w._det = (w._det || 0) + dt;
    if (w._det >= 0.25) {
        w._det = 0;
        const sensors = {};
        for (const n of w.nations) if (n.alive) sensors[n.slot] = sensorsOf(w, n.slot);
        for (const p of w.projectiles) {
            if (p._dead) continue;
            if (!p.seenBy) p.seenBy = []; // saves from before fog of war
            const tgtSlot = findTarget(w, p.targetId)?.slot;
            for (const n of w.nations) {
                if (!n.alive || p.seenBy.includes(n.slot) || !sensors[n.slot]) continue;
                if (!sensorsCover(sensors[n.slot], p.lng, p.lat)) continue;
                p.seenBy.push(n.slot);
                if (n.slot === tgtSlot) w.events.push({
                    id: nextId(w, "e"), t: w.time, type: "detected", slot: n.slot, lng: p.lng, lat: p.lat
                });
            }
        }
    }

    for (const it of w.interceptors) {
        const tgt = w.projectiles.find((p) => p.id === it.targetId && !p._dead);
        if (!tgt) {
            it._dead = true;
            continue;
        }
        it.toLng = tgt.lng;
        it.toLat = tgt.lat;
        const dist = haversine(it.lng, it.lat, tgt.lng, tgt.lat);
        const stepKm = it.speed * dt;
        it.altNorm = (tgt.altNorm ?? 0) * Math.min(1, Math.max(0, 1 - dist / (it.launchDist || 1)));
        if (dist <= Math.max(INTERCEPT_KILL_RADIUS_KM, stepKm)) {
            it._dead = true;
            if (rand(w) < (it.hitProb ?? DEFAULT_HIT_PROB)) {
                tgt._dead = true;
                w.events.push({
                    id: nextId(w, "e"),
                    t: w.time,
                    type: "intercept",
                    lng: tgt.lng,
                    lat: tgt.lat,
                    alt: tgt.altNorm ?? 0,
                    byLng: it.fromLng,
                    byLat: it.fromLat
                });
            } else {
                w.events.push({
                    id: nextId(w, "e"),
                    t: w.time,
                    type: "miss",
                    lng: it.lng,
                    lat: it.lat,
                    alt: it.altNorm ?? 0
                });
            }
        } else {
            const f = stepKm / dist;
            it.lng += (tgt.lng - it.lng) * f;
            it.lat += (tgt.lat - it.lat) * f;
        }
    }

    w.interceptors = w.interceptors.filter((it) => !it._dead);
    w.projectiles = w.projectiles.filter((p) => !p._dead);
    w.units = w.units.filter((u) => u.hp > 0);
    if (w.events.length > 60) w.events.splice(0, w.events.length - 60);

    aiTick(w, dt);
    for (const n of w.nations) if (n.alive && !w.cities.some((c) => c.slot === n.slot && c.alive)) n.alive = false;
    const alive = w.nations.filter((n) => n.alive);
    if (alive.length <= 1) {
        w.over = true;
        w.winnerSlot = alive[0]?.slot ?? null;
        w.paused = true;
    }
    return w;
}
