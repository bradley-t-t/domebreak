// AI tuning v2 — every knob the opponent AI reads, organized by pipeline stage.
// Replaces the flat AI_TUNING block that lived in data/constants.js. Numbers that
// survived the redesign keep their old values; new knobs are grouped with the
// module that consumes them. Reserves are the points cushion the AI keeps on hand
// before committing to that purchase.

// Think cadence + production line. Active nations (at war, or near the player)
// think on the fast cadence; distant peacetime nations idle on the slow one —
// the same level-of-detail bound the old AI used (DIPLOMACY.activeRangeKm).
export const THINK = {
    activeMin: 3, activeSpan: 3,
    queueMax: 4,                 // human-style: keep the production line steadily fed
    lossTrackSec: 2,             // cadence of the war-damage attribution pass (ledger)
};

// Threat map — coarse per-cell inbound-fire pressure over a nation's ground.
export const THREAT = {
    maxCells: 140,               // grid resolution cap (cols x rows) per nation
    bufferDeg: 3,                // grid margin past the nation's city bounding box
    distScaleKm: 5000,           // pressure falloff scale with attacker distance
    peacetimeRivalW: 0.25,       // rivals we are NOT at war with still project this much pressure
    coverageIntercept: 1.4,      // gap denominator weight per covering interceptor's kill probability
    leaderValue: 6e6,            // protect-value a leadership token adds to a cell
    industryValue: 4e6,          // protect-value an industry structure adds to a cell
    profiledRivals: 12,          // nearest rivals that get full profiles / threat sources per think
    profiledRivalsLite: 4,       // same cap for an idle nation's lite frame (no threat grid)
};

// Posture thresholds (assessment/posture.js).
export const POSTURE = {
    turtleRatio: 0.6,            // my strength / strongest rival bloc below this -> turtle
    blitzRatio: 1.5,             // clear superiority at war -> blitz (with aggression)
    decapLeadPct: 40,            // foe leadership below this invites a decapitation posture
    decapStrikeMin: 3,           // strategic launch platforms needed before decap is credible
    pressAggression: 0.7,        // peacetime aggression bias above this leans press
};

// Personality distribution (personality.js). Traits are seeded per nation from
// (world seed, slot, iso) — reproducible across saves and replays.
export const PERSONALITY = {
    floor: 0.12, span: 0.76,     // traits sample in [floor, floor+span] — off the degenerate extremes
};

// Doctrine selection + composition weights (doctrine/doctrines.js).
export const DOCTRINE = {
    overlayWeight: 0.5,          // wants weight of a stacked sub-doctrine vs the primary
    spaceGdpMin: 6,              // effective GDP ($T) before the Space path scores
    spaceRushMin: 0.6,           // spaceRush trait floor for the Space overlay
    projectionNavalism: 0.55,    // navalism trait floor for Projection to lead
    steamrollerRatio: 1.15,      // ground-power edge over the front foe to favor Steamroller
    firstStrikeDecap: 0.55,      // decapFocus trait floor for FirstStrike to lead
    smallNationCities: 4,        // at or below this many cities Turtle scores strongly
};

// Forward budget (economy/budget.js).
export const BUDGET = {
    horizonThinks: 8,            // projection window in think cycles
    minNet: 0.5,                 // never buy a non-industry item that projects net below this
    scrapMinNet: -0.5,           // trigger scrapping when net < this (a small buffer under zero)
    scrapMaxPerThink: 1,         // at most one dismantle per decision
    brokePoints: 300,            // any deficit with fewer points than this also scraps (see budget.js)
};

// Desired-force targets + reserves (doctrine wants). Carried over from AI_TUNING.
export const WANTS = {
    factoryReserve: 80,
    portTarget: 2, portReserve: 100,
    refineryTarget: 2, refineryReserve: 140,
    techparkReserve: 180,
    industryBootstrap: 4,        // hold-everything industry floor before military spend competes
    radarPerCity: 0.5, radarMax: 5, radarReserve: 60,
    othReserve: 100,
    siloTarget: 4, siloReserve: 100, siloMinNet: 1,
    launcherTarget: 3, launcherReserve: 60,
    hyperTarget: 2, hyperReserve: 120,
    defensePerPoint: 1.0, defenseMax: 14,
    bunkerMinCities: 2, bunkerReserve: 100,
    armyReserve: 100,
    groundTarget: 8,
    artilleryShare: 0.25,
    destroyerTarget: 2, destroyerReserve: 120,
    cruiserTarget: 1, cruiserReserve: 180,
    battleshipTarget: 1, battleshipReserve: 200,
    carrierTarget: 1, carrierReserve: 500,
    amphibTarget: 1, amphibReserve: 180,
    replenishTarget: 1, replenishReserve: 180,
    spaceHqReserve: 500, subReserve: 200,
    ammoPerPlatformWar: 3,
    ammoPerPlatformPeace: 1,
    stdReserve: 40, thermoReserve: 180, clusterReserve: 60,
    thermomirvReserve: 220, hgvReserve: 120, sicbmReserve: 90,
    hangarTargets: {
        interceptor: 6, attack: 6, transport: 4, awacs: 1,
        carrierfighter: 8, strikefighter: 4, helo: 4, transporthelo: 2,
    },
    patrolSize: 2,
};

// Placement (placement/).
export const PLACE = {
    spreadKm: 150,               // same-role minimum spacing
    scrapSafeRadiusKm: 550,      // preserve defenders within this of a protect-point
    gapTopK: 5,                  // threat-map gap cells considered per defense siting
};

// Fires (fires/) — AI-authored battle plans through the shared solver.
export const FIRES = {
    engagementKm: 20000,         // wide open — the solver already prefers near targets
    thermoChance: 0.35,          // odds a strategic shot upgrades to its signature payload
    hgvChance: 0.4,
    sicbmChance: 0.4,
};

// War-lifecycle state thresholds (diplomacy/warLifecycle.js).
export const WAR_STATE = {
    trendAlpha: 0.25,            // EMA weight for the per-think strength trend
    stallAfterSec: 150,          // no movement past this age reads as a stall
    losingDamageRatio: 1.6,      // taken/dealt above this (with a negative trend) reads as losing
    winningDamageRatio: 0.7,     // below this the war is going our way
    routedLeadPct: 25,           // leadership at/below this is a rout
    routedFracMargin: 0.08,      // surviving-city fraction within this of auto-surrender is a rout
    cityLossPerMinLosing: 0.6,   // cities/game-minute loss rate that reads as losing
    lossWindowSec: 45,           // city-loss rate is measured over this window, never per-think
};

// Peace cadence + acceptance (diplomacy/peace.js). Retry intervals scale with
// personality.patience (patient nations endure longer before suing again).
export const PEACE = {
    routedRetrySec: 15,
    losingRetrySec: 45,
    stallRetrySec: 120,
    acceptDamageRatio: 1.5,      // accept when we've taken this much more than we dealt (past minWarSec)
    refuseDamageRatio: 0.8,      // refuse while clearly ahead in the opening/prosecute phase
    impatienceAgeMult: 2,        // low-patience nations accept once age > minWarSec x this
    maxDeclinesPerWar: 2,        // stop offering to a foe who has refused this many times this war
    vindictiveMin: 0.7,          // vindictive nations refuse unless clearly losing
    ceaseFireSec: 300,           // no re-declaring on a foe for this long after a white peace
};

// Alliances (diplomacy/alliance.js).
export const ALLIANCE = {
    counterweightRatio: 0.9,     // propose a pact when my bloc / rising rival bloc < this
    proposeLoyaltyMin: 0.4,      // very low-loyalty AIs almost never propose
    acceptLoyaltyLean: 0.6,      // loyal nations lean yes on a clean-record proposer
    breakLoyaltyMax: 0.2,        // only the least loyal break a pact on a strength flip alone
    breakStrengthFlip: 1.8,      // my bloc / ally bloc above this tempts the disloyal to walk
    freeloaderWars: 2,           // ally sat out this many of my wars -> freeloader
};

// Betrayal windows (diplomacy/betrayal.js).
export const BETRAYAL = {
    loyaltyMax: 0.4,             // only low-loyalty nations (or the wronged) take the free hit
    targetFracMax: 0.55,         // target's surviving fraction below this marks it as staggering
    minReadiness: 0.6,           // doctrine wants satisfied before an opportunistic war opens
};

// Declare-war gates layered on the bloc-power weighing (diplomacy/diplomacy.js).
export const DECLARE = {
    readinessMin: 0.5,           // fraction of key wants satisfied before opening a war
    grudgeDamageT: 150,          // ledger damage taken from a rival that starts nudging revenge
    grudgeW: 0.5,                // revenge weight per unit of grudge, scaled by vindictiveness
    declinedW: 0.35,             // extra weight per peace offer they refused us
    warRangeGdpBoostT: 1.5,      // ($T) GDP above which warRangeKm scales up
    warRangeMaxKm: 14000,        // ceiling for great-power reach (~global)
    blocGdpWeight: 1.0,
    blocForceWeight: 0.8,
    blocAdvantageMin: 1.1,       // only declare when my bloc / their bloc >= this
    weaknessTopN: 5,
    targetDistScaleKm: 6000,
    targetTopN: 4,
};
