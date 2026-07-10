// Opponent AI entrypoint. Each active AI nation, once per think, runs the full
// pipeline over a fresh PerceptionFrame:
//
//   Perception -> Assessment -> Doctrine -> Budget -> Placement -> Fires
//                                                            -> Diplomacy -> Orders
//
// Every stage is a pure function of the frame; only orders/ mutates the world,
// and every random draw flows through the seeded rand(w) so matches replay.
// Nations far from the player and at peace think on the slow idle cadence —
// the same level-of-detail bound the previous AI used.
import {DIPLOMACY} from "../../data/constants.js";
import {haversine} from "../../geo/geo.js";
import {rand} from "../worldState.js";
import {ensureProd} from "../production.js";
import {randRange} from "../../../lib/random.js";
import {ensurePersonality} from "./personality.js";
import {buildFrame, capPositions} from "./perception/perception.js";
import {assessPosture} from "./assessment/posture.js";
import {assessFocus} from "./assessment/focus.js";
import {assessWarPlans} from "./assessment/warPlan.js";
import {mergedWants, patrolPolicy, scrapBias, selectDoctrines} from "./doctrine/doctrines.js";
import {buildBuyPlan} from "./economy/budget.js";
import {makePlacer} from "./placement/placer.js";
import {buildFirePlans} from "./fires/plans.js";
import {solveFires} from "./fires/solver.js";
import {ensureDiplo, trackWarDamage} from "./diplomacy/ledger.js";
import {deriveWarStates, updateTrends} from "./diplomacy/warLifecycle.js";
import {diplomacyActions} from "./diplomacy/diplomacy.js";
import {
    applyFires,
    executeBuys,
    executeDiplomacy,
    executeGround,
    executeHangar,
    executePatrols,
    executeScrap,
} from "./orders/orderQueue.js";
import {THINK} from "./tuning.js";

function warCount(n) {
    let k = 0;
    for (const s in n.relations) if (n.relations[s] === "war") k++;
    return k;
}

function nearPlayer(w, n, caps) {
    const a = caps[n.slot], p = caps[w.mySlot];
    if (!a || !p) return false;
    return haversine(a.lng, a.lat, p.lng, p.lat) <= DIPLOMACY.activeRangeKm;
}

// Live-unit roster per slot — rebuilt per think (thinks are seconds apart; the
// scan is one pass over w.units).
function indexUnits(w) {
    const by = new Map();
    for (const u of w.units) {
        if (u.hp <= 0) continue;
        let arr = by.get(u.slot);
        if (!arr) by.set(u.slot, arr = []);
        arr.push(u);
    }
    return by;
}

function thinkNation(w, n, caps, diploDue) {
    ensureProd(n);
    const personality = ensurePersonality(w, n);
    ensureDiplo(n);
    const unitsBySlot = indexUnits(w);
    const frame = buildFrame(w, n, {unitsBySlot, caps});

    // Assessment: trends and lifecycle first (war plans read the states).
    updateTrends(frame);
    const warStates = deriveWarStates(frame);
    const posture = assessPosture(frame, personality);
    const focus = assessFocus(frame, posture, personality);
    const warPlans = assessWarPlans(frame, posture, personality);

    // Doctrine -> budget -> build orders.
    const stack = selectDoctrines(frame, personality, posture);
    const {buys, needScrap} = buildBuyPlan(frame, mergedWants(stack, frame, focus, personality));
    if (needScrap) executeScrap(w, frame, scrapBias(stack));
    executeBuys(w, frame, buys, makePlacer(w, frame, warPlans));
    executeHangar(w, frame);
    executePatrols(w, frame, patrolPolicy(stack, frame));

    // Fires: author one plan per war, solve through the shared battle-plan
    // solver, push the assignments. The solve's ammo ask feeds the next budget.
    const solved = solveFires(w, frame, buildFirePlans(frame, warPlans));
    applyFires(w, frame, solved);
    n._fires = {ammoWanted: solved.ammoWanted};
    executeGround(w, frame, warPlans);

    // Diplomacy on its own slower cadence, decided on this think's frame.
    if (diploDue) {
        executeDiplomacy(w, frame, diplomacyActions(w, frame, posture, warStates, personality, unitsBySlot));
    }
}

export function aiTick(w, dt) {
    // Damage attribution runs world-wide on a coarse cadence so every ledger
    // (including what AIs know about the human) stays current.
    trackWarDamage(w);
    let caps = null;
    for (const n of w.nations) {
        if (!n.isAi || !n.alive || n.active === false) continue;
        if (n._ai == null) n._ai = 2 + (n.slot % 20) * 0.3;
        if (n._diplo == null) n._diplo = randRange(rand(w), DIPLOMACY.thinkMin, DIPLOMACY.thinkSpan);
        n._ai -= dt;
        n._diplo -= dt;
        // A due diplomacy pass pulls the next think forward so war/peace tempo
        // doesn't slow to the idle build cadence.
        if (n._diplo <= 0 && n._ai > 1) n._ai = 1;
        if (n._ai > 0) continue;
        caps ??= capPositions(w);
        const active = warCount(n) > 0 || nearPlayer(w, n, caps);
        n._ai = active
            ? randRange(rand(w), THINK.activeMin, THINK.activeSpan)
            : randRange(rand(w), DIPLOMACY.idleThinkMin, DIPLOMACY.idleThinkSpan);
        const diploDue = n._diplo <= 0;
        if (diploDue) n._diplo = randRange(rand(w), DIPLOMACY.thinkMin, DIPLOMACY.thinkSpan);
        thinkNation(w, n, caps, diploDue);
    }
}
