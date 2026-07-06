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
import {ensureHangar, launchFerry} from "./aircraft.js";

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
    for (const n of nations) {
        n.lead = {total: LEADERSHIP.startTokens, lost: 0, sheltered: 0};
        n.commandMult = 1;
        n._evac = false;
        const own = cities.filter((c) => c.slot === n.slot);
        for (const c of own) c.leaders = 0;
        if (!own.length) {
            n.lead.total = 0; // nation with no cities — nothing to seed (buildSetup shouldn't produce this)
            continue;
        }
        const ordered = [...own].sort(cityPriority);
        const selected = ordered.slice(0, Math.max(1, LEADERSHIP.leaderCities));
        const total = LEADERSHIP.startTokens;
        if (selected.length === 1) {
            selected[0].leaders = total;
            continue;
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
        if (n.isAi && !n._evac && w.nations.some((m) => m.alive && atWar(w, n.slot, m.slot))) n._evac = "shelter";
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
        // Leaders already being fetched, per city: an inbound (not-yet-loaded) ferry
        // will lift up to perPlane, so it covers that many of the city's remaining
        // leaders. Loaded ferries have already drawn their cargo out of city.leaders.
        const inbound = new Map();
        for (const u of ferries) {
            if (u.mission.phase === "toPickup") inbound.set(u.mission.capId, (inbound.get(u.mission.capId) || 0) + LEADERSHIP.perPlane);
        }
        const needsFerry = (c) => (c.leaders || 0) - (inbound.get(c.id) || 0) > 0;
        for (const s of strips) {
            let slots = LEADERSHIP.transportsPerAirstrip - (perStrip.get(s.id) || 0);
            while (slots > 0 && (s.hangar?.transport || 0) > 0) {
                const city = sites.find(needsFerry);
                if (!city) break; // every city's leaders are already covered by inbound ferries
                launchFerry(w, s, city.id, bunker.id, "shelter");
                inbound.set(city.id, (inbound.get(city.id) || 0) + LEADERSHIP.perPlane);
                slots--;
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
    // Sheltered leaders not yet claimed by an inbound (heading-to-bunker) ferry.
    const enroute = ferries.filter((u) => u.mission.mode === "release" && u.mission.phase === "toPickup").length;
    let unclaimed = (n.lead.sheltered || 0) - enroute * LEADERSHIP.perPlane;
    // Effective fill per target = current leaders + leaders already inbound on a
    // release ferry, so new launches spread to the emptiest cities.
    const fill = new Map();
    for (const c of targets) fill.set(c.id, c.leaders || 0);
    for (const u of ferries) {
        if (u.mission.mode === "release" && fill.has(u.mission.capId)) fill.set(u.mission.capId, fill.get(u.mission.capId) + LEADERSHIP.perPlane);
    }
    for (const s of strips) {
        let slots = LEADERSHIP.transportsPerAirstrip - (perStrip.get(s.id) || 0);
        while (slots > 0 && (s.hangar?.transport || 0) > 0 && unclaimed > 0) {
            let tgt = null, min = Infinity;
            for (const c of targets) {
                const f = fill.get(c.id);
                if (f < min) {
                    min = f;
                    tgt = c;
                }
            }
            if (!tgt) break;
            launchFerry(w, s, tgt.id, bunker.id, "release");
            fill.set(tgt.id, fill.get(tgt.id) + LEADERSHIP.perPlane);
            unclaimed -= LEADERSHIP.perPlane;
            slots--;
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
