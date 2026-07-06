// Airbase and naval flight-deck mechanics: ship steaming along plotted sea
// routes, and the full aircraft lifecycle (hangar stock, takeoff, patrol
// orbit, landing pattern, rollout) for carriers and airstrips.
import {
    AIRSTRIP_RUNWAY,
    APPROACH_KM,
    AWACS_ORBIT_KM,
    CLIMB_KM,
    FIGHTER_ORBIT_BASE_KM,
    FIGHTER_ORBIT_STEP_KM,
    HANGAR_SPEC,
    HELO_CLIMB_T,
    HELO_STATION_KM,
    HOLD_PAD,
    KM_PER_DEG,
    LAUNCH_GAP,
    PATROL_FIGHTER,
    PATROL_FUEL,
    ROLL_KM,
    ROLLOUT_KM,
    TRAIL_DT,
    TRAIL_LEN,
    UNITS,
} from "../data/constants.js";
import {haversine} from "../geo/geo.js";
import {nextId} from "./worldState.js";

// Ships and ground units move continuously to a routed waypoint at their own
// speed — no point cost. Naval courses are plotted around land over the sea
// grid; ground marches are plotted around water over its complement. The
// waypoint list lives on u.route with u.dest as the final mark.
// Advance one mover along its plotted route this tick, rolling over waypoints
// mid-step so a fast unit never stalls on a mark. Longitude deltas are wrapped
// so a Pacific crossing steams through the antimeridian instead of around the
// world. `face` is the look-ahead point the UI rotates the sprite toward.
export function steamShip(u, def, dt) {
    if (!u.dest) return;
    if (!u.route?.length) u.route = [{...u.dest}]; // saves from before routes existed
    let stepKm = (def.navalSpeed || def.landSpeed) * dt;
    while (u.route.length) {
        const wp = u.route[0];
        const dx = ((wp.lng - u.lng + 540) % 360) - 180, dy = wp.lat - u.lat;
        const d = haversine(u.lng, u.lat, wp.lng, wp.lat);
        u.face = {lng: u.lng + dx, lat: wp.lat};
        if (d <= stepKm || d < 1) {
            u.lng = wp.lng;
            u.lat = wp.lat;
            u.route.shift();
            stepKm -= d;
            if (!u.route.length) {
                // Arrived — hold the final heading: park the facing marker just
                // past the mark along the approach bearing.
                const mag = Math.hypot(dx, dy) || 1;
                u.dest = null;
                u.route = null;
                u.face = {lng: u.lng + (dx / mag) * 0.5, lat: u.lat + (dy / mag) * 0.5};
                return;
            }
        } else {
            const f = stepKm / d;
            u.lng = ((u.lng + dx * f + 540) % 360) - 180;
            u.lat += dy * f;
            return;
        }
    }
}

// Point at radiusKm/ang from origin o, in the local flight frame: math angle
// (east = 0, counterclockwise), equirectangular offset with cos(lat) clamped
// near the poles. bearingTo() reads angles in this same basis.
export function polarFrom(o, radiusKm, ang) {
    const cosLat = Math.max(0.05, Math.cos((o.lat * Math.PI) / 180));
    return {
        lng: o.lng + (radiusKm / (KM_PER_DEG * cosLat)) * Math.cos(ang),
        lat: o.lat + (radiusKm / KM_PER_DEG) * Math.sin(ang)
    };
}

// Direction (math angle, east=0) from one point to another, in polarFrom's basis.
export function bearingTo(from, to) {
    const cosLat = Math.max(0.05, Math.cos((from.lat * Math.PI) / 180));
    let dLng = to.lng - from.lng; // shortest way around — never steer the long way past the antimeridian
    while (dLng > 180) dLng -= 360;
    while (dLng < -180) dLng += 360;
    return Math.atan2(to.lat - from.lat, dLng * cosLat);
}

// Rotate `cur` toward `target` by at most `maxDelta`, shortest way around.
export function turnToward(cur, target, maxDelta) {
    let d = target - cur;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return Math.abs(d) <= maxDelta ? target : cur + Math.sign(d) * maxDelta;
}

// Turn-rate-limited forward flight: bank the heading toward `desired` (never faster
// than turnRate), then advance one step along the *actual* heading. No teleporting —
// the jet always flies where it's pointed and curves onto its target.
export function advance(u, desired, speedKm, turnRate, dt) {
    u.hdg = turnToward(u.hdg == null ? desired : u.hdg, desired, turnRate * dt);
    const p = polarFrom(u, speedKm * dt, u.hdg);
    u.lng = p.lng;
    u.lat = p.lat;
    while (u.lng > 180) u.lng -= 360; // keep coordinates sane across the antimeridian
    while (u.lng < -180) u.lng += 360;
    u.face = polarFrom(u, Math.max(18, speedKm), u.hdg);
}

export function hangarCapOf(baseType, acType) {
    return HANGAR_SPEC[baseType]?.[acType] || 0;
}

// Lazily attaches hangar stock/patrol state to a base, absorbing legacy
// pre-spawned housed jets (and the old boolean `patrol` flag) into stock.
export function ensureHangar(w, base) {
    if (base.hangar) return;
    base.hangar = {...HANGAR_SPEC[base.type]};
    base.patrolSize = base.patrol ? 2 : 0; // legacy boolean patrol → 2-ship
    base.awacsPatrol = false;
    delete base.patrol;
    // Absorb legacy pre-spawned housed jets into stock.
    for (const u of w.units) {
        if (u.baseId === base.id && u.hp > 0 && u.phase === "ground") {
            const cap = hangarCapOf(base.type, u.type);
            if ((base.hangar[u.type] || 0) < cap) base.hangar[u.type] = (base.hangar[u.type] || 0) + 1;
            u.hp = 0;
        }
    }
}

// Materialize one aircraft out of stock onto the runway.
export function launchOne(w, base, type) {
    const idx = w.units.filter((u) => u.baseId === base.id && u.hp > 0).length;
    base.hangar[type]--;
    const ad = UNITS[type];
    const jet = {
        id: nextId(w, "u"), slot: base.slot, type, lng: base.lng, lat: base.lat,
        hp: ad.hp, cooldown: 0, targetId: null, warhead: ad.kind === "offense" ? "standard" : null,
        baseId: base.id, phase: "takeoff", hdg: runwayAxis(base), alt: 0, vis: 0, _to: 0,
        fuel: PATROL_FUEL,
        orbitR: type === "awacs" ? AWACS_ORBIT_KM : FIGHTER_ORBIT_BASE_KM + (idx % 4) * FIGHTER_ORBIT_STEP_KM,
        orbitA: (idx % 8) * 0.8,
    };
    w.units.push(jet);
    base.op = jet.id;
    base.launchT = LAUNCH_GAP;
}

// Per-tick base controller: keep the requested patrol pattern airborne — launch
// from stock when short (stock rotation covers refueling), recall extras.
export function runAirbase(w, base, dt) {
    ensureHangar(w, base);
    if (base.op && !w.units.some((x) => x.id === base.op && x.hp > 0)) base.op = null;
    base.launchT = Math.max(0, (base.launchT || 0) - dt);
    const ftype = PATROL_FIGHTER[base.type];
    const fighters = w.units.filter((u) => u.baseId === base.id && u.hp > 0 && u.type === ftype);
    const awacses = w.units.filter((u) => u.baseId === base.id && u.hp > 0 && u.type === "awacs");
    const wantF = base.patrolSize || 0;
    const wantA = base.awacsPatrol ? 1 : 0;
    fighters.forEach((u, i) => {
        u.recall = i >= wantF;
    });
    awacses.forEach((u, i) => {
        u.recall = i >= wantA;
    });
    const shortFinal = w.units.some((x) => x.baseId === base.id && x.hp > 0 && x.phase === "landing" && x._land === "final" && (x._alongD ?? 999) < 60);
    if (base.launchT <= 0 && base.op == null && !shortFinal) {
        if (fighters.length < wantF && (base.hangar[ftype] || 0) > 0) launchOne(w, base, ftype);
        else if (awacses.length < wantA && (base.hangar.awacs || 0) > 0) launchOne(w, base, "awacs");
    }
}

// The runway/deck axis: airstrips are fixed; a carrier's deck follows its heading.
export function runwayAxis(base) {
    if (base.type === "carrier") return base.face ? bearingTo(base, base.face) : (base.runwayA ?? Math.PI / 2);
    return base.runwayA ?? AIRSTRIP_RUNWAY;
}

// Rate-limited approach toward a target — kills every altitude pop (go-arounds,
// capture handoffs) by slewing instead of snapping.
export function slew(cur, tgt, maxDelta) {
    const d = tgt - (cur ?? tgt);
    return (cur ?? tgt) + Math.max(-maxDelta, Math.min(maxDelta, d));
}

export function recordTrail(u, dt) {
    u._trailT = (u._trailT || 0) + dt;
    if (u._trailT < TRAIL_DT) return;
    u._trailT = 0;
    (u.trail ||= []).push([u.lng, u.lat, u.alt || 0]);
    if (u.trail.length > TRAIL_LEN) u.trail.shift();
}

// Rotary-wing controller: vertical lift-off, hover on a picket point around the
// base (a distinct bearing per helo so a flight fans out), then a vertical descent
// onto the pad. No ground roll, no orbit ring, no localizer approach.
function flyRotary(w, u, def, base, dt) {
    const sp = def.airSpeed, tr = def.turnRate;
    const d = (a, b) => haversine(a.lng, a.lat, b.lng, b.lat);
    // Fly toward a point at up to `speed`, easing to a dead stop on arrival — the
    // per-step distance is capped at the remaining range so it never overshoots.
    const goHover = (pt, speed) => {
        const rng = d(u, pt);
        if (rng < 0.6) return true;
        advance(u, bearingTo(u, pt), Math.min(speed, rng / Math.max(dt, 1e-3)), tr, dt);
        return false;
    };
    const bearing = u.orbitA ?? 0;

    if (u.phase === "takeoff") {                       // straight up off the pad
        u.alt = slew(u.alt, 1, dt / HELO_CLIMB_T);
        u.vis = Math.min(1, (u.vis || 0) + dt / 0.6);
        u.face = polarFrom(base, 60, bearing);         // nose out toward its sector
        if (u.alt > 0.25 && base.op === u.id) base.op = null; // clear of the pad
        if (u.alt >= 0.98) u.phase = "station";
        return;
    }
    if (u.phase !== "recover" && u.phase !== "landing") { // hover on station (default while airborne)
        u.phase = "station";
        u.alt = slew(u.alt, 1, dt);
        u.vis = 1;
        const pt = polarFrom(base, HELO_STATION_KM, bearing);
        if (goHover(pt, sp)) u.face = polarFrom(u, 30, bearing); // arrived → hold, watching outward
        u.fuel = (u.fuel ?? 0) - dt;
        if (u.fuel <= 0 || u.recall) u.phase = "recover";
        return;
    }
    // recover / land: fly home, then settle vertically onto the pad and stow.
    const rng = d(u, base);
    if (rng > 2.5) {
        goHover(base, sp);
        u.alt = slew(u.alt, 1, dt);
        u.vis = 1;
        if (rng < 25 && base.op == null) base.op = u.id; // reserve the pad on short approach
    } else {
        if (base.op == null) base.op = u.id;
        u.alt = slew(u.alt, 0, dt / HELO_CLIMB_T);     // settle straight down
        u.face = polarFrom(base, 40, base.runwayA ?? 0);
        if (u.alt <= 0.03) {
            if (base.op === u.id) base.op = null;
            u.phase = "ground";
        }
    }
}

export function flyAircraft(w, u, def, dt) {
    const base = w.units.find((b) => b.id === u.baseId && b.hp > 0);
    if (!base) {
        u.hp = 0;
        u.face = null;
        return;
    } // base lost — the wing goes down with it
    if (!u.phase) u.phase = "ground";
    if (base.op && !w.units.some((x) => x.id === base.op && x.hp > 0)) base.op = null; // free a stuck runway
    const ra = runwayAxis(base);
    const dist = (a, b) => haversine(a.lng, a.lat, b.lng, b.lat);
    const sp = def.airSpeed, tr = def.turnRate;
    if (u.phase !== "ground" && (u.alt || 0) > 0.02) recordTrail(u, dt);

    if (u.phase === "ground") {           // legacy state — stow into the hangar
        const cap = hangarCapOf(base.type, u.type);
        if ((base.hangar?.[u.type] || 0) < cap) base.hangar[u.type] = (base.hangar[u.type] || 0) + 1;
        u.hp = 0;
        return;
    }
    // Helicopters don't use the runway/orbit/localizer model at all — they lift off
    // vertically, hover on a picket point, and set straight back down on the pad.
    if (def.rotary) {
        flyRotary(w, u, def, base, dt);
        return;
    }
    if (u.phase === "takeoff") {                       // roll straight down the runway, rotate, climb out
        // Progress is the jet's own integrated run, NOT distance from the base —
        // a moving carrier would otherwise outrun the rolling jet and stall it.
        // During the deck roll the ship's speed is added so the jet stays with it.
        const baseSpd = (base.dest && UNITS[base.type]?.navalSpeed) || 0;
        const rolling = (u._to || 0) < ROLL_KM;
        const spd = rolling ? baseSpd + sp * 0.5 : sp;
        u._to = (u._to || 0) + spd * dt;
        u.alt = u._to < ROLL_KM ? 0 : Math.min(1, (u._to - ROLL_KM) / CLIMB_KM);
        u.vis = Math.min(1, u._to / 8);
        advance(u, ra, spd, tr, dt);
        if ((u._to || 0) > ROLL_KM + 20 && base.op === u.id) base.op = null; // wheels up — runway clear for the next mover
        if (u.alt >= 1) {
            u.phase = "cruise";
            if (base.op === u.id) base.op = null;
            u._to = 0;
        }
        return;
    }
    // Orbit-hold guidance: fly the ring tangent, banking gently in or out in
    // proportion to radial error. Produces true circles and smooth joins from
    // any entry angle — no carrot-chasing wobble.
    const orbit = (R, h) => {
        const rd = Math.max(1, dist(base, u));
        const desired = bearingTo(base, u) + Math.PI / 2 + Math.max(-0.9, Math.min(0.9, (rd - R) / 80));
        advance(u, desired, sp, tr, h);
    };
    if (u.phase === "cruise") {                        // hold the patrol ring
        u.alt = slew(u.alt, 1, dt / 1.5);
        u.vis = 1;
        orbit(u.orbitR, dt);
        u.fuel = (u.fuel ?? 0) - dt;
        if (u.fuel <= 0 || u.recall) u.phase = "hold"; // bingo fuel / recalled → recover
        return;
    }
    if (u.phase === "hold") {                          // stack on a wider ring, waiting for the runway
        u.alt = slew(u.alt, 1, dt / 1.5);
        u.vis = 1;
        orbit(u.orbitR + HOLD_PAD, dt);
        // Recovery doesn't reserve the runway — the strip is only owned on short
        // final/rollout, so departures keep flowing between arrivals.
        const inPattern = w.units.filter((x) => x.baseId === base.id && x.hp > 0 && x.phase === "landing").length;
        if (inPattern < 2) {
            u.phase = "landing";
            u._land = "toFinal";
        }
        return;
    }
    if (u.phase === "landing") {                       // intercept the localizer, final approach, touchdown, rollout
        if (u._land === "toFinal") {
            // Localizer-intercept CONTROLLER (no waypoints, so nothing to orbit):
            // fly the runway heading plus a cross-track correction angle — up to
            // ~63° cut toward the centerline, easing to zero as the jet lines up.
            // Too close in (or on the departure side), fly an outbound leg to a
            // pattern-entry region on its own side, then the controller takes over.
            u.alt = 1;
            u.vis = 1;
            const cosLat = Math.max(0.05, Math.cos((base.lat * Math.PI) / 180));
            let dLng = u.lng - base.lng;
            while (dLng > 180) dLng -= 360;
            while (dLng < -180) dLng += 360;
            const px = dLng * cosLat * KM_PER_DEG, py = (u.lat - base.lat) * KM_PER_DEG;
            const axx = Math.cos(ra), axy = Math.sin(ra);
            const along = -(px * axx + py * axy);        // km out on the APPROACH side of the threshold
            const cross = -px * axy + py * axx;          // signed cross-track distance from the centerline
            const LEAD = Math.min(160, Math.max(70, (sp / tr) * 2.2));
            if (along > 40) {
                const desired = ra + Math.max(-1.1, Math.min(1.1, -cross / 40));
                advance(u, desired, sp, tr, dt);
                let dh = ra - (u.hdg ?? ra);
                while (dh > Math.PI) dh -= 2 * Math.PI;
                while (dh < -Math.PI) dh += 2 * Math.PI;
                if (Math.abs(cross) < 15 && Math.abs(dh) < 0.9) u._land = "final";
            } else {
                // Outbound to pattern entry: offset to the jet's own side so the
                // turn back in is a single smooth procedure turn.
                const side = cross >= 0 ? 1 : -1;
                const back = polarFrom(base, LEAD * 1.6, ra + Math.PI);
                const entry = polarFrom(back, 70 * side, ra + Math.PI / 2);
                advance(u, bearingTo(u, entry), sp, tr, dt);
            }
        } else if (u._land === "final") {
            // Final is the same heading-based control as the intercept, just
            // tighter: runway heading plus a small cross-track cut, throttled
            // back, altitude slewing down the glide slope. No sideways position
            // bleeding — the jet only ever moves where its nose points.
            const cosLat = Math.max(0.05, Math.cos((base.lat * Math.PI) / 180));
            let dLng = u.lng - base.lng;
            while (dLng > 180) dLng -= 360;
            while (dLng < -180) dLng += 360;
            const px = dLng * cosLat * KM_PER_DEG, py = (u.lat - base.lat) * KM_PER_DEG;
            const axx = Math.cos(ra), axy = Math.sin(ra);
            const along = -(px * axx + py * axy);
            const cross = -px * axy + py * axx;
            u._alongD = along;
            // Blown approach (short and still off the centerline) → go around.
            if (along < 10 && Math.abs(cross) > 6) {
                u._land = null;
                u._alongD = null;
                u.phase = "hold";
                return;
            }
            // Short final: claim the strip. Occupied by someone else → go around.
            if (along < 35) {
                if (base.op == null) base.op = u.id;
                else if (base.op !== u.id) {
                    u._land = null;
                    u._alongD = null;
                    u.phase = "hold";
                    return;
                }
            }
            const desired = ra + Math.max(-0.6, Math.min(0.6, -cross / 25));
            advance(u, desired, sp * 0.7, tr, dt);
            u.alt = slew(u.alt, Math.max(0, Math.min(1, along / (APPROACH_KM * 0.85))), dt / 1.2);
            u.vis = 1;
            if (along <= sp * 0.7 * dt + 2 && Math.abs(cross) < 6) {
                u._land = "rollout";
                u._roll = 0;
                u.alt = Math.min(u.alt, 0.05);
            }
        } else {                                         // touchdown — roll out and decelerate
            const decel = Math.max(0.18, 1 - (u._roll || 0) / ROLLOUT_KM);
            advance(u, ra, sp * 0.5 * decel, tr, dt);
            u._roll = (u._roll || 0) + sp * 0.5 * decel * dt;
            u.alt = 0;
            u.vis = Math.max(0, 1 - (u._roll || 0) / (ROLLOUT_KM * 0.85));
            if ((u._roll || 0) >= ROLLOUT_KM) {
                // Taxi in — the airframe returns to hangar stock (stock rotation
                // relaunches a fresh one if the patrol still wants it up).
                const cap = hangarCapOf(base.type, u.type);
                if ((base.hangar?.[u.type] || 0) < cap) base.hangar[u.type] = (base.hangar[u.type] || 0) + 1;
                if (base.op === u.id) base.op = null;
                u.hp = 0;
            }
        }
        return;
    }
}
