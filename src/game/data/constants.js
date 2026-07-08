// Up to 16 participants, each a distinct, readable color on the dark map.
// Slot 0 is always the local commander — rendered WHITE so "you" reads as the
// neutral friendly force in the black-&-white tactical scheme; hostiles keep
// their distinct hues so nations stay tellable apart on the map.
export const SLOT_COLOR = {
    0: "#f0f3f7", 1: "#ff5d5d", 2: "#f4c02a", 3: "#46d38a", 4: "#b57bff", 5: "#ff9f43",
    6: "#2ee6d6", 7: "#ff6ec7", 8: "#8ed14a", 9: "#5c7cfa", 10: "#ff8a5c", 11: "#c0e05a",
    12: "#e05a9c", 13: "#5ad1e0", 14: "#d98cff", 15: "#ffd05a",
};
export const MAX_SLOTS = 16;

// Distinct per-nation colors. Slots 0–15 use the hand-tuned palette above; every
// slot beyond it (the full-world roster runs to ~222 live nations) gets a
// deterministic color via golden-angle hue spacing, so adjacent slots stay
// tellable apart wherever nations are enumerated with a color chip. The player
// (slot 0) is always white. Data, not chrome — it lives here with the palette.
export const COLOR_S = 68, COLOR_L = 62;

export function colorForSlot(slot) {
    const hand = SLOT_COLOR[slot];
    if (hand) return hand;
    const hue = (slot * 137.508) % 360;
    return `hsl(${hue.toFixed(1)}, ${COLOR_S}%, ${COLOR_L}%)`;
}

// Simulation speed multipliers, slowest → fastest. Shared by the HUD, settings, and hotkeys.
export const GAME_SPEEDS = [0.5, 1, 2, 4, 10];

// Opening camera framing: when a game begins the view centers on the player's
// capital at a zoom that fits most of their nation. The frame is derived from
// the geographic span of the player's cities around the capital, then clamped.
export const START_CAM = {
    spanPad: 1.1,  // grow the nation's span before fitting, so it isn't edge-to-edge
    padPx: 60,      // pixel inset so the framed nation clears the HUD chrome
    maxZoom: 6.3,   // cap the opening zoom so even a city-state keeps regional context
    bootMs: 6000,   // failsafe: lift the loading veil after this even if the map never idles
};

// Interactive world-map zoom limits (MapLibre zoom levels; lower = further out).
// The floor is per-surface: gameplay clamps hard so the player stays in-theatre,
// while the attract globe and lobby nation-select keep a permissive floor so their
// pulled-back framing (~1.85–1.9) still renders. LiveGame passes `min`; the other
// surfaces use WorldMap's `menuMin` default.
export const WORLD_ZOOM = {
    min: 3.8,       // gameplay zoom-out floor (was 1.1 → 1.43 → 1.8 → 2.2 → 3.0; tightened further)
    menuMin: 1.1,   // permissive floor for attract/lobby so their wide framing isn't clamped
    max: 7,         // closest zoom-in allowed
};

// Keyboard (WASD) map-pan speed, in screen pixels per second. The pan is driven
// by short constant-velocity ease segments (see LiveGame's pan effect).
export const PAN_PX_PER_SEC = 1500;

// --- Core sim tuning (moved from engine.js — behavior-preserving extraction) ---
export const START_POINTS = 500;
export const MISSILE_SPEED = 140;
export const INTERCEPTOR_SPEED = 520;
export const RADAR_RANGE_MULT = 2.5;
export const TERRITORY_RADIUS = 550;
export const MOVE_COST_FRAC = 0.25;
// Ground occupation (see design/gdd/ground-combat-and-occupation.md). A capture-
// flagged ground unit (infantry/tank) that holds within holdKm of an enemy city
// — with no hostile unit inside contestKm to fight it off — accrues capture
// progress over captureSec game-seconds, then flips that city's whole state to
// the occupier. Progress bleeds off at decayPerSec when unheld or contested.
// A captor that also ASSAULTS the city (attacks it while holding) drives the
// flip assaultMult times faster: a capture-flagged unit's fire on a city it
// could take is converted to capture pressure instead of razing it (tick.js),
// so "attack the city" accelerates the capture rather than destroying it.
// Data-driven per coding standards — no capture number is hardcoded in systems.
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

// Income formula coefficients (see incomeOf in sim/queries.js):
// GDP-rated nations earn base + coef·√GDP·(surviving economy share) + industry;
// unrated nations fall back to a flat floor plus a per-surviving-city bonus.
export const ECONOMY = {
    incomeBase: 1.5,
    incomeGdpCoef: 4,
    fallbackBase: 2,
    fallbackPerCity: 0.6,
};

// Industry capacity: a nation may sustain BASE_INDUSTRY structures plus one more
// per POP_PER_INDUSTRY living people, capped at MAX_INDUSTRY. Living population
// scales with city health (see vitalityOf), so bombing enemy cities lowers their
// industrial ceiling and throttles their ability to rebuild. Shared across all
// kind:"industry" types (factory/port/refinery/techpark).
export const INDUSTRY = {
    base: 3,
    popPer: 40e6,
    max: 24,
};

// Population growth (see design/quick-specs/population-growth-2026-07-06.md).
// Each living city's people grow every tick, scaled by its vitality (hp/maxHp)
// so healthy cities repopulate and battered ones barely recover, capped at a
// multiple of the city's starting population. Pure/deterministic — a function of
// stored pop, hp, and dt, no RNG. Feeds populationOf → industry cap / domination.
export const POPULATION = {
    growthPerSec: 0.00015,   // fractional pop growth per game-second at full vitality
    growthCapMult: 1.5,      // pop ceiling as a multiple of starting pop (1.0 disables growth)
};

// Opponent-AI tuning (consumed by aiTick in sim/tick.js). Reserves are the
// points cushion the AI keeps on hand before committing to that purchase.
export const AI_TUNING = {
    thinkMin: 3, thinkSpan: 3,       // seconds between decisions: min + rand·span
    queueMax: 2,                     // keep the production line short — plan, don't hoard
    thermoChance: 0.25,              // odds per decision to arm/order a thermo warhead
    hgvChance: 0.3,                  // odds per decision to arm/order a hypersonic warhead
    sicbmChance: 0.3,                // odds per decision to arm/order a SICBM round (TEL)
    stdStockTarget: 4, stdReserve: 60,
    thermoStockTarget: 1, thermoReserve: 300,
    hgvStockTarget: 2, hgvReserve: 200,
    sicbmStockTarget: 2, sicbmReserve: 150,
    radarReserve: 100, othReserve: 150,
    industryTarget: 3, factoryReserve: 120,
    researchMinPoints: 350, researchChance: 0.55,
    siloReserve: 200, siloMinNet: 3,
    // Deep-tree tuning: the AI keeps researching past the Cold War tiers and
    // builds the units its completed techs unlock (see aiTick in sim/tick.js).
    // researchDepthTarget caps how deep any single track is pushed; deepReserve
    // is the extra points cushion required before committing to Modern/Space
    // tiers (they cost far more); unlockedBuildChance is the per-decision odds
    // the AI builds a freshly-unlocked tech-gated unit; spaceHqReserve is the
    // cushion before committing to the Space Command HQ prerequisite.
    researchDepthTarget: 12, deepReserve: 300, deepTierGate: 8,
    unlockedBuildChance: 0.5, spaceHqReserve: 700, subReserve: 260,
    // Strategic placement (see ai-strategic-placement-2026-07-06.md and aiPlace in
    // sim/tick.js). The AI sites units by role and spreads them across its cities
    // instead of piling everything onto the capital.
    spreadKm: 150,                   // min distance the AI keeps between two same-role units
    defensePerPoint: 0.5, defenseMax: 6,   // defenses built = clamp(round(protectPts·perPoint),1,max)
    radarPerCity: 0.25, radarMax: 3,       // radars built = clamp(round(cities·perCity),1,max)
    bunkerMinCities: 3, bunkerReserve: 150, // raise one leadership bunker once this established
};

// Living-world AI diplomacy + world-sim bounds. Consumed by diploTick and aiTick
// in sim/tick.js. Every country on the map is a live AI nation; these knobs govern
// how wars start and end between them, how hard distant peaceful nations are
// throttled, the fielding cap that bounds the global unit count, and the player's
// domination-victory threshold. All diplomacy rolls use the seeded rand(w), so the
// entire world history is reproducible from (seed, playerIso).
export const DIPLOMACY = {
    // War/peace rhythm.
    thinkMin: 12, thinkSpan: 10,     // seconds between a nation's diplomacy evaluations
    warRangeKm: 4200,                // max capital-to-capital distance for a war to start
    maxWars: 2,                      // simultaneous wars a nation will sustain
    declareChance: 0.35,             // odds per diplo tick an eligible nation opens a war
    playerGraceSec: 45,              // opening window before AIs may declare on the player
    wGdp: 0.6, wWeak: 0.8,           // rival weighting exponents: prefer wealthier / weaker
    wMin: 0.15, wMax: 8,             // clamp on any single rival's selection weight
    surrenderThreshold: 0.35,        // surrender (Defeat) below this surviving-city fraction
    minWarSec: 90,                   // minimum war duration before a white-peace offer
    peaceOfferChance: 0.06,          // odds per diplo tick an AI offers white peace once past minWarSec
    // Alliances (mutual-defense pacts — see design/gdd/alliances.md).
    maxAllies: 2,                    // simultaneous alliances a nation will hold
    allyRangeKm: 4200,               // max capital-to-capital distance to propose an alliance
    allyProposeChance: 0.05,         // odds per diplo tick an eligible AI proposes an alliance
    allySharedEnemyW: 2,             // extra proposal weight toward a candidate that shares an enemy
    // Level-of-detail: a nation at war or within activeRangeKm of the player runs its
    // build/attack AI (aiTick) at the normal cadence; everyone else runs on the slow
    // idle cadence — bounding heavy AI work to the action actually on the map.
    activeRangeKm: 4200,
    idleThinkMin: 20, idleThinkSpan: 20,
    aiUnitCap: 22,                   // max live units an AI nation fields (interception-loop bound)
    // Player victory: hold at least this share of surviving world population.
    dominationPopFrac: 0.5,
};

// Leadership continuity (see design/gdd/leadership.md). Each nation's national
// command is a pool of `startTokens` leader tokens seeded across its top cities —
// the capital holds the largest share, the rest spread over other major cities;
// Leadership% = (startTokens - lost) / startTokens. Tokens are airlifted to the
// Leadership Bunker by transport ferries (from every airstrip, several per strip)
// when war exposes them. All values are data-driven tuning knobs — no leadership
// number is hardcoded in systems code.
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
    penalizeResearch: true,     // scale research speed by the command factor too
};

// National Stability (see design/gdd/stability.md). Each nation's stability (0–100)
// eases toward a live target of 100 − Σ penalties, drawn from population loss, wars
// beyond the first, leadership killed or bunkered, and points deficits. It is an
// ambient HUD pressure readout with no mechanical consequence of its own. All values
// are data-driven knobs — no stability number is hardcoded in systems code.
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

// --- Unit registry (extracted to units.js; behavior-preserving refactor to
// keep this file under the size budget — no values changed). Re-exported here
// so every prior constants.js import (UNITS, UNIT_ICON, unitLabel, armamentOf)
// keeps working unchanged.
export * from "./units.js";

// Radar coverage overlay ring colors by sensor type. Dedicated ground sensors get
// distinct hues so the two warning tiers read apart at a glance; every other
// emitter (ships, aircraft, carriers) keeps its faction color. Map overlay
// colors are data, not chrome — they live here with the faction palette. The
// `space` violet is the third warning tier for orbital sensors; the recon and
// missile-warning satellite unit types map onto it so the coverage-ring lookup
// (RADAR_RING_COLORS[unit.type] in useLiveLayers) resolves them to the space hue.
export const RADAR_RING_COLORS = {
    oth: "#e8a33d",
    radar: "#4fc3e8",
    space: "#b98cff",
    reconsat: "#b98cff",
    warnsat: "#b98cff",
};

// --- Warhead registry (extracted to warheads.js; behavior-preserving refactor
// — no values changed). Re-exported here so every prior constants.js import
// (WARHEADS, WARHEAD_ICON, WARHEAD_ORDER, AMMO_START, BLAST, MIRV_SPLIT_AT,
// FALLOUT, allowedAmmo, initialWarhead, launchersForAmmo) keeps working unchanged.
export * from "./warheads.js";

// Spatial audio: the viewport is the listener. A world event's cue is placed in
// the stereo field by where it projects on screen and faded toward the edges;
// anything projecting outside the view (plus a small margin) is silent — combat
// you can't see doesn't reach you. Zoom is not modeled separately: on-screen
// plays, off-screen doesn't. See spatialize() in ui/live/LiveGame.jsx.
export const AUDIO_SPATIAL = {
    edgeMargin: 0.08,       // fraction of the viewport past each edge still audible before the hard cut to silence
    edgeGain: 0.55,         // on-screen loudness at the far corner (0..1); dead-centre is 1.0
    minGain: 0.3,           // floor under the radial rolloff so visible-but-edge cues stay present
};

// --- Tech tree registry (extracted to techs.js; behavior-preserving refactor
// — no values changed). Re-exported here so every prior constants.js import
// (TECHS, TECH_PATHS, ERAS, TECH_COST_BASE/GROWTH, TECH_TIME_BASE/GROWTH,
// AUTO_RESEARCH_RESERVE_MULT, eraForTier, techCostForTier, techTimeForTier)
// keeps working unchanged.
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
// point-to-point approach easing. Finer-grained control-law tuning that sits
// inside the runway/orbit geometry constants above.
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
// bundled data are metro figures; at setup newGame.js scales them so each
// nation's total matches reality, and each state's share becomes its economy %.
export const REAL_POP = {
    US: 335e6, RU: 144e6, CN: 1411e6, IN: 1429e6, GB: 68e6, FR: 68e6, DE: 84e6, JP: 124e6,
    BR: 216e6, KR: 52e6, IR: 89e6, TR: 85e6, SA: 37e6, PK: 240e6, CA: 40e6, AU: 27e6,
};
// Nominal GDP in $T (2024) — drives income weight between nations.
export const GDP_T = {
    US: 27.7, CN: 17.8, DE: 4.5, JP: 4.2, IN: 3.6, GB: 3.4, FR: 3.1, BR: 2.2,
    CA: 2.1, RU: 2.0, KR: 1.7, AU: 1.7, TR: 1.1, SA: 1.1, IR: 0.4, PK: 0.34,
};
