// Enemy/rival profiles: a rolling read of another nation's force — the human
// player and AI rivals alike go through the same lens. The profile reads the
// SHAPE of a force, not its owner: eight silos and thin defense reads as
// first-strike no matter who fields it, and the observing AI answers with SAM
// density; a tank park reads as steamroller and gets ground hardening. Pure
// data — no decisions here.
import {UNITS} from "../../../data/constants.js";
import {leadershipPct} from "../../leadership.js";
import {statOf} from "./stats.js";

// Strike platforms by strategic weight — the profile's "arsenal pressure" score.
const STRIKE_W = {silo: 3, "sub-ssbn": 3, orbitalstrike: 3, hypersonicbty: 2, launcher: 1.5, battleship: 1, "sub-ssn": 1};

function countTypes(units) {
    const by = {};
    for (const u of units) by[u.type] = (by[u.type] || 0) + 1;
    return by;
}

// Infer a force's posture from its composition. Read by doctrine selection
// (answer a first-striker with interceptor depth) and by the threat map.
function inferPosture(strike, defense, ground, total) {
    if (total < 3) return "balanced";
    if (strike >= defense * 1.5 && strike >= 4) return "first-strike";
    if (ground >= total * 0.45 && ground >= 4) return "steamroller";
    if (defense >= total * 0.55) return "turtle";
    if (strike + ground >= defense * 1.3) return "aggressive";
    return "balanced";
}

// Build the profile of `other` as seen by any observer. unitsBySlot is the
// per-tick roster index; economy figures come from the per-step aggregates so
// profiling N nations never means N full-world scans.
export function buildProfile(w, other, unitsBySlot) {
    const units = unitsBySlot.get(other.slot) || [];
    const by = countTypes(units);
    const ct = (t) => by[t] || 0;
    let strike = 0;
    for (const t in STRIKE_W) strike += ct(t) * STRIKE_W[t];
    let defense = 0, ground = 0;
    for (const u of units) {
        const def = UNITS[u.type];
        if (def.kind === "defense" && !def.hidden) defense++;
        if (def.capture || (def.targets === "land" && def.landSpeed)) ground++;
    }
    const stat = statOf(w, other.slot);
    const groundable = units.filter((u) => !u.baseId).length; // hangar aircraft aren't standing force
    return {
        slot: other.slot,
        isHuman: !other.isAi,
        gdp: stat.gdp,
        net: stat.net,
        cities: stat.cities,
        frac: stat.frac,
        arsenal: {
            silos: ct("silo"), launchers: ct("launcher"), hypers: ct("hypersonicbty"),
            ssbn: ct("sub-ssbn"), ssn: ct("sub-ssn"), orbital: ct("orbitalstrike"),
            warheads: {...(other.ammo || {})},
            strike,
        },
        defense: {
            count: defense,
            batteries: ct("battery"), patriots: ct("patriot"), thaad: ct("thaad"),
            aegis: ct("aegis"), domes: ct("dome"), lasers: ct("orbitallaser"),
        },
        ground: {
            count: ground,
            infantry: ct("infantry"), tanks: ct("tank"), artillery: ct("artillery"),
            bases: ct("armybase"),
        },
        navy: {
            carriers: ct("carrier"), cruisers: ct("cruiser"), destroyers: ct("destroyer"),
            battleships: ct("battleship"), subs: ct("sub-ssn") + ct("sub-ssbn"),
        },
        air: {strips: ct("airstrip")},
        lead: {
            pct: leadershipPct(other),
            exposed: stat.leaders,
            bunker: units.some((u) => u.type === "bunker"),
        },
        posture: inferPosture(strike, defense, ground, groundable),
    };
}
