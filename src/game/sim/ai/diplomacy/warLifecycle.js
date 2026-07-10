// War lifecycle: each active war carries a per-side state, re-derived every
// think from observable facts — strength trend, city loss rate, the damage
// ledger, leadership, and the surrender floor. No RNG, just readable
// thresholds. The state steers the war plan (goals), the fires layer (hold
// fire while suing), and the whole peace cadence.
//
//   opening    — first minWarSec: no peace offers, doctrine snaps aggressive
//   prosecute  — the plan is working: press
//   stall      — neither side gaining: look for an exit
//   losing     — strength/cities eroding: start suing for peace
//   routed     — near the surrender floor or leadership broken: peace at any cost
//   collapsed  — below the floor: warResolution's auto-surrender takes it
import {DIPLOMACY} from "../../../data/constants.js";
import {ensureDiplo, damageRatio} from "./ledger.js";
import {WAR_STATE, POSTURE} from "../tuning.js";

// Per-think bookkeeping the state derivation reads: an EMA of the nation's
// strength delta and a windowed city-loss rate. The loss rate is measured over
// a fixed window (not per-think) so a single unlucky city loss between two
// thinks a few seconds apart reads as its true sustained rate, not a 10x
// spike that would flip a winning war to "losing". Stored on n.diplo.
export function updateTrends(frame) {
    const d = frame.diplo;
    if (d.power != null) {
        d.trend = WAR_STATE.trendAlpha * (frame.me.power - d.power) + (1 - WAR_STATE.trendAlpha) * (d.trend || 0);
    }
    d.power = frame.me.power;
    d.at = frame.time;
    if (d.winT0 == null || frame.time - d.winT0 >= WAR_STATE.lossWindowSec) {
        if (d.winT0 != null) {
            const mins = Math.max(0.75, (frame.time - d.winT0) / 60);
            d.cityRate = (d.winCities - frame.me.cities.length) / mins; // cities LOST per game-minute
        }
        d.winT0 = frame.time;
        d.winCities = frame.me.cities.length;
    }
}

export function deriveWarStates(frame) {
    const d = ensureDiplo(frame.n);
    const states = {};
    for (const front of frame.fronts) {
        const foe = front.foe;
        const p = frame.world.profiles[foe];
        const ratio = damageRatio(frame.n, foe);
        const frac = frame.me.frac;
        let state;
        if (frac < DIPLOMACY.surrenderThreshold) {
            state = "collapsed";
        } else if (frac < DIPLOMACY.surrenderThreshold + WAR_STATE.routedFracMargin
            || frame.me.leadPct <= WAR_STATE.routedLeadPct) {
            state = "routed";
        } else if ((ratio > WAR_STATE.losingDamageRatio && (d.trend || 0) < 0)
            || (d.cityRate || 0) > WAR_STATE.cityLossPerMinLosing) {
            state = "losing";
        } else if (front.age < DIPLOMACY.minWarSec) {
            state = "opening";
        } else if (front.age > WAR_STATE.stallAfterSec
            && ratio >= WAR_STATE.winningDamageRatio && ratio <= WAR_STATE.losingDamageRatio
            && Math.abs(d.cityRate || 0) < 0.05
            && (!p || p.frac > 0.7)) {
            state = "stall";
        } else {
            state = "prosecute";
        }
        states[foe] = state;
        d.warState[foe] = state;
    }
    // Drop stale entries for wars that have ended.
    for (const s in d.warState) if (!(s in states)) delete d.warState[s];
    return states;
}

// Is this nation one shot from a decapitation kill on `foe`? Peace logic never
// sues (or accepts) while the throat is bared.
export function nearDecapKill(frame, foe) {
    const p = frame.world.profiles[foe];
    return !!p && p.lead.pct < POSTURE.decapLeadPct
        && frame.me.units.filter((u) => ["silo", "sub-ssbn", "orbitalstrike", "hypersonicbty", "launcher"].includes(u.type)).length >= POSTURE.decapStrikeMin;
}
