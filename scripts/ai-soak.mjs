// Headless AI soak: run full matches with every nation AI-driven at fixed
// seeds and report what the living world actually did — wars opened and how
// they ended, alliances formed/broken, economies that collapsed vs recovered,
// force composition, and step cost. Used to validate the AI pipeline and to
// sweep tuning knobs.
//
//   node scripts/ai-soak.mjs [--seeds 1,2,3] [--gameSec 3600] [--active 8] [--json]
//                            [--set "PEACE.losingRetrySec=30;WAR_STATE.stallAfterSec=120"]
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";
import {createWorld, step, netIncomeOf, UNITS} from "../src/game/engine.js";
import {buildSetup} from "../src/game/sim/newGame.js";
import * as TUNING from "../src/game/sim/ai/tuning.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const data = {
    cities: JSON.parse(readFileSync(join(root, "public/data/cities.json"), "utf8")),
    countries: JSON.parse(readFileSync(join(root, "public/data/countries.json"), "utf8")),
};

const arg = (name, dflt) => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : dflt;
};
const seeds = String(arg("seeds", "1,2,3")).split(",").map(Number);
const gameSec = Number(arg("gameSec", 3600));
const active = Number(arg("active", 8));
const asJson = process.argv.includes("--json");

// Tuning overrides for sweep runs: "GROUP.key=value;GROUP.key=value". The
// tuning module's exports are live objects, so assigning properties reshapes
// the AI for this process only.
const overrides = arg("set", "");
for (const pair of overrides.split(";").filter(Boolean)) {
    const [path, value] = pair.split("=");
    const [group, key] = path.trim().split(".");
    if (!TUNING[group] || !(key in TUNING[group])) throw new Error(`Unknown tuning knob: ${path}`);
    TUNING[group][key] = Number(value);
}

function runMatch(seed) {
    const setup = buildSetup(data, "US", null, seed, {activeCount: active, rules: {playerGraceSec: 45}});
    const w = createWorld(setup);
    for (const n of w.nations) n.isAi = true;   // fully AI-driven world — nobody idles as "the human"
    w.paused = false;

    const dt = 0.5;
    const steps = Math.round(gameSec / dt);
    const netSamples = new Map();               // slot -> [deficit ticks, samples]
    // The sim prunes old events, so tally them cumulatively as they appear.
    const seenEvents = new Set();
    const eventCounts = {};
    let stepMs = 0;
    const t0 = performance.now();
    for (let i = 0; i < steps; i++) {
        const s0 = performance.now();
        step(w, dt);
        stepMs += performance.now() - s0;
        for (const e of w.events) {
            if (seenEvents.has(e.id)) continue;
            seenEvents.add(e.id);
            eventCounts[e.type] = (eventCounts[e.type] || 0) + 1;
        }
        if (w.over) break;
        if (i % 120 === 0) {                    // sample economies every 60 game-sec
            for (const n of w.nations) {
                if (!n.alive || n.active === false) continue;
                const cur = netSamples.get(n.slot) || [0, 0];
                cur[1]++;
                if (netIncomeOf(w, n.slot) < 0) cur[0]++;
                netSamples.set(n.slot, cur);
            }
        }
    }
    const wallMs = performance.now() - t0;

    const count = (type) => eventCounts[type] || 0;
    const nations = w.nations.filter((n) => n.active !== false).map((n) => {
        const units = w.units.filter((u) => u.slot === n.slot && u.hp > 0);
        const byKind = {};
        for (const u of units) {
            const k = UNITS[u.type].kind || "other";
            byKind[k] = (byKind[k] || 0) + 1;
        }
        const [deficit, samples] = netSamples.get(n.slot) || [0, 0];
        return {
            iso: n.iso,
            alive: n.alive,
            cities: w.cities.filter((c) => c.slot === n.slot && c.alive).length,
            points: Math.round(n.points),
            net: Math.round(netIncomeOf(w, n.slot) * 10) / 10,
            units: units.length,
            byKind,
            ammo: Object.fromEntries(Object.entries(n.ammo || {}).filter(([, v]) => v > 0)),
            deficitFrac: samples ? Math.round((deficit / samples) * 100) / 100 : 0,
            wars: Object.values(n.relations).filter((r) => r === "war").length,
            allies: Object.values(n.relations).filter((r) => r === "ally").length,
            personality: n.personality,
        };
    });

    return {
        seed,
        gameSec: Math.round(w.time),
        over: w.over,
        winner: w.winnerSlot,
        wallMs: Math.round(wallMs),
        msPerStep: Math.round((stepMs / steps) * 100) / 100,
        events: {
            wars: count("war"),
            callToArms: count("callToArms"),
            conquests: count("conquest"),
            whitePeaces: count("peace"),
            alliances: count("alliance"),
            breaks: count("breakalliance"),
            captured: count("captured"),
        },
        nations,
    };
}

const results = seeds.map((seed) => {
    try {
        return runMatch(seed);
    } catch (err) {
        return {seed, error: `${err.message}\n${err.stack}`};
    }
});

if (asJson) {
    console.log(JSON.stringify(results, null, 2));
} else {
    for (const r of results) {
        if (r.error) {
            console.log(`seed ${r.seed}: ERROR ${r.error}`);
            continue;
        }
        console.log(`\nseed ${r.seed} — ${r.gameSec}s simulated, ${r.wallMs}ms wall (${r.msPerStep}ms/step)${r.over ? ` OVER winner=${r.winner}` : ""}`);
        console.log(`  events: ${JSON.stringify(r.events)}`);
        for (const n of r.nations) {
            console.log(`  ${n.iso.padEnd(3)} ${n.alive ? "alive" : "DEAD "} cities=${String(n.cities).padStart(2)} pts=${String(n.points).padStart(5)} net=${String(n.net).padStart(6)} units=${String(n.units).padStart(2)} deficit=${n.deficitFrac} wars=${n.wars} allies=${n.allies} kinds=${JSON.stringify(n.byKind)}`);
        }
    }
}
