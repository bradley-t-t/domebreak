// Leadership continuity: national command modeled as integer "leader tokens"
// seeded on capital cities, airlifted to the Leadership Bunker by transport
// ferries when war exposes them (see design/gdd/leadership.md, ADR-0005).
//
// This module owns all leadership orchestration — token seeding, derived
// queries, the shelter order, the per-tick evac controller, loss reconciliation,
// and the command-factor economy penalty. Combat resolution is NOT touched here:
// reconciliation reads the same city.alive / unit.hp flags combat already sets,
// so leadership stays a pure, deterministic (no-RNG) layer over the sim.
import {LEADERSHIP} from "../data/constants.js";
import {nationOf, nextId} from "./worldState.js";
import {atWar} from "./queries.js";
import {ensureHangar, launchEscort, launchFerry} from "./aircraft.js";
import {haversine} from "../geo/geo.js";

// One airstrip may only launch a ferry every LEADERSHIP.launchGapSec — a takeoff
// queue, so a strip staggers its departures instead of scrambling its whole
// fleet in a single tick. Also scrambles the ferry's fighter escort.
function dispatchFerry(w, strip, capId, bunkerId, mode) {
    if ((w.time - (strip._ferryAt ?? -Infinity)) < LEADERSHIP.launchGapSec) return null;
    const ferry = launchFerry(w, strip, capId, bunkerId, mode);
    if (!ferry) return null;
    strip._ferryAt = w.time;
    for (let i = 0; i < LEADERSHIP.escortsPerFerry; i++) launchEscort(w, strip, ferry.id, i);
    return ferry;
}

// Orders a nation's living cities by evacuation priority: capital(s) first, then
// by population descending. Shared by seeding and the evac controller so leaders
// are always seeded and airlifted capital-first.
function cityPriority(a, b) {
    const ca = a.cap ? 1 : 0, cb = b.cap ? 1 : 0;
    if (ca !== cb) return cb - ca;
    return (b.pop || 0) - (a.pop || 0);
}

// Seeds each nation's leader-token pool across its top cities. Called once from
// createWorld with the freshly-built nations/cities arrays. The capital takes the
// largest single share (capitalShare); the remainder spreads across the next most
// populous cities (up to leaderCities total) weighted by population, via
// largest-remainder rounding so the integer tokens always sum to startTokens.
export function distributeLeadership(nations, cities) {
    for (const n of nations) seedLeadership(n, cities.filter((c) => c.slot === n.slot));
}

// Seeds a single nation's fresh leader-token pool across its own cities (passed in),
// resetting its leadership state. Used at world creation (per nation) and by the
// civil-war fracture to re-seed both successor governments from scratch.
export function seedLeadership(n, ownCities) {
    n.lead = {total: LEADERSHIP.startTokens, lost: 0, sheltered: 0};
    n.commandMult = 1;
    n._evac = false;
    const own = ownCities.filter((c) => c.alive !== false);
    for (const c of own) c.leaders = 0;
    if (!own.length) {
        n.lead.total = 0; // nation with no cities — nothing to seed (buildSetup shouldn't produce this)
        return;
    }
    const ordered = [...own].sort(cityPriority);
    const selected = ordered.slice(0, Math.max(1, LEADERSHIP.leaderCities));
    const total = LEADERSHIP.startTokens;
    if (selected.length === 1) {
        selected[0].leaders = total;
        return;
    }
    // Capital keeps the biggest slice, but never so much that the other selected
    // cities can't each hold at least one leader.
    const capTokens = Math.max(1, Math.min(Math.round(total * LEADERSHIP.capitalShare), total - (selected.length - 1)));
    const others = selected.slice(1);
    const rest = total - capTokens;
    const wsum = others.reduce((s, c) => s + (c.pop || 1), 0) || 1;
    const alloc = others.map((c) => {
        const exact = rest * (c.pop || 1) / wsum;
        return {c, base: Math.floor(exact), frac: exact - Math.floor(exact)};
    });
    let leftover = rest - alloc.reduce((s, a) => s + a.base, 0);
    alloc.sort((a, b) => b.frac - a.frac);
    for (let i = 0; i < alloc.length && leftover > 0; i++, leftover--) alloc[i].base++;
    selected[0].leaders = capTokens;
    for (const a of alloc) a.c.leaders = a.base;
}

// Leadership as a 0..100 percentage (surviving tokens over the starting pool).
export function leadershipPct(n) {
    if (!n?.lead || !n.lead.total) return 100;
    return Math.round(((n.lead.total - n.lead.lost) / n.lead.total) * 100);
}

// National output multiplier from Leadership: commandFloor at 0%, 1.0 at 100%.
export function commandFactor(n) {
    if (!n?.lead || !n.lead.total) return 1;
    const f = Math.max(0, (n.lead.total - n.lead.lost) / n.lead.total);
    return LEADERSHIP.commandFloor + (1 - LEADERSHIP.commandFloor) * f;
}

// The nation's living Leadership Bunker (maxCount 1), or null.
export function bunkerOf(w, slot) {
    return w.units.find((u) => u.slot === slot && u.type === "bunker" && u.hp > 0) || null;
}

function airstripsOf(w, slot) {
    return w.units.filter((u) => u.slot === slot && u.type === "airstrip" && u.hp > 0);
}

// Living cities of a nation that still hold leaders, in evacuation priority order
// (capital first, then by population).
function citiesWithLeaders(w, slot) {
    return w.cities.filter((c) => c.slot === slot && c.alive && (c.leaders || 0) > 0).sort(cityPriority);
}

// Full leadership picture for a slot, for the HUD/alert. Presentation reads this;
// it never mutates state. Returns null for pre-feature saves that lack n.lead.
export function leadershipStatus(w, slot) {
    const n = nationOf(w, slot);
    if (!n || !n.lead) return null;
    let atCity = 0;
    for (const c of w.cities) if (c.slot === slot && c.alive) atCity += (c.leaders || 0);
    let inTransit = 0;
    for (const u of w.units) {
        if (u.slot === slot && u.hp > 0 && u.mission?.role === "leadershipFerry") inTransit += u.mission.cargo || 0;
    }
    const atWarNow = w.nations.some((m) => m.alive && atWar(w, slot, m.slot));
    return {
        pct: leadershipPct(n),
        total: n.lead.total || 0,
        lost: n.lead.lost || 0,
        sheltered: n.lead.sheltered || 0,
        atCity,
        inTransit,
        exposed: atCity > 0,
        evac: !!n._evac,
        mode: n._evac || null,      // "shelter" | "release" | null
        atWar: atWarNow,
        hasBunker: !!bunkerOf(w, slot),
        hasAirstrip: airstripsOf(w, slot).length > 0,
        sites: citiesWithLeaders(w, slot).map((c) => c.name),
    };
}

// Order: begin sheltering the nation's leadership. Validates infrastructure and
// arms the auto-evac controller; individual planes are dispatched by evacTick.
export function shelterLeadership(w, slot) {
    const n = nationOf(w, slot);
    if (!n || !n.lead) return {error: "No leadership to shelter."};
    if (!bunkerOf(w, slot)) return {error: "Build a Leadership Bunker first."};
    if (!airstripsOf(w, slot).length) return {error: "Build an Airstrip first."};
    n._evac = "shelter";
    return {ok: true};
}

// Order: release sheltered leadership back out to the nation's cities — the reverse
// airlift. Requires leaders actually in the bunker plus the infrastructure to fly
// them; ferries then run bunker -> city instead of city -> bunker.
export function releaseLeadership(w, slot) {
    const n = nationOf(w, slot);
    if (!n || !n.lead) return {error: "No leadership to release."};
    if (!bunkerOf(w, slot)) return {error: "No Leadership Bunker."};
    if ((n.lead.sheltered || 0) <= 0) return {error: "No leadership is sheltered."};
    if (!airstripsOf(w, slot).length) return {error: "Build an Airstrip first."};
    n._evac = "release";
    return {ok: true};
}

// Re-aim an in-flight leadership ferry at assets its CURRENT owner actually holds.
// Called after a civil war splits a nation (stability.js): the ferry's slot may have
// defected to the breakaway state, leaving its mission pointed at a now-enemy city,
// bunker, or home strip. A laden ferry is redirected to drop at an owned bunker if
// one survives, else the nearest owned living city; an empty one abandons its run
// and returns to an owned airstrip. Its fighter escort follows it to the new owner.
export function retargetFerry(w, u) {
    const m = u.mission;
    if (!m || m.role !== "leadershipFerry") return;
    const slot = u.slot;
    const bunker = bunkerOf(w, slot);
    const strips = airstripsOf(w, slot);
    // Nearest owned living city — the fallback drop when no bunker survives.
    let city = null, best = Infinity;
    for (const c of w.cities) {
        if (c.slot !== slot || !c.alive) continue;
        const d = haversine(u.lng, u.lat, c.lng, c.lat);
        if (d < best) { best = d; city = c; }
    }
    // Home strip: keep the original if still owned, else the nearest owned one.
    let home = strips.find((a) => a.id === m.homeId) || null;
    if (!home && strips.length) {
        let hb = Infinity;
        for (const a of strips) {
            const d = haversine(u.lng, u.lat, a.lng, a.lat);
            if (d < hb) { hb = d; home = a; }
        }
    }
    if (home) m.homeId = home.id;
    if (m.cargo > 0) {
        if (bunker) { m.mode = "shelter"; m.bunkerId = bunker.id; m.phase = "toDrop"; } // drop -> bunker
        else if (city) { m.mode = "release"; m.capId = city.id; m.phase = "toDrop"; }    // drop -> owned city
        else m.phase = "toHome"; // nothing owned to drop into; carry home and redeposit
    } else {
        m.phase = "toHome"; // empty mid-run — abandon the pickup, return to an owned base
    }
    // Keep the escort with its ferry's new allegiance.
    for (const e of w.units) {
        if (e.mission?.role === "leadershipEscort" && e.mission.leadId === u.id) e.slot = slot;
    }
}

// Refreshes every living nation's stored command multiplier once per tick, so the
// economy (incomeOf / research) can read a plain number without recomputing.
export function updateCommand(w) {
    for (const n of w.nations) if (n.alive) n.commandMult = commandFactor(n);
}

// Per-tick evac controller. For each nation actively sheltering (player pressed
// Shelter, or an AI that has entered a war), it flies EVERY airstrip — up to
// transportsPerAirstrip ferries each — pulling leaders from all cities that still
// hold them in priority order (capital first, then by population). Each free slot
// is assigned the highest-priority city whose leaders aren't already covered by
// inbound ferries, so the whole fleet fans out across cities instead of piling on
// one. Clears the evac flag once every city is empty and no ferries remain airborne.
export function evacTick(w) {
    for (const n of w.nations) {
        if (!n.alive || !n.lead) continue;
        // AI leadership doctrine: shelter leaders while at war with exposed leaders
        // (dodge the heavy leadership-loss stability hit), and bring them home in
        // peacetime (shed the bunkered-leadership stability penalty). Player evac
        // stays fully manual.
        if (n.isAi) {
            const atWarNow = w.nations.some((m) => m.alive && atWar(w, n.slot, m.slot));
            if (atWarNow) {
                if (n._evac !== "shelter" && citiesWithLeaders(w, n.slot).length) n._evac = "shelter";
            } else if (n._evac !== "release" && (n.lead.sheltered || 0) > 0) {
                n._evac = "release";
            }
        }
        if (!n._evac) continue;
        const bunker = bunkerOf(w, n.slot);
        if (!bunker) {
            if (n._evac === "release") n._evac = false; // nothing to release from
            continue;
        }
        const strips = airstripsOf(w, n.slot);
        if (!strips.length) continue;
        for (const s of strips) ensureHangar(w, s);
        const ferries = w.units.filter((u) => u.slot === n.slot && u.hp > 0 && u.mission?.role === "leadershipFerry");
        const perStrip = new Map();
        for (const u of ferries) perStrip.set(u.mission.homeId, (perStrip.get(u.mission.homeId) || 0) + 1);
        if (n._evac === "release") {
            releaseAssign(w, n, bunker, strips, ferries, perStrip);
            continue;
        }
        const sites = citiesWithLeaders(w, n.slot);
        if (!sites.length) {
            if (!ferries.length) n._evac = false; // evacuation complete
            continue;
        }
        // Leaders already being fetched, per city: a ferry inbound to a city OR
        // sitting on its pad loading has claimed up to perPlane of that city's
        // leaders. A loading ferry has NOT yet drawn its cargo out of city.leaders
        // (that happens the instant loading completes), so it must still count as
        // coverage — otherwise a second airstrip re-sends a ferry for leaders that
        // are already being lifted, and it arrives to an empty city (a wasted trip
        // — the multi-airfield over-dispatch bug). Ferries past loading (toDrop /
        // unloading / toHome) already reduced city.leaders, so they are not counted.
        const inbound = new Map();
        for (const u of ferries) {
            if (u.mission.phase === "toPickup" || u.mission.phase === "loading") {
                inbound.set(u.mission.capId, (inbound.get(u.mission.capId) || 0) + LEADERSHIP.perPlane);
            }
        }
        const needsFerry = (c) => (c.leaders || 0) - (inbound.get(c.id) || 0) > 0;
        for (const s of strips) {
            // At most one departure per strip per tick, gated by the takeoff-queue
            // interval, so a strip fans its ferries out over time (up to
            // transportsPerAirstrip airborne at once) instead of all at once.
            const slots = LEADERSHIP.transportsPerAirstrip - (perStrip.get(s.id) || 0);
            if (slots <= 0 || (s.hangar?.transport || 0) <= 0) continue;
            const city = sites.find(needsFerry);
            if (!city) continue; // every city's leaders are already covered by inbound ferries
            if (dispatchFerry(w, s, city.id, bunker.id, "shelter")) {
                inbound.set(city.id, (inbound.get(city.id) || 0) + LEADERSHIP.perPlane);
            }
        }
    }
}

// Reverse airlift: fly sheltered leaders out of the bunker back to living cities,
// spreading across the top cities (capital first) toward the least-filled so they
// repopulate evenly. Clears the release flag when the bunker is empty and no
// ferries remain.
function releaseAssign(w, n, bunker, strips, ferries, perStrip) {
    if ((n.lead.sheltered || 0) <= 0 && !ferries.length) {
        n._evac = false;
        return;
    }
    const targets = w.cities.filter((c) => c.slot === n.slot && c.alive).sort(cityPriority).slice(0, Math.max(1, LEADERSHIP.leaderCities));
    if (!targets.length) {
        if (!ferries.length) n._evac = false; // nowhere alive to send them
        return;
    }
    // Sheltered leaders not yet claimed by a ferry heading to the bunker OR loading
    // on its pad — a loading release ferry hasn't drawn n.lead.sheltered down yet,
    // so counting only "toPickup" would re-dispatch for leaders already being lifted.
    const enroute = ferries.filter((u) => u.mission.mode === "release" && (u.mission.phase === "toPickup" || u.mission.phase === "loading")).length;
    let unclaimed = (n.lead.sheltered || 0) - enroute * LEADERSHIP.perPlane;
    // Effective fill per target = current leaders + leaders already inbound on a
    // release ferry, so new launches spread to the emptiest cities.
    const fill = new Map();
    for (const c of targets) fill.set(c.id, c.leaders || 0);
    for (const u of ferries) {
        if (u.mission.mode === "release" && fill.has(u.mission.capId)) fill.set(u.mission.capId, fill.get(u.mission.capId) + LEADERSHIP.perPlane);
    }
    for (const s of strips) {
        // One queued departure per strip per tick (see dispatchFerry).
        const slots = LEADERSHIP.transportsPerAirstrip - (perStrip.get(s.id) || 0);
        if (slots <= 0 || (s.hangar?.transport || 0) <= 0 || unclaimed <= 0) continue;
        let tgt = null, min = Infinity;
        for (const c of targets) {
            const f = fill.get(c.id);
            if (f < min) {
                min = f;
                tgt = c;
            }
        }
        if (!tgt) continue;
        if (dispatchFerry(w, s, tgt.id, bunker.id, "release")) {
            fill.set(tgt.id, fill.get(tgt.id) + LEADERSHIP.perPlane);
            unclaimed -= LEADERSHIP.perPlane;
        }
    }
}

function leadershipEvent(w, slot, lost, extra) {
    w.events.push({id: nextId(w, "e"), t: w.time, type: "leadership", slot, lost, ...extra});
}

// Converts leaders killed this tick into permanent losses. Runs after combat and
// fallout have flagged deaths but before the dead-unit prune, so it can still read
// a downed ferry's cargo. Three loss sources: a destroyed capital still holding
// leaders, a destroyed ferry carrying cargo, and a destroyed bunker holding
// sheltered leaders.
export function reconcileLeadership(w) {
    for (const c of w.cities) {
        if (c.alive || !(c.leaders > 0)) continue;
        const n = nationOf(w, c.slot);
        if (n?.lead) {
            n.lead.lost += c.leaders;
            leadershipEvent(w, c.slot, c.leaders, {cityId: c.id, lng: c.lng, lat: c.lat});
        }
        c.leaders = 0;
    }
    for (const u of w.units) {
        if (u.hp > 0 || u.mission?.role !== "leadershipFerry" || !(u.mission.cargo > 0)) continue;
        const n = nationOf(w, u.slot);
        if (n?.lead) {
            n.lead.lost += u.mission.cargo;
            leadershipEvent(w, u.slot, u.mission.cargo, {lng: u.lng, lat: u.lat});
        }
        u.mission.cargo = 0;
    }
    for (const n of w.nations) {
        if (!n.lead || !(n.lead.sheltered > 0)) continue;
        if (!bunkerOf(w, n.slot)) {
            n.lead.lost += n.lead.sheltered;
            leadershipEvent(w, n.slot, n.lead.sheltered, {bunker: true});
            n.lead.sheltered = 0;
        }
    }
    for (const n of w.nations) if (n.lead && n.lead.lost > n.lead.total) n.lead.lost = n.lead.total;
}
