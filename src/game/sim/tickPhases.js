// The per-tick simulation phases: research/production progress, unit movement
// and firing, projectile flight and interception, sensor sweeps, fallout, and
// end-of-tick cleanup/victory checks. step() orchestrates these in order.
import {
    initialWarhead,
    DEFAULT_BUILD_TIME,
    DEFAULT_HIT_PROB,
    DEFAULT_RELOAD,
    DIPLOMACY,
    FALLOUT,
    INTERCEPT_CAP,
    INTERCEPT_KILL_RADIUS_KM,
    INTERCEPTOR_SPEED,
    MIRV_SPLIT_AT,
    MISSILE_SPEED,
    POPULATION,
    UNITS,
    WARHEADS,
} from "../data/constants.js";
import {haversine} from "../geo/geo.js";
import {nationOf, nextId, rand} from "./worldState.js";
import {clamp01} from "../../lib/math.js";
import {offsetKmPolar} from "../../lib/geo.js";
import {
    airborne,
    atWar,
    defenseRange,
    defenseMinRange,
    falloutIntensity,
    falloutProximity,
    netIncomeOf,
    sensorsCover,
    sensorsOf,
    vitalityOf,
    replenishmentBuff,
} from "./queries.js";
import {directFire, findTarget, launch, leadInterceptPoint, mirvSplit, resolveHit, trackPoint} from "./combat.js";
import {flyAircraft, runAirbase, steamShip} from "./aircraft.js";
import {ensureProd} from "./production.js";
import {reconcileLeadership, updateCommand} from "./leadership.js";
import {REPLENISH_RELOAD_MULT} from "../data/constants.js";
import {spawnQueuedUnit} from "./tickSpawn.js";

// Population growth: each living city's people grow toward a ceiling, scaled by
// vitality so healthy cities repopulate over a match and battered ones barely
// recover. Pure and deterministic — a function of stored pop/hp and dt, no RNG.
// Raw pop is capped at pop0 * growthCapMult; pop0 falls back to current pop for
// legacy saves.
export function growCities(w, dt) {
    if (dt <= 0) return;
    const {growthPerSec, growthCapMult} = POPULATION;
    if (growthPerSec <= 0 || growthCapMult <= 1) return;
    for (const c of w.cities) {
        if (!c.alive) continue;
        const cap = (c.pop0 ?? c.pop) * growthCapMult;
        if (c.pop >= cap) continue;
        c.pop = Math.min(cap, c.pop * (1 + growthPerSec * vitalityOf(c) * dt));
    }
}

// --- step() phases -----------------------------------------------------

// Phase 1: economy — leadership command factor, income accrual, then each
// nation's production line advances and (on completion) spawns its unit.
// (No tech tree — everything is unlocked at world creation.)
export function stepEconomy(w, dt) {
    // Refresh each nation's leadership command factor before the economy reads it
    // (incomeOf below scales by n.commandMult).
    updateCommand(w);
    for (const n of w.nations) if (n.alive) n.points = Math.max(0, n.points + netIncomeOf(w, n.slot) * dt);

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
}

// Phase 2: unit movement and firing — naval/land march, aircraft flight
// (sub-stepped for turn-rate stability), and ground/warhead-platform firing
// against a locked target once in range and off cooldown.
export function stepMovement(w, dt) {
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
        // Shoot-and-scoot: a road-mobile warhead platform (the TEL) holds fire while
        // it has a march destination — it must halt to launch.
        if (def.kind === "offense" && u.targetId && u.cooldown <= 0 && airborne(u) && !(def.warheads && def.landSpeed && u.dest)) {
            const t = findTarget(w, u.targetId);
            if (!t || !t.alive || !atWar(w, u.slot, t.slot)) {
                u.targetId = null;
                continue;
            }
            const n = nationOf(w, u.slot);
            if (haversine(u.lng, u.lat, t.lng, t.lat) <= def.range) {
                ensureProd(n);
                if (def.targets === "land") {
                    // Ground forces (infantry/tank/artillery) fight like ground
                    // forces: damage lands straight on the target — no interceptable
                    // projectile, no SAM/THAAD engagement. Distinct from the missile
                    // and warhead platforms that loft the interceptable arsenal.
                    //
                    // One exception: a capture-flagged unit (infantry/tank) firing
                    // on an enemy CITY it could take doesn't raze it — the assault
                    // is converted to capture pressure (occupation.js speeds the
                    // flip by CAPTURE.assaultMult while u.targetId is this city).
                    // Fire on enemy ground UNITS still lands as normal damage.
                    if (!(def.capture && t.kind === "city")) directFire(w, u, t);
                    u.cooldown = def.reload;
                } else {
                    // Missile units spend a warhead from the strategic arsenal (and can't
                    // fire when it's empty). Conventional air/sea units — aircraft, ships —
                    // fire their own munitions and never draw the arsenal.
                    const _wh = def.warheads ? (u.warhead || initialWarhead(u.type)) : "standard";
                    if (!def.warheads || (n.ammo[_wh] || 0) > 0) {
                        if (def.warheads) n.ammo[_wh] -= 1;
                        launch(w, u, t, _wh);
                        // Ships rearming under a Replenishment Ship recycle faster.
                        const replen = def.domain === "sea" && replenishmentBuff(w, u) ? REPLENISH_RELOAD_MULT : 1;
                        u.cooldown = def.reload * replen;
                    }
                }
            }
        }
    }
}

// Phase 3: projectile flight and interception — advances every in-flight
// projectile along its track (splitting MIRVs at their release point),
// engages it against the target nation's air defenses within their
// engagement annulus, and resolves impact on reaching the target.
export function stepCombat(w, dt) {
    // Index live defenses by the nation they protect. A battery only ever engages
    // ordnance inbound on its own nation (the inboundSlot gate below), so each
    // projectile need only test that nation's defenders — this bounds the loop by
    // per-nation unit count instead of scanning the world's entire unit list every
    // projectile (was O(projectiles × all units), the hot loop at full-world scale).
    const defBySlot = new Map();
    for (const d of w.units) {
        // Fighters flying a leadership escort are not air-defense batteries — skip
        // them so they hold formation instead of peeling off to fire interceptors.
        if (d.hp <= 0 || UNITS[d.type].kind !== "defense" || d.mission?.role === "leadershipEscort") continue;
        let arr = defBySlot.get(d.slot);
        if (!arr) defBySlot.set(d.slot, arr = []);
        arr.push(d);
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
        if (WARHEADS[p.warhead]?.mirv && !p.sub && !p._dead && p.progress >= MIRV_SPLIT_AT) {
            mirvSplit(w, p);
            p._dead = true;
            continue;
        }
        // Defenses fire interceptors (gated by reload + points). Only ordnance
        // actually inbound on the defender's own nation is engaged — missiles
        // transiting past a third party are not their problem.
        const inboundSlot = findTarget(w, p.targetId)?.slot;
        const defenders = inboundSlot == null ? null : defBySlot.get(inboundSlot);
        if (defenders) for (const d of defenders) {
            const ddef = UNITS[d.type];
            // Fighters kill what flies in the air column — not ballistic reentry
            // vehicles screaming down from space. BMD stays with ground/sea defenses.
            if (ddef.airSpeed && UNITS[p.type]?.ballistic) continue;
            // Orbital BMD (SBI, Orbital Laser) is a boost-phase / midcourse layer:
            // it engages ballistic ordnance only, never atmospheric threats like
            // cruise missiles or aircraft-launched munitions. Without this gate a
            // laser in orbit would try to burn every inbound cruise missile in
            // atmosphere, which the flavour text explicitly rules out.
            if (ddef.boostPhaseOnly && !UNITS[p.type]?.ballistic) continue;
            if (d.slot === p.slot || d.cooldown > 0 || p.tried.includes(d.id) || !airborne(d)) continue;
            // Engage only within the battery's annulus: inside defenseRange (outer
            // reach) but outside defenseMinRange (the keep-out gap for area ABMs
            // like THAAD, which can't kill a target that's already dived in close).
            const dToTarget = haversine(d.lng, d.lat, p.lng, p.lat);
            if (dToTarget <= defenseRange(w, d) && dToTarget >= defenseMinRange(w, d)) {
                const dn = nationOf(w, d.slot);
                if (dn.points <= 0 && netIncomeOf(w, d.slot) < 0) continue; // upkeep unmet — interceptors offline
                p.tried.push(d.id);
                // Sea-based defenses (cruiser/destroyer/Aegis afloat) reload faster
                // while replenished by a nearby oiler.
                const dReplen = ddef.domain === "sea" && replenishmentBuff(w, d) ? REPLENISH_RELOAD_MULT : 1;
                d.cooldown = (ddef.reload || DEFAULT_RELOAD) * dReplen;
                // Hypersonic-evasion: fast boost-glide weapons (off8 / Hypersonic
                // Missile Battery) shave the interceptor's hit probability by the
                // munition's evasion. Floored to a small residual chance (derived
                // from INTERCEPT_CAP, no magic number) so evasion makes a strike
                // hard to stop but never truly un-interceptable.
                const baseProb = Math.min(INTERCEPT_CAP, ddef.intercept);
                const evadeFloor = baseProb * (1 - INTERCEPT_CAP);
                const hitProb = Math.max(evadeFloor, baseProb - (p.evasion ?? 0));
                // Directed-energy weapons (Orbital Laser) fire at light-speed: the
                // kill roll resolves the instant the shot is taken, no interceptor
                // sprite chases the target across the sky. Everything else launches
                // a kinetic interceptor and steers it through the sky loop.
                if (ddef.directedEnergy) {
                    if (rand(w) < hitProb) {
                        p._dead = true;
                        w.events.push({
                            id: nextId(w, "e"),
                            t: w.time,
                            type: "intercept",
                            lng: p.lng,
                            lat: p.lat,
                            alt: p.altNorm ?? 0,
                            byLng: d.lng,
                            byLat: d.lat
                        });
                    } else {
                        w.events.push({
                            id: nextId(w, "e"),
                            t: w.time,
                            type: "miss",
                            lng: p.lng,
                            lat: p.lat,
                            alt: p.altNorm ?? 0
                        });
                    }
                    // A directed-energy hit destroys the projectile in place; no
                    // further defender fires on this frame's dead track.
                    if (p._dead) break;
                    continue;
                }
                w.interceptors.push({
                    id: nextId(w, "i"),
                    slot: d.slot,
                    srcType: d.type,   // firing battery type — drives the sky sprite variant
                    targetId: p.id,
                    hitProb,
                    speed: INTERCEPTOR_SPEED,
                    altNorm: 0,
                    launchDist: Math.max(1, dToTarget),
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
}

// Phase 4: radioactive fallout.
// Radioactive fallout: each contamination cloud ages, drifts on the prevailing
// wind, and irradiates every living city and unit inside its radius — friend or
// foe alike — for damage over time, then decays away. Pure math (intensity /
// proximity / drift are functions of age, position, and dt, no rng), so the
// sim stays deterministic. A city that fallout drops to 0 hp dies exactly like
// a direct hit — same destroy event, so the toast, explosion, and ruin fire.
export function stepFallout(w, dt) {
    if (w.effects && w.effects.length) {
        for (const fx of w.effects) {
            if (fx.type !== "fallout") continue;
            fx.age += dt;
            const driftKm = FALLOUT.driftKmPerSec * dt;
            // Cloud drifts on a compass bearing; offsetKmPolar takes math angle
            // (east = 0, CCW) so convert with `PI/2 - compassRad`.
            const brng = Math.PI / 2 - (FALLOUT.driftHeadingDeg * Math.PI) / 180;
            const drifted = offsetKmPolar({lng: fx.lng, lat: fx.lat}, driftKm, brng);
            fx.lng = drifted.lng;
            fx.lat = drifted.lat;
            const intensity = falloutIntensity(fx.age);
            if (intensity <= 0) continue;
            const rate = FALLOUT.dmgPerSec * intensity * dt;
            for (const c of w.cities) {
                if (!c.alive) continue;
                const prox = falloutProximity(haversine(fx.lng, fx.lat, c.lng, c.lat), fx.radiusKm);
                if (prox <= 0) continue;
                c.hp -= rate * prox;
                if (c.hp <= 0) {
                    c.hp = 0;
                    c.alive = false;
                    w.events.push({
                        id: nextId(w, "e"), t: w.time, type: "destroy", kind: "city",
                        cityId: c.id, lng: c.lng, lat: c.lat, slot: fx.slot, fallout: 1
                    });
                }
            }
            for (const u of w.units) {
                // The bunker is sealed against fallout too — a direct thermonuclear
                // hit or ground capture are the only ways to breach it.
                if (u.hp <= 0 || u.type === "bunker") continue;
                const prox = falloutProximity(haversine(fx.lng, fx.lat, u.lng, u.lat), fx.radiusKm);
                if (prox > 0) u.hp -= rate * prox;
            }
        }
        w.effects = w.effects.filter((fx) => fx.type !== "fallout" || fx.age < FALLOUT.lifeSec);
    }
}

// Phase 5: sensor sweep (~4 Hz) — each nation's radars pick up missiles
// entering their coverage. A track, once held, is never dropped. The
// intended victim's first pickup of ordnance inbound on them raises the
// "detected" warning — without OTH coverage of the launch site that's the
// first they hear of it.
export function stepSensors(w, dt) {
    w._det = (w._det || 0) + dt;
    if (w._det >= 0.25) {
        w._det = 0;
        // Sensor coverage is entirely unit-derived (sensorsOf), so only nations that
        // actually field units can hold a track — skip the rest of the ~222-nation
        // roster on both the build and the per-projectile test.
        const slotsWithUnits = new Set();
        for (const u of w.units) if (u.hp > 0) slotsWithUnits.add(u.slot);
        const sensors = {};
        for (const n of w.nations) if (n.alive && slotsWithUnits.has(n.slot)) sensors[n.slot] = sensorsOf(w, n.slot);
        for (const p of w.projectiles) {
            if (p._dead) continue;
            if (!p.seenBy) p.seenBy = []; // saves from before fog of war
            const tgtSlot = findTarget(w, p.targetId)?.slot;
            for (const n of w.nations) {
                if (!n.alive || p.seenBy.includes(n.slot) || !sensors[n.slot]?.length) continue;
                if (!sensorsCover(sensors[n.slot], p.lng, p.lat)) continue;
                p.seenBy.push(n.slot);
                if (n.slot === tgtSlot) w.events.push({
                    id: nextId(w, "e"), t: w.time, type: "detected", slot: n.slot, lng: p.lng, lat: p.lat
                });
            }
        }
    }
}

// Phase 6: interceptor guidance and resolution — each in-flight interceptor
// steers toward a lead-pursuit aim point and, once within kill radius, rolls
// its hit probability against the tracked projectile.
export function stepInterceptors(w, dt) {
    for (const it of w.interceptors) {
        const tgt = w.projectiles.find((p) => p.id === it.targetId && !p._dead); // byId with predicate — keep inline
        if (!tgt) {
            it._dead = true;
            continue;
        }
        // Lead pursuit: steer toward where the target *will* be, not where it is.
        // The kill test still measures the real separation (below), so leading only
        // shapes the flight path — it can't teleport a hit.
        const aim = leadInterceptPoint(it, tgt);
        it.toLng = aim[0];
        it.toLat = aim[1];
        const dist = haversine(it.lng, it.lat, tgt.lng, tgt.lat);
        const stepKm = it.speed * dt;
        it.altNorm = (tgt.altNorm ?? 0) * clamp01(1 - dist / (it.launchDist || 1));
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
            const aimDist = haversine(it.lng, it.lat, aim[0], aim[1]) || 1;
            const f = Math.min(1, stepKm / aimDist);
            it.lng += (aim[0] - it.lng) * f;
            it.lat += (aim[1] - it.lat) * f;
        }
    }
}

// Phase 7: end-of-tick cleanup — reconcile leadership losses, then prune
// every dead interceptor/projectile/unit and cap the event log.
export function stepEventPrune(w) {
    // Turn any leaders killed this tick into permanent losses BEFORE the prune,
    // while a downed ferry (hp 0) still carries its cargo to be accounted for.
    reconcileLeadership(w);

    w.interceptors = w.interceptors.filter((it) => !it._dead);
    w.projectiles = w.projectiles.filter((p) => !p._dead);
    w.units = w.units.filter((u) => u.hp > 0);
    if (w.events.length > 60) w.events.splice(0, w.events.length - 60);
}

// Phase 8: win/loss check — tallies which slots still hold a living city and
// the surviving world population, then resolves elimination (player) and
// victory (last nation standing, or population domination).
export function stepVictory(w) {
    // One pass over cities: which slots still hold a living city, and the population
    // tally for the domination check. O(cities), not O(nations × cities) — the naive
    // per-nation `cities.some(...)` was 222 × ~2565 every tick at full-world scale.
    const slotsAlive = new Set();
    let myPop = 0, totPop = 0;
    for (const c of w.cities) {
        if (!c.alive) continue;
        slotsAlive.add(c.slot);
        const p = c.pop || 0;
        totPop += p;
        if (c.slot === w.mySlot) myPop += p;
    }
    for (const n of w.nations) if (n.alive && !slotsAlive.has(n.slot)) n.alive = false;
    const me = nationOf(w, w.mySlot);
    if (!me || !me.alive) {
        // Player eliminated — immediate defeat, regardless of the surviving world.
        w.over = true;
        w.winnerSlot = null;
        w.paused = true;
        return;
    }
    // Victory: last ACTIVE nation standing, or a commanding share of surviving world
    // population. Only participating (active) nations count toward last-standing —
    // passive neutrals on the map never block a win. The domination denominator is
    // the whole world's population, so capturing neutrals counts toward the win. In
    // an all-active match this is identical to the old "last nation standing" rule.
    const aliveActive = w.nations.filter((n) => n.alive && n.active !== false);
    const dominant = totPop > 0 && myPop / totPop >= DIPLOMACY.dominationPopFrac;
    if (aliveActive.length <= 1 || dominant) {
        w.over = true;
        w.winnerSlot = me.slot;
        w.paused = true;
    }
}
