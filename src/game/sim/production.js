// Production queue, unit/ammo/aircraft ordering, unit relocation and naval
// sailing orders, patrol toggles, and diplomacy orders. The single in-order
// production line (units + warheads) lives here.
//
// Order/command contract: every mutating order function validates first and
// returns {ok: true, ...} on success or {error: "reason"} on refusal. Point
// costs are charged on acceptance and refunded if delivery later fails.
import {
    allowedAmmo,
    AMMO_START,
    AMPHIB_LIFT_KM,
    MOVE_COST_FRAC,
    PATROL_SIZES,
    SCRAP_REFUND_FRAC,
    TECHS,
    UNITS,
    WARHEADS,
} from "../data/constants.js";
import {nationOf, nextId} from "./worldState.js";
import {atWar, inTerritory, industryCapOf, industryCountOf, netIncomeOf, placementBlocked} from "./queries.js";
import {findTarget} from "./combat.js";
import {ensureHangar, hangarCapOf} from "./aircraft.js";
import {landRoute, seaRoute} from "../geo/seaRoute.js";
import {haversine} from "../geo/geo.js";

// Set the war relation between two nations and stamp the war-start time on both
// sides so diplomacy can age the conflict regardless of which nation opened it
// (see diploTick in sim/tick.js). Relation-only — events are the caller's job.
function setWar(w, na, nb, a, b) {
    na.relations[b] = "war";
    nb.relations[a] = "war";
    (na._warStart || (na._warStart = {}))[b] = w.time;
    (nb._warStart || (nb._warStart = {}))[a] = w.time;
}

// Defensive pact: an attack on `defender` pulls its allies into the war against the
// aggressor. One hop only (the allies' own allies are NOT chained in) so a single
// declaration can't cascade the whole world. A nation allied to BOTH belligerents,
// or already at war with the aggressor, stays out. See design/gdd/alliances.md.
function callToArms(w, aggressor, defender) {
    const na = nationOf(w, aggressor), nd = nationOf(w, defender);
    if (!na || !nd) return;
    for (const s in nd.relations) {
        if (nd.relations[s] !== "ally") continue;
        const ally = +s;
        if (ally === aggressor) continue;                       // allied to the aggressor too — stays out
        const nAlly = nationOf(w, ally);
        if (!nAlly || !nAlly.alive) continue;
        if (na.relations[ally] === "war" || na.relations[ally] === "ally") continue;
        setWar(w, na, nAlly, aggressor, ally);
        w.events.push({id: nextId(w, "e"), t: w.time, type: "callToArms", a: ally, b: aggressor, defender});
    }
}

export function declareWar(w, a, b) {
    const na = nationOf(w, a), nb = nationOf(w, b);
    if (!na || !nb || a === b) return {error: "Invalid order."};
    if (na.relations[b] === "ally") return {error: "You are allied — break the alliance first."};
    setWar(w, na, nb, a, b);
    w.events.push({id: nextId(w, "e"), t: w.time, type: "war", a, b});
    // Defensive pact: an attack on b pulls b's allies in against the aggressor.
    callToArms(w, a, b);
    return {ok: true};
}

// Form a mutual-defense pact between a and b (symmetric `ally` relation). Refused if
// they are at war or it's a self-pact — the caller (proposeAlliance) also enforces
// the ally cap. Territory/stability are untouched; alliance is a pure relation flag.
export function formAlliance(w, a, b) {
    const na = nationOf(w, a), nb = nationOf(w, b);
    if (!na || !nb || a === b) return {error: "Invalid order."};
    if (atWar(w, a, b)) return {error: "You are at war with them."};
    na.relations[b] = "ally";
    nb.relations[a] = "ally";
    w.events.push({id: nextId(w, "e"), t: w.time, type: "alliance", a, b});
    return {ok: true};
}

// Dissolve an alliance — both sides fall back to peace. No-op on either side that
// isn't actually allied, so a one-sided/legacy state can't be corrupted.
export function breakAlliance(w, a, b) {
    const na = nationOf(w, a), nb = nationOf(w, b);
    if (na && na.relations[b] === "ally") na.relations[b] = "peace";
    if (nb && nb.relations[a] === "ally") nb.relations[a] = "peace";
    w.events.push({id: nextId(w, "e"), t: w.time, type: "breakalliance", a, b});
    return {ok: true};
}

// Low-level relation primitive: clear the war between a and b (and its age stamps).
// Territory, stability, events, and popups are the caller's job — every real war
// ending routes through sim/warResolution.js `endWar`, which wraps this.
export function makePeace(w, a, b) {
    const na = nationOf(w, a), nb = nationOf(w, b);
    if (na) {
        na.relations[b] = "peace";
        if (na._warStart) delete na._warStart[b];
    }
    if (nb) {
        nb.relations[a] = "peace";
        if (nb._warStart) delete nb._warStart[a];
    }
    return {ok: true};
}

// --- Unified production line: units and warheads share one in-order queue. ---
// Queuing pays the point cost up front; the item then takes buildTime/prodTime
// seconds on the line. One item builds at a time, strictly FIFO.
export function ensureProd(n) {
    if (!n.ammo) n.ammo = {...AMMO_START};
    if (!n.prod) {
        n.prod = {queue: [], current: null};
        // Migrate legacy ammo-only queues from older saves.
        if (n.ammoCur) n.prod.current = {
            item: {
                kind: "ammo",
                type: n.ammoCur.type,
                paid: WARHEADS[n.ammoCur.type].prodCost
            }, progress: n.ammoCur.progress || 0
        };
        if (n.ammoQ?.length) n.prod.queue = n.ammoQ.map((t) => ({kind: "ammo", type: t, paid: WARHEADS[t].prodCost}));
        n.ammoCur = null;
        n.ammoQ = [];
    }
}

export function prodCount(n, kind, type) {
    if (!n.prod) return 0;
    const inCur = n.prod.current && n.prod.current.item.kind === kind && n.prod.current.item.type === type ? 1 : 0;
    return inCur + n.prod.queue.filter((it) => it.kind === kind && it.type === type).length;
}

export function queueUnit(w, slot, type, lng, lat, territoryOk) {
    const def = UNITS[type], n = nationOf(w, slot);
    if (!def || !n) return {error: "Invalid order."};
    ensureProd(n);
    const hasReq = (t) => w.units.some((u) => u.slot === slot && u.type === t && u.hp > 0) || prodCount(n, "unit", t) > 0;
    // Tech-gated units: the unlocking research must be completed first (spec §6).
    if (def.requiresTech && !n.research.done.includes(def.requiresTech)) {
        return {error: `Requires ${TECHS[def.requiresTech]?.name || def.requiresTech}.`};
    }
    // Unit-prerequisite gate (e.g. space assets need a standing Space Command HQ).
    // Mirrors `requires` but for the new requiresUnit field — a live unit of that
    // type, or one already on the line, satisfies it.
    if (def.requiresUnit && !hasReq(def.requiresUnit)) return {error: `Needs a ${UNITS[def.requiresUnit].label}.`};
    if (def.requires && !hasReq(def.requires)) return {error: `Needs a ${UNITS[def.requires].label}.`};
    // Per-nation build cap (e.g. the Leadership Bunker's maxCount: 1) — living
    // units plus everything already on the line count against the limit.
    if (def.maxCount) {
        const have = w.units.filter((u) => u.slot === slot && u.type === type && u.hp > 0).length + prodCount(n, "unit", type);
        if (have >= def.maxCount) return {error: `Limited to ${def.maxCount} ${def.label}${def.maxCount > 1 ? "s" : ""}.`};
    }
    // Population-scaled industrial capacity: a nation can only sustain so many
    // industry structures for its living population. Living + queued industry count
    // against the cap; structures already standing over it are grandfathered.
    if (def.kind === "industry") {
        const cur = n.prod.current?.item;
        const queued = n.prod.queue.filter((it) => it.kind === "unit" && UNITS[it.type]?.kind === "industry").length
            + (cur?.kind === "unit" && UNITS[cur.type]?.kind === "industry" ? 1 : 0);
        if (industryCountOf(w, slot) + queued >= industryCapOf(w, slot)) {
            return {error: "Industrial capacity reached — grow your population."};
        }
    }
    // Industry is exempt from the deficit gate — building it is how you recover.
    if (netIncomeOf(w, slot) < 0 && def.kind !== "industry") return {error: "Cannot build while in deficit."};
    const okTerr = territoryOk === undefined ? inTerritory(w, slot, lng, lat) : !!territoryOk;
    if (!okTerr) return {error: "Outside your territory."};
    const blocked = placementBlocked(w, lng, lat, null);
    if (blocked) return {error: blocked};
    const cost = Math.round(def.cost * (n.buildCostMult ?? 1));
    if (n.points < cost) return {error: "Not enough points."};
    n.points -= cost;
    n.prod.queue.push({kind: "unit", type, lng, lat, paid: cost});
    return {ok: true};
}

// The reason a unit type can't currently be built (tech-locked, missing a unit
// prerequisite, or at its per-nation cap), or null when it's buildable. The
// production UI greys locked units out and shows this string as the tooltip.
// Checks the same gates queueUnit enforces, minus the placement/points/deficit
// checks that depend on a chosen spot.
export function unitLockReason(w, slot, type) {
    const def = UNITS[type], n = nationOf(w, slot);
    if (!def || !n) return "Invalid unit.";
    const hasReq = (t) => w.units.some((u) => u.slot === slot && u.type === t && u.hp > 0) || prodCount(n, "unit", t) > 0;
    if (def.requiresTech && !n.research?.done?.includes(def.requiresTech)) {
        return `Requires ${TECHS[def.requiresTech]?.name || def.requiresTech}.`;
    }
    if (def.requiresUnit && !hasReq(def.requiresUnit)) return `Needs a ${UNITS[def.requiresUnit].label}.`;
    if (def.requires && !hasReq(def.requires)) return `Needs a ${UNITS[def.requires].label}.`;
    if (def.maxCount) {
        const have = w.units.filter((u) => u.slot === slot && u.type === type && u.hp > 0).length + prodCount(n, "unit", type);
        if (have >= def.maxCount) return `Limited to ${def.maxCount} ${def.label}${def.maxCount > 1 ? "s" : ""}.`;
    }
    return null;
}

// --- Amphibious lift: embark / disembark ground units (spec §8d) -----------
// Range (AMPHIB_LIFT_KM) is a data-driven tuning knob in data/constants.js.

// Load a friendly ground unit into an Amphibious Transport. The transport must
// have spare capacity and be within lift range of the (land-domain, mobile)
// ground unit. The embarked unit is stored in transport.cargo and pulled out of
// the live unit list, so it stops rendering, sensing, and fighting until landed.
export function embark(w, slot, transportId, groundUnitId) {
    const t = w.units.find((x) => x.id === transportId && x.slot === slot && x.hp > 0);
    if (!t) return {error: "Transport not found."};
    const cap = UNITS[t.type].capacity;
    if (!cap) return {error: "Not a transport."};
    const g = w.units.find((x) => x.id === groundUnitId && x.slot === slot && x.hp > 0);
    if (!g) return {error: "Ground unit not found."};
    const gd = UNITS[g.type];
    if (gd.domain !== "land" || !gd.landSpeed) return {error: "Only ground units can embark."};
    if (!t.cargo) t.cargo = [];
    if (t.cargo.length >= cap) return {error: "Transport is full."};
    if (haversine(t.lng, t.lat, g.lng, g.lat) > AMPHIB_LIFT_KM) return {error: "Ground unit is too far from the transport."};
    // Store the whole unit so it can be restored intact on disembark; drop route.
    const i = w.units.indexOf(g);
    w.units.splice(i, 1);
    g.route = null;
    g.dest = null;
    t.cargo.push(g);
    return {ok: true, cargo: t.cargo.length};
}

// Set embarked ground units back down at a coastal point in/near your territory.
// The transport must be within lift range of the drop point and the spot must be
// clear; cargo units are placed one at a time on the first free nearby spot.
export function disembark(w, slot, transportId, lng, lat) {
    const t = w.units.find((x) => x.id === transportId && x.slot === slot && x.hp > 0);
    if (!t) return {error: "Transport not found."};
    if (!UNITS[t.type].capacity) return {error: "Not a transport."};
    if (!t.cargo || !t.cargo.length) return {error: "Nothing embarked."};
    if (haversine(t.lng, t.lat, lng, lat) > AMPHIB_LIFT_KM) return {error: "Landing point is out of range."};
    if (!inTerritory(w, slot, lng, lat)) return {error: "Land only in your own territory."};
    const landed = [];
    for (const g of [...t.cargo]) {
        let spot = null;
        for (let k = 0; k < 12 && !spot; k++) {
            const dl = lng + (k ? Math.cos(k) * 0.4 * k * 0.35 : 0), da = lat + (k ? Math.sin(k) * 0.4 * k * 0.35 : 0);
            if (!placementBlocked(w, dl, da, null)) spot = {lng: dl, lat: da};
        }
        if (!spot) break; // no room left ashore — keep the rest embarked
        g.lng = spot.lng;
        g.lat = spot.lat;
        g.route = null;
        g.dest = null;
        w.units.push(g);
        landed.push(g.id);
    }
    t.cargo = t.cargo.filter((g) => !landed.includes(g.id));
    if (!landed.length) return {error: "No room to land ashore here."};
    return {ok: true, landed: landed.length};
}

export function moveUnit(w, slot, unitId, lng, lat, territoryOk) {
    const u = w.units.find((x) => x.id === unitId && x.slot === slot);
    if (!u) return {error: "Unit not found."};
    const okTerr = territoryOk === undefined ? inTerritory(w, slot, lng, lat) : !!territoryOk;
    if (!okTerr) return {error: "Outside your territory."};
    const blocked = placementBlocked(w, lng, lat, unitId);
    if (blocked) return {error: blocked};
    const n = nationOf(w, slot);
    const cost = Math.round(UNITS[u.type].cost * MOVE_COST_FRAC * (n.moveCostMult ?? 1));
    if (n.points < cost) return {error: "Not enough points to relocate."};
    n.points -= cost;
    u.lng = lng;
    u.lat = lat;
    return {ok: true, cost};
}

export function setSail(w, slot, unitId, lng, lat) {
    const u = w.units.find((x) => x.id === unitId && x.slot === slot);
    if (!u) return {error: "Unit not found."};
    if (!UNITS[u.type].navalSpeed) return {error: "Not a ship."};
    const route = seaRoute(u.lng, u.lat, lng, lat);
    if (!route) return {error: "No sea route to there."};
    u.route = route;
    u.dest = {...route[route.length - 1]};
    return {ok: true};
}

// Ground march order — the land mirror of setSail: free, continuous movement
// along a route plotted over land at the unit's landSpeed. stopSail halts both.
export function setMarch(w, slot, unitId, lng, lat) {
    const u = w.units.find((x) => x.id === unitId && x.slot === slot);
    if (!u) return {error: "Unit not found."};
    if (!UNITS[u.type].landSpeed) return {error: "Not a ground unit."};
    const route = landRoute(u.lng, u.lat, lng, lat);
    if (!route) return {error: "No land route to there."};
    u.route = route;
    u.dest = {...route[route.length - 1]};
    return {ok: true};
}

export function stopSail(w, slot, unitId) {
    const u = w.units.find((x) => x.id === unitId && x.slot === slot);
    if (u) {
        u.dest = null;
        u.route = null;
    }
    return {ok: true};
}

// Set an airbase's fighter patrol pattern (0 = stand down, else 2- or 4-ship).
export function setPatrolSize(w, slot, unitId, size) {
    const u = w.units.find((x) => x.id === unitId && x.slot === slot);
    if (!u || !UNITS[u.type].wing) return {error: "Not an airbase."};
    if (!PATROL_SIZES.includes(size)) return {error: "Invalid patrol size."};
    ensureHangar(w, u);
    u.patrolSize = size;
    return {ok: true, patrolSize: size};
}

// Toggle the base's AWACS orbit on or off.
export function setAwacsPatrol(w, slot, unitId, on) {
    const u = w.units.find((x) => x.id === unitId && x.slot === slot);
    if (!u || !UNITS[u.type].wing) return {error: "Not an airbase."};
    ensureHangar(w, u);
    u.awacsPatrol = on == null ? !u.awacsPatrol : !!on;
    return {ok: true, awacsPatrol: u.awacsPatrol};
}

// Dismantles a unit, refunding SCRAP_REFUND_FRAC of its build cost.
export function scrapUnit(w, slot, unitId) {
    const i = w.units.findIndex((u) => u.id === unitId && u.slot === slot);
    if (i < 0) return {error: "Unit not found."};
    const u = w.units[i];
    const n = nationOf(w, slot);
    if (n) n.points += Math.floor((UNITS[u.type].cost || 0) * SCRAP_REFUND_FRAC);
    w.units.splice(i, 1);
    return {ok: true};
}

export function commandAttack(w, unitId, targetId) {
    const u = w.units.find((x) => x.id === unitId);
    if (!u) return {error: "Target is gone."};
    if (UNITS[u.type].kind !== "offense") return {error: "Not an offensive unit."};
    if (targetId == null) {
        u.targetId = null;
        return {ok: true};
    }
    const t = findTarget(w, targetId);
    if (!t) return {error: "Target is gone."};
    // You may only strike a nation you're formally at war with. Neutrals are passive
    // scenery — never a valid target.
    if (!atWar(w, u.slot, t.slot)) return {error: "Not at war with that nation."};
    // Ground forces fight the ground war: units with targets:"land" may never
    // engage naval hulls or anything that flies (cities and land assets only).
    if (UNITS[u.type].targets === "land" && t.kind === "unit") {
        const td = UNITS[t.ref.type];
        if (td.domain === "sea" || td.airSpeed) return {error: "Ground forces cannot engage naval or air targets."};
    }
    u.targetId = targetId;
    return {ok: true};
}

// Total accounted airframes of a type for a base: stock + airborne + on the line.
export function hangarCount(w, n, baseId, type) {
    const base = w.units.find((b) => b.id === baseId && b.hp > 0);
    const stock = base?.hangar?.[type] || 0;
    const live = w.units.filter((u) => u.baseId === baseId && u.type === type && u.hp > 0).length;
    const cur = n.prod?.current?.item;
    const queued = (cur?.forBase === baseId && cur?.type === type ? 1 : 0)
        + (n.prod?.queue || []).filter((it) => it.forBase === baseId && it.type === type).length;
    return stock + live + queued;
}

// Order a replacement aircraft for a base — joins the production line and is
// delivered into the base's hangar stock when it completes.
export function queueAircraft(w, slot, baseId, type) {
    const n = nationOf(w, slot);
    const base = w.units.find((b) => b.id === baseId && b.slot === slot && b.hp > 0);
    if (!n || !base || !UNITS[base.type]?.wing) return {error: "Not an airbase."};
    const cap = hangarCapOf(base.type, type);
    if (!cap) return {error: "That aircraft can't operate from this base."};
    ensureHangar(w, base);
    if (hangarCount(w, n, baseId, type) >= cap) return {error: "The hangar is at capacity for that type."};
    if (netIncomeOf(w, slot) < 0) return {error: "Cannot build while in deficit."};
    const cost = Math.round(UNITS[type].cost * (n.buildCostMult ?? 1));
    if (n.points < cost) return {error: "Not enough points."};
    n.points -= cost;
    n.prod.queue.push({kind: "unit", type, forBase: baseId, paid: cost});
    return {ok: true};
}

export function queueAmmo(w, slot, type) {
    const n = nationOf(w, slot), wh = WARHEADS[type];
    if (!n || !wh) return {error: "Invalid order."};
    ensureProd(n);
    if (n.points < wh.prodCost) return {error: "Not enough points."};
    n.points -= wh.prodCost;
    n.prod.queue.push({kind: "ammo", type, paid: wh.prodCost});
    return {ok: true};
}

// index -1 cancels the item currently on the line (progress is lost); any other
// index cancels a queued item. Either way the points paid come back.
export function cancelProd(w, slot, index) {
    const n = nationOf(w, slot);
    if (!n) return {error: "Invalid order."};
    ensureProd(n);
    if (index === -1) {
        if (!n.prod.current) return {error: "Nothing is building."};
        n.points += n.prod.current.item.paid || 0;
        n.prod.current = null;
        return {ok: true};
    }
    if (index < 0 || index >= n.prod.queue.length) return {error: "Invalid order."};
    const it = n.prod.queue.splice(index, 1)[0];
    n.points += it.paid || 0;
    return {ok: true};
}

export function setWarhead(w, slot, unitId, type) {
    const u = w.units.find((x) => x.id === unitId && x.slot === slot);
    if (!u || UNITS[u.type].kind !== "offense" || !WARHEADS[type]) return {error: "Invalid order."};
    // A launcher can only load a payload on its allow-list — a road-mobile
    // hypersonic can't carry a thermonuclear city-killer, etc.
    if (!allowedAmmo(u.type).includes(type)) return {error: "This launcher can't carry that warhead."};
    u.warhead = type;
    return {ok: true};
}
