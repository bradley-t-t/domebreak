// Aircraft flight state-machine phase helpers: orbit/turn kinematics primitives,
// hangar-capacity lookup, and the per-phase flight controllers (leadership ferry
// legs, escort formation, rotary-wing patrol, and the fixed-wing climb/cruise/
// hold/approach/landing pattern) driven by aircraft.js's flyAircraft/flyFerry
// dispatchers.
import {
    APPROACH_KM,
    CLIMB_KM,
    FLIGHT,
    HANGAR_SPEC,
    HELO_CLIMB_T,
    HELO_PATROL_RATE,
    HELO_STATION_KM,
    HOLD_PAD,
    KM_PER_DEG,
    LEADERSHIP,
    ROLL_KM,
    ROLLOUT_KM,
    TRAIL_DT,
    TRAIL_LEN,
    UNITS,
} from "../data/constants.js";
import {haversine} from "../geo/geo.js";
import {cosLatSafe, offsetKmPolar, unwrapLng, wrapAnglePi} from "../../lib/geo.js";
import {clamp, clamp01, clampSym} from "../../lib/math.js";
import {nationOf} from "./worldState.js";
import {idMapOf} from "./combat.js";

// Point at radiusKm/ang from origin o, in the local flight frame: math angle
// (east = 0, counterclockwise), equirectangular offset with cos(lat) clamped
// near the poles. bearingTo() reads angles in this same basis.
export const polarFrom = offsetKmPolar;

// Direction (math angle, east=0) from one point to another, in polarFrom's basis.
export function bearingTo(from, to) {
    const dLng = unwrapLng(to.lng - from.lng, 0);
    return Math.atan2(to.lat - from.lat, dLng * cosLatSafe(from.lat));
}

// Rotate `cur` toward `target` by at most `maxDelta`, shortest way around.
function turnToward(cur, target, maxDelta) {
    const d = wrapAnglePi(target - cur);
    return Math.abs(d) <= maxDelta ? target : cur + Math.sign(d) * maxDelta;
}

// Turn-rate-limited forward flight: bank the heading toward `desired` (never faster
// than turnRate), then advance one step along the *actual* heading. No teleporting —
// the jet always flies where it's pointed and curves onto its target.
export function advance(u, desired, speedKm, turnRate, dt) {
    u.hdg = turnToward(u.hdg == null ? desired : u.hdg, desired, turnRate * dt);
    const p = polarFrom(u, speedKm * dt, u.hdg);
    u.lng = unwrapLng(p.lng, 0); // keep coordinates sane across the antimeridian
    u.lat = p.lat;
    u.face = polarFrom(u, Math.max(18, speedKm), u.hdg);
}

export function hangarCapOf(baseType, acType) {
    return HANGAR_SPEC[baseType]?.[acType] || 0;
}

// Rate-limited approach toward a target — kills every altitude pop (go-arounds,
// capture handoffs) by slewing instead of snapping.
export function slew(cur, tgt, maxDelta) {
    const base = cur ?? tgt;
    return base + clampSym(tgt - base, maxDelta);
}

export function recordTrail(u, dt) {
    u._trailT = (u._trailT || 0) + dt;
    if (u._trailT < TRAIL_DT) return;
    u._trailT = 0;
    (u.trail ||= []).push([u.lng, u.lat, u.alt || 0]);
    if (u.trail.length > TRAIL_LEN) u.trail.shift();
}

// Formation escort: hold a stand-off point off the leadership ferry until the run
// ends (ferry lands/stows or is lost), then return to the home airstrip and stow
// back into fighter stock. Pure flight — the combat loops skip escort-mission
// units, so an escort never breaks formation to shoot.
export function flyEscort(w, u, def, dt) {
    const m = u.mission;
    const sp = def.airSpeed, tr = def.turnRate;
    const dist = (a, b) => haversine(a.lng, a.lat, b.lng, b.lat);
    u.vis = Math.min(1, (u.vis || 0) + dt / 0.8);
    if ((u.alt || 0) > 0.02) recordTrail(u, dt);
    // Id lookups via the amortized id map — these run once per flight sub-step
    // (up to ~12 per aircraft per tick), where a linear scan multiplied badly.
    const units = idMapOf(w.units);
    const leadRef = units.get(m.leadId);
    const lead = leadRef && leadRef.hp > 0 && leadRef.mission?.role === "leadershipFerry" ? leadRef : null;
    const homeRef = units.get(m.homeId);
    const home = homeRef && homeRef.hp > 0 ? homeRef : null;
    if (lead) {
        // Fan the escorts around the ferry by index so a flight spreads out, and
        // match the ferry's altitude so they climb/descend with it on the pads.
        const escorts = Math.max(1, LEADERSHIP.escortsPerFerry);
        const ang = ((m.idx || 0) / escorts) * 2 * Math.PI + Math.PI / 2;
        const fp = polarFrom(lead, LEADERSHIP.escortOffsetKm, ang);
        u.alt = Math.max(0.35, lead.alt || 0);
        const rng = dist(u, fp);
        const speed = clamp(rng * 1.4, sp * 0.35, sp);
        advance(u, bearingTo(u, fp), speed, tr * 2, dt);
        return;
    }
    // Run over (ferry stowed or shot down): recover to the home strip and stow.
    if (!home) {
        u.hp = 0;
        u.face = null;
        return;
    }
    u.alt = 1;
    if (dist(u, home) <= LEADERSHIP.arriveKm) {
        const cap = hangarCapOf(home.type, u.type);
        if ((home.hangar?.[u.type] || 0) < cap) home.hangar[u.type] = (home.hangar[u.type] || 0) + 1;
        u.hp = 0; // stow into fighter stock
        return;
    }
    advance(u, bearingTo(u, home), sp, tr, dt);
}

// Point-to-point leadership ferry, direction set by mission.mode. Flies a straight
// line toward the current waypoint (climbing to cruise), sets down for a timed
// load/unload, then flies the next leg, then home to stow. In "shelter" mode it
// picks up from a city and drops at the bunker (sheltered); in "release" mode it
// picks up from the bunker (sheltered) and drops at a city. Cargo that can't be
// delivered is redeposited safely (or lost only when nothing valid remains).
// toPickup: nothing to lift here → skip ahead; otherwise fly to the pickup
// point and, on arrival, start the timed load.
function ferryToPickup(u, m, pickup, sourceEmpty, flyTo) {
    if (sourceEmpty || !pickup) {
        m.phase = m.cargo > 0 ? "toDrop" : "toHome"; // nothing to lift here
        return;
    }
    if (flyTo(pickup)) {
        m.phase = "loading";
        m.timer = LEADERSHIP.loadSec;
        u.alt = 0;
    }
}

// loading: sit on the pad for the timed load, then take on as much cargo as
// there's room for and source has, before moving on.
function ferryLoading(u, m, dt, release, n, city) {
    u.alt = 0;
    m.timer -= dt;
    if (m.timer <= 0) {
        const room = LEADERSHIP.perPlane - m.cargo;
        if (release) {
            const take = n?.lead ? Math.min(room, n.lead.sheltered || 0) : 0;
            if (take > 0) {
                n.lead.sheltered -= take;
                m.cargo += take;
            }
        } else {
            const take = city && city.alive ? Math.min(room, city.leaders || 0) : 0;
            if (take > 0) {
                city.leaders -= take;
                m.cargo += take;
            }
        }
        m.phase = m.cargo > 0 ? "toDrop" : "toHome";
    }
}

// toDrop: destination lost → carry home and redeposit safely; otherwise fly to
// the drop point and, on arrival, start the timed unload.
function ferryToDrop(u, m, drop, dropGone, flyTo) {
    if (dropGone || !drop) {
        m.phase = "toHome"; // destination lost — carry home and redeposit safely
        return;
    }
    if (flyTo(drop)) {
        m.phase = "unloading";
        m.timer = LEADERSHIP.unloadSec;
        u.alt = 0;
    }
}

// unloading: sit on the pad for the timed unload, deliver any cargo (or
// redeposit it safely if the destination went bad mid-run), then head home.
function ferryUnloading(u, m, dt, release, city, n, redeposit) {
    u.alt = 0;
    m.timer -= dt;
    if (m.timer <= 0) {
        if (m.cargo > 0) {
            if (release) {
                if (city && city.alive) city.leaders = (city.leaders || 0) + m.cargo;
                else redeposit();
            } else if (n?.lead) n.lead.sheltered += m.cargo;
            m.cargo = 0;
        }
        m.phase = "toHome";
    }
}

// toHome (and the default fallback): home strip lost mid-flight → the ferry
// goes down (cargo lost via reconcile); otherwise fly home and, on arrival,
// redeposit any diverted cargo and stow back into transport stock.
function ferryToHome(u, home, redeposit, flyTo) {
    if (!home) { // home strip lost mid-flight — the ferry goes down (cargo lost via reconcile)
        redeposit();
        u.hp = 0;
        u.face = null;
        return;
    }
    if (flyTo(home)) {
        redeposit(); // only carries cargo here if it was diverted; a normal run lands empty
        const cap = hangarCapOf(home.type, "transport");
        if ((home.hangar?.transport || 0) < cap) home.hangar.transport = (home.hangar.transport || 0) + 1;
        u.hp = 0; // stow into stock; evacTick relaunches if there is more to move
    }
}

export function flyFerry(w, u, def, dt) {
    const m = u.mission;
    const release = m.mode === "release";
    const sp = def.airSpeed, tr = def.turnRate;
    const dist = (a, b) => haversine(a.lng, a.lat, b.lng, b.lat);
    const n = nationOf(w, u.slot);
    // Id lookups via the amortized id map — one per waypoint per sub-step.
    const units = idMapOf(w.units);
    const city = idMapOf(w.cities).get(m.capId);
    const bunkerRef = units.get(m.bunkerId);
    const bunker = bunkerRef && bunkerRef.hp > 0 ? bunkerRef : null;
    const homeRef = units.get(m.homeId);
    const home = homeRef && homeRef.hp > 0 ? homeRef : null;
    const pickup = release ? bunker : city;   // where we load
    const drop = release ? city : bunker;     // where we deliver
    u.vis = Math.min(1, (u.vis || 0) + dt / FLIGHT.FERRY_VIS_RAMP_T);
    if ((u.alt || 0) > FLIGHT.TRAIL_ALT_THRESHOLD) recordTrail(u, dt);
    // Put stuck cargo somewhere sane. Shelter runs return it to the origin city (or
    // lose it with a dead city); release runs keep it safe in the bunker, else a
    // living city, else lost.
    const redeposit = () => {
        if (!(m.cargo > 0)) return;
        if (release) {
            if (bunker && n?.lead) n.lead.sheltered += m.cargo;
            else {
                const alt = w.cities.find((c) => c.slot === u.slot && c.alive);
                if (alt) alt.leaders = (alt.leaders || 0) + m.cargo;
                else if (n?.lead) n.lead.lost += m.cargo;
            }
        } else if (city && city.alive) city.leaders = (city.leaders || 0) + m.cargo;
        else if (n?.lead) n.lead.lost += m.cargo;
        m.cargo = 0;
    };
    const flyTo = (pt) => {
        const rng = dist(u, pt);
        if (rng <= LEADERSHIP.arriveKm) {
            u.lng = pt.lng; // snap onto the pad so the ground-hold reads as a clean landing
            u.lat = pt.lat;
            return true;
        }
        u.alt = 1;
        // Ease speed down and tighten the turn on approach: an airlifter's normal
        // cruise turn radius (v/ω) is far larger than the gaps between a city, the
        // bunker, and the airstrip, so it must slow to capture a near waypoint.
        const speed = clamp(rng / FLIGHT.FERRY_APPROACH_RANGE_DIV, sp * FLIGHT.FERRY_APPROACH_SPEED_MULT, sp);
        advance(u, bearingTo(u, pt), speed, tr * FLIGHT.FERRY_APPROACH_TURN_MULT, dt);
        return false;
    };
    // Is there anything left to load at the source?
    const sourceEmpty = release
        ? (!bunker || (n?.lead?.sheltered || 0) <= 0)
        : (!city || !city.alive || (city.leaders || 0) <= 0);
    // Is the delivery destination still valid?
    const dropGone = release ? (!city || !city.alive) : !bunker;
    switch (m.phase) {
        case "toPickup":
            ferryToPickup(u, m, pickup, sourceEmpty, flyTo);
            break;
        case "loading":
            ferryLoading(u, m, dt, release, n, city);
            break;
        case "toDrop":
            ferryToDrop(u, m, drop, dropGone, flyTo);
            break;
        case "unloading":
            ferryUnloading(u, m, dt, release, city, n, redeposit);
            break;
        case "toHome":
        default:
            ferryToHome(u, home, redeposit, flyTo);
            break;
    }
}

// Rotary-wing controller: vertical lift-off, then patrol a slow picket circle around
// the base (each helo starts on a distinct bearing so a flight fans out around the
// ring), then a vertical descent onto the pad. No ground roll, no localizer approach.
export function flyRotary(w, u, def, base, dt) {
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
    if (u.phase !== "recover" && u.phase !== "landing") { // patrol the picket ring (default while airborne)
        u.phase = "station";
        u.alt = slew(u.alt, 1, dt);
        u.vis = 1;
        // Walk the picket point slowly around the base so the helo flies a circuit
        // rather than parking on one spot — a visible patrol, not a static hover.
        u.orbitA = (u.orbitA ?? 0) + HELO_PATROL_RATE * dt;
        const pt = polarFrom(base, HELO_STATION_KM, u.orbitA);
        goHover(pt, sp);
        u.face = polarFrom(u, 30, u.orbitA + Math.PI / 2); // nose along the patrol track
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

// Orbit-hold guidance: fly the ring tangent, banking gently in or out in
// proportion to radial error. Produces true circles and smooth joins from
// any entry angle — no carrot-chasing wobble. Shared by the cruise and hold phases.
function flyOrbitHold(base, u, sp, tr, R, dt) {
    const rd = Math.max(1, haversine(base.lng, base.lat, u.lng, u.lat));
    const desired = bearingTo(base, u) + Math.PI / 2 + clampSym((rd - R) / FLIGHT.ORBIT_RADIAL_DIV, FLIGHT.ORBIT_BANK_RAD);
    advance(u, desired, sp, tr, dt);
}

// Climb: roll straight down the runway, rotate, climb out. Progress is the
// jet's own integrated run, NOT distance from the base — a moving carrier
// would otherwise outrun the rolling jet and stall it. During the deck roll
// the ship's speed is added so the jet stays with it.
export function flyClimb(u, base, ra, sp, tr, dt) {
    const baseSpd = (base.dest && UNITS[base.type]?.navalSpeed) || 0;
    const rolling = (u._to || 0) < ROLL_KM;
    const spd = rolling ? baseSpd + sp * FLIGHT.ROLL_SPEED_MULT : sp;
    u._to = (u._to || 0) + spd * dt;
    u.alt = u._to < ROLL_KM ? 0 : Math.min(1, (u._to - ROLL_KM) / CLIMB_KM);
    u.vis = Math.min(1, u._to / FLIGHT.TAKEOFF_VIS_KM);
    advance(u, ra, spd, tr, dt);
    if ((u._to || 0) > ROLL_KM + FLIGHT.ROLL_CLEAR_PAD_KM && base.op === u.id) base.op = null; // wheels up — runway clear for the next mover
    if (u.alt >= 1) {
        u.phase = "cruise";
        if (base.op === u.id) base.op = null;
        u._to = 0;
    }
}

// Cruise: hold the patrol ring.
export function flyCruise(u, base, sp, tr, dt) {
    u.alt = slew(u.alt, 1, dt / FLIGHT.CRUISE_ALT_SLEW_T);
    u.vis = 1;
    flyOrbitHold(base, u, sp, tr, u.orbitR, dt);
    u.fuel = (u.fuel ?? 0) - dt;
    if (u.fuel <= 0 || u.recall) u.phase = "hold"; // bingo fuel / recalled → recover
}

// Hold: stack on a wider ring, waiting for the runway. Recovery doesn't
// reserve the runway — the strip is only owned on short final/rollout, so
// departures keep flowing between arrivals.
export function flyHold(w, u, base, sp, tr, dt) {
    u.alt = slew(u.alt, 1, dt / FLIGHT.CRUISE_ALT_SLEW_T);
    u.vis = 1;
    flyOrbitHold(base, u, sp, tr, u.orbitR + HOLD_PAD, dt);
    const inPattern = w.units.filter((x) => x.baseId === base.id && x.hp > 0 && x.phase === "landing").length;
    if (inPattern < FLIGHT.HOLD_PATTERN_MAX) {
        u.phase = "landing";
        u._land = "toFinal";
    }
}

// Approach ("toFinal"): localizer-intercept CONTROLLER (no waypoints, so nothing
// to orbit): fly the runway heading plus a cross-track correction angle — up to
// ~63° cut toward the centerline, easing to zero as the jet lines up. Too close
// in (or on the departure side), fly an outbound leg to a pattern-entry region
// on its own side, then the controller takes over.
function flyApproachIntercept(u, base, ra, sp, tr, dt) {
    u.alt = 1;
    u.vis = 1;
    const cosLat = cosLatSafe(base.lat);
    const dLng = unwrapLng(u.lng - base.lng, 0);
    const px = dLng * cosLat * KM_PER_DEG, py = (u.lat - base.lat) * KM_PER_DEG;
    const axx = Math.cos(ra), axy = Math.sin(ra);
    const along = -(px * axx + py * axy);        // km out on the APPROACH side of the threshold
    const cross = -px * axy + py * axx;          // signed cross-track distance from the centerline
    const LEAD = clamp((sp / tr) * FLIGHT.LEAD_SPEED_TURN_MULT, FLIGHT.LEAD_MIN_KM, FLIGHT.LEAD_MAX_KM);
    if (along > FLIGHT.INTERCEPT_ALONG_KM) {
        const desired = ra + clampSym(-cross / FLIGHT.INTERCEPT_CROSS_DIV, FLIGHT.INTERCEPT_TURN_RAD);
        advance(u, desired, sp, tr, dt);
        const dh = wrapAnglePi(ra - (u.hdg ?? ra));
        if (Math.abs(cross) < FLIGHT.INTERCEPT_CAPTURE_CROSS_KM && Math.abs(dh) < FLIGHT.INTERCEPT_CAPTURE_HDG_RAD) u._land = "final";
    } else {
        // Outbound to pattern entry: offset to the jet's own side so the
        // turn back in is a single smooth procedure turn.
        const side = cross >= 0 ? 1 : -1;
        const back = polarFrom(base, LEAD * FLIGHT.PATTERN_ENTRY_BACK_MULT, ra + Math.PI);
        const entry = polarFrom(back, FLIGHT.PATTERN_ENTRY_OFFSET_KM * side, ra + Math.PI / 2);
        advance(u, bearingTo(u, entry), sp, tr, dt);
    }
}

// Approach ("final"): the same heading-based control as the intercept, just
// tighter: runway heading plus a small cross-track cut, throttled back,
// altitude slewing down the glide slope. No sideways position bleeding — the
// jet only ever moves where its nose points.
function flyApproachFinal(u, base, ra, sp, tr, dt) {
    const cosLat = cosLatSafe(base.lat);
    const dLng = unwrapLng(u.lng - base.lng, 0);
    const px = dLng * cosLat * KM_PER_DEG, py = (u.lat - base.lat) * KM_PER_DEG;
    const axx = Math.cos(ra), axy = Math.sin(ra);
    const along = -(px * axx + py * axy);
    const cross = -px * axy + py * axx;
    u._alongD = along;
    // Blown approach (short and still off the centerline) → go around.
    if (along < FLIGHT.GO_AROUND_ALONG_KM && Math.abs(cross) > FLIGHT.CROSS_CAPTURE_KM) {
        u._land = null;
        u._alongD = null;
        u.phase = "hold";
        return;
    }
    // Short final: claim the strip. Occupied by someone else → go around.
    if (along < FLIGHT.SHORT_FINAL_ALONG_KM) {
        if (base.op == null) base.op = u.id;
        else if (base.op !== u.id) {
            u._land = null;
            u._alongD = null;
            u.phase = "hold";
            return;
        }
    }
    const desired = ra + clampSym(-cross / FLIGHT.FINAL_CROSS_DIV, FLIGHT.FINAL_TURN_RAD);
    advance(u, desired, sp * FLIGHT.FINAL_SPEED_MULT, tr, dt);
    u.alt = slew(u.alt, clamp01(along / (APPROACH_KM * FLIGHT.GLIDE_SLOPE_FRAC)), dt / FLIGHT.FINAL_ALT_SLEW_T);
    u.vis = 1;
    if (along <= sp * FLIGHT.FINAL_SPEED_MULT * dt + FLIGHT.TOUCHDOWN_ARRIVE_PAD_KM && Math.abs(cross) < FLIGHT.CROSS_CAPTURE_KM) {
        u._land = "rollout";
        u._roll = 0;
        u.alt = Math.min(u.alt, FLIGHT.TOUCHDOWN_ALT_CAP);
    }
}

// Land: touchdown — roll out and decelerate.
function flyLandRollout(u, base, ra, sp, tr, dt) {
    const decel = Math.max(FLIGHT.ROLLOUT_MIN_DECEL, 1 - (u._roll || 0) / ROLLOUT_KM);
    advance(u, ra, sp * FLIGHT.ROLLOUT_SPEED_MULT * decel, tr, dt);
    u._roll = (u._roll || 0) + sp * FLIGHT.ROLLOUT_SPEED_MULT * decel * dt;
    u.alt = 0;
    u.vis = Math.max(0, 1 - (u._roll || 0) / (ROLLOUT_KM * FLIGHT.ROLLOUT_VIS_FRAC));
    if ((u._roll || 0) >= ROLLOUT_KM) {
        // Taxi in — the airframe returns to hangar stock (stock rotation
        // relaunches a fresh one if the patrol still wants it up).
        const cap = hangarCapOf(base.type, u.type);
        if ((base.hangar?.[u.type] || 0) < cap) base.hangar[u.type] = (base.hangar[u.type] || 0) + 1;
        if (base.op === u.id) base.op = null;
        u.hp = 0;
    }
}

// Landing dispatcher: intercept the localizer, final approach, touchdown, rollout.
export function flyLandingPhase(u, base, ra, sp, tr, dt) {
    if (u._land === "toFinal") flyApproachIntercept(u, base, ra, sp, tr, dt);
    else if (u._land === "final") flyApproachFinal(u, base, ra, sp, tr, dt);
    else flyLandRollout(u, base, ra, sp, tr, dt);
}
