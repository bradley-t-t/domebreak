// Airbase and naval flight-deck mechanics: ship steaming along plotted sea
// routes, and the full aircraft lifecycle (hangar stock, takeoff, patrol
// orbit, landing pattern, rollout) for carriers and airstrips.
import {
    AIRSTRIP_RUNWAY,
    AWACS_ORBIT_KM,
    FIGHTER_ORBIT_BASE_KM,
    FIGHTER_ORBIT_STEP_KM,
    FLIGHT,
    HANGAR_SPEC,
    LAUNCH_GAP,
    PATROL_FIGHTER,
    PATROL_FUEL,
    STRIKE,
    UNITS,
} from "../data/constants.js";
import {haversine} from "../geo/geo.js";
import {nextId} from "./worldState.js";
import {bearingTo, flyClimb, flyCruise, flyEscort, flyFerry, flyHold, flyLandingPhase, flyRotary, flySortieEscort, flyStrike, hangarCapOf, recordTrail} from "./flight.js";

// polarFrom is defined in flight.js (it's the shared flight-frame primitive the
// phase controllers build on) but stays part of aircraft.js's public surface —
// tick.js imports it from here to place newly-spawned bases' runway icons.
export {polarFrom} from "./flight.js";

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
    if (!u.route?.length) u.route = [{...u.dest}]; // legacy saves predate routes
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

export {hangarCapOf};

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
function launchOne(w, base, type) {
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

// Launch one transport from an airstrip on a leadership ferry. Unlike a patrol
// launch this bypasses the runway/orbit/landing model entirely (cities and the
// bunker aren't airbases), starting the transport airborne with a mission flyFerry
// flies point-to-point. mode "shelter" runs airstrip -> city -> bunker -> home;
// mode "release" runs the reverse, airstrip -> bunker -> city -> home. Returns the
// launched transport, or null if no transport stock remains.
export function launchFerry(w, base, capId, bunkerId, mode = "shelter") {
    ensureHangar(w, base);
    if ((base.hangar.transport || 0) <= 0) return null;
    base.hangar.transport--;
    const ad = UNITS.transport;
    const jet = {
        id: nextId(w, "u"), slot: base.slot, type: "transport",
        lng: base.lng, lat: base.lat, hp: ad.hp, cooldown: 0, targetId: null, warhead: null,
        baseId: base.id, phase: "ferry", hdg: runwayAxis(base), alt: 1, vis: 0, fuel: Infinity,
        mission: {role: "leadershipFerry", mode, phase: "toPickup", capId, bunkerId, homeId: base.id, timer: 0, cargo: 0},
    };
    w.units.push(jet);
    return jet;
}

// Scramble one escort fighter to shadow a leadership ferry. Draws from the
// airstrip's patrol-fighter stock (the same type it would fly on CAP) and flies
// a custom formation profile (flyEscort) — it never enters the patrol/attack
// logic, so it just guards the ferry and returns to stock when the run ends.
// Returns the escort, or null if no fighter stock remains.
export function launchEscort(w, base, ferryId, idx) {
    ensureHangar(w, base);
    const ftype = PATROL_FIGHTER[base.type];
    if (!ftype || (base.hangar[ftype] || 0) <= 0) return null;
    base.hangar[ftype]--;
    const ad = UNITS[ftype];
    const jet = {
        id: nextId(w, "u"), slot: base.slot, type: ftype,
        lng: base.lng, lat: base.lat, hp: ad.hp, cooldown: 0, targetId: null, warhead: null,
        baseId: base.id, phase: "escort", hdg: runwayAxis(base), alt: 1, vis: 0, fuel: Infinity,
        mission: {role: "leadershipEscort", leadId: ferryId, homeId: base.id, idx: idx || 0},
    };
    w.units.push(jet);
    return jet;
}

// Launch an offensive bomber package from an airstrip at a tasked target: up to
// STRIKE.bombersPerSortie bombers, each on a strike mission at the target, plus up
// to STRIKE.escortsPerSortie fighters flying formation to keep the sky clear. Like
// the ferry launch, the package starts airborne (bombers don't queue for the runway
// behind the CAP). Returns the launched bombers, or null if no bombers are in stock.
export function launchStrikeSortie(w, base, targetId) {
    ensureHangar(w, base);
    if ((base.hangar.bomber || 0) <= 0) return null;
    const sortieId = nextId(w, "so");
    const ra = runwayAxis(base);
    const bombers = [];
    for (let i = 0; i < STRIKE.bombersPerSortie && (base.hangar.bomber || 0) > 0; i++) {
        base.hangar.bomber--;
        const ad = UNITS.bomber;
        const jet = {
            id: nextId(w, "u"), slot: base.slot, type: "bomber", lng: base.lng, lat: base.lat,
            hp: ad.hp, cooldown: 0, targetId: null, warhead: "standard", baseId: base.id,
            phase: "sortie", hdg: ra, alt: 0.06, vis: 0, fuel: Infinity, stance: "hostile",
            mission: {role: "strike", targetId, homeId: base.id, sortieId, phase: "outbound", passes: 0},
        };
        w.units.push(jet);
        bombers.push(jet);
    }
    const escortType = "multirole";
    for (let i = 0; i < STRIKE.escortsPerSortie && (base.hangar[escortType] || 0) > 0; i++) {
        base.hangar[escortType]--;
        const ad = UNITS[escortType];
        w.units.push({
            id: nextId(w, "u"), slot: base.slot, type: escortType, lng: base.lng, lat: base.lat,
            hp: ad.hp, cooldown: 0, targetId: null, warhead: "standard", baseId: base.id,
            phase: "sortie", hdg: ra, alt: 0.06, vis: 0, fuel: Infinity, stance: "hostile",
            mission: {role: "sortieEscort", sortieId, homeId: base.id, idx: i},
        });
    }
    base.sortieCd = STRIKE.sortieCooldownSec;
    return bombers;
}

// Per-tick base controller: keep the requested patrol pattern airborne — launch
// from stock when short (stock rotation covers refueling), recall extras.
// `basedHere` is the tick's prebuilt list of aircraft with baseId === base.id
// (stepMovement builds one map for all bases instead of each base re-filtering
// the world's whole unit list); it may hold units that died earlier this tick,
// so everything below still checks hp. Omitted (tests, one-shot callers), the
// list is derived from the world.
export function runAirbase(w, base, dt, basedHere) {
    ensureHangar(w, base);
    if (base.op && !w.units.some((x) => x.id === base.op && x.hp > 0)) base.op = null;
    base.launchT = Math.max(0, (base.launchT || 0) - dt);
    const ftype = PATROL_FIGHTER[base.type];
    const based = basedHere ?? w.units.filter((u) => u.baseId === base.id);
    const fighters = based.filter((u) => u.hp > 0 && u.type === ftype);
    const awacses = based.filter((u) => u.hp > 0 && u.type === "awacs");
    const wantF = base.patrolSize || 0;
    const wantA = base.awacsPatrol ? 1 : 0;
    fighters.forEach((u, i) => {
        u.recall = i >= wantF;
    });
    awacses.forEach((u, i) => {
        u.recall = i >= wantA;
    });
    const shortFinal = based.some((x) => x.hp > 0 && x.phase === "landing" && x._land === "final" && (x._alongD ?? 999) < 60);
    if (base.launchT <= 0 && base.op == null && !shortFinal) {
        if (fighters.length < wantF && (base.hangar[ftype] || 0) > 0) launchOne(w, base, ftype);
        else if (awacses.length < wantA && (base.hangar.awacs || 0) > 0) launchOne(w, base, "awacs");
    }
}

// The runway/deck axis: airstrips are fixed; a carrier's deck follows its heading.
function runwayAxis(base) {
    if (base.type === "carrier") return base.face ? bearingTo(base, base.face) : (base.runwayA ?? Math.PI / 2);
    return base.runwayA ?? AIRSTRIP_RUNWAY;
}

// `homeBase` is the caller's already-resolved live home base (or null when it is
// gone) — stepMovement resolves it once per aircraft per tick instead of paying
// this O(units) find inside every flight sub-step. Omitted, it is derived here.
export function flyAircraft(w, u, def, dt, homeBase) {
    // Leadership ferries + their escorts fly their own profiles, not the patrol
    // pattern — handled entirely before the airbase/runway machinery below.
    if (u.mission?.role === "leadershipFerry") return flyFerry(w, u, def, dt);
    if (u.mission?.role === "leadershipEscort") return flyEscort(w, u, def, dt);
    if (u.mission?.role === "strike") return flyStrike(w, u, def, dt);
    if (u.mission?.role === "sortieEscort") return flySortieEscort(w, u, def, dt);
    const base = homeBase !== undefined ? homeBase : (w.units.find((b) => b.id === u.baseId && b.hp > 0) ?? null);
    if (!base) {
        u.hp = 0;
        u.face = null;
        return;
    } // base lost — the wing goes down with it
    if (!u.phase) u.phase = "ground";
    if (base.op && !w.units.some((x) => x.id === base.op && x.hp > 0)) base.op = null; // free a stuck runway
    const ra = runwayAxis(base);
    const sp = def.airSpeed, tr = def.turnRate;
    if (u.phase !== "ground" && (u.alt || 0) > FLIGHT.TRAIL_ALT_THRESHOLD) recordTrail(u, dt);

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
        flyClimb(u, base, ra, sp, tr, dt);
        return;
    }
    if (u.phase === "cruise") {                        // hold the patrol ring
        flyCruise(u, base, sp, tr, dt);
        return;
    }
    if (u.phase === "hold") {                          // stack on a wider ring, waiting for the runway
        flyHold(w, u, base, sp, tr, dt);
        return;
    }
    if (u.phase === "landing") {                       // intercept the localizer, final approach, touchdown, rollout
        flyLandingPhase(u, base, ra, sp, tr, dt);
        return;
    }
}
