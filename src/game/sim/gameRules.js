// Player-authored match rules. A tiny knob-set threaded into buildSetup /
// createWorld so both singleplayer (chosen on the New Game rules screen) and
// multiplayer (chosen in the lobby before Ready Up) can customize the war they
// spin up. The core sim reads these off `world.rules` at tick time, so a rule
// change is instantly authoritative for the running match — no re-seeding.
import {DIPLOMACY, GAME_SPEEDS, NEUTRAL, START_POINTS} from "../data/constants.js";
import {clamp} from "../../lib/math.js";

export const DEFAULT_RULES = Object.freeze({
    activeCount: NEUTRAL.defaultActive,          // participating nations in the match
    startPoints: START_POINTS,                    // opening points every nation starts with
    dominationPopFrac: DIPLOMACY.dominationPopFrac, // world-pop share that wins the war
    playerGraceSec: DIPLOMACY.playerGraceSec,     // opening ceasefire before AIs may declare on the player
    startSpeed: 1,                                // opening sim speed (SP only — MP is server-locked to 1x)
});

// Per-rule UI metadata: label, help copy, bounds, step, formatter. The
// GameRulesForm renders one control per entry here. `sp/mp` gate which flow a
// rule shows in — some rules simply don't apply online (speed is locked).
export const RULES_META = [
    {
        key: "activeCount",
        label: "Active Nations",
        help: "How many nations actually fight this war. The rest of the map stays as passive, capturable neutrals.",
        min: NEUTRAL.minActive,
        max: NEUTRAL.maxActive,
        step: 1,
        format: (v) => `${v}`,
        sp: true, mp: true,
    },
    {
        key: "startPoints",
        label: "Starting Points",
        help: "Points every nation starts with. Higher = faster opening buildouts.",
        min: 100,
        max: 2000,
        step: 50,
        format: (v) => `${v}`,
        sp: true, mp: true,
    },
    {
        key: "dominationPopFrac",
        label: "Domination Threshold",
        help: "Share of surviving world population you must hold to win by domination.",
        min: 0.25,
        max: 0.9,
        step: 0.05,
        format: (v) => `${Math.round(v * 100)}%`,
        sp: true, mp: true,
    },
    {
        key: "playerGraceSec",
        label: "Opening Grace (s)",
        help: "Seconds at match start during which AIs won't declare war on a human commander.",
        min: 0,
        max: 300,
        step: 5,
        format: (v) => `${v}s`,
        sp: true, mp: true,
    },
    {
        key: "startSpeed",
        label: "Starting Speed",
        help: "Opening sim speed — the HUD's speed hotkeys still work in-game.",
        min: 0,
        max: GAME_SPEEDS.length - 1,
        step: 1,
        format: (v) => `${GAME_SPEEDS[clamp(v, 0, GAME_SPEEDS.length - 1) | 0]}x`,
        toStored: (idx) => GAME_SPEEDS[clamp(idx, 0, GAME_SPEEDS.length - 1) | 0],
        fromStored: (mult) => {
            const i = GAME_SPEEDS.indexOf(mult);
            return i < 0 ? GAME_SPEEDS.indexOf(1) : i;
        },
        sp: true, mp: false,
    },
];

// Merge caller input over the defaults with per-rule clamps, so a saved payload
// (older shape, out-of-range value, garbage) can never propagate an invalid rule
// into the sim. Unknown keys are dropped.
export function normalizeRules(input) {
    const out = {...DEFAULT_RULES};
    if (!input || typeof input !== "object") return out;
    for (const meta of RULES_META) {
        const raw = input[meta.key];
        if (raw == null) continue;
        if (meta.key === "startSpeed") {
            const mult = Number(raw);
            out.startSpeed = GAME_SPEEDS.includes(mult) ? mult : DEFAULT_RULES.startSpeed;
            continue;
        }
        const num = Number(raw);
        if (!Number.isFinite(num)) continue;
        out[meta.key] = clamp(num, meta.min, meta.max);
    }
    return out;
}

// Rules shown in a given flow (sp | mp). Consumers render one control per entry.
export function rulesForMode(mode) {
    return RULES_META.filter((m) => m[mode]);
}
