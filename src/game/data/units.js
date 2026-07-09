// Unit registry — extracted verbatim from constants.js (behavior-preserving
// refactor to keep constants.js under the file-size budget; no values changed).
// Re-exported from constants.js so the public import surface is unchanged.
// Second half of UNITS lives in unitsExtra.js (file-size budget); spreading it
// in after the first-half entries preserves original key insertion order.

import {UNITS_EXTRA} from "./unitsExtra.js";

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
        range: 3000,
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
    // Shelters leadership (design/gdd/leadership.md). Immune to all fire except a
    // DIRECT Thermonuclear-class hit; can still be seized by enemy infantry.
    bunker: {
        label: "Leadership Bunker",
        desc: "Hardened national command. Shrugs off everything but a direct Thermonuclear strike — but enemy infantry that capture it decapitate you. Only one may ever be built.",
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
    ...UNITS_EXTRA
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

// One generic, nation-agnostic name per unit type (UNITS labels). Platform
// armament is generic flavor too — never named after any one country's missile.
export function unitLabel(type) {
    return UNITS[type].label;
}

export function armamentOf(type) {
    return type === "silo" ? "ICBM" : type === "launcher" ? "SICBM" : null;
}
