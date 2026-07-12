// Player-authored match rules. A tiny knob-set threaded into buildSetup /
// createWorld so both singleplayer (chosen on the New Game rules screen) and
// multiplayer (chosen in the lobby before Ready Up) can customize the war they
// spin up. The core sim reads these off `world.rules` at tick time, so a rule
// change is instantly authoritative for the running match — no re-seeding.
import {DIPLOMACY, NEUTRAL, START_POINTS} from "../data/constants.js";
import {clamp} from "../../lib/math.js";

export const DEFAULT_RULES = Object.freeze({
    activeCount: NEUTRAL.defaultActive,          // participating nations in the match
    startPoints: START_POINTS,                    // opening points every nation starts with
    dominationPopFrac: DIPLOMACY.dominationPopFrac, // world-pop share that wins the war
    playerGraceSec: DIPLOMACY.playerGraceSec,     // opening ceasefire during which nobody may declare war
    balanced: false,                              // equalize GDP/pop across nations for a level opening
    aiPicks: [],                                  // ISOs the player pinned as AI belligerents ([] = fully random)
});

// Per-rule UI metadata: label, help copy, bounds, step, formatter. The
// GameRulesForm renders one control per entry here. `sp/mp` gate which flow a
// rule shows in — MP still ignores knobs that don't apply online.
// `type` selects the control: "range" (default) or "toggle".
const RULES_META = [
    {
        key: "activeCount",
        label: "Active Nations",
        help: "How many nations actually fight this war. The rest of the map stays as passive, capturable neutrals.",
        type: "range",
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
        type: "range",
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
        type: "range",
        min: 0.25,
        max: 0.9,
        step: 0.05,
        format: (v) => `${Math.round(v * 100)}%`,
        sp: true, mp: true,
    },
    {
        key: "playerGraceSec",
        label: "Opening Grace",
        help: "Seconds at match start during which no nation — human or AI — may declare war. Up to one full hour.",
        type: "range",
        min: 0,
        max: 3600,
        step: 30,
        format: formatGrace,
        sp: true, mp: true,
    },
    {
        key: "balanced",
        label: "Balanced Start",
        help: "Equalize every nation's GDP and population at match start so no one begins with an economic edge.",
        type: "toggle",
        sp: true, mp: true,
    },
];

// Pretty-print a grace duration: seconds under a minute, m:ss under an hour,
// "1h" at the top of the range.
function formatGrace(sec) {
    const s = Math.max(0, Math.round(sec));
    if (s < 60) return `${s}s`;
    if (s >= 3600) return "1h";
    const m = Math.floor(s / 60), r = s % 60;
    return r === 0 ? `${m}m` : `${m}m ${r}s`;
}

// Merge caller input over the defaults with per-rule clamps, so a saved payload
// (older shape, out-of-range value, garbage) can never propagate an invalid rule
// into the sim. Unknown keys are dropped.
export function normalizeRules(input) {
    const out = {...DEFAULT_RULES, aiPicks: []};
    if (!input || typeof input !== "object") return out;
    // aiPicks isn't a RULES_META control (it's rendered by a dedicated nation
    // picker, not a slider/toggle) so it's sanitized here: uppercase ISO strings,
    // de-duped, capped to the active-nation ceiling.
    if (Array.isArray(input.aiPicks)) {
        out.aiPicks = [...new Set(input.aiPicks
            .map((s) => String(s).toUpperCase())
            .filter(Boolean))].slice(0, NEUTRAL.maxActive);
    }
    for (const meta of RULES_META) {
        const raw = input[meta.key];
        if (raw == null) continue;
        if (meta.type === "toggle") {
            out[meta.key] = !!raw;
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
