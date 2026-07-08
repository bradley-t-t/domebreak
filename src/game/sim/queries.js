// Read-only world accessors: economy (gdp/income/upkeep), territory, sensor
// coverage, and defense-range queries. No mutation of world state.
import {haversine} from "../geo/geo.js";
import {countryGidAt, countryLandCells} from "../geo/countryOwner.js";
import {toGid3} from "../data/iso3.js";
import {nationOf} from "./worldState.js";
import {AIRBORNE_ALT, ECONOMY, FALLOUT, INDUSTRY, MIN_SEP, RADAR_RANGE_MULT, TERRITORY_RADIUS, UNITS} from "../data/constants.js";

// Fallout cloud intensity (0..1) for a given age in sim seconds: ramps up over
// riseSec, holds at peak through fadeFrac of its life, then decays linearly to 0
// at lifeSec. Pure — the tick uses it for damage, the map uses it for opacity, so
// the danger footprint and the visible haze always agree.
export function falloutIntensity(age) {
    if (age <= 0 || age >= FALLOUT.lifeSec) return 0;
    if (age < FALLOUT.riseSec) return age / FALLOUT.riseSec;
    const fadeStart = FALLOUT.lifeSec * FALLOUT.fadeFrac;
    if (age <= fadeStart) return 1;
    return Math.max(0, 1 - (age - fadeStart) / (FALLOUT.lifeSec - fadeStart));
}

// Fallout dose falloff (0..1) at distance distKm from the cloud center: full dose
// at the core, tapering to edgeFalloff at radiusKm, zero beyond.
export function falloutProximity(distKm, radiusKm) {
    if (distKm >= radiusKm) return 0;
    return 1 - (1 - FALLOUT.edgeFalloff) * (distKm / radiusKm);
}

// The fallout situation at a point: the worst current dose (0..1, intensity ×
// proximity) across every cloud covering it, and the longest time any of those
// clouds still has to live. `dose × FALLOUT.dmgPerSec` is the hp/s being lost
// there; `remain > 0` means the point sits under at least one active cloud. Used
// by the UI to flag contaminated cities and time the hazard.
export function falloutDoseAt(w, lng, lat) {
    let dose = 0, remain = 0;
    for (const fx of (w.effects || [])) {
        if (fx.type !== "fallout") continue;
        const prox = falloutProximity(haversine(fx.lng, fx.lat, lng, lat), fx.radiusKm);
        if (prox <= 0) continue;
        const d = prox * falloutIntensity(fx.age);
        if (d > dose) dose = d;
        const r = FALLOUT.lifeSec - fx.age;
        if (r > remain) remain = r;
    }
    return {dose, remain};
}

export function atWar(w, a, b) {
    if (a === b) return false;
    const n = nationOf(w, a);
    return !!(n && n.relations[b] === "war");
}

// Display name for a slot, with a stable fallback for unnamed/AI nations. The
// public spelling of the internal nationOf lookup — the UI reads this instead of
// re-implementing `w.nations.find(...)?.name || …` at each call site.
export function nationName(w, slot) {
    return nationOf(w, slot)?.name || `Nation ${slot}`;
}

// A city's vitality (0..1): the share of its people, economy, and output still
// standing, driven by current health. A dead city contributes nothing; a city at
// full hp is identical to the pre-vitality behaviour. Every downstream economic /
// demographic quantity a city feeds into is scaled by this.
export function vitalityOf(c) {
    if (!c || !c.alive) return 0;
    const max = c.maxHp || 1;
    return Math.max(0, Math.min(1, (c.hp ?? max) / max));
}

// Flat points/s produced by a nation's standing industry structures.
export function industryOutputOf(w, slot) {
    let sum = 0;
    for (const u of w.units) if (u.slot === slot && u.hp > 0) sum += UNITS[u.type].output || 0;
    return sum;
}

// Effective GDP in $T — the real-world base scaled by the share of the economy
// still standing, plus everything the nation's industry has built on top.
export function gdpOf(w, slot) {
    const n = nationOf(w, slot);
    if (!n) return 0;
    let econ = 0, add = 0;
    for (const c of w.cities) if (c.slot === slot && c.alive) econ += (c.econ || 0) * vitalityOf(c);
    for (const u of w.units) if (u.slot === slot && u.hp > 0) add += UNITS[u.type].gdpAdd || 0;
    return n.gdp * econ + add;
}

// Income is driven by the nation's real GDP weight and the share of its economy
// still standing — each state contributes its economy % of the country. Losing
// your richest states hits income the hardest. Built industry adds flat output
// on top, so a small nation can manufacture its way up. Deliberately lean:
// points are scarce and production is the bottleneck.
export function incomeOf(w, slot) {
    const n = nationOf(w, slot);
    if (!n) return 0;
    const ind = industryOutputOf(w, slot);
    if (n.gdp > 0) {
        let econ = 0;
        for (const c of w.cities) if (c.slot === slot && c.alive) econ += (c.econ || 0) * vitalityOf(c);
        return (ECONOMY.incomeBase + ECONOMY.incomeGdpCoef * Math.sqrt(n.gdp) * econ + ind) * (n.incomeMult ?? 1) * (n.commandMult ?? 1);
    }
    let vit = 0;
    for (const c of w.cities) if (c.slot === slot && c.alive) vit += vitalityOf(c);
    return (ECONOMY.fallbackBase + vit * ECONOMY.fallbackPerCity + ind) * (n.incomeMult ?? 1) * (n.commandMult ?? 1);
}

export function upkeepOf(w, slot) {
    const n = nationOf(w, slot);
    let sum = 0;
    for (const u of w.units) if (u.slot === slot && u.hp > 0) sum += UNITS[u.type].upkeep ?? 0;
    return sum * (n?.upkeepMult ?? 1);
}

export function netIncomeOf(w, slot) {
    return incomeOf(w, slot) - upkeepOf(w, slot);
}

// Living population: each city's people scaled by its vitality, so damage bleeds
// population continuously rather than only at death.
export function populationOf(w, slot) {
    let p = 0;
    for (const c of w.cities) if (c.slot === slot && c.alive) p += (c.pop || 0) * vitalityOf(c);
    return p;
}

// Living industry structures a nation currently fields (all kind:"industry" types).
export function industryCountOf(w, slot) {
    let n = 0;
    for (const u of w.units) if (u.slot === slot && u.hp > 0 && UNITS[u.type].kind === "industry") n++;
    return n;
}

// Max industry structures a nation may sustain, scaled by its living population.
// Losing cities lowers the ceiling; surplus structures above it are grandfathered.
export function industryCapOf(w, slot) {
    const pop = populationOf(w, slot);
    return Math.max(INDUSTRY.base, Math.min(INDUSTRY.max, INDUSTRY.base + Math.floor(pop / INDUSTRY.popPer)));
}

// A point belongs to `slot` only if the NEAREST living city of ANY nation is one
// of slot's own AND lies within TERRITORY_RADIUS. This makes territories mutually
// exclusive (a Voronoi partition clipped to the radius) so neighbouring nations'
// 550 km disks never overlap — an AI (or the player) can no longer site a unit in
// a spot that sits closer to a rival's city than to its own. Fixes enemy units
// appearing inside your borders where the two territory disks used to overlap.
export function inTerritory(w, slot, lng, lat) {
    let nearestSlot = -1, nearest = Infinity;
    for (const c of w.cities) {
        if (!c.alive) continue;
        const d = haversine(c.lng, c.lat, lng, lat);
        if (d < nearest) {
            nearest = d;
            nearestSlot = c.slot;
        }
    }
    return nearestSlot === slot && nearest <= TERRITORY_RADIUS;
}

// True when a land point sits inside slot's own POLITICAL border — the same
// national outline the human player is bound to when placing (LiveGame gates the
// player on the GID_0 country polygon under the cursor). Reads the rasterized
// country grid, so the AI can be held to its real borders instead of the Voronoi
// `inTerritory` disk, which spills across frontiers into neighbours' land. Ocean
// points return null → false here (naval placement uses inTerritory instead).
export function inOwnCountry(w, slot, lng, lat) {
    const gid = toGid3(nationOf(w, slot)?.iso);
    return gid != null && countryGidAt(lng, lat) === gid;
}

// Radar emission radius of a unit type (km): dedicated sensors use their range;
// aircraft carry their own set, each type with its own strength.
export function radarRangeOf(type) {
    const def = UNITS[type];
    return def.radarKm || (def.detect ? def.range : 0);
}

// A based aircraft can only fight (or radiate) while airborne, climbed clear
// of the base. Shared by radar linkage, sensor coverage, and the combat tick.
export function airborne(u) {
    return !u.baseId || (u.alt || 0) > AIRBORNE_ALT;
}

// True when any of the nation's fire-control-grade radars covers unit d —
// warnOnly OTH arrays and parked aircraft don't count. Gates the
// RADAR_RANGE_MULT engagement-range bonus in defenseRange().
export function radarLinked(w, d) {
    const n = nationOf(w, d.slot);
    return w.units.some((r) => {
        if (r.slot !== d.slot || r.hp <= 0) return false;
        if (UNITS[r.type].warnOnly) return false; // OTH tracks are too coarse to cue interceptors
        const km = radarRangeOf(r.type);
        if (!km) return false;
        if (r.baseId && !airborne(r)) return false; // a parked jet radiates nothing
        return haversine(r.lng, r.lat, d.lng, d.lat) <= km * (n?.radarMult ?? 1);
    });
}

// Everything a nation senses with: dedicated radars/ships/aircraft cover their
// radar radius (× tech multiplier); defense units watch their own engagement
// bubble with organic fire-control radar — they can still shoot what nothing
// warned them about, they just get no lead time. Fog of war and missile
// detection both read from this list.
export function sensorsOf(w, slot) {
    const n = nationOf(w, slot);
    const mult = n?.radarMult ?? 1;
    const sonarMult = n?.sonarMult ?? 1;
    const list = [];
    for (const r of w.units) {
        if (r.slot !== slot || r.hp <= 0) continue;
        if (r.baseId && !airborne(r)) continue;
        const def = UNITS[r.type];
        const km = radarRangeOf(r.type) * mult || (def.kind === "defense" ? def.range : 0);
        if (km) list.push({
            id: r.id,          // stable identity so a moving emitter's fog bubble tracks it smoothly
            lng: r.lng,
            lat: r.lat,
            km,
            asw: !!def.asw,
            sonarKm: def.asw ? (def.sonarKm || 0) * sonarMult : 0,
        });
    }
    return list;
}

// Anti-submarine sensors only: platforms flagged asw:true, radiating a sonar
// bubble of sonarKm × the nation's sonarMult (det tracking/fusion techs widen
// it — spec §8c). Submerged hulls are detected only within one of these.
export function subSensorsOf(w, slot) {
    const n = nationOf(w, slot);
    const sonarMult = n?.sonarMult ?? 1;
    const list = [];
    for (const r of w.units) {
        if (r.slot !== slot || r.hp <= 0) continue;
        if (r.baseId && !airborne(r)) continue;
        const def = UNITS[r.type];
        if (!def.asw) continue;
        const km = (def.sonarKm || 0) * sonarMult;
        if (km) list.push({lng: r.lng, lat: r.lat, km});
    }
    return list;
}

export function sensorsCover(sensors, lng, lat) {
    return sensors.some((s) => haversine(s.lng, s.lat, lng, lat) <= s.km);
}

export function sensedBy(w, slot, lng, lat) {
    return sensorsCover(sensorsOf(w, slot), lng, lat);
}

// Fraction (0..1) of the nation's own land area sitting under its radar picture.
// Uses exactly the emitters the radar overlay draws — every unit whose
// radarRangeOf() is non-zero (dedicated radars, OTH arrays, ships, carriers, and
// airborne AWACS), each at its research-scaled range — so this figure always
// agrees with the coverage rings the player can toggle on the map. Land area is
// the country grid's cos(lat)-weighted cells for the nation's GID_0, making the
// result a true surface-area share. 0 when the nation has no mapped land or no
// live emitters. Not cheap on large countries — callers memoize on a coarse cadence.
export function radarLandCoverage(w, slot) {
    const n = nationOf(w, slot);
    const {cells, area} = countryLandCells(toGid3(n?.iso));
    if (!area) return 0;
    const mult = n?.radarMult ?? 1;
    const emitters = [];
    for (const r of w.units) {
        if (r.slot !== slot || r.hp <= 0) continue;
        if (r.baseId && !airborne(r)) continue; // a parked jet radiates nothing
        const km = radarRangeOf(r.type) * mult;
        if (km > 0) emitters.push({lng: r.lng, lat: r.lat, km});
    }
    if (!emitters.length) return 0;
    let covered = 0;
    for (const cell of cells) {
        for (const e of emitters) {
            if (haversine(e.lng, e.lat, cell.lng, cell.lat) <= e.km) {
                covered += cell.w;
                break;
            }
        }
    }
    return covered / area;
}

// Fog-of-war visibility of a single enemy (or friendly) unit to a viewer nation.
// Own units are always visible. Submarines (submarine:true hulls) are stealthy —
// ordinary radar and satellites don't reveal them; they show only when an ASW
// sensor (subSensorsOf) covers them. Everything else uses the normal radar net.
// The live UI reads this to build its visible-units set (spec §8c).
export function unitVisibleTo(w, viewerSlot, u, sensors, subSensors) {
    if (u.slot === viewerSlot) return true;
    if (UNITS[u.type]?.submarine) {
        return sensorsCover(subSensors ?? subSensorsOf(w, viewerSlot), u.lng, u.lat);
    }
    return sensorsCover(sensors ?? sensorsOf(w, viewerSlot), u.lng, u.lat);
}

// True when a friendly Replenishment Ship (resupplyKm) is within range of `unit`
// (a ship). An underway-replenishment buff cuts the buffed hull's reload and
// firing cost (applied in the firing path in tick.js / combat via engine tick).
export function replenishmentBuff(w, unit) {
    if (!unit || unit.hp <= 0) return false;
    return w.units.some((r) => {
        if (r.slot !== unit.slot || r.hp <= 0 || r.id === unit.id) return false;
        const km = UNITS[r.type].resupplyKm;
        if (!km) return false;
        return haversine(r.lng, r.lat, unit.lng, unit.lat) <= km;
    });
}

export function defenseRange(w, d) {
    const base = UNITS[d.type].range;
    if (UNITS[d.type].kind !== "defense") return base;
    const n = nationOf(w, d.slot);
    return base * (radarLinked(w, d) ? RADAR_RANGE_MULT : 1) * (n?.defRangeMult ?? 1);
}

// Inner keep-out radius (km): targets closer than this can't be engaged. It's a
// flat kinematic floor of the battery — radar links and range research push the
// outer edge out, but never shrink this inner gap. 0 for units without one.
export function defenseMinRange(_w, d) {
    return UNITS[d.type].minRange || 0;
}

// Returns the human-readable reason a structure can't be sited here, or null
// if the spot is clear (minimum separation from cities and living units).
export function placementBlocked(w, lng, lat, ignoreUnitId) {
    if (w.cities.some((c) => haversine(c.lng, c.lat, lng, lat) < MIN_SEP)) return "Too close to a city.";
    if (w.units.some((u) => u.id !== ignoreUnitId && u.hp > 0 && haversine(u.lng, u.lat, lng, lat) < MIN_SEP)) return "Too close to another unit.";
    return null;
}
