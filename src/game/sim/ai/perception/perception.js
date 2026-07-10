// PerceptionFrame builder — the one snapshot a nation reasons from for a whole
// think. Data only, no decisions: who I am (force, economy, ground worth
// protecting), who is around me (profiles of foes and reachable rivals, the
// human included), where fire can land (threat map), and the front geometry of
// every active war. Downstream stages are pure functions of this frame.
import {DIPLOMACY} from "../../../data/constants.js";
import {haversine} from "../../../geo/geo.js";
import {atWar, industryCapOf} from "../../queries.js";
import {isSea} from "../../../geo/seaRoute.js";
import {leadershipPct} from "../../leadership.js";
import {statOf} from "./stats.js";
import {buildProfile} from "./profiles.js";
import {buildThreatMap, meanPressure} from "./threatMap.js";
import {ensureDiplo, rel} from "../diplomacy/ledger.js";
import {DECLARE, THREAT} from "../tuning.js";

// Capital + population weighting used to rank anchor / protect targets.
function cityValue(c) {
    return (c.pop || 0) * (c.cap ? 1.5 : 1) + (c.cap ? 5e6 : 0);
}

// A nation's alive cities, most valuable first.
export function aiCities(w, slot) {
    const out = [];
    for (const c of w.cities) if (c.slot === slot && c.alive) out.push(c);
    out.sort((a, b) => cityValue(b) - cityValue(a));
    return out;
}

// High-value points a nation wants shielded: its cities plus its command assets
// (leadership bunker, space HQ). Value-sorted so callers take the most valuable
// uncovered one first.
export function protectPoints(w, slot, myUnits) {
    const pts = [];
    for (const c of w.cities) if (c.slot === slot && c.alive) pts.push({lng: c.lng, lat: c.lat, val: cityValue(c)});
    for (const u of myUnits) if (u.type === "bunker" || u.type === "spacehq") pts.push({lng: u.lng, lat: u.lat, val: 8e6});
    pts.sort((a, b) => b.val - a.val);
    return pts;
}

// Capital (or first-living-city) positions per slot, cached per sim step —
// keyed on w.time so a dead capital or a city flipped by occupation refreshes
// on the next step instead of being read stale for the rest of the match.
export function capPositions(w) {
    if (w._capPos && w._capPosAt === w.time) return w._capPos;
    const caps = {};
    for (const c of w.cities) {
        if (!c.alive) continue;
        const cur = caps[c.slot];
        if (!cur || (c.cap && !cur.cap)) caps[c.slot] = {lng: c.lng, lat: c.lat, cap: !!c.cap};
    }
    w._capPos = caps;
    w._capPosAt = w.time;
    return caps;
}

// Great-power reach: bigger economies see farther diplomatically.
export function warRangeFor(n) {
    const gdp = Math.max(0.1, n.gdp || 0.1);
    if (gdp <= DECLARE.warRangeGdpBoostT) return DIPLOMACY.warRangeKm;
    const t = Math.min(1, Math.log(gdp / DECLARE.warRangeGdpBoostT) / Math.log(30));
    return DIPLOMACY.warRangeKm + (DECLARE.warRangeMaxKm - DIPLOMACY.warRangeKm) * t;
}

// Raw national strength: GDP plus a cost x hp-fraction force score — the same
// bloc-power math the old AI used, kept so tuning carries over. Reads the
// per-step aggregates (callers may still pass their unitsBySlot; the aggregate
// already folded the force term in).
export function nationPower(w, n) {
    return statOf(w, n.slot).power;
}

// n's bloc power = n plus every living ally.
export function blocPower(w, n, unitsBySlot) {
    let sum = nationPower(w, n, unitsBySlot);
    for (const s in n.relations) {
        if (n.relations[s] !== "ally") continue;
        const ally = w.nations.find((x) => x.slot === +s && x.alive);
        if (ally) sum += nationPower(w, ally, unitsBySlot);
    }
    return sum;
}

// Does the nation have sea access near any of its cities? Cached per nation —
// coastline doesn't change. Gates naval appetite before any hull is priced.
function coastal(w, n, cities) {
    if (n._coastal != null) return n._coastal;
    let found = false;
    outer: for (const c of cities.slice(0, 6)) {
        for (let k = 0; k < 12; k++) {
            const a = (k / 12) * Math.PI * 2;
            if (isSea(c.lng + Math.cos(a) * 1.2, c.lat + Math.sin(a) * 1.2)) { found = true; break outer; }
        }
    }
    n._coastal = found;
    return found;
}

// The front a war (or the peacetime map) orients to: nearest at-war capital, or
// the nearest active rival's capital so outward-facing builds still make sense.
export function frontPos(w, n, caps) {
    const a = caps[n.slot];
    if (!a) return null;
    let best = null, bd = Infinity;
    for (const m of w.nations) {
        if (m.slot === n.slot || !m.alive || m.active === false) continue;
        const b = caps[m.slot];
        if (!b) continue;
        const d = haversine(a.lng, a.lat, b.lng, b.lat) * (n.relations[m.slot] === "war" ? 0.5 : 1);
        if (d < bd) { bd = d; best = b; }
    }
    return best;
}

// Build the frame. `shared` carries the per-tick indices the caller owns:
// {unitsBySlot, caps, lite}. A LITE frame is the idle-nation economy mode —
// peacetime nations far from any human skip the threat grid and profile only
// a couple of neighbours, since nothing is shooting at them and their builds
// anchor on protect-points anyway. Nations at war or near the player always
// get the full picture.
export function buildFrame(w, n, shared) {
    const {unitsBySlot, caps, lite} = shared;
    const myUnits = unitsBySlot.get(n.slot) || [];
    const cities = aiCities(w, n.slot);
    const diplo = ensureDiplo(n);
    const myCap = caps[n.slot];

    const enemies = [], allies = [], rivals = [];
    const reach = warRangeFor(n);
    for (const m of w.nations) {
        if (m.slot === n.slot || !m.alive || m.active === false) continue;
        if (atWar(w, n.slot, m.slot)) enemies.push(m);
        else if (n.relations[m.slot] === "ally") allies.push(m);
        else {
            const capB = caps[m.slot];
            if (myCap && capB && haversine(myCap.lng, myCap.lat, capB.lng, capB.lat) <= reach) rivals.push(m);
        }
    }

    // In an all-active world a great power can reach most of the planet; the
    // composition-shaping reads (profiles, threat map) only look at the
    // NEAREST handful of rivals — distant ones still matter to diplomacy,
    // which reads the cheap aggregates instead of full profiles.
    const profileCap = lite ? THREAT.profiledRivalsLite : THREAT.profiledRivals;
    let rivalsNear = rivals;
    if (rivals.length > profileCap && myCap) {
        rivalsNear = rivals
            .map((m) => [m, caps[m.slot] ? haversine(myCap.lng, myCap.lat, caps[m.slot].lng, caps[m.slot].lat) : Infinity])
            .sort((a, b) => a[1] - b[1])
            .slice(0, profileCap)
            .map(([m]) => m);
    }

    // Profiles: every foe, ally, and near rival, plus a grudge-hardened threat
    // weight — a rival who has hurt us before keeps our guard up in peacetime.
    const profiles = {};
    for (const m of [...enemies, ...rivalsNear, ...allies]) {
        const p = buildProfile(w, m, unitsBySlot);
        p.grudge = rel(n, m.slot).taken;
        profiles[m.slot] = p;
    }

    const threats = lite
        ? {cells: [], grid: null}
        : buildThreatMap(w, n, {cities, myUnits, enemies, rivals: rivalsNear, unitsBySlot});

    // One front per active war: where the foe is, how far, and its age.
    const fronts = enemies.map((e) => {
        const capB = caps[e.slot];
        return {
            foe: e.slot,
            pos: capB || null,
            distKm: myCap && capB ? haversine(myCap.lng, myCap.lat, capB.lng, capB.lat) : Infinity,
            age: w.time - (n._warStart?.[e.slot] ?? 0),
        };
    });

    const myPower = blocPower(w, n, unitsBySlot);
    let strongestOpposing = 0.1;
    for (const m of [...enemies, ...rivals]) {
        strongestOpposing = Math.max(strongestOpposing, blocPower(w, m, unitsBySlot));
    }

    const mine = statOf(w, n.slot);
    return {
        n,
        _w: w,      // world handle for stages that must consult live queries (never mutated)
        me: {
            slot: n.slot,
            units: myUnits,
            cities,
            protect: protectPoints(w, n.slot, myUnits),
            cap: myCap || null,
            points: n.points,
            income: mine.income,
            upkeep: mine.upkeep,
            net: mine.net,
            ammo: n.ammo || {},
            gdp: mine.gdp,
            indCap: industryCapOf(w, n.slot),
            leadPct: leadershipPct(n),
            frac: mine.frac,
            coastal: coastal(w, n, cities),
            power: myPower,
        },
        world: {
            enemies,
            allies,
            rivals,
            profiles,
            atWar: enemies.length > 0,
            strengthRatio: myPower / strongestOpposing,
        },
        threats,
        pressure: meanPressure(threats),
        fronts,
        front: frontPos(w, n, caps),
        diplo,
        time: w.time,
    };
}
