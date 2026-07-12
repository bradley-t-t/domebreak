// The per-tick simulation phases: research/production progress, unit movement
// and firing, projectile flight and interception, sensor sweeps, fallout, and
// end-of-tick cleanup/victory checks. step() orchestrates these in order.
import {
    initialWarhead,
    CITY_REGEN,
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
    isAttacker,
} from "../data/constants.js";
import {haversine, withinKm} from "../geo/geo.js";
import {nationOf, nextId, rand} from "./worldState.js";
import {clamp, clamp01} from "../../lib/math.js";
import {offsetKmPolar, unwrapLng} from "../../lib/geo.js";
import {
    airborne,
    atWar,
    defenseRange,
    defenseMinRange,
    falloutIntensity,
    falloutProximity,
    hasSurrendered,
    netIncomeFromAgg,
    sensorsCover,
    sensorsOf,
    slotEconomyAggregates,
    vitalityOf,
    replenishmentBuff,
} from "./queries.js";
import {advanceHoming, directFire, findTarget, launch, leadInterceptPoint, mirvSplit, nearestEnemyTarget, resolveHit, targetIndexOf, trackPoint} from "./combat.js";
import {flyAircraft, launchStrikeSortie, runAirbase, steamShip} from "./aircraft.js";
import {STRIKE} from "../data/constants.js";
import {ensureProd} from "./production.js";
import {reconcileLeadership, updateCommand} from "./leadership.js";
import {REPLENISH_RELOAD_MULT} from "../data/constants.js";
import {spawnQueuedUnit} from "./tickSpawn.js";

// Per-slot prosperity multiplier for population growth: the nation's effective
// GDP (surviving economy × baseline GDP + built industry — gdpOf's formula) over
// its baseline GDP, clamped to [gdpGrowthFloor, gdpGrowthCap]. Batched in one
// pass over cities+units — calling gdpOf() per nation would be O(nations × world)
// every tick. Slots without a GDP-rated nation (tests, legacy saves) grow at 1×.
function prosperityBySlot(w) {
    const {gdpGrowthFloor, gdpGrowthCap} = POPULATION;
    const econ = new Map(), industry = new Map();
    for (const c of w.cities) {
        if (!c.alive) continue;
        econ.set(c.slot, (econ.get(c.slot) || 0) + (c.econ || 0) * vitalityOf(c));
    }
    for (const u of w.units ?? []) {
        const g = u.hp > 0 ? UNITS[u.type].gdpAdd || 0 : 0;
        if (g) industry.set(u.slot, (industry.get(u.slot) || 0) + g);
    }
    const out = new Map();
    for (const n of w.nations ?? []) {
        if (!(n.gdp > 0)) continue;
        const gdp = n.gdp * (econ.get(n.slot) || 0) + (industry.get(n.slot) || 0);
        out.set(n.slot, clamp(gdp / n.gdp, gdpGrowthFloor, gdpGrowthCap));
    }
    return out;
}

// Population growth: each living city's people grow toward a ceiling, scaled by
// vitality so healthy cities repopulate over a match and battered ones barely
// recover, and by national prosperity (prosperityBySlot above) so a wrecked or
// conquered-away economy slows repopulation and built industry quickens it. Pure
// and deterministic — a function of stored pop/hp, nation GDP, and dt, no RNG.
// Raw pop is capped at pop0 * growthCapMult; pop0 falls back to current pop for
// legacy saves.
export function growCities(w, dt) {
    if (dt <= 0) return;
    const {growthPerSec, growthCapMult} = POPULATION;
    if (growthPerSec <= 0 || growthCapMult <= 1) return;
    const prosperity = prosperityBySlot(w);
    for (const c of w.cities) {
        if (!c.alive) continue;
        const cap = (c.pop0 ?? c.pop) * growthCapMult;
        if (c.pop >= cap) continue;
        const rate = growthPerSec * vitalityOf(c) * (prosperity.get(c.slot) ?? 1);
        c.pop = Math.min(cap, c.pop * (1 + rate * dt));
    }
}

// City reconstruction: every damaged-but-living city rebuilds toward full health
// at CITY_REGEN.hpFracPerSec of maxHp per game-second — provided its people are
// still there (pop > 0) and its owner is still standing: alive, and not inside
// the post-surrender window a lost war opens (hasSurrendered). A destroyed city
// (alive=false — its population is gone) never comes back. Flat fraction of
// maxHp, so a battered capital rebuilds on the same timescale as a town.
export function healCities(w, dt) {
    if (dt <= 0) return;
    const rate = CITY_REGEN.hpFracPerSec;
    if (rate <= 0) return;
    const standing = new Set();
    for (const n of w.nations ?? []) {
        if (n.alive && !hasSurrendered(w, n)) standing.add(n.slot);
    }
    for (const c of w.cities) {
        if (!c.alive || !(c.pop > 0) || c.hp >= c.maxHp || !standing.has(c.slot)) continue;
        c.hp = Math.min(c.maxHp, c.hp + c.maxHp * rate * dt);
    }
}

// Instantaneous rate of change of a nation's LIVING population (populationOf, in
// people per game-second), derived from the very model growCities/healCities apply
// so the HUD signifiers never drift from the sim. Displayed population is
// Σ pop·vitality, so each living city contributes two positive terms:
//   • growth   — growCities lifts pop by pop·growthPerSec·v·prosperity; its effect
//                on pop·v is v× that (only while below the pop cap).
//   • recovery — healCities lifts hp→vitality by hpFracPerSec/sec; its effect on
//                pop·v is pop·hpFracPerSec (only while damaged and the owner stands).
// Returns ≥ 0 (this model never sheds population — that happens through discrete
// combat, not here); ~0 means every holding is capped, wrecked, or its owner has
// surrendered. Pure, no mutation. Feeds PopTrend; combat losses are event-driven
// and deliberately not reflected.
export function populationTrendOf(w, slot) {
    const {growthPerSec, growthCapMult} = POPULATION;
    const healRate = CITY_REGEN.hpFracPerSec;
    const canGrow = growthPerSec > 0 && growthCapMult > 1;
    const prosperity = canGrow ? (prosperityBySlot(w).get(slot) ?? 1) : 0;
    const n = (w.nations ?? []).find((x) => x.slot === slot);
    const standing = !!n && n.alive && !hasSurrendered(w, n);
    let rate = 0;
    for (const c of w.cities) {
        if (c.slot !== slot || !c.alive) continue;
        const v = vitalityOf(c);
        if (canGrow && c.pop < (c.pop0 ?? c.pop) * growthCapMult) rate += v * (c.pop * growthPerSec * v * prosperity);
        if (standing && healRate > 0 && c.pop > 0 && c.hp < c.maxHp) rate += c.pop * healRate;
    }
    return rate;
}

// --- step() phases -----------------------------------------------------

// Phase 1: economy — leadership command factor, income accrual, then each
// nation's production line advances and (on completion) spawns its unit.
// (No tech tree — everything is unlocked at world creation.)
export function stepEconomy(w, dt) {
    // Refresh each nation's leadership command factor before the economy reads it
    // (the income formula scales by n.commandMult).
    updateCommand(w);
    // One batched pass over cities+units for every nation's income figures —
    // netIncomeOf per nation re-scans the whole world per nation, which at
    // full-world scale (~222 nations, neutrals included) dominated the tick.
    const agg = slotEconomyAggregates(w);
    for (const n of w.nations) if (n.alive) n.points = Math.max(0, n.points + netIncomeFromAgg(n, agg.get(n.slot)) * dt);

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

// Standing-order target selection shared by aircraft and airbases. A Hostile unit
// acquires the nearest enemy it can see within `scanKm`; a Defensive one only locks
// whoever last attacked it (still alive and at war), so it returns fire but never
// starts a fight. Throttled by STRIKE.reacquireSec so the scan isn't paid per tick.
// Mutates `u.targetId`; returns nothing.
function autoAcquireTarget(w, u, idx, now, scanKm, scanOpts) {
    if (u.targetId != null || (now - (u._acqT ?? -1e9)) < STRIKE.reacquireSec) return;
    u._acqT = now;
    if ((u.stance || "defensive") === "hostile") {
        const t = nearestEnemyTarget(w, u, scanKm, scanOpts);
        if (t) u.targetId = t.id;
    } else if (u._threatBy != null && (now - (u._threatT ?? -1e9)) <= STRIKE.threatMemorySec) {
        const a = idx.units.get(u._threatBy);
        if (a && a.hp > 0 && atWar(w, u.slot, a.slot)) u.targetId = a.id;
        else u._threatBy = null;
    }
}

// Airstrip offensive posture: keep or acquire a standing sortie target, then launch
// a bomber package at it whenever off cooldown and the target is within sortie range.
// The target order persists (a "standing" strike) so a fresh package flies each time
// the cooldown clears, until the target dies, leaves the war, or is stood down.
function airbaseSortie(w, base, def, idx, dt, now) {
    base.sortieCd = Math.max(0, (base.sortieCd || 0) - dt);
    // Bombers strike ground and cities — a Hostile strip doesn't scramble a heavy
    // package to chase enemy jets (its own CAP handles those).
    autoAcquireTarget(w, base, idx, now, def.sortieKm, {includeAircraft: false});
    if (base.targetId == null) return;
    const t = findTarget(w, base.targetId, idx);
    if (!t || !t.alive || !atWar(w, base.slot, t.slot)) { base.targetId = null; return; }
    if (base.sortieCd <= 0 && haversine(base.lng, base.lat, t.lng, t.lat) <= def.sortieKm) {
        launchStrikeSortie(w, base, base.targetId);
    }
}

// Phase 2: unit movement and firing — naval/land march, aircraft flight
// (sub-stepped for turn-rate stability), and ground/warhead-platform firing
// against a locked target once in range and off cooldown.
export function stepMovement(w, dt) {
    const now = w.time;
    // Per-tick lookups shared by every unit below: id -> entity for target and
    // airbase resolution (kills the O(cities + units) scan per armed unit), and
    // baseId -> based aircraft for the airbase controllers (each wing base was
    // re-filtering the whole unit list several times per tick). Aircraft launched
    // mid-tick aren't in these; their base's controller already ran this tick and
    // every consumer re-checks hp at use, so nothing reads stale.
    const idx = targetIndexOf(w);
    const basedAircraft = new Map();
    for (const u of w.units) {
        if (!u.baseId) continue;
        let arr = basedAircraft.get(u.baseId);
        if (!arr) basedAircraft.set(u.baseId, arr = []);
        arr.push(u);
    }
    for (const u of w.units) {
        if (u.hp <= 0) continue;
        u.cooldown = Math.max(0, u.cooldown - dt);
        const def = UNITS[u.type];
        // Orbital sats sweep their parallel of latitude: longitude advances every
        // tick, latitude is held wherever the player placed them. That's how a
        // reconsat's ground track walks around the globe under its orbit and how
        // an orbital-strike platform's engagement footprint gets to any target on
        // its parallel — you have to wait for the orbit to bring it overhead. Wrap
        // longitude at ±180 so downstream haversine / projection code stays in the
        // canonical range.
        if (def.orbital && def.orbitSpeedDegPerSec) {
            let lng = u.lng + def.orbitSpeedDegPerSec * dt;
            if (lng > 180) lng -= 360;
            else if (lng < -180) lng += 360;
            u.lng = lng;
        }
        if (def.wing) runAirbase(w, u, dt, basedAircraft.get(u.id));
        if (def.sortieKm) airbaseSortie(w, u, def, idx, dt, now);
        // A patrolling offensive aircraft handed a standing target (Command Attack, a
        // Battle Plan, or Hostile auto-engage) breaks off onto a strike mission; a
        // Defensive one only does so to retaliate. Runs before the flight dispatch so
        // flyAircraft picks the mission up this same tick.
        if (def.airSpeed && u.baseId && isAttacker(def) && !u.mission) {
            autoAcquireTarget(w, u, idx, now, Math.max(def.radarKm || 0, STRIKE.a2aRangeKm));
            if (u.targetId != null) u.mission = {role: "strike", targetId: u.targetId, homeId: u.baseId, phase: "outbound", passes: 0};
        }
        if ((def.navalSpeed || def.landSpeed) && u.dest) steamShip(u, def, dt);
        else if (def.airSpeed && u.baseId) {
            // Sub-step the flight physics: at 4×–10× game speed a whole tick can
            // be a full second — one turn-rate-limited update per tick makes the
            // heading saw-tooth around the path. Integrating in ≤80 ms slices
            // keeps the nose on the velocity vector at any speed. The home base is
            // resolved once for the whole tick — it cannot change between slices
            // (only this unit advances during them), and finding it per slice was
            // an O(units) scan multiplied by up to ~12 slices per aircraft.
            const home = idx.units.get(u.baseId);
            const base = home && home.hp > 0 ? home : null;
            let rem = dt;
            while (rem > 1e-6 && u.hp > 0) {
                const h = Math.min(0.08, rem);
                flyAircraft(w, u, def, h, base);
                rem -= h;
            }
        }
        // Shoot-and-scoot: a road-mobile warhead platform (the TEL) holds fire while
        // it has a march destination — it must halt to launch.
        if (isAttacker(def) && !def.wing && u.targetId && u.cooldown <= 0 && airborne(u) && !(def.warheads && def.landSpeed && u.dest)) {
            const t = findTarget(w, u.targetId, idx);
            if (!t || !t.alive || !atWar(w, u.slot, t.slot)) {
                u.targetId = null;
                continue;
            }
            const n = nationOf(w, u.slot);
            // Aircraft close on the target and release at short range — a ground/city
            // strike from a tight overhead standoff, an air target with a longer-reach
            // air-to-air missile. Every other platform fires out to its full hardware
            // range. The munition tag drives the sky sprite and (a2a) homing flight.
            const tgtAir = t.kind === "unit" && !!UNITS[t.ref.type]?.airSpeed;
            const reach = def.airSpeed ? (tgtAir ? STRIKE.a2aRangeKm : Math.max(def.range, STRIKE.loiterKm)) : def.range;
            if (haversine(u.lng, u.lat, t.lng, t.lat) <= reach) {
                ensureProd(n);
                if (def.targets === "land" || def.directedEnergy) {
                    // Damage lands straight on the target — no interceptable projectile,
                    // no SAM/THAAD engagement. Two kinds of shooter take this path:
                    // ground forces (infantry/tank/artillery, targets:"land"), and
                    // directed-energy weapons (the orbital laser's speed-of-light beam,
                    // which can't be shot down). Distinct from the missile and warhead
                    // platforms that loft the interceptable arsenal.
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
                        const muni = def.airSpeed ? (tgtAir ? "a2a" : "bomb") : null;
                        launch(w, u, t, _wh, muni ? {muni, homing: muni === "a2a"} : undefined);
                        // Ships rearming under a Replenishment Ship recycle faster.
                        const replen = def.domain === "sea" && replenishmentBuff(w, u) ? REPLENISH_RELOAD_MULT : 1;
                        u.cooldown = def.reload * replen;
                        // A strike aircraft counts its passes so it breaks off and
                        // recovers after STRIKE.maxPasses (see flyStrike).
                        if (u.mission?.role === "strike") u.mission.passes = (u.mission.passes || 0) + 1;
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
    // Per-tick memo of each defender's engagement reach and replenishment buff.
    // Both are invariant for a defender within a tick but were recomputed per
    // projectile — and each defenseRange() call hides an O(units) radar-link scan,
    // which multiplied out to the single hottest path of a saturation attack.
    const idx = targetIndexOf(w);
    const reachOf = new Map();   // defender id -> outer engagement radius
    const replenOf = new Map();  // defender id -> replenishment reload multiplier

    for (const p of w.projectiles) {
        // Homing air-to-air rounds chase a moving jet and resolve on their own — no
        // ballistic arc, no MIRV split, and (being a short-range dogfight missile)
        // no interceptor engagement.
        if (p.homing) {
            advanceHoming(w, p, dt, idx);
            continue;
        }
        p.travelled += (p.speed ?? MISSILE_SPEED) * dt;
        p.progress = Math.min(1, p.travelled / (p.dist || 1));
        const pos = trackPoint(p, p.progress);
        p.lng = pos[0];
        p.lat = pos[1];
        // MIRVs descend from their release altitude; whole missiles fly the sine arc.
        p.altNorm = p.altStart != null ? p.altStart * (1 - p.progress) : Math.sin(p.progress * Math.PI);
        if (WARHEADS[p.warhead]?.mirv && !p.sub && !p._dead && p.progress >= MIRV_SPLIT_AT) {
            mirvSplit(w, p, idx);
            p._dead = true;
            continue;
        }
        // Defenses fire interceptors (gated by reload + points). Only ordnance
        // actually inbound on the defender's own nation is engaged — missiles
        // transiting past a third party are not their problem.
        const inboundSlot = findTarget(w, p.targetId, idx)?.slot;
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
            let reach = reachOf.get(d.id);
            if (reach === undefined) reachOf.set(d.id, reach = defenseRange(w, d));
            const dToTarget = haversine(d.lng, d.lat, p.lng, p.lat);
            if (dToTarget <= reach && dToTarget >= defenseMinRange(w, d)) {
                p.tried.push(d.id);
                // Sea-based defenses (cruiser/destroyer/Aegis afloat) reload faster
                // while replenished by a nearby oiler.
                let dReplen = replenOf.get(d.id);
                if (dReplen === undefined) {
                    replenOf.set(d.id, dReplen = ddef.domain === "sea" && replenishmentBuff(w, d) ? REPLENISH_RELOAD_MULT : 1);
                }
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
            resolveHit(w, p, idx);
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
                // Cheap reject before the trig: the whole world is scanned per cloud,
                // and almost everything is nowhere near it.
                if (!withinKm(fx.lng, fx.lat, c.lng, c.lat, fx.radiusKm)) continue;
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
                if (!withinKm(fx.lng, fx.lat, u.lng, u.lat, fx.radiusKm)) continue;
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
        const idx = targetIndexOf(w);
        for (const p of w.projectiles) {
            if (p._dead) continue;
            if (!p.seenBy) p.seenBy = []; // saves from before fog of war
            const tgtSlot = findTarget(w, p.targetId, idx)?.slot;
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
    // Id -> projectile once per tick: resolving each interceptor's target with a
    // linear find was O(interceptors x projectiles) — the pairing that blows up in
    // exactly the saturation engagements interceptors exist for.
    const projById = new Map();
    for (const p of w.projectiles) projById.set(p.id, p);
    for (const it of w.interceptors) {
        const live = projById.get(it.targetId);
        const tgt = live && !live._dead ? live : null;
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
        // The interceptor closes far faster than its target, so lead pursuit carries
        // it to the merge point ahead of the slower missile. Track the range so we
        // can tell the terminal phase from the approach.
        const receding = it.prevDist != null && dist > it.prevDist;
        it.prevDist = dist;
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
        } else if (receding) {
            // Closest approach has passed without ever reaching the kill radius, so
            // the pass is a miss. Fuze out here rather than turning the round back
            // around toward a target that is now behind it.
            it._dead = true;
            w.events.push({
                id: nextId(w, "e"),
                t: w.time,
                type: "miss",
                lng: it.lng,
                lat: it.lat,
                alt: it.altNorm ?? 0
            });
        } else {
            // Remember the pre-move fix so the sky renderer can face the nose along
            // the round's real direction of travel instead of a stale aim point.
            it.pLng = it.lng;
            it.pLat = it.lat;
            // Unwrap the aim longitude to the interceptor's side of the antimeridian
            // before stepping. Raw interpolation toward a normalized aim (aim +179,
            // round at -179 → delta 358°) lurched the round the LONG way around the
            // planet — while aimDist (haversine, periodic) stayed small, so f was
            // large and the round teleported tens of degrees in one tick. The classic
            // "interceptors go crazy near the dateline / over the pole" bug.
            const aimLng = unwrapLng(aim[0], it.lng);
            const aimDist = haversine(it.lng, it.lat, aimLng, aim[1]) || 1;
            const f = Math.min(1, stepKm / aimDist);
            it.lng += (aimLng - it.lng) * f;
            it.lat += (aim[1] - it.lat) * f;
            // Keep the stored longitude canonical for saves/snapshots and the
            // renderer's own unwrap chains.
            if (it.lng > 180) it.lng -= 360;
            else if (it.lng < -180) it.lng += 360;
        }
    }
}

// Phase 7: end-of-tick cleanup — reconcile leadership losses, then prune
// every dead interceptor/projectile/unit and cap the event log.
export function stepEventPrune(w) {
    // Turn any leaders killed this tick into permanent losses BEFORE the prune,
    // while a downed ferry (hp 0) still carries its cargo to be accounted for.
    reconcileLeadership(w);

    // Rebuild each array only when something in it actually died — the
    // unconditional filters re-allocated all three every tick, pure GC churn on
    // the overwhelmingly common no-deaths tick.
    if (w.interceptors.some((it) => it._dead)) w.interceptors = w.interceptors.filter((it) => !it._dead);
    if (w.projectiles.some((p) => p._dead)) w.projectiles = w.projectiles.filter((p) => !p._dead);
    if (w.units.some((u) => u.hp <= 0)) w.units = w.units.filter((u) => u.hp > 0);
    if (w.events.length > 60) w.events.splice(0, w.events.length - 60);
}

// Phase 8: win/loss check — tallies which slots still hold a living city and
// the surviving world population, flips newly-eliminated nations, then resolves
// the end state. Online (server-authoritative, no single "me") runs to the last
// active nation or a population dominator; solo ends the moment the player is
// eliminated (defeat) or wins by last-standing/domination.
export function stepVictory(w) {
    // One pass over cities: which slots still hold a living city, plus the population
    // tally (total and per-slot) for the domination check. O(cities), not
    // O(nations × cities) — the naive per-nation `cities.some(...)` was 222 × ~2565
    // every tick at full-world scale.
    const slotsAlive = new Set();
    const popBySlot = new Map();
    let totPop = 0;
    for (const c of w.cities) {
        if (!c.alive) continue;
        slotsAlive.add(c.slot);
        const p = c.pop || 0;
        totPop += p;
        if (p) popBySlot.set(c.slot, (popBySlot.get(c.slot) || 0) + p);
    }
    // A nation with no living city is eliminated — flip it once here so both the
    // tally below and every client snapshot see it as out of the war. A player
    // learns of their OWN elimination from this flag (LiveGame's spectate flow).
    for (const n of w.nations) if (n.alive && !slotsAlive.has(n.slot)) n.alive = false;

    // Victory: last ACTIVE nation standing, or a commanding share of surviving world
    // population. Only participating (active) nations count toward last-standing —
    // passive neutrals on the map never block a win. The domination denominator is
    // the whole world's population, so capturing neutrals counts toward the win.
    const aliveActive = w.nations.filter((n) => n.alive && n.active !== false);
    const dominationFrac = w.rules?.dominationPopFrac ?? DIPLOMACY.dominationPopFrac;

    if (w.meta?.mode === "online") {
        // Online has no single "me": the server world is authoritative for every
        // slot, so one player's elimination must NOT end the match. It runs until a
        // last active nation stands or one seizes the domination share — and THAT
        // nation is crowned (any human or AI), never a hardcoded slot.
        let over = false, winnerSlot = null;
        if (aliveActive.length <= 1) {
            over = true;
            winnerSlot = aliveActive[0]?.slot ?? null;
        } else if (totPop > 0) {
            const dom = aliveActive.find((n) => (popBySlot.get(n.slot) || 0) / totPop >= dominationFrac);
            if (dom) { over = true; winnerSlot = dom.slot; }
        }
        if (over) {
            w.over = true;
            w.winnerSlot = winnerSlot;
            w.paused = true;
        }
        return;
    }

    // Solo: the player's own elimination is an immediate defeat, regardless of the
    // surviving world; victory is the player being last active standing or reaching
    // the domination share. Identical to the pre-online behavior.
    const me = nationOf(w, w.mySlot);
    if (!me || !me.alive) {
        w.over = true;
        w.winnerSlot = null;
        w.paused = true;
        return;
    }
    const myPop = popBySlot.get(w.mySlot) || 0;
    const dominant = totPop > 0 && myPop / totPop >= dominationFrac;
    if (aliveActive.length <= 1 || dominant) {
        w.over = true;
        w.winnerSlot = me.slot;
        w.paused = true;
    }
}
