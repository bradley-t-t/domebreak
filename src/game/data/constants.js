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
    peaceLossThreshold: 0.35,        // sue for peace below this surviving-city fraction
    minWarSec: 90,                   // minimum war duration before a random ceasefire
    peaceChance: 0.06,               // odds per diplo tick of a ceasefire once past minWarSec
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
};

export const UNITS = {
    battery: {
        label: "SAM Battery",
        desc: "Mobile SAM battalion. Affordable point defense that thins out whatever leaks through the outer layers.",
        kind: "defense",
        cost: 150,
        buildTime: 8,
        range: 320,
        intercept: 0.5,
        reload: 3,
        fireCost: 12,
        hp: 50,
        upkeep: 1,
        glyph: "◆"
    },
    dome: {
        label: "Golden Dome",
        desc: "The national shield emplacement — a dense interceptor battery built to blunt a concentrated strike.",
        kind: "defense",
        cost: 400,
        buildTime: 14,
        range: 250,
        intercept: 0.85,
        reload: 4.5,
        fireCost: 22,
        hp: 90,
        upkeep: 3,
        glyph: "⬡"
    },
    radar: {
        label: "Early Warning Radar",
        desc: "Phased-array early warning. Builds the air picture and cues nearby interceptors far beyond their organic reach.",
        kind: "support",
        cost: 150,
        buildTime: 8,
        range: 1500,
        detect: true,
        hp: 40,
        upkeep: 1.5,
        glyph: "❉"
    },
    // Skywave sensor: sees launches far past the horizon, but its tracks are too
    // coarse to cue interceptors — warnOnly keeps it out of radarLinked.
    oth: {
        label: "Over-the-Horizon Radar",
        desc: "Ionospheric backscatter array. Spots launch plumes far over the horizon — strategic warning only, no fire control.",
        kind: "support",
        cost: 500,
        buildTime: 24,
        range: 5000,
        detect: true,
        warnOnly: true,
        hp: 35,
        upkeep: 2.5,
        glyph: "≋",
        hint: "Skywave array — detects launches far over the horizon. Warning only; can't guide interceptors."
    },
    // Launch platforms — the national missile they fire is armament (see armamentOf),
    // never the unit's own name.
    launcher: {
        label: "TEL",
        warheads: true, // fires the selectable strategic arsenal; conventional units don't
        ammo: ["sicbm"], // single-round mobile platform — the SICBM; no warhead picker
        signature: "sicbm",
        desc: "Road-mobile transporter-erector-launcher. Shoot-and-scoot SICBM strikes — reposition to dodge counter-battery; halts to fire. Shorter reach than a silo.",
        ballistic: true,
        kind: "offense",
        cost: 200,
        buildTime: 10,
        range: 8000,
        damage: 40,
        reload: 19.2,
        fireCost: 22,
        speed: 140,       // in-flight missile speed (ballistic), not ground movement
        landSpeed: 20,    // road-mobile: marches over land like a ground unit (shoot-and-scoot)
        hp: 45,
        upkeep: 2,
        glyph: "➤"
    },
    silo: {
        label: "Missile Silo",
        warheads: true,
        ammo: ["standard", "cluster", "thermo", "thermomirv"], // hardened ICBM — full strategic warhead range
        signature: "thermo",
        desc: "Hardened launch silo. Global-reach ICBMs carrying the heaviest strategic payloads.",
        ballistic: true,
        kind: "offense",
        cost: 320,
        buildTime: 16,
        range: 20000,
        damage: 55,
        reload: 39,
        fireCost: 45,
        speed: 140,
        hp: 60,
        upkeep: 4,
        glyph: "▲"
    },
    // Naval — deploy in coastal ocean inside your territory, never on land.
    // Carriers ship with their air wing (strike + multirole fighters).
    // navalSpeed = km per game-second while steaming to a waypoint (see setSail).
    // Every vessel carries its own radar (radarKm), each hull a different
    // strength — the fleet senses for itself, no shore radar needed.
    cruiser: {
        label: "Missile Cruiser",
        desc: "Fleet air-defense flagship — the longest interceptor reach afloat.",
        kind: "defense",
        domain: "sea",
        cost: 300,
        buildTime: 15,
        range: 700,
        intercept: 0.75,
        reload: 3.2,
        fireCost: 18,
        radarKm: 480,
        hp: 70,
        upkeep: 3,
        navalSpeed: 78,
        glyph: "⛴"
    },
    destroyer: {
        label: "Destroyer",
        desc: "Fast escort screen. Area air defense and the fleet's sub-hunter — its sonar finds boats that hide from radar.",
        kind: "defense",
        domain: "sea",
        cost: 220,
        buildTime: 12,
        range: 500,
        intercept: 0.65,
        reload: 3,
        fireCost: 14,
        radarKm: 400,
        // The surface ASW picket (naval-subs-asw GDD): its sonar reveals submerged
        // hulls within sonarKm (× nation sonarMult), the counter to enemy subs.
        asw: true,
        sonarKm: 300,
        hp: 60,
        upkeep: 2,
        navalSpeed: 96,
        glyph: "⛴"
    },
    battleship: {
        label: "Battleship",
        desc: "Standoff bombardment hull — conventional strike weight from open water.",
        kind: "offense",
        domain: "sea",
        cost: 360,
        buildTime: 18,
        range: 8000,
        damage: 42,
        reload: 24,
        fireCost: 26,
        speed: 80,
        radarKm: 240,
        hp: 95,
        upkeep: 4,
        navalSpeed: 58,
        glyph: "⛴"
    },
    carrier: {
        label: "Aircraft Carrier",
        desc: "A sovereign airfield at sea: strike fighters, surveillance, and reach anywhere the fleet sails.",
        kind: "support",
        domain: "sea",
        cost: 800,
        buildTime: 30,
        range: 2500,
        detect: true,
        radarKm: 2500,
        hp: 130,
        upkeep: 5,
        navalSpeed: 50,
        glyph: "⛴",
        wing: ["carrierfighter", "strikefighter", "awacs"]
    },
    // Airstrips ship with their air wing (air-superiority + close air support).
    airstrip: {
        label: "Airstrip",
        desc: "Forward operating strip. Houses, launches, and recovers the land-based air wing.",
        kind: "support",
        cost: 550,
        buildTime: 22,
        range: 60,
        hp: 45,
        upkeep: 1,
        glyph: "▭",
        wing: ["interceptor", "attack", "transport", "awacs"]
    },
    // Ground forces — see design/quick-specs/ground-forces-expansion-2026-07-05.md.
    // The Army Base is the land Airstrip: fields the helicopter wing, prerequisite
    // for all mobile ground units. Mobile ground units (landSpeed) march over land
    // exactly as ships steam over sea, and engage land targets only (targets: "land").
    armybase: {
        label: "Army Base",
        desc: "Garrison and helipad. Fields the helicopter wing and stages the ground forces.",
        kind: "support",
        domain: "land",
        cost: 480,
        buildTime: 20,
        range: 60,
        hp: 85,
        upkeep: 1,
        glyph: "▧",
        wing: ["helo", "transporthelo"]
    },
    // Unique national command structure. maxCount caps builds per nation.
    // Deliberately inert for now — command mechanics arrive in a later design pass.
    bunker: {
        label: "Leadership Bunker",
        desc: "Hardened national command authority. Only one may ever be built — keep it standing.",
        kind: "support",
        maxCount: 1,
        cost: 650,
        buildTime: 32,
        hp: 220,
        upkeep: 0.5,
        glyph: "⬢"
    },
    infantry: {
        label: "Infantry",
        desc: "Rifle divisions — cheap, tough, and slow. Close-range assault on land targets only. Holds a cleared city to capture its state.",
        kind: "offense",
        domain: "land",
        targets: "land",
        capture: true, // boots on the ground: may occupy and flip an enemy city's state
        requires: "armybase",
        landSpeed: 18,
        cost: 110,
        buildTime: 7,
        range: 250,
        damage: 14,
        reload: 13.2,
        fireCost: 6,
        speed: 30,
        hp: 75,
        upkeep: 0.8,
        glyph: "▪"
    },
    artillery: {
        label: "Artillery",
        desc: "Towed gun batteries — the longest ground reach, fragile up close.",
        kind: "offense",
        domain: "land",
        targets: "land",
        requires: "armybase",
        landSpeed: 13,
        cost: 210,
        buildTime: 11,
        range: 550,
        damage: 34,
        reload: 25.2,
        fireCost: 12,
        speed: 35,
        hp: 45,
        upkeep: 1.2,
        glyph: "▴"
    },
    tank: {
        label: "Tank Battalion",
        desc: "Armored maneuver force — the fastest thing on the ground. Can seize and hold enemy cities.",
        kind: "offense",
        domain: "land",
        targets: "land",
        capture: true, // armored maneuver arm: may occupy and flip an enemy city's state
        requires: "armybase",
        landSpeed: 26,
        cost: 190,
        buildTime: 9,
        range: 380,
        damage: 26,
        reload: 18,
        fireCost: 9,
        speed: 45,
        hp: 70,
        upkeep: 1.5,
        glyph: "▮"
    },
    // --- Tech-gated modern & space-age units (spec §8a) ---------------------
    // Each carries requiresTech: "<techId>" — buildable only once that tech is
    // done (enforced in sim/production.js queueUnit). The techId here MUST match
    // the `unlocks` on the corresponding tech in TECHS below. Space assets also
    // need the Space Command HQ standing (unit prereq handled in production.js).
    hypersonicbty: {
        label: "Hypersonic Missile Battery",
        warheads: true,
        ammo: ["hgv"], // dedicated hypersonic platform — single fixed round, no picker
        signature: "hgv",
        desc: "Boost-glide launcher fielding maneuvering hypersonic weapons — fast, low, and hard to intercept at regional reach.",
        kind: "offense",
        requiresTech: "off8",
        cost: 340,
        buildTime: 15,
        range: 7000,
        damage: 40,
        reload: 18,
        fireCost: 26,
        speed: 120,       // in-flight projectile base speed; the HGV round's speedMult scales it up further
        hp: 50,
        upkeep: 3,
        glyph: "➤"
    },
    patriot: {
        label: "Patriot Battery",
        desc: "Modern terminal SAM — hit-to-kill interceptors that tighten the last-ditch layer against aircraft and short-range missiles.",
        kind: "defense",
        requiresTech: "def5",
        cost: 260,
        buildTime: 11,
        range: 400,
        intercept: 0.7,
        reload: 3,
        fireCost: 16,
        hp: 55,
        upkeep: 2,
        glyph: "◆"
    },
    aegis: {
        label: "Aegis Ashore",
        desc: "Land-based Standard Missile site — a midcourse interceptor node that reaches out well beyond terminal SAMs.",
        kind: "defense",
        requiresTech: "def6",
        cost: 380,
        buildTime: 16,
        range: 900,
        intercept: 0.78,
        reload: 3.4,
        fireCost: 20,
        hp: 70,
        upkeep: 3,
        glyph: "⬡"
    },
    thaad: {
        label: "THAAD Battery",
        desc: "High-altitude terminal anti-ballistic defense — kills reentry vehicles above the atmosphere before they can bloom.",
        kind: "defense",
        antiBallistic: true,
        requiresTech: "def7",
        cost: 460,
        buildTime: 18,
        range: 700,
        // High-altitude area ABM: it kills reentry vehicles far out and high up.
        // Inside this keep-out radius the engagement geometry collapses, so the
        // battery can't fire — that inner gap is the lower tier's (Patriot) job.
        minRange: 250,
        intercept: 0.85,
        reload: 4,
        fireCost: 24,
        hp: 65,
        upkeep: 3.5,
        glyph: "⬡"
    },
    // Space assets — stationary national platforms with global/very-large reach,
    // deliberately abstracted (no orbital physics). All require Space Command HQ.
    sbi: {
        label: "Space-Based Interceptor",
        desc: "Orbital kinetic-kill layer — a global brilliant-pebbles net that engages boosters and midcourse threats anywhere.",
        kind: "defense",
        requiresTech: "def9",
        requiresUnit: "spacehq",
        cost: 900,
        buildTime: 30,
        range: 6000,
        intercept: 0.7,
        reload: 5,
        fireCost: 40,
        hp: 90,
        upkeep: 5,
        glyph: "✦"
    },
    orbitallaser: {
        label: "Orbital Laser",
        desc: "Space-based directed-energy shield — speed-of-light boost-phase kills with a near-perfect single-shot probability.",
        kind: "defense",
        requiresTech: "def10",
        requiresUnit: "spacehq",
        cost: 1200,
        buildTime: 34,
        range: 4000,
        intercept: 0.92,
        reload: 4,
        fireCost: 36,
        hp: 90,
        upkeep: 6,
        glyph: "✦"
    },
    spacehq: {
        label: "Space Command HQ",
        desc: "National space operations center. Only one may be built — the prerequisite for every orbital asset in the arsenal.",
        kind: "support",
        maxCount: 1,
        requiresTech: "cmd11",
        cost: 700,
        buildTime: 30,
        hp: 240,
        upkeep: 1,
        glyph: "✦"
    },
    reconsat: {
        label: "Reconnaissance Satellite",
        desc: "Fire-control-grade orbital sensor — a global surveillance eye that cues interceptors like a shore radar.",
        kind: "support",
        requiresTech: "det6",
        requiresUnit: "spacehq",
        cost: 650,
        buildTime: 26,
        range: 9000,
        detect: true,
        radarKm: 9000,
        hp: 40,
        upkeep: 4,
        glyph: "❉"
    },
    warnsat: {
        label: "Missile-Warning Satellite",
        desc: "Infrared launch-warning constellation — spots plumes worldwide, but its tracks are warning-only, no fire control.",
        kind: "support",
        requiresTech: "det4",
        requiresUnit: "spacehq",
        cost: 500,
        buildTime: 24,
        range: 14000,
        detect: true,
        warnOnly: true,
        radarKm: 14000,
        hp: 35,
        upkeep: 3,
        glyph: "≋"
    },
    orbitalstrike: {
        label: "Orbital Strike Platform",
        warheads: true,
        ammo: ["cluster", "thermo", "thermomirv"], // strategic-only orbital bus — no conventional round
        signature: "thermo",
        desc: "Global kinetic-bombardment platform — a rod-from-god that can strike anywhere on the board, slow to recycle.",
        kind: "offense",
        ballistic: true,
        requiresTech: "off11",
        requiresUnit: "spacehq",
        cost: 1100,
        buildTime: 34,
        range: 20000,
        damage: 55,
        reload: 54,
        fireCost: 50,
        speed: 160,
        hp: 60,
        upkeep: 6,
        glyph: "▲"
    },
    // --- Tech-gated naval units (spec §8b) — subs + logistics ---------------
    // Submarines are stealthy: submarine:true hulls are not revealed by ordinary
    // radar or satellites, only by asw sensors within sonarKm (see queries.js).
    "sub-ssn": {
        label: "Attack Submarine (SSN)",
        desc: "Nuclear hunter-killer — a stealthy hull that stalks fleets and lofts land-attack cruise missiles from hiding.",
        kind: "offense",
        domain: "sea",
        submarine: true,
        asw: true,
        sonarKm: 300,
        requiresTech: "eco4",
        cost: 420,
        buildTime: 20,
        range: 2500,
        damage: 30,
        reload: 21.6,
        fireCost: 20,
        speed: 70,
        radarKm: 120,
        hp: 65,
        upkeep: 4,
        navalSpeed: 64,
        glyph: "⟓"
    },
    "sub-ssbn": {
        label: "Ballistic Missile Sub (SSBN)",
        warheads: true,
        ammo: ["standard", "cluster", "thermo", "thermomirv"], // survivable second-strike leg — full strategic warhead range
        signature: "thermo",
        desc: "The survivable sea leg of the triad — a deep-stealth boomer whose tubes carry only strategic SLBMs: MIRV buses and city-killers for a guaranteed second strike.",
        kind: "offense",
        domain: "sea",
        ballistic: true,
        submarine: true,
        requiresTech: "cmd2",
        cost: 700,
        buildTime: 28,
        range: 20000,
        damage: 55,
        reload: 42,
        fireCost: 45,
        speed: 140,
        radarKm: 90,
        hp: 80,
        upkeep: 5,
        navalSpeed: 52,
        glyph: "⟓"
    },
    amphib: {
        label: "Amphibious Transport",
        desc: "Ships embarked ground units across the ocean and lands them on a hostile coast — the sea bridge for the land game.",
        kind: "support",
        domain: "sea",
        capacity: 4,
        requiresTech: "eco5",
        cost: 340,
        buildTime: 16,
        range: 60,
        radarKm: 160,
        hp: 75,
        upkeep: 2,
        navalSpeed: 60,
        glyph: "⛴"
    },
    replenish: {
        label: "Replenishment Ship",
        desc: "Underway replenishment oiler — rearms and refuels nearby friendly hulls, cutting their reload time and firing cost.",
        kind: "support",
        domain: "sea",
        resupplyKm: 250,
        requiresTech: "eco5",
        cost: 300,
        buildTime: 15,
        range: 60,
        radarKm: 200,
        hp: 70,
        upkeep: 2,
        navalSpeed: 60,
        glyph: "⛴"
    },
    // Industry — economic structures. Each adds flat income (output pts/s) and
    // grows the nation's effective GDP (gdpAdd, $T). They never fight, but they
    // can be struck; losing them costs the economy they carried. Industry is the
    // one thing you may still build while in deficit — it's the way back out.
    factory: {
        label: "Factory",
        kind: "industry",
        cost: 250,
        buildTime: 14,
        output: 3,
        gdpAdd: 0.2,
        hp: 60,
        upkeep: 0.5,
        glyph: "⚙",
        hint: "Heavy manufacturing — steady income and GDP growth."
    },
    port: {
        label: "Seaport",
        kind: "industry",
        coastal: true,
        cost: 340,
        buildTime: 18,
        output: 4.5,
        gdpAdd: 0.35,
        hp: 70,
        upkeep: 0.5,
        glyph: "⚓",
        hint: "Coastal trade hub — build on land beside the sea."
    },
    refinery: {
        label: "Oil Refinery",
        kind: "industry",
        requires: "factory",
        cost: 460,
        buildTime: 22,
        output: 6.5,
        gdpAdd: 0.5,
        hp: 65,
        upkeep: 1,
        glyph: "⛭",
        hint: "Petrochemical exports — strong income. Needs a Factory."
    },
    techpark: {
        label: "Tech Park",
        kind: "industry",
        requires: "factory",
        cost: 600,
        buildTime: 26,
        output: 9,
        gdpAdd: 0.7,
        hp: 55,
        upkeep: 1,
        glyph: "✦",
        hint: "High-tech sector — top-tier income. Needs a Factory."
    },
    // Aircraft only arrive as part of a carrier or airstrip wing — never bought alone.
    // airSpeed = km/game-second in flight; turnRate = max heading change (rad/s) — its
    // agility. Turn radius = airSpeed/turnRate, kept below the patrol ring so jets can
    // hold their orbit. `speed` is the munition it fires (unrelated to flight).
    multirole: {
        label: "Multirole Fighter",
        desc: "Workhorse multirole fighter — flexible strike at a friendly price.",
        kind: "offense",
        hidden: true,
        cost: 180,
        buildTime: 9,
        range: 3000,
        damage: 26,
        reload: 15.6,
        fireCost: 16,
        speed: 90,
        airSpeed: 78,
        radarKm: 220,
        turnRate: 1.3,
        hp: 40,
        upkeep: 2,
        glyph: "✈"
    },
    strikefighter: {
        label: "Strike Fighter",
        desc: "Low-observable strike fighter for deep attack against defended targets.",
        kind: "offense",
        hidden: true,
        cost: 300,
        buildTime: 13,
        range: 4500,
        damage: 38,
        reload: 18,
        fireCost: 20,
        speed: 100,
        airSpeed: 82,
        radarKm: 320,
        turnRate: 1.1,
        hp: 48,
        upkeep: 3,
        glyph: "✈"
    },
    interceptor: {
        label: "Air Superiority Fighter",
        desc: "Air-superiority interceptor — the fastest way to kill what flies. Can't engage ballistic reentry vehicles.",
        kind: "defense",
        hidden: true,
        cost: 340,
        buildTime: 14,
        range: 520,
        intercept: 0.8,
        reload: 3.5,
        fireCost: 20,
        airSpeed: 90,
        radarKm: 340,
        turnRate: 1.5,
        hp: 46,
        upkeep: 3,
        glyph: "✈"
    },
    attack: {
        label: "Close Air Support",
        desc: "Low-and-slow attack aircraft delivering withering close air support.",
        kind: "offense",
        hidden: true,
        cost: 160,
        buildTime: 8,
        range: 1200,
        damage: 46,
        reload: 20.4,
        fireCost: 14,
        speed: 70,
        airSpeed: 58,
        radarKm: 90,
        turnRate: 0.9,
        hp: 55,
        upkeep: 2,
        glyph: "✈"
    },
    transport: {
        label: "Transport Aircraft",
        desc: "Airlift for the wing — logistics muscle, not a combatant.",
        kind: "support",
        hidden: true,
        cost: 140,
        buildTime: 7,
        range: 60,
        airSpeed: 52,
        turnRate: 0.4,
        hp: 50,
        upkeep: 1,
        glyph: "✈"
    },
    awacs: {
        label: "AEW&C (AWACS)",
        desc: "Airborne early warning & control — a flying radar picket for fleet or front.",
        kind: "support",
        hidden: true,
        cost: 260,
        buildTime: 12,
        range: 900,
        detect: true,
        radarKm: 900,
        airSpeed: 52,
        turnRate: 0.45,
        hp: 35,
        upkeep: 3,
        glyph: "❉"
    },
    helo: {
        label: "Attack Helicopter",
        rotary: true, // helicopter: vertical lift-off, hover on station, vertical landing — not fixed-wing patrol
        desc: "Gunship close air support — slow, agile, deadly against surface targets.",
        kind: "offense",
        hidden: true,
        cost: 170,
        buildTime: 9,
        range: 900,
        damage: 24,
        reload: 18,
        fireCost: 10,
        speed: 55,
        airSpeed: 38,
        radarKm: 80,
        turnRate: 2.0,
        hp: 34,
        upkeep: 1.5,
        glyph: "✚"
    },
    transporthelo: {
        label: "Transport Helicopter",
        rotary: true,
        desc: "Heavy-lift rotor logistics for the ground wing — not a combatant.",
        kind: "support",
        hidden: true,
        cost: 120,
        buildTime: 7,
        range: 60,
        airSpeed: 34,
        turnRate: 1.6,
        hp: 40,
        upkeep: 0.8,
        glyph: "✚"
    },
    carrierfighter: {
        label: "Carrier Fighter",
        desc: "Carrier-borne multirole strike fighter — the deck's main punch.",
        kind: "offense",
        domain: "sea",
        hidden: true,
        cost: 240,
        buildTime: 11,
        range: 3500,
        damage: 30,
        reload: 16.8,
        fireCost: 18,
        speed: 95,
        airSpeed: 80,
        radarKm: 260,
        turnRate: 1.1,
        hp: 44,
        upkeep: 2.5,
        glyph: "✈"
    },
};
// Map unit type -> public/icons SVG basename (rendered by ui/common/UnitIcon).
export const UNIT_ICON = {
    silo: "silo",
    launcher: "hypersonic",
    battery: "battery",
    dome: "dome",
    radar: "radar",
    oth: "oth",
    cruiser: "cruiser",
    destroyer: "destroyer",
    battleship: "battleship",
    carrier: "carrier",
    airstrip: "airstrip",
    factory: "factory",
    port: "port",
    refinery: "refinery",
    techpark: "techpark",
    multirole: "jet", transport: "transport",
    strikefighter: "strike-fighter",
    interceptor: "interceptor",
    attack: "attack",
    awacs: "awacs",
    carrierfighter: "carrier-fighter",
    armybase: "armybase",
    bunker: "bunker",
    infantry: "infantry",
    artillery: "artillery",
    tank: "tank",
    helo: "helo",
    transporthelo: "transport-helo",
    // Tech-gated modern / space / naval units (spec §8a–§8b). Basenames are the
    // exact filenames the art pipeline emits under public/icons/.
    hypersonicbty: "hypersonicbty",
    patriot: "patriot",
    aegis: "aegis",
    thaad: "thaad",
    sbi: "sbi",
    orbitallaser: "orbitallaser",
    spacehq: "spacehq",
    reconsat: "reconsat",
    warnsat: "warnsat",
    orbitalstrike: "orbitalstrike",
    "sub-ssn": "sub-ssn",
    "sub-ssbn": "sub-ssbn",
    amphib: "amphib",
    replenish: "replenish"
};

// Map warhead type -> public/icons SVG basename (production queue + arsenal UI).
export const WARHEAD_ICON = {standard: "wh-standard", cluster: "wh-cluster", hgv: "wh-hgv", thermo: "wh-thermo", sicbm: "wh-standard", thermomirv: "wh-thermo"};

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

// Offensive munitions. Strikes consume a warhead of the loaded type; each has
// its own production cost/time, damage multiplier, and (for effect) flame color.
export const WARHEADS = {
    standard: {
        name: "Conventional",
        short: "CONV",
        role: "Balanced",   // one-word niche, surfaced on the payload picker chip
        dmgMult: 1.0,
        prodCost: 30,
        prodTime: 4,
        blastKm: 70,        // ground-zero blast radius; units inside take proximity-scaled damage
        flame: "#ff8a1a",   // exhaust/glow tint (SkyLayer --flame); trail is the smoke-plume color
        trail: "#e3e7ec",
        trailW: 2.4,
        desc: "Conventional single warhead. Cheap and quick to build."
    },
    cluster: {
        name: "Cluster",
        short: "CLU",
        role: "Area",
        mirv: true,         // splits into submunitions at reentry (data-driven MIRV trigger)
        dmgMult: 0.75,
        prodCost: 55,
        prodTime: 6,
        splash: 240,
        subCount: 8,
        spread: 300,
        subDmgFrac: 0.25,   // each sub-warhead carries this fraction of the bus damage
        primaryShare: 0.5,  // share of subs that stay on the primary target; the rest fan out
        blastKm: 0,         // area comes from the MIRV pattern (splash), not a single blast
        flame: "#61e0ff",
        trail: "#bfe9f7",
        trailW: 2.2,
        desc: "MIRV bus — splits into 8 warheads on reentry; half strike the target, half fan out to nearby targets."
    },
    hgv: {
        name: "Hypersonic Missile",
        short: "HYP",
        role: "Fast",
        dmgMult: 1.6,
        prodCost: 90,
        prodTime: 8,
        blastKm: 90,        // kinetic terminal impact — a tight, hard-hitting blast
        evasion: 0.32,      // maneuvering glide body; added to the projectile's intercept-evasion
        speedMult: 1.8,     // boost-glide overspeed — multiplies the firing platform's projectile speed
        flame: "#b98cff",
        trail: "#cdb8ff",   // thin ionization streak — a glide body, not a rocket plume
        trailW: 1.7,
        desc: "Maneuvering kinetic glide body — the fastest round in the arsenal and very hard to intercept. The Hypersonic Battery's signature round."
    },
    thermo: {
        name: "Thermonuclear",
        short: "THR",
        role: "Heavy",
        dmgMult: 2.4,
        prodCost: 130,
        prodTime: 11,
        blastKm: 170,       // vast fireball — a wide blast on top of the lingering fallout cloud
        flame: "#ff3b6b",
        trail: "#ffcdd6",   // heavy, dense plume off a big booster
        trailW: 3.0,
        desc: "City-killer yield. Expensive and slow to produce."
    },
    // Single heavy ballistic round of the road-mobile TEL — bigger warhead than a
    // conventional ICBM, shorter reach than a silo. A single-round platform, so it
    // never shows a warhead picker.
    sicbm: {
        name: "SICBM",
        short: "SICBM",
        role: "Mobile",
        dmgMult: 1.4,
        prodCost: 55,
        prodTime: 6,
        blastKm: 100,
        flame: "#ffb24d",
        trail: "#e3e7ec",
        trailW: 2.6,
        desc: "Road-mobile short-range ballistic missile with a heavy single warhead. Fired by the TEL."
    },
    // Thermonuclear MIRV — a multi-warhead strategic bus. Splits into a few
    // thermonuclear sub-warheads (fewer than a conventional Cluster), each leaving
    // fallout: a multi-city capstone strike, not single-target overkill.
    thermomirv: {
        name: "Thermonuclear MIRV",
        short: "TMRV",
        role: "Heavy MIRV",
        mirv: true,
        dmgMult: 2.4,
        prodCost: 210,
        prodTime: 17,
        splash: 280,
        subCount: 3,
        spread: 320,
        subDmgFrac: 0.6,    // each thermo sub carries this fraction of the bus damage
        primaryShare: 0.34, // ~1 of 3 subs stays on the primary; the rest fan to other cities
        blastKm: 120,
        flame: "#ff3b6b",
        trail: "#ffcdd6",
        trailW: 3.0,
        desc: "Multi-warhead thermonuclear bus — splits into three city-killers on reentry, each leaving fallout."
    },
};
// Ground-zero blast: on detonation every unit within a warhead's blastKm takes
// proximity-scaled damage — a fraction of the warhead's yield at the core, linearly
// down to the edge — on top of the direct hit. Cities keep direct-hit-only so the
// existing scoring/economy balance is untouched. Data-driven per the coding
// standards: the tick reads these numbers, they are never hardcoded in systems.
export const BLAST = {
    aoeShare: 0.6,   // peak blast damage as a fraction of the warhead's full yield, at ground zero
    edgeFrac: 0.3,   // fraction of that peak still dealt at the blast edge (0..1); core is 1
};
// Fraction of flight at which a MIRV bus (cluster / thermo-MIRV) releases its
// warheads — split early so the submunitions fan out over a long terminal run.
export const MIRV_SPLIT_AT = 0.3;
// Warhead display/cycling order (arsenal UI, loadout toggles).
export const WARHEAD_ORDER = ["standard", "cluster", "thermo", "thermomirv", "hgv", "sicbm"];
// Warhead stockpile every nation starts the match with.
export const AMMO_START = {standard: 6, cluster: 0, thermo: 0, thermomirv: 0, hgv: 0, sicbm: 0};

// Which strategic warheads each launcher may load. Warhead-capable units carry an
// explicit `ammo` allow-list on their UNITS entry; anything else falls back to the
// full order. The strike UI, the fire logic, and the setWarhead command all gate on
// this, so a platform can never load — or be shown — a payload it cannot carry.
export function allowedAmmo(type) {
    return UNITS[type]?.ammo || WARHEAD_ORDER;
}
// The warhead a freshly built platform comes loaded with. Ready-to-fire platforms
// default to the cheap Standard round they always have in stock; a strategic-only
// platform not cleared for Standard (the SSBN) loads its signature round instead —
// so the default is never a payload the platform can't carry. This is the single
// source of truth for the initial/fallback warhead; nothing hardcodes "standard".
export function initialWarhead(type) {
    const u = UNITS[type];
    if (!u?.warheads) return "standard";
    const allowed = allowedAmmo(type);
    if (allowed.includes("standard")) return "standard";
    return u.signature && allowed.includes(u.signature) ? u.signature : allowed[0];
}
// Reverse map for the production arsenal: the launcher unit types that can fire a
// given warhead, in canonical unit order. Drives each munition card's "fires from"
// icon row.
export function launchersForAmmo(key) {
    return Object.keys(UNITS).filter((t) => UNITS[t].warheads && allowedAmmo(t).includes(key));
}

// Radioactive fallout: certain warheads scatter long-lived contamination at
// ground zero. The resulting cloud drifts on the prevailing wind and irradiates
// every city and unit inside it — friend or foe alike — for damage over time
// until it decays. Data-driven per the coding standards: the tick and renderers
// read these numbers, they are never hardcoded in systems. See
// design/gdd/radioactive-fallout.md for the model and formulas.
export const FALLOUT = {
    warheads: ["thermo", "thermomirv"],   // warhead keys that leave a fallout cloud on impact
    radiusKm: 480,          // contamination radius at ground zero
    lifeSec: 80,            // sim seconds the cloud lingers before full decay
    riseSec: 6,             // seconds to reach peak intensity after detonation
    fadeFrac: 0.55,         // fraction of life spent at peak before decay begins
    dmgPerSec: 2.2,         // hp/sec at the cloud core, at peak intensity
    edgeFalloff: 0.35,      // intensity retained at the cloud edge (0..1); core is 1
    driftKmPerSec: 1.1,     // prevailing-wind drift speed of the cloud center
    driftHeadingDeg: 90,    // drift bearing (90 = due east / westerlies)
};

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

// One generic, nation-agnostic name per unit type (UNITS labels). Platform
// armament is generic flavor too — never named after any one country's missile.
export function unitLabel(type) {
    return UNITS[type].label;
}

export function armamentOf(type) {
    return type === "silo" ? "ICBM" : type === "launcher" ? "SICBM" : null;
}

// --- Eras -----------------------------------------------------------------
// Three chronological eras band the 12 research tiers (4 tiers each). ERAS is
// pure metadata consumed by the tech-tree UI for era banding — id, display
// name, inclusive tier range [lo, hi], flavor years, and a band color. Tech
// entries carry a matching `era` id so the UI can group lanes without recomputing
// the tier→era mapping.
export const ERAS = [
    {id: "coldwar", name: "Cold War", tierRange: [1, 4], years: "1947–1991", color: "#4fc3e8"},
    {id: "modern", name: "Modern", tierRange: [5, 8], years: "1991–2035", color: "#f4c02a"},
    {id: "space", name: "Space Age", tierRange: [9, 12], years: "2035+", color: "#b98cff"},
];

// Era id for a given 1-based tier (drives the `era` tag on every tech).
export function eraForTier(tier) {
    const e = ERAS.find((era) => tier >= era.tierRange[0] && tier <= era.tierRange[1]);
    return e ? e.id : ERAS[ERAS.length - 1].id;
}

// --- Tech cost / time scaling ---------------------------------------------
// Costs and research times escalate super-linearly with tier, so the deeper
// (more futuristic) a tech, the harder and slower it is to reach. Every tech's
// cost/time derives from its tier via these knobs unless it supplies an explicit
// override. Data-driven per coding standards — no scaling numbers in systems.
//   cost(tier) = round(TECH_COST_BASE * TECH_COST_GROWTH ^ (tier-1))
//   time(tier) = round(TECH_TIME_BASE * TECH_TIME_GROWTH ^ (tier-1))
// Difficulty tuning: bases dropped to 0.6× (900→540 pts, 80→48 s) to make the
// whole tree ~40% easier — every tier is 40% cheaper AND 40% faster to research,
// uniformly (scaling the base scales cost(tier)/time(tier) by the same factor at
// every tier), so time-to-any-tech falls ~40% without distorting the curve shape
// or the cost:time ratio.
export const TECH_COST_BASE = 540;
export const TECH_COST_GROWTH = 1.40;
export const TECH_TIME_BASE = 48;
export const TECH_TIME_GROWTH = 1.30;

// Auto-Research safety buffer. When the player enables the tech-tree Auto-Research
// toggle, the sim auto-queues the next affordable techs but only spends on a tech
// once the treasury holds this multiple of its cost — so a reserve equal to the
// tech's cost always remains for production and defense (points are charged at
// enqueue time). Data-driven per coding standards — no tuning numbers in systems.
export const AUTO_RESEARCH_RESERVE_MULT = 2;

// Derive the escalating research cost (points) for a 1-based tier.
export function techCostForTier(tier) {
    return Math.round(TECH_COST_BASE * TECH_COST_GROWTH ** (tier - 1));
}

// Derive the escalating research time (seconds) for a 1-based tier.
export function techTimeForTier(tier) {
    return Math.round(TECH_TIME_BASE * TECH_TIME_GROWTH ** (tier - 1));
}

// The five research tracks; TECHS entries reference these by path id.
// `color` is the doctrine accent — a per-track tactical tint used for the lane
// label + glyph chip so the five rows read as distinct doctrines at a glance.
// (Node/era chroma is a separate axis: the era band tints columns by epoch.)
export const TECH_PATHS = [
    {id: "off", name: "Strategic Command", glyph: "▲", color: "#e06a4f"}, // offense — warm strike red
    {id: "def", name: "Missile Shield", glyph: "⬡", color: "#4f9be0"},    // defense — shield blue
    {id: "eco", name: "War Economy", glyph: "$", color: "#59c08a"},       // economy — supply green
    {id: "det", name: "Early Warning", glyph: "❉", color: "#e0b34f"},     // detection — radar amber
    {id: "cmd", name: "Command & Control", glyph: "✦", color: "#9b7fe0"}, // C2 — command violet
];

// Build a linear tech chain for a track. Each def is a 1-based tier; tier N
// requires tier N-1. cost/time default to the tier-derived scaling curve above
// (per-def `cost`/`time` overrides win), and `era` is tagged from the tier.
function chain(path, defs) {
    const out = {};
    defs.forEach((d, i) => {
        const tier = i + 1;
        out[`${path}${tier}`] = {
            path,
            tier,
            req: i ? `${path}${i}` : null,
            era: eraForTier(tier),
            cost: techCostForTier(tier),
            time: techTimeForTier(tier),
            ...d, // per-tech cost/time/other overrides take precedence
        };
    });
    return out;
}

// 5 tracks × 12 tiers = 60 techs. Tiers 1–4 Cold War, 5–8 Modern, 9–12 Space
// Age. Each tech either boosts a nation multiplier (`apply`), unlocks a
// tech-gated unit (`unlocks: "<unitType>"` ↔ UNITS[type].requiresTech), or both.
// Cost/time come from the tier-scaling curve unless overridden.
export const TECHS = {
    // Strategic Command (off) — offense / strike.
    ...chain("off", [
        {name: "Fission Warheads", desc: "+15% strike damage", apply: (n) => (n.dmgMult *= 1.15)},
        {name: "Thermonuclear Warheads", desc: "+20% strike damage", apply: (n) => (n.dmgMult *= 1.2)},
        {name: "ICBM Program", desc: "+30% missile range", apply: (n) => (n.rangeMult *= 1.3)},
        {name: "MIRV Technology", desc: "+20% strike damage", apply: (n) => (n.dmgMult *= 1.2)},
        {name: "Precision Guidance (CEP)", desc: "+15% strike damage", apply: (n) => (n.dmgMult *= 1.15)},
        {name: "Cruise-Missile Doctrine", desc: "-15% reload time", apply: (n) => (n.reloadMult *= 0.85)},
        {name: "Penetration Aids / Decoys", desc: "+25% missile range", apply: (n) => (n.rangeMult *= 1.25)},
        {
            name: "Hypersonic Glide Vehicles",
            desc: "Unlocks the Hypersonic Missile Battery.",
            unlocks: "hypersonicbty",
            apply: (n) => (n.hypersonicEvasion += 0.15),
        },
        {name: "Maneuvering Reentry (MaRV)", desc: "+25% strike damage", apply: (n) => (n.dmgMult *= 1.25)},
        {
            name: "Fractional Orbital Bombardment (FOBS)",
            desc: "+30% missile range",
            apply: (n) => (n.rangeMult *= 1.3),
        },
        {
            name: "Kinetic Orbital Strike",
            desc: "Unlocks the Orbital Strike Platform.",
            unlocks: "orbitalstrike",
            apply: (n) => (n.dmgMult *= 1.15),
        },
        {name: "Directed-Energy Strike", desc: "+30% strike damage", apply: (n) => (n.dmgMult *= 1.3)},
    ]),
    // Missile Shield (def) — defense.
    ...chain("def", [
        {name: "Nike SAM Line", desc: "+10% intercept", apply: (n) => (n.interceptAdd += 0.1)},
        {name: "Anti-Ballistic Missile (Safeguard)", desc: "+10% intercept", apply: (n) => (n.interceptAdd += 0.1)},
        {name: "Layered Interceptors", desc: "+25% defense range", apply: (n) => (n.defRangeMult *= 1.25)},
        {
            name: "Phased-Array Fire Control",
            desc: "+25% interceptor speed",
            apply: (n) => (n.interceptorSpeedMult *= 1.25),
        },
        {name: "Patriot PAC-3", desc: "Unlocks the Patriot Battery.", unlocks: "patriot", apply: (n) => (n.interceptAdd += 0.08)},
        {name: "Aegis / Standard Missile", desc: "Unlocks Aegis Ashore; +10% intercept.", unlocks: "aegis", apply: (n) => (n.interceptAdd += 0.1)},
        {name: "THAAD", desc: "Unlocks the THAAD Battery.", unlocks: "thaad", apply: (n) => (n.defRangeMult *= 1.15)},
        {name: "Ground-Based Midcourse Defense", desc: "+12% intercept", apply: (n) => (n.interceptAdd += 0.12)},
        {name: "Brilliant Pebbles", desc: "Unlocks the Space-Based Interceptor.", unlocks: "sbi", apply: (n) => (n.interceptAdd += 0.08)},
        {name: "Directed-Energy Defense", desc: "Unlocks the Orbital Laser.", unlocks: "orbitallaser", apply: (n) => (n.interceptAdd += 0.1)},
        {name: "Boost-Phase Intercept", desc: "+15% intercept", apply: (n) => (n.interceptAdd += 0.15)},
        {name: "Golden Dome Doctrine", desc: "+35% defense range, +10% intercept", apply: (n) => {
            n.defRangeMult *= 1.35;
            n.interceptAdd += 0.1;
        }},
    ]),
    // War Economy (eco).
    ...chain("eco", [
        {name: "War Bonds", desc: "+20% income", apply: (n) => (n.incomeMult *= 1.2)},
        {name: "Military-Industrial Complex", desc: "+20% income", apply: (n) => (n.incomeMult *= 1.2)},
        {name: "Central Planning", desc: "-15% build cost", apply: (n) => (n.buildCostMult *= 0.85)},
        {
            name: "Nuclear Power",
            desc: "Nuclear propulsion — unlocks the Attack Submarine (SSN); -15% upkeep.",
            unlocks: "sub-ssn",
            apply: (n) => (n.upkeepMult *= 0.85),
        },
        {
            name: "Just-in-Time Logistics",
            desc: "Unlocks the Amphibious Transport & Replenishment Ship; -15% upkeep.",
            unlocks: "amphib",
            apply: (n) => (n.upkeepMult *= 0.85),
        },
        {name: "Globalized Supply Chains", desc: "+25% income", apply: (n) => (n.incomeMult *= 1.25)},
        {name: "Industrial Automation", desc: "-15% build cost", apply: (n) => (n.buildCostMult *= 0.85)},
        {name: "Additive Manufacturing", desc: "-15% build cost", apply: (n) => (n.buildCostMult *= 0.85)},
        {name: "Fusion Power", desc: "+30% income", apply: (n) => (n.incomeMult *= 1.3)},
        {name: "Orbital Mining", desc: "+30% income", apply: (n) => (n.incomeMult *= 1.3)},
        {name: "AI-Managed Economy", desc: "-20% upkeep", apply: (n) => (n.upkeepMult *= 0.8)},
        {name: "Post-Scarcity War Machine", desc: "+35% income, -15% build cost", apply: (n) => {
            n.incomeMult *= 1.35;
            n.buildCostMult *= 0.85;
        }},
    ]),
    // Early Warning (det) — detection. Later tiers scale sonarKm (ASW) via sonarMult.
    ...chain("det", [
        {name: "DEW-Line Radar", desc: "+25% radar coverage", apply: (n) => (n.radarMult *= 1.25)},
        {name: "Over-the-Horizon Backscatter", desc: "+30% radar coverage", apply: (n) => (n.radarMult *= 1.3)},
        {name: "BMEWS", desc: "+20% radar coverage", apply: (n) => (n.radarMult *= 1.2)},
        {
            name: "Early-Warning Satellite (DSP)",
            desc: "Unlocks the Missile-Warning Satellite.",
            unlocks: "warnsat",
            apply: (n) => (n.radarMult *= 1.1),
        },
        {name: "AWACS Datalink", desc: "+15% intercept", apply: (n) => (n.interceptAdd += 0.15)},
        {
            name: "Space-Based Infrared (SBIRS)",
            desc: "Unlocks the Reconnaissance Satellite.",
            unlocks: "reconsat",
            apply: (n) => (n.radarMult *= 1.15),
        },
        {name: "Multi-Spectral Tracking", desc: "+25% ASW sonar range", apply: (n) => (n.sonarMult *= 1.25)},
        {name: "Networked Sensor Fusion", desc: "+30% ASW sonar range, +20% radar coverage", apply: (n) => {
            n.sonarMult *= 1.3;
            n.radarMult *= 1.2;
        }},
        {name: "Persistent Orbital Constellation", desc: "+30% radar coverage", apply: (n) => (n.radarMult *= 1.3)},
        {name: "Hypersonic Tracking Layer", desc: "+30% interceptor speed", apply: (n) => (n.interceptorSpeedMult *= 1.3)},
        {name: "Quantum Radar", desc: "+35% ASW sonar range", apply: (n) => (n.sonarMult *= 1.35)},
        {name: "Global Surveillance Grid", desc: "+40% radar coverage, +25% ASW sonar range", apply: (n) => {
            n.radarMult *= 1.4;
            n.sonarMult *= 1.25;
        }},
    ]),
    // Command & Control (cmd).
    ...chain("cmd", [
        {name: "SAGE Network", desc: "+20% research speed", apply: (n) => (n.researchSpeedMult *= 1.2)},
        {
            name: "Nuclear Triad Doctrine",
            desc: "Unlocks the Ballistic Missile Sub (SSBN) — the sea leg of the triad.",
            unlocks: "sub-ssbn",
            apply: (n) => (n.dmgMult *= 1.1),
        },
        {name: "Mobile Launchers", desc: "-40% relocation cost", apply: (n) => (n.moveCostMult *= 0.6)},
        {name: "NORAD Hardened Bunkers", desc: "-15% upkeep", apply: (n) => (n.upkeepMult *= 0.85)},
        {name: "GPS / PNT", desc: "+15% strike damage", apply: (n) => (n.dmgMult *= 1.15)},
        {name: "Network-Centric Warfare", desc: "+20% radar coverage", apply: (n) => (n.radarMult *= 1.2)},
        {name: "Real-Time C4ISR", desc: "+10% intercept", apply: (n) => (n.interceptAdd += 0.1)},
        {name: "Drone Command", desc: "-15% build cost", apply: (n) => (n.buildCostMult *= 0.85)},
        {name: "Autonomous Battle Management", desc: "+25% interceptor speed", apply: (n) => (n.interceptorSpeedMult *= 1.25)},
        {name: "AI Decision Support", desc: "+25% research speed", apply: (n) => (n.researchSpeedMult *= 1.25)},
        {
            name: "Space Command",
            desc: "Unlocks the Space Command HQ — prerequisite for all orbital assets.",
            unlocks: "spacehq",
            apply: (n) => (n.researchSpeedMult *= 1.1),
        },
        {name: "Grand Strategy", desc: "+15% strike damage, +10% intercept", apply: (n) => {
            n.dmgMult *= 1.15;
            n.interceptAdd += 0.1;
        }},
    ]),
};

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
