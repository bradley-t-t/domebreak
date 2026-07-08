// DomeBreak real-time simulation engine. Pure and deterministic given its seed.
// This module is the stable public facade: world creation lives here, and
// every symbol the engine used to export directly is re-exported from the
// focused modules it now lives in (constants/queries/production/aircraft/
// combat/tick) so existing importers keep working unchanged.
import {AMMO_START, CAPITAL_HP, CITY_HP, START_POINTS, TECHS, colorForSlot} from "./data/constants.js";
import {distributeLeadership} from "./sim/leadership.js";

// Builds a fresh world from a match setup: {mySlot, seed, nations: [{slot,
// name, iso, isAi, gdp}], cities: [{id, slot, name, state, cap, pop, econ,
// lng, lat}]}. The returned object is the entire game state — plain
// JSON-serializable data that the tick mutates in place.
export function createWorld(setup) {
    const nations = setup.nations.map((n) => ({
        slot: n.slot,
        name: n.name,
        iso: n.iso,
        isAi: !!n.isAi,
        gdp: n.gdp || 0,
        color: colorForSlot(n.slot),
        points: START_POINTS,
        alive: true,
        relations: {},
        _ai: 2 + n.slot * 0.3,
        // Everything is unlocked from the start — the tech tree / research mechanic
        // was removed. Every tech id is marked done so all unit gates open, and each
        // tech's effect is applied once below so nations begin fully teched.
        research: {queue: [], current: null, done: Object.keys(TECHS)},
        ammo: {...AMMO_START},
        prod: {queue: [], current: null},
        dmgMult: 1,
        interceptAdd: 0,
        incomeMult: 1,
        rangeMult: 1,
        reloadMult: 1,
        defRangeMult: 1,
        radarMult: 1,
        interceptorSpeedMult: 1,
        buildCostMult: 1,
        upkeepMult: 1,
        researchSpeedMult: 1,
        moveCostMult: 1,
        // Tech-tree expansion multipliers (default identities; scaled by the new
        // Space Age / Early Warning techs in data/constants.js TECHS):
        //   hypersonicEvasion — additive intercept-evasion bonus for hypersonic
        //     boost-glide weapons (off8 Hypersonic Glide Vehicles).
        //   sonarMult — multiplies ASW sonarKm so det tracking/fusion techs turn
        //     hulls into better sub-hunters (det7/8/11/12).
        hypersonicEvasion: 0,
        sonarMult: 1,
        stability: 100,   // national stability 0–100 (see sim/stability.js)
    }));
    // Apply every tech's effect once per nation, so the fully-unlocked tree's stat
    // multipliers (dmgMult, interceptAdd, ranges, sonar, …) are all live at start.
    for (const n of nations) for (const id of n.research.done) TECHS[id].apply(n);
    const cities = setup.cities.map((c) => ({
        id: c.id,
        slot: c.slot,
        name: c.name,
        state: c.state || "",
        cap: c.cap ? 1 : 0,
        pop: c.pop || 0,
        pop0: c.pop || 0,   // starting population — growth ceiling baseline (see POPULATION)
        owner0: c.slot,     // original owner — war-resolution reference ("occupied" ≡ slot !== owner0)
        econ: c.econ || 0,
        lng: c.lng,
        lat: c.lat,
        hp: c.cap ? CAPITAL_HP : CITY_HP,
        maxHp: c.cap ? CAPITAL_HP : CITY_HP,
        alive: true
    }));
    // Seed national leadership: leader tokens onto each nation's capital(s), plus
    // the per-nation lead pool / command multiplier the economy and evac read.
    distributeLeadership(nations, cities);
    return {
        time: 0,
        speed: 1,
        paused: true,
        mySlot: setup.mySlot,
        seed: setup.seed || 1,
        _r: (setup.seed || 1) >>> 0,
        _id: 0,
        nations,
        cities,
        units: [],
        projectiles: [],
        interceptors: [],
        effects: [],
        events: [],
        warPopups: [],       // player-facing war outcomes/offers queued for the modal (see sim/warResolution.js)
        pendingPeace: [],     // open white-peace offers: {from, to, t}
        winnerSlot: null,
        over: false
    };
}

// --- Re-exports: preserves the pre-refactor export surface of engine.js. ---
export {
    START_POINTS,
    MISSILE_SPEED,
    INTERCEPTOR_SPEED,
    RADAR_RANGE_MULT,
    TERRITORY_RADIUS,
    MOVE_COST_FRAC,
    MIN_SEP,
    CITY_HP,
    CAPITAL_HP,
    INTERCEPT_CAP,
    SCRAP_REFUND_FRAC,
    COAST_KM,
    UNITS,
    UNIT_ICON,
    WARHEADS,
    FALLOUT,
    MIRV_SPLIT_AT,
    WARHEAD_ORDER,
    AMMO_START,
    allowedAmmo,
    initialWarhead,
    launchersForAmmo,
    unitLabel,
    armamentOf,
    TECH_PATHS,
    TECHS,
    HANGAR_SPEC,
    PATROL_FIGHTER,
    PATROL_SIZES,
} from "./data/constants.js";

export {haversine} from "./geo/geo.js";

export {countryGidAt} from "./geo/countryOwner.js";

export {
    airborne,
    atWar,
    vitalityOf,
    falloutIntensity,
    falloutProximity,
    falloutDoseAt,
    industryOutputOf,
    industryCountOf,
    industryCapOf,
    gdpOf,
    incomeOf,
    upkeepOf,
    netIncomeOf,
    populationOf,
    inTerritory,
    inOwnCountry,
    radarRangeOf,
    radarLinked,
    sensorsOf,
    subSensorsOf,
    unitVisibleTo,
    replenishmentBuff,
    sensorsCover,
    sensedBy,
    radarLandCoverage,
    defenseRange,
    defenseMinRange,
    placementBlocked,
    nationName,
} from "./sim/queries.js";

export {OBJECTIVES, evaluateObjectives} from "./sim/objectives.js";

export {
    declareWar,
    makePeace,
    formAlliance,
    breakAlliance,
    ensureProd,
    prodCount,
    queueUnit,
    unitLockReason,
    embark,
    disembark,
    moveUnit,
    setSail,
    setMarch,
    stopSail,
    setPatrolSize,
    setAwacsPatrol,
    scrapUnit,
    commandAttack,
    hangarCount,
    queueAircraft,
    queueAmmo,
    cancelProd,
    setWarhead,
} from "./sim/production.js";

export {hangarCapOf} from "./sim/aircraft.js";

export {
    shelterLeadership,
    releaseLeadership,
    leadershipStatus,
    leadershipPct,
    commandFactor,
    bunkerOf,
} from "./sim/leadership.js";

export {trackPoint, leadInterceptPoint} from "./sim/combat.js";

export {step, growCities} from "./sim/tick.js";

export {updateStability, stabilityStatus, stabilityBreakdown, stabilityTarget} from "./sim/stability.js";

export {endWar, offerPeace, respondPeace, proposeAlliance, respondAlliance, dismissWarPopup} from "./sim/warResolution.js";
