// Shared wants builders. A "want" is one desired purchase the budget can price:
//   {kind: "unit"|"ammo", type, target, urgency, reserve, minNet?}
// target is the desired standing count (live + on the line); urgency orders the
// buy plan (>= BLOCK_URGENCY items hold the treasury until affordable — the
// bootstrap-industry / naked-at-war gates); reserve is the cushion kept on hand
// past the price. Doctrines compose these builders and scale their urgencies.
import {DIPLOMACY, UNITS, WARHEADS} from "../../../data/constants.js";
import {prodCount, unitLockReason} from "../../production.js";
import {WANTS} from "../tuning.js";

// Wants at or above this urgency block lower-urgency spending while
// unaffordable. ONLY deliberate emergencies (bootstrap industry, a naked
// wartime capital) may sit in the block band — every routine want is clamped
// under it in push(), no matter how hot the focus multipliers run, so a deep
// defense wall can never hold the treasury hostage against the economy.
export const BLOCK_URGENCY = 9;

// Live + queued count of a type, memoized on the frame for the think.
export function have(frame, type) {
    let by = frame._have;
    if (!by) {
        by = frame._have = {};
        for (const u of frame.me.units) by[u.type] = (by[u.type] || 0) + 1;
    }
    return (by[type] || 0) + prodCount(frame.n, "unit", type);
}

export function haveAmmo(frame, type) {
    return (frame.me.ammo[type] || 0) + prodCount(frame.n, "ammo", type);
}

function push(list, kind, type, target, urgency, reserve = 0, extra = {}) {
    if (target <= 0 || urgency <= 0) return;
    const short = kind === "unit" ? target - have(list.frame, type) : target - haveAmmo(list.frame, type);
    if (short <= 0) return;
    // Block items always sit in the block band no matter what multiplier the
    // caller ran (a cold economy axis must not quietly demote the bootstrap
    // gate); routine items never reach it no matter how hot.
    const {block, ...rest} = extra;
    const u = block ? Math.max(urgency, BLOCK_URGENCY) : Math.min(urgency, BLOCK_URGENCY - 0.5);
    list.items.push({kind, type, target, urgency: u, reserve, ...rest});
}

export function wantList(frame) {
    return {frame, items: []};
}

const INDUSTRY_TYPES = ["factory", "port", "refinery", "techpark"];

export function industryTotal(frame) {
    let k = 0;
    for (const t of INDUSTRY_TYPES) k += have(frame, t);
    return k;
}

// The industry ladder: one factory unlocks the tree, then top-heavy fill
// (techpark > refinery > port > factory) to the population cap. Below the
// bootstrap floor the urgency crosses BLOCK_URGENCY so the treasury holds for
// economy first — the old doctrine's industry gate, expressed as data.
export function industryWants(list, eco) {
    const frame = list.frame;
    const total = industryTotal(frame);
    const cap = frame.me.indCap;
    if (total >= cap) return;
    // Bootstrap wants take FLAT urgencies in the block band — the economy axis
    // must neither demote them below it nor lift them past the naked-wartime-
    // capital emergency (BLOCK_URGENCY + 2), which always outranks industry.
    const boot = total < Math.min(cap, WANTS.industryBootstrap);
    const scale = boot ? 1 : Math.max(0.5, eco);
    const base = boot ? BLOCK_URGENCY : 4 * scale;
    const opts = boot ? {block: true} : {};
    if (have(frame, "factory") < 1) {
        push(list, "unit", "factory", 1, base + 1 * scale, WANTS.factoryReserve, opts);
        return; // everything else in the tree needs the first factory
    }
    push(list, "unit", "techpark", have(frame, "techpark") + 1, base + 0.5 * scale, WANTS.techparkReserve, opts);
    push(list, "unit", "refinery", Math.min(WANTS.refineryTarget, have(frame, "refinery") + 1), base + 0.2 * scale, WANTS.refineryReserve, opts);
    if (frame.me.coastal) push(list, "unit", "port", Math.min(WANTS.portTarget, have(frame, "port") + 1), base, WANTS.portReserve, opts);
    push(list, "unit", "factory", have(frame, "factory") + 1, base - 0.5 * scale, WANTS.factoryReserve, opts);
}

export function radarWants(list, radarAxis) {
    const frame = list.frame;
    const target = Math.min(WANTS.radarMax, Math.max(1, Math.round(frame.me.cities.length * WANTS.radarPerCity)));
    const radars = have(frame, "radar");
    push(list, "unit", "radar", target, (radars === 0 ? 7 : 4) * radarAxis, WANTS.radarReserve);
    if (radars > 0 && have(frame, "oth") === 0) push(list, "unit", "oth", 1, 3 * radarAxis, WANTS.othReserve);
}

// Layered defense: cycle the least-built buildable tier so the wall ends up a
// real mix instead of a battery farm. Emits the two next candidates; wartime
// zero-defenders is an emergency that blocks all other spending.
const DEFENSE_TYPES = ["battery", "patriot", "dome", "aegis", "thaad", "orbitallaser"];

export function defenderCount(frame) {
    let k = 0;
    for (const t of [...DEFENSE_TYPES, "cruiser", "destroyer"]) k += have(frame, t);
    return k;
}

export function defenseWants(list, defAxis, targetMult = 1) {
    const frame = list.frame, w = frame._w;
    // The wall is bounded twice: by the protect-point demand and by a share of
    // the AI unit cap — a 50-city superpower must never spend its whole
    // fielding allowance on interceptors and have nothing left to shoot back with.
    const capShare = Math.max(3, Math.floor(DIPLOMACY.aiUnitCap * 0.4));
    const target = Math.min(WANTS.defenseMax, capShare,
        Math.max(1, Math.round(frame.me.protect.length * WANTS.defensePerPoint * targetMult)));
    const defenders = defenderCount(frame);
    if (defenders >= target) return;
    const options = DEFENSE_TYPES
        .filter((t) => !unitLockReason(w, frame.me.slot, t))
        .map((t) => ({t, count: have(frame, t), cost: UNITS[t].cost}))
        .sort((a, b) => a.count - b.count || a.cost - b.cost);
    const emergency = frame.world.atWar && defenders === 0;
    options.slice(0, 2).forEach(({t}, i) => {
        const reserve = t === "orbitallaser" ? WANTS.spaceHqReserve : 0;
        if (emergency && i === 0) {
            push(list, "unit", t, have(frame, t) + 1, BLOCK_URGENCY + 2, reserve, {block: true});
        } else {
            push(list, "unit", t, have(frame, t) + 1, (5 + 3 * (1 - defenders / target) - i) * defAxis, reserve);
        }
    });
}

export function offenseWants(list, offAxis, {siloMult = 1, launcherMult = 1, hyperMult = 1} = {}) {
    const frame = list.frame, w = frame._w;
    // Deterrent scaling: the fewer strike platforms stand, the harder the next
    // one is wanted — the first few outrank mid-tier wall expansion, so the
    // defense race to the unit cap can't leave a nation with nothing to shoot.
    const strikers = have(frame, "silo") + have(frame, "launcher") + have(frame, "hypersonicbty")
        + have(frame, "sub-ssbn") + have(frame, "orbitalstrike");
    const deficiency = 1 - Math.min(1, strikers / 6);
    const base = (5 + 2.5 * deficiency) * Math.max(offAxis, strikers === 0 ? 1.3 : offAxis);
    push(list, "unit", "launcher", Math.round(WANTS.launcherTarget * launcherMult), base, WANTS.launcherReserve);
    if (!unitLockReason(w, frame.me.slot, "hypersonicbty")) {
        push(list, "unit", "hypersonicbty", Math.round(WANTS.hyperTarget * hyperMult), base - 0.5, WANTS.hyperReserve);
    }
    const siloTarget = Math.round((frame.world.atWar ? WANTS.siloTarget : Math.max(1, WANTS.siloTarget / 2)) * siloMult);
    push(list, "unit", "silo", siloTarget, base - 0.2, WANTS.siloReserve, {minNet: WANTS.siloMinNet});
}

// Magazines: every warhead-capable platform keeps a stock scaled by war/peace,
// deepened by whatever the fires solver asked for last cycle (n._fires).
export function ammoWants(list, whAxis, depthMult = 1) {
    const frame = list.frame;
    const atWarNow = frame.world.atWar;
    const perPlat = (atWarNow ? WANTS.ammoPerPlatformWar : WANTS.ammoPerPlatformPeace) * depthMult;
    const silos = have(frame, "silo"), boomers = have(frame, "sub-ssbn"), orbs = have(frame, "orbitalstrike");
    const strategic = silos + boomers + orbs;
    const wanted = frame.n._fires?.ammoWanted || {};
    const stock = (type, count, mult = 1, reserve = 0) => {
        if (count <= 0 && !wanted[type]) return;
        const target = Math.max(count > 0 ? Math.ceil(count * perPlat * mult) : 0, wanted[type] || 0);
        push(list, "ammo", type, target, (atWarNow ? 4.2 : 2.5) * whAxis, reserve);
    };
    stock("standard", silos + boomers, atWarNow ? 1.5 : 2, WANTS.stdReserve);
    stock("cluster", strategic, 1, WANTS.clusterReserve);
    stock("thermo", strategic, 1, WANTS.thermoReserve);
    if (atWarNow) stock("thermomirv", strategic, 0.5, WANTS.thermomirvReserve);
    stock("hgv", have(frame, "hypersonicbty"), 1, WANTS.hgvReserve);
    stock("sicbm", have(frame, "launcher"), 1, WANTS.sicbmReserve);
}

export function commandWants(list, paranoia) {
    const frame = list.frame;
    if (frame.me.cities.length >= WANTS.bunkerMinCities) {
        push(list, "unit", "bunker", 1, 6 * (0.7 + paranoia), WANTS.bunkerReserve);
    }
    push(list, "unit", "airstrip", 1, 5.5 * (0.7 + paranoia * 0.5), WANTS.bunkerReserve);
}

export function groundWants(list, groundAxis, {targetMult = 1, artilleryShare = WANTS.artilleryShare} = {}) {
    const frame = list.frame;
    push(list, "unit", "armybase", 1, 5 * groundAxis, WANTS.armyReserve);
    if (have(frame, "armybase") < 1) return;
    const target = Math.round(WANTS.groundTarget * targetMult);
    const force = have(frame, "infantry") + have(frame, "tank") + have(frame, "artillery");
    if (force >= target) return;
    // Deterministic mix by current composition instead of a dice roll: fill the
    // most underrepresented arm next.
    const mix = [
        ["artillery", artilleryShare],
        ["tank", (1 - artilleryShare) * 0.45],
        ["infantry", (1 - artilleryShare) * 0.55],
    ];
    mix.sort((a, b) => (have(frame, a[0]) / Math.max(0.05, a[1])) - (have(frame, b[0]) / Math.max(0.05, b[1])));
    push(list, "unit", mix[0][0], have(frame, mix[0][0]) + 1, 4.5 * groundAxis, WANTS.armyReserve);
}

export function navalWants(list, navyAxis, {carrierMult = 1} = {}) {
    const frame = list.frame, w = frame._w;
    if (!frame.me.coastal || navyAxis <= 0) return;
    const fleet = [
        ["destroyer", WANTS.destroyerTarget, WANTS.destroyerReserve, 4],
        ["cruiser", WANTS.cruiserTarget, WANTS.cruiserReserve, 3.6],
        ["battleship", WANTS.battleshipTarget, WANTS.battleshipReserve, 3.2],
        ["sub-ssn", 1, WANTS.subReserve, 3.4],
        ["sub-ssbn", 1, WANTS.subReserve, 3.3],
        ["replenish", WANTS.replenishTarget, WANTS.replenishReserve, 2.6],
        ["amphib", WANTS.amphibTarget, WANTS.amphibReserve, 2.8],
        ["carrier", Math.round(WANTS.carrierTarget * carrierMult), WANTS.carrierReserve, 3 * carrierMult],
    ];
    for (const [type, target, reserve, base] of fleet) {
        if (unitLockReason(w, frame.me.slot, type)) continue;
        push(list, "unit", type, target, base * navyAxis, reserve);
    }
}

export function spaceWants(list, spaceAxis) {
    const frame = list.frame, w = frame._w;
    if (spaceAxis <= 0) return;
    if (!unitLockReason(w, frame.me.slot, "spacehq")) {
        push(list, "unit", "spacehq", 1, 4.5 * spaceAxis, WANTS.spaceHqReserve);
    }
    for (const [type, target, base] of [["reconsat", 1, 3.6], ["orbitallaser", 1, 3.2], ["orbitalstrike", 1, 3]]) {
        if (unitLockReason(w, frame.me.slot, type)) continue;
        push(list, "unit", type, target, base * spaceAxis, WANTS.spaceHqReserve * 0.5);
    }
}
