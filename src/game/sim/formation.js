// Naval formation station-keeping. A ship with a `followId` is stationed on the
// ship it points at (its "guide"): every movement tick it steams to a doctrinal
// station off the guide instead of taking a manual sail order. Ships sharing one
// guide screen it together — escorts ring it, submarines picket ahead, heavies
// fall into line astern, high-value hulls tuck in close, and the replenishment
// oiler shuttles alongside each hull in turn. Pure motion, so it runs on both the
// authoritative server and the client-prediction tick (see stepMovement).
//
// State is plain ids/points on the unit: `followId` (the guide's id, resolved
// each tick — never an object reference) plus the transient `_fRoute`/`_fAnchor`
// route cache. All of it serializes into snapshots and saves for free.
import {FORMATION, UNITS} from "../data/constants.js";
import {bearing, geoDest, haversine} from "../geo/geo.js";
import {isSea, seaRoute} from "../geo/seaRoute.js";

// Which screen bucket a hull rides in — the shape of a real task-group disposition.
export function stationRoleOf(type) {
    const def = UNITS[type];
    if (!def) return "screen";
    if (def.submarine) return "van";        // subs picket well ahead
    if (def.resupplyKm) return "logi";      // the oiler shuttles between clients
    if (def.wing || def.capacity) return "hvu"; // carrier / amphib — the protected core
    if (def.range >= 3000 && def.kind === "offense") return "stern"; // battleship line astern
    if (def.asw) return "screen";           // destroyer — the ASW picket screen
    if (def.kind === "defense") return "inner"; // cruiser — tight air-defense ring
    return "screen";                        // everything else rides the screen
}

// Course the guide is making good, in compass degrees. Derived from its look-ahead
// facing marker (set while steaming and parked past the last mark on arrival, so it
// persists at anchor); a hull that has never moved defaults to due north.
function headingOf(u) {
    if (u?.face) return bearing(u.lng, u.lat, u.face.lng, u.face.lat);
    return 0;
}

// Relative bearing for ship i of n spread symmetrically across `span` about `center`.
function arcBearing(i, n, center, span) {
    if (n <= 1) return center;
    return center - span / 2 + (span * i) / (n - 1);
}

// A station point `km` off `u` on compass `brng`, pulled in toward the hull until it
// lands on open water so a station near a coast never sits inland (worst case: the
// guide's own position, which is by definition afloat).
function seaStation(u, km, brng) {
    const b = ((brng % 360) + 360) % 360;
    for (const frac of [1, 0.66, 0.4, 0.2]) {
        const [lng, lat] = geoDest(u.lng, u.lat, km * frac, b);
        if (isSea(lng, lat)) return {lng, lat};
    }
    return {lng: u.lng, lat: u.lat};
}

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// Assign every follower of one guide its station point. Deterministic — ships of a
// role are ordered by id and fanned across their arc, and the oiler's current client
// is a function of world time — so server and client agree without shared RNG.
function computeStations(w, guide, followers) {
    const H = headingOf(guide);
    const stations = new Map();
    const buckets = {van: [], screen: [], inner: [], stern: [], hvu: [], logi: []};
    for (const f of followers) buckets[stationRoleOf(f.type)].push(f);
    for (const k in buckets) buckets[k].sort(byId);

    buckets.van.forEach((f, i, a) => stations.set(f.id, seaStation(guide, FORMATION.vanKm, H + arcBearing(i, a.length, 0, FORMATION.vanArc))));
    buckets.screen.forEach((f, i, a) => stations.set(f.id, seaStation(guide, FORMATION.screenKm, H + arcBearing(i, a.length, 0, FORMATION.screenArc))));
    buckets.inner.forEach((f, i, a) => stations.set(f.id, seaStation(guide, FORMATION.innerKm, H + arcBearing(i, a.length, 0, FORMATION.innerArc))));
    buckets.stern.forEach((f, i) => stations.set(f.id, seaStation(guide, FORMATION.sternKm + i * FORMATION.sternStepKm, H + 180)));
    buckets.hvu.forEach((f, i, a) => stations.set(f.id, seaStation(guide, FORMATION.hvuKm, H + 180 + arcBearing(i, a.length, 0, 40))));

    if (buckets.logi.length) {
        // Underway replenishment: the oiler comes alongside one hull at a time,
        // cycling through the formation's non-logistics ships on a fixed dwell so it
        // visibly works its way down the line, keeping each within resupply range.
        const clients = [guide, ...followers.filter((f) => stationRoleOf(f.type) !== "logi")]
            .filter((c) => c.hp > 0).sort(byId);
        const turn = Math.floor(w.time / FORMATION.resupplyDwellSec);
        buckets.logi.forEach((f, i) => {
            if (!clients.length) return stations.set(f.id, seaStation(guide, FORMATION.hvuKm, H + 180));
            const client = clients[((turn + i) % clients.length + clients.length) % clients.length];
            stations.set(f.id, seaStation(client, FORMATION.alongsideKm, headingOf(client) + 90));
        });
    }
    return stations;
}

// Direct rhumb-ish segment sampling — cheap open-water test so a station transit only
// pays for A* sea routing when the straight run would actually cross land.
function directSea(a, b) {
    const dLng = ((b.lng - a.lng + 540) % 360) - 180;
    for (let i = 1; i <= 6; i++) {
        const f = i / 6;
        if (!isSea(a.lng + dLng * f, a.lat + (b.lat - a.lat) * f)) return false;
    }
    return true;
}

function plotStationRoute(u, station) {
    if (directSea(u, station)) return [station];
    const r = seaRoute(u.lng, u.lat, station.lng, station.lat);
    return r?.length ? r : [station];
}

// Advance along the cached station route this tick — the steamShip waypoint walk,
// minus the dest/route bookkeeping (a follower carries no sail order).
function advanceAlong(u, def, dt) {
    let stepKm = def.navalSpeed * dt;
    const route = u._fRoute;
    while (route && route.length) {
        const wp = route[0];
        const dx = ((wp.lng - u.lng + 540) % 360) - 180, dy = wp.lat - u.lat;
        const d = haversine(u.lng, u.lat, wp.lng, wp.lat);
        u.face = {lng: u.lng + dx, lat: wp.lat};
        if (d <= stepKm || d < 1) {
            u.lng = wp.lng;
            u.lat = wp.lat;
            route.shift();
            stepKm -= d;
            if (!route.length) {
                u._fRoute = null;
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

function steamToStation(u, def, dt, station, guideHeading) {
    if (haversine(u.lng, u.lat, station.lng, station.lat) <= FORMATION.holdKm) {
        // On station: cut thrust and swing round to match the guide's course so the
        // whole disposition points the same way.
        u._fRoute = null;
        u._fAnchor = null;
        const [flng, flat] = geoDest(u.lng, u.lat, Math.max(6, def.navalSpeed), guideHeading);
        u.face = {lng: flng, lat: flat};
        return;
    }
    // Re-plot when the cache is empty or the station has drifted past the tolerance
    // (the guide moved) — otherwise ride the existing route so we don't run A* every tick.
    if (!u._fRoute?.length || !u._fAnchor
        || haversine(u._fAnchor.lng, u._fAnchor.lat, station.lng, station.lat) > FORMATION.replotKm) {
        u._fRoute = plotStationRoute(u, station);
        u._fAnchor = {lng: station.lng, lat: station.lat};
    }
    advanceAlong(u, def, dt);
}

// Sever a follow order and drop its route cache — used on a dangling/dead guide and
// wherever a manual order supersedes formation control.
export function clearFollow(u) {
    u.followId = null;
    u._fRoute = null;
    u._fAnchor = null;
}

// The live guide a ship is stationed on, or null if it isn't following one.
export function formationGuideOf(w, u) {
    if (!u?.followId) return null;
    return w.units.find((x) => x.id === u.followId && x.hp > 0) || null;
}

// Movement phase: steam every following hull to its station. Guides have already
// advanced this tick (the main mover loop ran first), so followers chase the fresh
// position. A guide that died, was scrapped, changed hands, or turned out not to be
// a ship frees its followers on the spot.
export function stepFormations(w, dt, idx) {
    const guideOf = (id) => (idx ? idx.units.get(id) : w.units.find((x) => x.id === id));
    const groups = new Map();
    for (const u of w.units) {
        if (u.hp <= 0 || !u.followId) continue;
        if (!UNITS[u.type]?.navalSpeed) {
            clearFollow(u);
            continue;
        }
        const guide = guideOf(u.followId);
        if (!guide || guide.hp <= 0 || guide.slot !== u.slot || !UNITS[guide.type]?.navalSpeed) {
            clearFollow(u);
            continue;
        }
        let arr = groups.get(u.followId);
        if (!arr) groups.set(u.followId, arr = []);
        arr.push(u);
    }
    for (const [guideId, followers] of groups) {
        const guide = guideOf(guideId);
        if (!guide) continue;
        const stations = computeStations(w, guide, followers);
        const gh = headingOf(guide);
        for (const f of followers) {
            const s = stations.get(f.id);
            if (s) steamToStation(f, UNITS[f.type], dt, s, gh);
        }
    }
}
