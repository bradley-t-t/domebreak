// DomeBreak real-time simulation engine. Pure and deterministic given its seed.
// The public facade: world creation lives here, and every engine symbol is
// re-exported from the focused modules it lives in (constants/queries/production/
// aircraft/combat/tick).
import {AMMO_START, CAPITAL_HP, CITY_HP, START_POINTS, TECHS, colorForSlot} from "./data/constants.js";
import {distributeLeadership} from "./sim/leadership.js";
import {DEFAULT_RULES, normalizeRules} from "./sim/gameRules.js";

// Builds a fresh world from a match setup: {mySlot, seed, nations: [{slot,
// name, iso, isAi, gdp}], cities: [{id, slot, name, state, cap, pop, econ,
// lng, lat}]}. The returned object is the entire game state — plain
// JSON-serializable data that the tick mutates in place.
export function createWorld(setup) {
    // Author's rules, seeded through buildSetup. Fall back to defaults so a
    // handcrafted setup (tests, legacy callers) always yields a valid rule set.
    const rules = normalizeRules(setup.rules ?? DEFAULT_RULES);
    const startPoints = rules.startPoints ?? START_POINTS;
    const nations = setup.nations.map((n) => ({
        slot: n.slot,
        name: n.name,
        iso: n.iso,
        isAi: !!n.isAi,
        // Active = a participating nation (human or AI). Inactive = passive neutral
        // (never ticks AI/diplomacy, but capturable). Defaults to active when the
        // setup doesn't specify, so all-active matches (multiplayer, attract) work.
        active: n.active !== false,
        gdp: n.gdp || 0,
        color: colorForSlot(n.slot),
        points: startPoints,
        alive: true,
        relations: {},
        // Small staggered first-think offset. Modulo (not raw slot) so the
        // singleplayer neutral-world roster — where active AIs are scattered
        // across a 222-nation slot space — can't leave a high-slot participant
        // idle for over a minute waiting for its first tick.
        _ai: 2 + (n.slot % 20) * 0.3,
        // Every tech id is marked done so every requiresTech unit is buildable from
        // the first tick. Techs no longer carry stat effects — this list is a pure
        // unit-unlock gate (see requiresTech in data/units.js).
        research: {done: Object.keys(TECHS)},
        ammo: {...AMMO_START},
        prod: {queue: [], current: null},
        stability: 100,   // national stability 0–100 (see sim/stability.js)
    }));
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
        paused: true,       // fresh worlds load paused — the commander presses play
        mySlot: setup.mySlot,
        seed: setup.seed || 1,
        rules,
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
        // Authored attack plans (Battle Planning). Player INTENT, not simulation state:
        // the tick never reads this. It rides on the world purely so it serializes with
        // the save — plans can be drafted in peacetime and persist across load. The UI
        // (useBattlePlans) reads/writes it through readBattlePlans / writeBattlePlans.
        battlePlans: {plans: [], activeId: null},
        winnerSlot: null,
        over: false
    };
}

// --- Re-exports: the engine's public API, sourced from its submodules. ---
export {
    START_POINTS,
    MISSILE_SPEED,
    INTERCEPTOR_SPEED,
    RADAR_RANGE_MULT,
    TERRITORY_RADIUS,
    MOVE_COST_FRAC,
    MIN_SEP,
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
    isAttacker,
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
    hasSurrendered,
    vitalityOf,
    falloutIntensity,
    falloutProximity,
    falloutDoseAt,
    industryOutputOf,
    industryCountOf,
    industryPendingOf,
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
    isActive,
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
} from "./sim/leadership.js";

export {trackPoint, leadInterceptPoint} from "./sim/combat.js";

export {solvePlan, planPreview, planAttackerTypeOptions, planTargets, targetCategoryOf, loadedWarhead, readBattlePlans, writeBattlePlans} from "./sim/battlePlan.js";

export {step, growCities, healCities} from "./sim/tick.js";

export {updateStability, stabilityStatus, stabilityBreakdown, stabilityTarget} from "./sim/stability.js";

export {endWar, offerPeace, respondPeace, proposeAlliance, respondAlliance, dismissWarPopup} from "./sim/warResolution.js";
