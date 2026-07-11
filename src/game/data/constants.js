// Per-participant map colors, up to 16 slots. Slot 0 (the local commander) is
// white so "you" reads as the friendly force; hostiles keep distinct hues.
export const SLOT_COLOR = {
    0: "#f0f3f7", 1: "#ff5d5d", 2: "#f4c02a", 3: "#46d38a", 4: "#b57bff", 5: "#ff9f43",
    6: "#2ee6d6", 7: "#ff6ec7", 8: "#8ed14a", 9: "#5c7cfa", 10: "#ff8a5c", 11: "#c0e05a",
    12: "#e05a9c", 13: "#5ad1e0", 14: "#d98cff", 15: "#ffd05a",
};
export const MAX_SLOTS = 16;

// Per-nation colors. Slots 0–15 use the hand-tuned palette above; every slot
// beyond it (the roster runs to ~222 nations) gets a deterministic color via
// golden-angle hue spacing so adjacent slots stay tellable apart.
const COLOR_S = 68, COLOR_L = 62;

export function colorForSlot(slot) {
    const hand = SLOT_COLOR[slot];
    if (hand) return hand;
    const hue = (slot * 137.508) % 360;
    return `hsl(${hue.toFixed(1)}, ${COLOR_S}%, ${COLOR_L}%)`;
}

// Simulation speed multipliers, slowest → fastest. Shared by the HUD, settings, and hotkeys.
export const GAME_SPEEDS = [0.5, 1, 2, 4, 10];

// Opening camera framing: centers on the player's capital at a zoom fitting most
// of their nation, derived from the geographic span of their cities, then clamped.
export const START_CAM = {
    spanPad: 1.1,  // grow the nation's span before fitting, so it isn't edge-to-edge
    padPx: 60,      // pixel inset so the framed nation clears the HUD chrome
    maxZoom: 6.3,   // cap the opening zoom so even a city-state keeps regional context
    bootMs: 6000,   // failsafe: lift the loading veil after this even if the map never idles
};

// Interactive world-map zoom limits (MapLibre zoom levels; lower = further out).
// The floor is per-surface: gameplay clamps hard to keep the player in-theatre,
// while attract/lobby keep a permissive floor so their pulled-back framing still
// renders. LiveGame passes `min`; other surfaces use WorldMap's `menuMin` default.
export const WORLD_ZOOM = {
    min: 3.54,      // gameplay zoom-out floor
    menuMin: 1.1,   // permissive floor for attract/lobby so their wide framing isn't clamped
    max: 7,         // closest zoom-in allowed
};

// Keyboard (WASD) map-pan speed, in screen pixels per second.
export const PAN_PX_PER_SEC = 1500;

// Hard latitude limit for camera panning, in degrees. Kept inside the tile/relief
// data edge (MERC_LAT ≈ 85.05°) and short of the polar projection singularity
// where meridians converge and the vector map re-settles — the cause of polar pan
// stutter. Applied in both projections.
export const PAN_LAT_LIMIT = 82;

// Core sim tuning.
export const START_POINTS = 500;
export const MISSILE_SPEED = 140;
export const INTERCEPTOR_SPEED = 520;
export const RADAR_RANGE_MULT = 2.5;
export const TERRITORY_RADIUS = 550;
export const MOVE_COST_FRAC = 0.25;
// Ground occupation. A capture-flagged ground unit (infantry/tank) that holds
// within holdKm of an enemy city — with no hostile unit inside contestKm — accrues
// capture progress over captureSec game-seconds, then flips that city's state to
// the occupier. Progress bleeds off at decayPerSec when unheld or contested. A
// captor that also assaults the city drives the flip assaultMult times faster:
// its fire is converted to capture pressure instead of razing the city.
export const CAPTURE = {
    holdKm: 70,
    contestKm: 140,
    captureSec: 22,
    decayPerSec: 0.15,
    assaultMult: 2.6,
};
export const MIN_SEP = 45;
// City survivability: warhead damage subtracts from these; a city dies at 0.
export const CITY_HP = 100;
export const CAPITAL_HP = 140;
// Hard ceiling on any interceptor hit probability, after research bonuses stack.
export const INTERCEPT_CAP = 0.97;
// Terminal engagement envelope (km): an interceptor inside this resolves its kill roll.
export const INTERCEPT_KILL_RADIUS_KM = 50;
// Normalized climb-out altitude above which a based aircraft can fight and radiate.
export const AIRBORNE_ALT = 0.55;
// Fraction of build cost refunded when a unit is dismantled.
export const SCRAP_REFUND_FRAC = 0.5;
// Max distance (km) from open water at which a coastal structure may be sited.
export const COAST_KM = 60;
// Amphibious lift: transport embark/disembark range for ground units (km).
export const AMPHIB_LIFT_KM = 120;
// Reload multiplier a hull gets while inside a friendly Replenishment Ship's resupplyKm.
export const REPLENISH_RELOAD_MULT = 0.7;
// Stat fallbacks for unit types that omit a field (and legacy-save projectiles).
export const DEFAULT_BUILD_TIME = 10, DEFAULT_RELOAD = 3, DEFAULT_HIT_PROB = 0.8;
// Effective GDP ($T) assumed for nations missing from the GDP_T table.
export const GDP_FALLBACK_T = 0.5;

// Income formula coefficients (see incomeOf in sim/queries.js). GDP-rated nations
// earn base + coef·√GDP·(surviving economy share) + industry; unrated nations fall
// back to a flat floor plus a per-surviving-city bonus.
export const ECONOMY = {
    incomeBase: 1.5,
    incomeGdpCoef: 4,
    fallbackBase: 2,
    fallbackPerCity: 0.6,
    aiUpkeepMult: 0.5,               // AI nations pay half the unit upkeep a human does
};

// Industry capacity: a nation may sustain `base` structures plus one more per
// `popPer` living people, capped at `max`. Living population scales with city
// health, so bombing enemy cities lowers their industrial ceiling. Shared across
// all kind:"industry" types (factory/port/refinery/techpark).
export const INDUSTRY = {
    base: 12,
    popPer: 20e6,
    max: 48,
};

// Population growth. Each living city's people grow every tick, scaled by its
// vitality (hp/maxHp) so healthy cities repopulate and battered ones barely
// recover, and by national prosperity — the owner's effective GDP over its
// baseline GDP, clamped to [gdpGrowthFloor, gdpGrowthCap] — so a wrecked economy
// slows repopulation and built industry quickens it. Capped at a multiple of
// starting population. Deterministic — a function of stored pop, hp, nation GDP,
// and dt. Feeds populationOf → industry cap / domination.
export const POPULATION = {
    growthPerSec: 0.0009,    // fractional pop growth per game-second at full vitality
    growthCapMult: 2.0,      // pop ceiling as a multiple of starting pop (1.0 disables growth)
    gdpGrowthFloor: 0.25,    // prosperity multiplier floor — even a dead economy trickles
    gdpGrowthCap: 1.5,       // prosperity ceiling as industry lifts GDP past its baseline
};

// City reconstruction. A damaged-but-living city rebuilds hpFracPerSec of its max
// health every game-second while its owner is still standing — alive, and not
// inside the post-surrender window a lost war opens (see hasSurrendered in
// sim/queries.js). A destroyed city (0 hp — its people are gone) never rebuilds.
export const CITY_REGEN = {
    hpFracPerSec: 0.0015,    // fraction of maxHp restored per game-second
};

// Opponent-AI tuning lives in sim/ai/tuning.js, organized by pipeline stage.

// Strategic objectives — the guided goals shown in the Objectives menu (see
// sim/objectives.js). Counts are how many of a structure the goal wants;
// radarLandCover is the fraction (0..1) of the nation's own land area that must sit
// under its radar picture to clear the early-warning objective.
export const OBJECTIVES_TUNING = {
    bunkersRequired: 1,
    airstripsRequired: 2,
    radarLandCover: 0.8,
    factoriesRequired: 3,
    refineriesRequired: 2,
    samBatteriesRequired: 3,
    patriotsRequired: 2,
    thaadRequired: 2,
    aegisRequired: 1,
    silosRequired: 2,
    launchersRequired: 2,
};

// Living-world AI diplomacy + world-sim bounds. Consumed by the AI pipeline in
// sim/ai/ (its own knobs live in sim/ai/tuning.js). These govern how wars start
// and end, how hard distant peaceful nations are throttled, the fielding cap on
// AI unit count, and the player's domination-victory threshold. Diplomacy rolls
// use the seeded rand(w), so world history is reproducible from (seed, playerIso).
export const DIPLOMACY = {
    // War/peace rhythm.
    thinkMin: 12, thinkSpan: 10,     // seconds between a nation's diplomacy evaluations
    warRangeKm: 4200,                // max capital-to-capital distance for a war to start
    maxWars: 2,                      // simultaneous wars a nation will sustain
    declareChance: 0.35,             // odds per diplo tick an eligible nation opens a war
    playerGraceSec: 45,              // opening window during which no nation may declare war
    wMin: 0.15, wMax: 8,             // clamp on any single rival's selection weight
    surrenderThreshold: 0.35,        // surrender (Defeat) below this surviving-city fraction
    minWarSec: 90,                   // minimum war duration before a white-peace offer
    peaceOfferChance: 0.06,          // odds per diplo tick an AI offers white peace once past minWarSec
    playerPeaceCooldownSec: 240,     // after sending a peace offer to a human (or being declined) an AI waits this long before offering again
    // Alliances (mutual-defense pacts).
    maxAllies: 2,                    // simultaneous alliances a nation will hold
    allyRangeKm: 4200,               // max capital-to-capital distance to propose an alliance
    allyProposeChance: 0.05,         // odds per diplo tick an eligible AI proposes an alliance
    allySharedEnemyW: 2,             // extra proposal weight toward a candidate that shares an enemy
    playerAllianceCooldownSec: 240,  // after proposing alliance to a human (or being declined) an AI waits this long before proposing again
    // Level-of-detail: a nation at war or within activeRangeKm of the player runs its
    // build/attack AI (aiTick) at the normal cadence; everyone else runs on the slow
    // idle cadence — bounding heavy AI work to the action actually on the map.
    activeRangeKm: 4200,
    idleThinkMin: 20, idleThinkSpan: 20,
    // Player victory: hold at least this share of surviving world population.
    dominationPopFrac: 0.5,
};

// Bounded-match / neutral-world model. A match runs at most `maxActive`
// participating ("active") nations; every other country stays on the map as a
// passive, capturable NEUTRAL that never builds and never wages war.
export const NEUTRAL = {
    maxActive: 8,        // hard cap on active (participating) nations in a match
    minActive: 2,        // floor — you plus at least one rival
    defaultActive: 8,    // singleplayer default active count
    scatterMinKm: 3000,  // seeding target: greedy farthest-point keeps active capitals apart
};

// Leadership continuity. Each nation's command is a pool of `startTokens` leader
// tokens seeded across its top cities — the capital holds the largest share, the
// rest spread over other major cities; Leadership% = (startTokens - lost) /
// startTokens. Tokens are airlifted to the Leadership Bunker by transport ferries
// when war exposes them.
export const LEADERSHIP = {
    startTokens: 12,            // leader tokens per nation (also the Leadership% denominator)
    leaderCities: 5,            // how many of a nation's cities hold leadership (capital + top others)
    capitalShare: 0.4,          // fraction of the pool seeded on the capital (rest spread by population)
    perPlane: 3,                // tokens a transport carries per ferry trip
    loadSec: 4,                 // ground delay loading leaders at a city
    unloadSec: 4,               // ground delay unloading at the bunker
    transportsPerAirstrip: 3,   // concurrent ferry transports each airstrip flies
    launchGapSec: 2.5,          // min seconds between successive takeoffs from ONE airstrip (queue, not all-at-once)
    escortsPerFerry: 2,         // patrol fighters scrambled to escort each leadership ferry
    escortOffsetKm: 7,          // formation stand-off the escorts hold off the ferry
    arriveKm: 12,               // distance to count a ferry "arrived" at a waypoint
    commandFloor: 0.5,          // national output multiplier at 0% Leadership (1.0 at 100%)
    // The Leadership Bunker is hardened: ONLY a direct hit from one of these
    // warheads destroys it — everything else (conventional/cluster/HGV strikes,
    // blast waves, fallout, and ground fire) bounces off. Enemy infantry capturing
    // the bunker also decapitates its owner (see occupation.js). A nation whose
    // leadership is fully wiped out (lost >= total) surrenders every war and is
    // eliminated from the match (see warResolution.decapitationTick).
    bunkerKillWarheads: ["thermo", "thermomirv"],
};

// National Stability. Each nation's stability (0–100) eases toward a live target of
// 100 − Σ penalties, drawn from population loss, wars beyond the first, leadership
// killed or bunkered, and points deficits. An ambient HUD pressure readout with no
// mechanical consequence of its own.
export const STABILITY = {
    easePerSec: 0.05,           // fraction of the gap to target closed per game-second
    freeWars: 1,                // simultaneous wars allowed before the "too many wars" penalty starts
    wPerWar: 12,                // stability lost per war beyond freeWars
    wPopLoss: 60,               // stability lost at total population loss (linear in fraction lost)
    wLeadLoss: 40,              // stability lost at total leadership loss (linear in fraction lost)
    wBunkered: 10,              // stability lost while leadership is fully sheltered (small, linear)
    wDeficit: 15,               // flat stability lost while running a points deficit
    wDefeat: 30,                // peak stability lost the instant a war is lost (see sim/warResolution.js)
    defeatSec: 17520,           // game-seconds the Defeat penalty decays over — one in-game year
                                // (HUD clock: 1 game-sec = 30 in-game min → 365·24·60/30 = 17520)
};

// Battle Planning — player-authored attack plans. Tuning for the plan solver, the
// auto-resupply cadence, and the globe preview.
export const BATTLE_PLAN = {
    maxPlans: 8,                // cap on simultaneous plans a player may author
    defaultEngagementKm: 20000, // starting dial — wide open (active nations are seeded far
                                // apart, often >12000 km, so a shorter default would leash
                                // reachable targets out of range). Players dial DOWN to leash.
    minEngagementKm: 500,       // slider floor
    maxEngagementKm: 20000,     // slider ceiling — matches the silo's global reach (units.js silo.range)
    engagementStepKm: 500,      // slider granularity
    autoBuildIntervalSec: 4,    // min game-seconds between auto-resupply queue actions per plan
    // Per-plan preview arc/target colors, cycled by plan index — chosen distinct
    // from the faction hues (white/red/blue/grey) so a plan never reads as a nation.
    planColors: ["#f0a63c", "#4fd1c5", "#c084fc", "#f472b6", "#60a5fa", "#a3e635", "#fb923c", "#e879f9"],
    // Target categories for the Battle Planning screen. A plan selects attacker unit
    // TYPES and these target CATEGORIES (type → type), never individual map units; the
    // solver maps each at-war enemy entity to a category. `city` (types:null) = enemy
    // cities.
    targetCategories: [
        {id: "city", label: "Cities", types: null},
        {id: "strike", label: "Missile Platforms", types: ["silo", "launcher", "battleship", "hypersonicbty", "orbitalstrike", "sub-ssbn", "sub-ssn"]},
        {id: "airdef", label: "Air Defense", types: ["dome", "battery", "patriot", "thaad", "aegis", "cruiser", "destroyer", "orbitallaser"]},
        {id: "sensors", label: "Sensors", types: ["radar", "oth", "reconsat"]},
        {id: "airbases", label: "Airbases", types: ["airstrip", "carrier", "armybase"]},
        {id: "command", label: "Command", types: ["bunker", "spacehq"]},
        {id: "ground", label: "Ground Forces", types: ["infantry", "artillery", "tank"]},
    ],
};

// Unit registry (UNITS, UNIT_ICON, unitLabel, armamentOf).
export * from "./units.js";

// Radar coverage overlay ring colors by sensor type. Dedicated ground sensors get
// distinct hues so the warning tiers read apart; every other emitter keeps its
// faction color. The `space` violet is the orbital-sensor tier that reconsat maps
// onto (RADAR_RING_COLORS[unit.type]).
export const RADAR_RING_COLORS = {
    oth: "#e8a33d",
    radar: "#4fc3e8",
    space: "#b98cff",
    reconsat: "#b98cff",
};

// Warhead registry (WARHEADS, WARHEAD_ICON, WARHEAD_ORDER, AMMO_START, BLAST,
// MIRV_SPLIT_AT, FALLOUT, allowedAmmo, initialWarhead, launchersForAmmo).
export * from "./warheads.js";

// Spatial audio: the viewport is the listener. A world event's cue is placed in the
// stereo field by where it projects on screen and faded toward the edges; anything
// outside the view (plus a small margin) is silent — combat you can't see doesn't
// reach you. See spatialize() in ui/live/LiveGame.jsx.
export const AUDIO_SPATIAL = {
    edgeMargin: 0.08,       // fraction of the viewport past each edge still audible before the hard cut to silence
    edgeGain: 0.55,         // on-screen loudness at the far corner (0..1); dead-centre is 1.0
    minGain: 0.3,           // floor under the radial rolloff so visible-but-edge cues stay present
};

// Tech tree registry.
export * from "./techs.js";

// Hangar complement per base type — aircraft live as STOCK (counts), not units,
// until they launch. Caps double as the max you can restock to via production.
export const HANGAR_SPEC = {
    airstrip: {interceptor: 10, attack: 15, transport: 20, awacs: 1},
    carrier: {carrierfighter: 20, strikefighter: 10, awacs: 1},
    armybase: {helo: 6, transporthelo: 2},
};
// Which type flies defensive patrols from each base, in real flight sizes.
export const PATROL_FIGHTER = {airstrip: "interceptor", carrier: "carrierfighter", armybase: "helo"};
export const PATROL_SIZES = [0, 2, 4];

// Housed until launched; jets roll out along the runway axis, climb, loiter until
// bingo fuel, hold for the runway, fly a lined-up approach, land and roll out, then
// refuel. The runway handles ONE operation at a time (base.op), so departures and
// arrivals queue — holding traffic stacks and lands in turn.
export const PATROL_FUEL = 45, REFUEL_TIME = 14, LAUNCH_GAP = 3.5;
// Patrol orbit geometry (km): AWACS holds a wide ring; fighters stack in four
// staggered rings stepping outward so a multi-ship CAP doesn't stack up.
export const AWACS_ORBIT_KM = 330, FIGHTER_ORBIT_BASE_KM = 140, FIGHTER_ORBIT_STEP_KM = 45;
export const KM_PER_DEG = 111;
export const ROLL_KM = 35, CLIMB_KM = 95, APPROACH_KM = 210, ROLLOUT_KM = 42, HOLD_PAD = 50, AIRSTRIP_RUNWAY = 0.95;
// Rotary-wing (helicopter) flight: no runway. HELO_STATION_KM is the picket radius
// each helo patrols around its base; HELO_PATROL_RATE is how fast (rad/s) its picket
// point walks that ring, so the flight sweeps a slow circle instead of hovering in
// place; HELO_CLIMB_T is the vertical lift-off / touchdown time constant (s to rise/settle).
export const HELO_STATION_KM = 95, HELO_PATROL_RATE = 0.08, HELO_CLIMB_T = 1.1;
export const TRAIL_DT = 0.4, TRAIL_LEN = 9;

// Flight-model tuning for flyAircraft/flyFerry's per-phase state machines: climb-out
// speed/vis ramps, orbit-hold bank geometry, localizer intercept/final-approach
// tolerances, touchdown/rollout deceleration, and the leadership ferry's
// point-to-point approach easing.
export const FLIGHT = {
    // Climb-out (takeoff phase)
    ROLL_SPEED_MULT: 0.5,      // ground-roll speed added atop half airSpeed while rolling
    ROLL_CLEAR_PAD_KM: 20,     // roll distance past ROLL_KM before the runway clears
    TAKEOFF_VIS_KM: 8,         // vis ramps to 1 over this many km of roll

    // Orbit-hold guidance (shared by the cruise and hold rings)
    ORBIT_BANK_RAD: 0.9,       // max bank correction for radial error (rad)
    ORBIT_RADIAL_DIV: 80,      // radial error divisor feeding the bank correction
    CRUISE_ALT_SLEW_T: 1.5,    // altitude slew time constant while cruising/holding (s)
    HOLD_PATTERN_MAX: 2,       // max aircraft already in the landing pattern before another may enter

    // Localizer intercept ("toFinal")
    LEAD_MIN_KM: 70,
    LEAD_MAX_KM: 160,
    LEAD_SPEED_TURN_MULT: 2.2,
    INTERCEPT_ALONG_KM: 40,           // distance out where intercept control begins
    INTERCEPT_TURN_RAD: 1.1,          // max cross-track turn angle during intercept (rad)
    INTERCEPT_CROSS_DIV: 40,          // cross-track divisor feeding the intercept turn
    INTERCEPT_CAPTURE_CROSS_KM: 15,   // cross-track tolerance to call the localizer captured
    INTERCEPT_CAPTURE_HDG_RAD: 0.9,   // heading tolerance to call the localizer captured
    PATTERN_ENTRY_BACK_MULT: 1.6,     // outbound leg distance, as a multiple of LEAD
    PATTERN_ENTRY_OFFSET_KM: 70,      // lateral offset of the pattern-entry point

    // Final approach
    GO_AROUND_ALONG_KM: 10,     // below this range, still off centerline → go around
    CROSS_CAPTURE_KM: 6,        // on-centerline tolerance (go-around trigger and touchdown capture)
    SHORT_FINAL_ALONG_KM: 35,   // range at which the strip is claimed for landing
    FINAL_TURN_RAD: 0.6,        // max cross-track turn angle on final (rad)
    FINAL_CROSS_DIV: 25,        // cross-track divisor feeding the final turn
    FINAL_SPEED_MULT: 0.7,      // throttled-back airspeed fraction on final
    GLIDE_SLOPE_FRAC: 0.85,     // fraction of APPROACH_KM used as the glide-slope reference
    FINAL_ALT_SLEW_T: 1.2,      // altitude slew time constant on final (s)
    TOUCHDOWN_ARRIVE_PAD_KM: 2, // range pad added to the per-tick travel when testing for touchdown
    TOUCHDOWN_ALT_CAP: 0.05,    // altitude clamp the instant touchdown is called

    // Touchdown / rollout
    ROLLOUT_MIN_DECEL: 0.18,    // deceleration floor so rollout speed never bottoms at zero early
    ROLLOUT_SPEED_MULT: 0.5,    // half airSpeed scaled by decel during rollout
    ROLLOUT_VIS_FRAC: 0.85,     // fraction of ROLLOUT_KM used as the vis fade-out reference

    // Leadership ferry (flyFerry) point-to-point flight
    FERRY_VIS_RAMP_T: 0.8,          // vis ramps to 1 over this time constant (s)
    TRAIL_ALT_THRESHOLD: 0.02,      // altitude above which a trail point is recorded
    FERRY_APPROACH_SPEED_MULT: 0.3, // speed floor fraction on approach to a waypoint
    FERRY_APPROACH_RANGE_DIV: 1.5,  // range divisor easing speed down on approach
    FERRY_APPROACH_TURN_MULT: 3,    // turn-rate multiplier tightening the ferry's turn on approach
};

// Real-world country populations (2024 estimates). City/state populations in the
// bundled data are metro figures; at setup newGame.js scales them so each nation's
// total matches reality, and each state's share becomes its economy %.
export const REAL_POP = {
    US: 335e6, RU: 144e6, CN: 1411e6, IN: 1429e6, GB: 68e6, FR: 68e6, DE: 84e6, JP: 124e6,
    BR: 216e6, KR: 52e6, IR: 89e6, TR: 85e6, SA: 37e6, PK: 240e6, CA: 40e6, AU: 27e6,
    // Remaining members of the 30-nation great-power pool (see POWER_POOL).
    ID: 277e6, MX: 129e6, IT: 59e6, ES: 48e6, NL: 18e6, PL: 37e6, EG: 111e6, UA: 38e6,
    ZA: 60e6, TW: 23e6, SE: 10.5e6, AE: 9.9e6, IL: 9.8e6, NG: 223e6,
};
// Nominal GDP in $T (2024) — drives income weight between nations.
export const GDP_T = {
    US: 27.7, CN: 17.8, DE: 4.5, JP: 4.2, IN: 3.6, GB: 3.4, FR: 3.1, BR: 2.2,
    CA: 2.1, RU: 2.0, KR: 1.7, AU: 1.7, TR: 1.1, SA: 1.1, IR: 0.4, PK: 0.34,
    // Remaining members of the 30-nation great-power pool (see POWER_POOL).
    ID: 1.4, MX: 1.8, IT: 2.3, ES: 1.6, NL: 1.1, PL: 0.84, EG: 0.35, UA: 0.18,
    ZA: 0.38, TW: 0.79, SE: 0.6, AE: 0.55, IL: 0.55, NG: 0.25,
};
