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
import {haversine} from "../geo/geo.js";
import {nationOf, nextId} from "./worldState.js";
import {atWar} from "./queries.js";
import {ensureHangar, launchFerry} from "./aircraft.js";

// Seeds each nation's leader-token pool onto its capital cities. Called once from
// createWorld with the freshly-built nations/cities arrays. Tokens split as evenly
// as possible across the nation's flagged capitals (remainder to the most populous),
// falling back to the single most-populous city when no capital is flagged.
export function distributeLeadership(nations, cities) {
    for (const n of nations) {
        n.lead = {total: LEADERSHIP.startTokens, lost: 0, sheltered: 0};
        n.commandMult = 1;
        n._evac = false;
        let caps = cities.filter((c) => c.slot === n.slot && c.cap);
        if (!caps.length) {
            const own = cities.filter((c) => c.slot === n.slot);
            if (own.length) caps = [own.reduce((a, b) => ((b.pop || 0) > (a.pop || 0) ? b : a))];
        }
        caps.sort((a, b) => (b.pop || 0) - (a.pop || 0));
        for (const c of caps) c.leaders = 0;
        const k = caps.length;
        if (!k) {
            n.lead.total = 0; // nation with no cities — nothing to seed (buildSetup shouldn't produce this)
            continue;
        }
        const base = Math.floor(LEADERSHIP.startTokens / k);
        const extra = LEADERSHIP.startTokens % k;
        caps.forEach((c, i) => {
            c.leaders = base + (i < extra ? 1 : 0);
        });
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

function capitalsWithLeaders(w, slot) {
    return w.cities.filter((c) => c.slot === slot && c.alive && (c.leaders || 0) > 0);
}

// Full leadership picture for a slot, for the HUD/alert. Presentation reads this;
// it never mutates state. Returns null for pre-feature saves that lack n.lead.
export function leadershipStatus(w, slot) {
    const n = nationOf(w, slot);
    if (!n || !n.lead) return null;
    let atCapital = 0;
    for (const c of w.cities) if (c.slot === slot && c.alive) atCapital += (c.leaders || 0);
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
        atCapital,
        inTransit,
        exposed: atCapital > 0,
        evac: !!n._evac,
        atWar: atWarNow,
        hasBunker: !!bunkerOf(w, slot),
        hasAirstrip: airstripsOf(w, slot).length > 0,
        capitals: capitalsWithLeaders(w, slot).map((c) => c.name),
    };
}

// Order: begin sheltering the nation's leadership. Validates infrastructure and
// arms the auto-evac controller; individual planes are dispatched by evacTick.
export function shelterLeadership(w, slot) {
    const n = nationOf(w, slot);
    if (!n || !n.lead) return {error: "No leadership to shelter."};
    if (!bunkerOf(w, slot)) return {error: "Build a Leadership Bunker first."};
    if (!airstripsOf(w, slot).length) return {error: "Build an Airstrip first."};
    n._evac = true;
    return {ok: true};
}

// Refreshes every living nation's stored command multiplier once per tick, so the
// economy (incomeOf / research) can read a plain number without recomputing.
export function updateCommand(w) {
    for (const n of w.nations) if (n.alive) n.commandMult = commandFactor(n);
}

// Per-tick evac controller. For each nation actively sheltering (player pressed
// Shelter, or an AI that has entered a war), keeps up to transportsPerCapital
// ferries working each capital that still holds leaders, launched from the nearest
// airstrip with transport stock. Clears the evac flag once every capital is empty
// and no ferries remain airborne.
export function evacTick(w) {
    for (const n of w.nations) {
        if (!n.alive || !n.lead) continue;
        if (n.isAi && !n._evac && w.nations.some((m) => m.alive && atWar(w, n.slot, m.slot))) n._evac = true;
        if (!n._evac) continue;
        const bunker = bunkerOf(w, n.slot);
        if (!bunker) continue;
        const strips = airstripsOf(w, n.slot);
        if (!strips.length) continue;
        for (const s of strips) ensureHangar(w, s);
        const caps = capitalsWithLeaders(w, n.slot);
        const ferriesAirborne = w.units.some((u) => u.slot === n.slot && u.hp > 0 && u.mission?.role === "leadershipFerry");
        if (!caps.length) {
            if (!ferriesAirborne) n._evac = false; // evacuation complete
            continue;
        }
        for (const c of caps) {
            const active = w.units.filter((u) =>
                u.slot === n.slot && u.hp > 0 && u.mission?.role === "leadershipFerry" && u.mission.capId === c.id).length;
            let want = LEADERSHIP.transportsPerCapital - active;
            while (want > 0) {
                let best = null, bestD = Infinity;
                for (const s of strips) {
                    if ((s.hangar?.transport || 0) <= 0) continue;
                    const d = haversine(s.lng, s.lat, c.lng, c.lat);
                    if (d < bestD) {
                        bestD = d;
                        best = s;
                    }
                }
                if (!best) break; // no transport stock anywhere
                launchFerry(w, best, c.id, bunker.id);
                want--;
            }
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
