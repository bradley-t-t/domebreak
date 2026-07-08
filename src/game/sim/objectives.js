// Strategic objectives — the guided, ordered goals the player works through, shown
// in the in-game Objectives menu. This module is the single source of truth for what
// the objectives ARE and whether they're met; the UI (ui/hud/ObjectivesPanel) only
// renders what evaluateObjectives returns. Read-only over world state — objectives
// observe the sim, they never mutate it.
//
// All tuning (counts, coverage thresholds) lives in OBJECTIVES_TUNING in data/
// constants.js, never inline here — the definitions reference it so a balance pass
// only ever touches one file.
import {OBJECTIVES_TUNING, UNITS} from "../data/constants.js";
import {radarLandCoverage} from "./queries.js";

// Objective definitions, in the order the player should pursue them. Each objective
// is a list of tasks; a task is either a structure count (build N of a unit type) or
// a coverage goal (reach a fraction of land under radar). Kept declarative so adding
// a future objective is a data edit, not new logic.
export const OBJECTIVES = [
    {
        id: "command-and-air",
        title: "Establish Command",
        blurb: "Stand up national command authority and forward air power.",
        tasks: [
            {id: "bunker", kind: "build", type: "bunker", need: OBJECTIVES_TUNING.bunkersRequired},
            {id: "airstrips", kind: "build", type: "airstrip", need: OBJECTIVES_TUNING.airstripsRequired},
        ],
    },
    {
        id: "early-warning",
        title: "Early Warning Net",
        blurb: "Blanket your own territory in radar coverage.",
        tasks: [
            {id: "radar-cover", kind: "coverage", need: OBJECTIVES_TUNING.radarLandCover},
        ],
    },
];

// Live count of a nation's standing (hp > 0) structures of a given unit type.
function builtCount(w, slot, type) {
    let n = 0;
    for (const u of w.units) if (u.slot === slot && u.type === type && u.hp > 0) n++;
    return n;
}

// Resolve one task against the world into display state: current value, target,
// a 0..1 progress ratio, a completion flag, and a preformatted "3 / 2" style
// progress string the panel can show verbatim. `coverage` is passed in (already
// computed once by the caller) so the expensive land-coverage scan runs at most
// once per evaluation rather than per task.
function evalTask(task, w, slot, coverage) {
    if (task.kind === "coverage") {
        const have = coverage;
        return {
            id: task.id,
            label: `Radar coverage of your land`,
            kind: "coverage",
            done: have >= task.need,
            progress: task.need > 0 ? Math.min(1, have / task.need) : 1,
            detail: `${Math.round(have * 100)}% / ${Math.round(task.need * 100)}%`,
        };
    }
    // kind: "build" — count standing structures of the task's unit type.
    const have = builtCount(w, slot, task.type);
    const label = UNITS[task.type]?.label || task.type;
    return {
        id: task.id,
        label: task.need > 1 ? `${label} ×${task.need}` : label,
        kind: "build",
        done: have >= task.need,
        progress: task.need > 0 ? Math.min(1, have / task.need) : 1,
        detail: `${Math.min(have, task.need)} / ${task.need}`,
    };
}

// Evaluate every objective for a nation against the current world. Returns an array
// of {id, title, blurb, done, tasks:[...]} the panel renders directly. An objective
// is done when all its tasks are done. The land-coverage scan is run at most once
// here and shared across any coverage tasks; still, callers should memoize this on a
// coarse cadence (e.g. once per game-second) rather than every frame.
export function evaluateObjectives(w, slot) {
    if (!w || slot == null) return [];
    const needsCoverage = OBJECTIVES.some((o) => o.tasks.some((t) => t.kind === "coverage"));
    const coverage = needsCoverage ? radarLandCoverage(w, slot) : 0;
    return OBJECTIVES.map((o) => {
        const tasks = o.tasks.map((t) => evalTask(t, w, slot, coverage));
        return {
            id: o.id,
            title: o.title,
            blurb: o.blurb,
            done: tasks.every((t) => t.done),
            tasks,
        };
    });
}
