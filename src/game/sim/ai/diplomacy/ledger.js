// Per-relationship memory. Every nation carries n.diplo — a plain-JSON block that
// serializes with the world — holding a ledger per rival (wars fought, damage
// exchanged, peace offers refused/honored, backstabs) plus the transient war
// bookkeeping (sue timestamps, cease-fires, cached lifecycle states). Grudges
// recorded here leak into war declarations, peace evaluation, alliance trust,
// and even force posture via the perception layer.
import {statOf} from "../perception/stats.js";
import {THINK} from "../tuning.js";

export function ensureDiplo(n) {
    if (!n.diplo) n.diplo = {ledger: {}, suing: {}, ceaseFire: {}, warState: {}, trend: 0, val: null};
    return n.diplo;
}

// The ledger entry for a rival, created on first contact.
export function rel(n, slot) {
    const d = ensureDiplo(n);
    let r = d.ledger[slot];
    if (!r) r = d.ledger[slot] = {
        wars: 0,            // times we've fought them
        dealt: 0,           // cumulative damage we've inflicted on them (points of value)
        taken: 0,           // cumulative damage they've inflicted on us
        declined: 0,        // peace offers of ours they refused — lifetime, feeds the grudge
        declinedWar: 0,     // same, but reset at each war's end — gates the peace cadence
        honored: 0,         // good-faith peaces they accepted or offered
        backstabs: 0,       // pacts broken between us (either direction)
        lastPeaceAt: -1e9,
        lastAllyAt: -1e9,
        lastWarAt: -1e9,
    };
    if (r.declinedWar == null) r.declinedWar = 0;   // ledgers from before the field existed
    return r;
}

// War-damage attribution pass. Runs on a coarse cadence for EVERY active nation
// (human included, so AI ledgers about the player fill in): diff each nation's
// standing value (statOf(..).value — city hp weighted by importance plus the
// hp-weighted build cost of its force, from the shared one-pass aggregates)
// since the last pass and, while at war, split the loss equally across its
// current foes — credited as `taken` on the victim's ledger and `dealt` on
// each foe's. Attribution by exact shooter would need combat hooks; the equal
// split keeps the ledger self-contained and deterministic.
export function trackWarDamage(w) {
    const t = (w._aiLossAt ?? -1e9);
    if (w.time - t < THINK.lossTrackSec) return;
    w._aiLossAt = w.time;
    for (const n of w.nations) {
        if (!n.alive || n.active === false) continue;
        const d = ensureDiplo(n);
        const cur = statOf(w, n.slot).value;
        const prev = d.val;
        d.val = cur;
        if (prev == null) continue;
        const lost = prev - cur;
        if (lost <= 0) continue;
        const foes = [];
        for (const s in n.relations) if (n.relations[s] === "war") foes.push(+s);
        if (!foes.length) continue;
        const share = lost / foes.length;
        for (const f of foes) {
            rel(n, f).taken += share;
            const foe = w.nations.find((x) => x.slot === f);
            if (foe) rel(foe, n.slot).dealt += share;
        }
    }
}

// Damage ratio for n's war against foe: taken over dealt, > 1 means we're
// bleeding more than we're inflicting. Clamped to a sane floor denominator.
export function damageRatio(n, foe) {
    const r = rel(n, foe);
    return r.taken / Math.max(1, r.dealt);
}

// Event records, called from warResolution + the diplomacy layer

// A war between a and b just ended. winner === null is a white peace (good
// faith honored both ways); a decisive end still stamps the timeline so
// readiness and cease-fire logic can read it.
export function recordWarEnd(w, a, b, winner) {
    const na = w.nations.find((x) => x.slot === a), nb = w.nations.find((x) => x.slot === b);
    if (!na || !nb) return;
    const ra = rel(na, b), rb = rel(nb, a);
    ra.wars += 1;
    rb.wars += 1;
    ra.declinedWar = rb.declinedWar = 0;   // the per-war refusal count dies with the war
    ra.lastPeaceAt = rb.lastPeaceAt = w.time;
    if (winner == null) {
        ra.honored += 1;
        rb.honored += 1;
        ensureDiplo(na).ceaseFire[b] = w.time;
        ensureDiplo(nb).ceaseFire[a] = w.time;
    }
    delete ensureDiplo(na).suing[b];
    delete ensureDiplo(nb).suing[a];
    delete ensureDiplo(na).warState[b];
    delete ensureDiplo(nb).warState[a];
}

// `refuser` turned down a peace offer from `offerer` — the offerer remembers,
// both for this war's cadence and as a lifetime grudge.
export function recordPeaceDeclined(w, offerer, refuser) {
    const n = w.nations.find((x) => x.slot === offerer);
    if (!n) return;
    const r = rel(n, refuser);
    r.declined += 1;
    r.declinedWar += 1;
}

export function recordAllianceFormed(w, a, b) {
    const na = w.nations.find((x) => x.slot === a), nb = w.nations.find((x) => x.slot === b);
    if (na) rel(na, b).lastAllyAt = w.time;
    if (nb) rel(nb, a).lastAllyAt = w.time;
}

// A pact between a and b was dissolved on purpose — both sides remember it as a
// backstab, so future proposals between them (and the breaker's other suitors,
// via the perception layer) get harder.
export function recordAllianceBroken(w, a, b) {
    const na = w.nations.find((x) => x.slot === a), nb = w.nations.find((x) => x.slot === b);
    if (na) rel(na, b).backstabs += 1;
    if (nb) rel(nb, a).backstabs += 1;
}
