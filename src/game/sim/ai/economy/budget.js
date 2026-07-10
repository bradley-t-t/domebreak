// Forward budget: turn the doctrine's merged wants into an ordered BuyPlan that
// respects the treasury, per-item reserves, and a net-income floor — so the AI
// spends toward a composition across ticks instead of impulse-buying every
// think. Must-have items (urgency >= BLOCK_URGENCY: bootstrap industry, a naked
// wartime capital) hold the treasury until affordable, which is the old
// industry-gate behavior expressed as data.
import {ECONOMY, UNITS, WARHEADS} from "../../../data/constants.js";
import {BLOCK_URGENCY} from "../doctrine/lib.js";
import {BUDGET, THINK} from "../tuning.js";

const itemCost = (it) => it.kind === "ammo" ? (WARHEADS[it.type]?.prodCost || 0) : (UNITS[it.type]?.cost || 0);
// Budget only ever plans for AI nations, which pay the reduced upkeep rate — so
// the marginal-upkeep projection that gates the net-income floor uses it too.
const itemUpkeep = (it) => it.kind === "ammo" ? 0 : (UNITS[it.type]?.upkeep || 0) * ECONOMY.aiUpkeepMult;
const isIndustry = (it) => it.kind === "unit" && UNITS[it.type]?.kind === "industry";

// wants arrive urgency-sorted from mergedWants. Returns {buys, needScrap}.
export function buildBuyPlan(frame, wants) {
    const deficit = frame.me.net < 0;
    // Scrap on a real structural deficit — or on ANY deficit once the treasury
    // is too empty to build industry out of it. A nation at net -0.3 with zero
    // points would otherwise idle bankrupt forever: no scrap trigger, and never
    // enough points for the factory that fixes the income.
    const needScrap = frame.me.net < BUDGET.scrapMinNet
        || (deficit && frame.me.points < BUDGET.brokePoints);
    let points = frame.me.points;
    let net = frame.me.net;
    const buys = [];
    for (const item of wants) {
        if (buys.length >= THINK.queueMax) break;
        // In deficit only industry may queue (queueUnit enforces the same rule);
        // everything else waits for the recovery.
        if (deficit && !isIndustry(item)) continue;
        const cost = itemCost(item);
        if (cost <= 0) continue;
        if (points < cost + (item.reserve || 0)) {
            // A must-have holds the treasury: nothing cheaper and less urgent may
            // drain the points it is saving toward.
            if (item.urgency >= BLOCK_URGENCY) break;
            continue;
        }
        // Never buy a non-industry unit into structural deficit: the projected
        // net after this purchase must stay above the floor (and above the
        // item's own minNet ask, e.g. silos).
        const projNet = net - itemUpkeep(item);
        if (!isIndustry(item)) {
            if (projNet < BUDGET.minNet) continue;
            if (item.minNet != null && projNet < item.minNet) continue;
        }
        buys.push({kind: item.kind, type: item.type});
        points -= cost;
        net = projNet;
    }
    return {buys, needScrap};
}
