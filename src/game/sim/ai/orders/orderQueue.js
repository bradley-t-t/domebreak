// Orders — the ONLY module in the AI pipeline that mutates the world. It
// consumes the pure stages' outputs (BuyPlan, fire assignments, patrol policy,
// diplomacy actions) and speaks to the same production/command APIs the human
// player does, bounded by the production line.
import {allowedAmmo, HANGAR_SPEC, UNITS, WARHEADS, initialWarhead} from "../../../data/constants.js";
import {haversine} from "../../../geo/geo.js";
import {rand} from "../../worldState.js";
import {atWar, netIncomeOf} from "../../queries.js";
import {findTarget} from "../../combat.js";
import {
    breakAlliance,
    commandAttack,
    declareWar,
    hangarCount,
    queueAircraft,
    queueAmmo,
    queueUnit,
    scrapUnit,
    setAwacsPatrol,
    setMarch,
    setPatrolSize,
} from "../../production.js";
import {offerPeace, proposeAlliance} from "../../warResolution.js";
import {pickScrapCandidate} from "../economy/scrap.js";
import {ensureDiplo, recordPeaceDeclined, rel} from "../diplomacy/ledger.js";
import {BUDGET, FIRES, THINK, WANTS} from "../tuning.js";

const lineBusy = (n) => (n.prod.current ? 1 : 0) + n.prod.queue.length;

// Deliberate divestment, capped per think so a deficit never triggers a fire sale.
export function executeScrap(w, frame, bias) {
    let scrapped = 0;
    while (scrapped < BUDGET.scrapMaxPerThink) {
        const victim = pickScrapCandidate(frame, bias);
        if (!victim || !scrapUnit(w, frame.me.slot, victim.id).ok) break;
        frame.me.units = frame.me.units.filter((u) => u.id !== victim.id);
        // Keep the wants memo honest for anything that counts units later in
        // this same think (readiness, defenderCount).
        if (frame._have?.[victim.type]) frame._have[victim.type]--;
        scrapped++;
    }
    return scrapped;
}

// Queue the BuyPlan through the production line. Every order revalidates in
// production.js (tech, caps, deficit, territory) — a refusal just skips the item.
export function executeBuys(w, frame, buys, place) {
    const n = frame.n;
    for (const buy of buys) {
        if (lineBusy(n) >= THINK.queueMax) break;
        if (buy.kind === "ammo") {
            queueAmmo(w, n.slot, buy.type);
            continue;
        }
        const p = place(buy.type);
        if (!p) continue;
        queueUnit(w, n.slot, buy.type, p.lng, p.lat, true);
    }
}

// Keep every base's hangar stocked to the doctrine's targets.
export function executeHangar(w, frame) {
    const n = frame.n;
    if (netIncomeOf(w, n.slot) < 0) return;
    for (const base of frame.me.units) {
        if (base.hp <= 0 || !UNITS[base.type].wing) continue;
        const spec = HANGAR_SPEC[base.type];
        if (!spec) continue;
        for (const type of Object.keys(spec)) {
            if (lineBusy(n) >= THINK.queueMax) return;
            const desired = Math.min(spec[type] || 0, WANTS.hangarTargets[type] || 0);
            if (desired <= 0) continue;
            // Per-base accounting (stock + airborne + on the line FOR THIS
            // base) — a wing queued for one airstrip must not suppress
            // another's order for the same type.
            if (hangarCount(w, n, base.id, type) >= desired) continue;
            if (n.points < (UNITS[type]?.cost || 0) + 20) continue;
            queueAircraft(w, n.slot, base.id, type);
        }
    }
}

// Bring every base to the doctrine's air posture — standing patrols up when
// the policy calls for them AND back down when it doesn't, so a war's CAP
// doesn't keep burning fuel forever after the peace.
export function executePatrols(w, frame, policy) {
    for (const u of frame.me.units) {
        if (u.hp <= 0 || !UNITS[u.type].wing) continue;
        const size = policy.size || 0;
        if ((u.patrolSize || 0) !== size) setPatrolSize(w, frame.me.slot, u.id, size);
        if (!u.awacsPatrol !== !policy.awacs) setAwacsPatrol(w, frame.me.slot, u.id, !!policy.awacs);
    }
}

// How many OTHER at-war hostiles sit within a cluster bus's splash of the aim
// point — the same pocket mirvSplit will fan its submunitions across. A lone
// target returns 0 (the bus's split yield would be wasted); a dense pocket of
// cities/forces returns high (the fan-out puts far more total damage on the
// group than a single round on one target).
function clusterPocket(w, slot, target) {
    const splash = WARHEADS.cluster?.splash || 240;
    let near = 0;
    for (const c of w.cities) {
        if (!c.alive || c.id === target.ref.id || !atWar(w, slot, c.slot)) continue;
        if (haversine(target.lng, target.lat, c.lng, c.lat) <= splash) near++;
    }
    for (const other of w.units) {
        if (other.hp <= 0 || other.id === target.ref.id || !atWar(w, slot, other.slot)) continue;
        if (haversine(target.lng, target.lat, other.lng, other.lat) <= splash) near++;
    }
    return near;
}

// The payload a platform should fly for a NEW fire order, given the war goal.
// Bunker kills need a thermonuclear-class hit; a target sitting in a dense
// pocket of hostiles favors the cluster bus (its fan-out saturates the group);
// otherwise city strikes upgrade on the signature roll. Rolled once per order —
// never re-rolled while the order stands, or the odds would ratchet to
// certainty across thinks.
function rollWarhead(w, n, u, assignment) {
    const def = UNITS[u.type];
    if (!def.warheads) return;
    const allowed = allowedAmmo(u.type);
    const stocked = (t) => (n.ammo[t] || 0) > 0;
    const target = findTarget(w, assignment.targetId);
    const bunkerKill = assignment.goal === "decap" && target?.kind === "unit"
        && (target.ref?.type === "bunker" || target.ref?.type === "spacehq");
    if (bunkerKill) {
        for (const t of ["thermo", "thermomirv"]) {
            if (allowed.includes(t) && stocked(t)) { u.warhead = t; return; }
        }
    }
    // Area saturation: when the aim point sits in a dense pocket of enemy targets
    // and the platform is cleared for cluster, prefer the MIRV bus over a single
    // round. Not for decap — a leadership kill wants massed yield on one point,
    // not a split payload. The roll steepens with pocket density and is capped
    // below certainty, so a marginal pocket only sometimes draws cluster and a
    // lone target never does.
    if (assignment.goal !== "decap" && target && allowed.includes("cluster") && stocked("cluster")) {
        const near = clusterPocket(w, n.slot, target);
        if (near >= FIRES.clusterMinTargets) {
            const chance = Math.min(FIRES.clusterChanceMax,
                FIRES.clusterChance + FIRES.clusterDensityStep * (near - FIRES.clusterMinTargets));
            if (rand(w) < chance) { u.warhead = "cluster"; return; }
        }
    }
    const sig = def.signature;
    if (sig && allowed.includes(sig) && stocked(sig)) {
        const chance = sig === "hgv" ? FIRES.hgvChance : sig === "sicbm" ? FIRES.sicbmChance : FIRES.thermoChance;
        const boost = assignment.goal === "cityStrike" || assignment.goal === "decap" ? 1.5 : 1;
        if (rand(w) < Math.min(1, chance * boost)) { u.warhead = sig; return; }
    }
    if (allowed.includes("standard")) u.warhead = "standard";
}

// An empty magazine falls back to Standard rather than jamming the tube.
function magazineFallback(n, u) {
    if (!UNITS[u.type].warheads) return;
    const wh = u.warhead || initialWarhead(u.type);
    if (!(n.ammo[wh] > 0) && allowedAmmo(u.type).includes("standard") && (n.ammo.standard || 0) > 0) {
        u.warhead = "standard";
    }
}

// Push the solver's fire assignments onto the platforms, and stand down
// anything still shooting at a foe we're actively suing out of the war with.
export function applyFires(w, frame, solved) {
    const n = frame.n;
    for (const u of frame.me.units) {
        const def = UNITS[u.type];
        if (def.kind !== "offense" || def.targets === "land") continue;
        const a = solved.assignments.get(u.id);
        if (a) {
            if (u.targetId !== a.targetId) {
                rollWarhead(w, n, u, a);
                commandAttack(w, u.id, a.targetId);
            }
            magazineFallback(n, u);
            continue;
        }
        magazineFallback(n, u);
        if (u.targetId) {
            // Stand down anything shooting at a foe we're suing for peace with —
            // and clear stale standing orders left over from an ended war (a
            // "still engaged" flag would otherwise pin the unit forever, e.g.
            // making it unscrappable in a deficit).
            const t = findTarget(w, u.targetId);
            if (!t || !atWar(w, frame.me.slot, t.slot) || solved.holdFoes.has(t.slot)) {
                commandAttack(w, u.id, null);
            }
        }
    }
}

// Ground forces press the war: each idle ground unit marches on the nearest
// at-war city, capture-goal fronts first. Artillery rides with the capture
// force — it can't plant a flag, but its long tube fires on the way in and
// covers the assault (leaving it home would waste a third of the ground budget).
export function executeGround(w, frame, warPlans) {
    const captureFoes = new Set();
    for (const foe in warPlans) if (warPlans[foe].goal === "capture") captureFoes.add(+foe);
    for (const u of frame.me.units) {
        const def = UNITS[u.type];
        const ground = def.capture || (def.targets === "land" && def.landSpeed);
        if (u.dest || u.hp <= 0 || !ground) continue;
        let best = null, bd = Infinity;
        for (const c of w.cities) {
            if (!c.alive || c.slot === frame.me.slot || !atWar(w, frame.me.slot, c.slot)) continue;
            const d = haversine(u.lng, u.lat, c.lng, c.lat) * (captureFoes.has(c.slot) ? 0.5 : 1);
            if (d < bd) { bd = d; best = c; }
        }
        if (best) {
            setMarch(w, frame.me.slot, u.id, best.lng, best.lat);
            commandAttack(w, u.id, best.id);
        }
    }
}

// Execute the diplomacy layer's decisions, stamping the ledger as we go.
export function executeDiplomacy(w, frame, actions) {
    const n = frame.n;
    const d = ensureDiplo(n);
    for (const action of actions) {
        const to = action.to;
        if (action.kind === "offerPeace") {
            d.suing[to] = w.time;
            const r = offerPeace(w, n.slot, to);
            if (r?.refused) recordPeaceDeclined(w, n.slot, to);
        } else if (action.kind === "proposeAlliance") {
            (d.askAlly ??= {})[to] = w.time;
            proposeAlliance(w, n.slot, to);
        } else if (action.kind === "breakAlliance") {
            breakAlliance(w, n.slot, to);      // the mechanic itself records the backstab on both ledgers
        } else if (action.kind === "declareWar") {
            const r = declareWar(w, n.slot, to);
            if (r?.ok) {
                rel(n, to).lastWarAt = w.time;
                const foe = w.nations.find((x) => x.slot === to);
                if (foe) rel(foe, n.slot).lastWarAt = w.time;
            }
        }
    }
}
