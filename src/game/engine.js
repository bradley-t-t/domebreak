// GoldenDome real-time simulation engine. Pure and deterministic given its seed.
// This module is the stable public facade: world creation lives here, and
// every symbol the engine used to export directly is re-exported from the
// focused modules it now lives in (constants/queries/production/aircraft/
// combat/tick) so existing importers keep working unchanged.
import {AMMO_START, CAPITAL_HP, CITY_HP, START_POINTS, colorForSlot} from "./data/constants.js";
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
        research: {queue: [], current: null, done: []},
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
    }));
    const cities = setup.cities.map((c) => ({
        id: c.id,
        slot: c.slot,
        name: c.name,
        state: c.state || "",
        cap: c.cap ? 1 : 0,
        pop: c.pop || 0,
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
    unitLabel,
    armamentOf,
    TECH_PATHS,
    TECHS,
    HANGAR_SPEC,
    PATROL_FIGHTER,
    PATROL_SIZES,
} from "./data/constants.js";

export {haversine} from "./geo/geo.js";

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
    radarRangeOf,
    radarLinked,
    sensorsOf,
    subSensorsOf,
    unitVisibleTo,
    replenishmentBuff,
    sensorsCover,
    sensedBy,
    defenseRange,
    defenseMinRange,
    placementBlocked,
} from "./sim/queries.js";

export {
    declareWar,
    makePeace,
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
    basedAircraft,
    scrapUnit,
    commandAttack,
    canQueue,
    enqueueResearch,
    unqueueResearch,
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

export {step} from "./sim/tick.js";
