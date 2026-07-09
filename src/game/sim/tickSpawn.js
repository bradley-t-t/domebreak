// Production-line delivery: spawnQueuedUnit, used only by stepEconomy in
// tickPhases.js.
import {AIRSTRIP_RUNWAY, HANGAR_SPEC, initialWarhead, UNITS} from "../data/constants.js";
import {nextId} from "./worldState.js";
import {placementBlocked} from "./queries.js";
import {ensureHangar, polarFrom} from "./aircraft.js";

// Delivers one finished production-line item into the world: a replacement
// aircraft goes straight into its ordering base's hangar stock; a new unit
// gets placed near its reserved spot (nudged if it's since been taken, or
// refunded if nothing nearby fits).
export function spawnQueuedUnit(w, n, it) {
    const def = UNITS[it.type];
    // Replacement aircraft: delivered straight into the ordering base's hangar
    // (housed, ready to launch). Refund if the base was lost while it was built.
    if (it.forBase) {
        const base = w.units.find((b) => b.id === it.forBase && b.hp > 0 && b.slot === n.slot);
        if (!base) {
            n.points += it.paid;
            return;
        }
        ensureHangar(w, base);
        base.hangar[it.type] = (base.hangar[it.type] || 0) + 1;
        return;
    }
    // The reserved spot may have been taken while the unit was on the line — nudge
    // around it, and refund if nowhere nearby fits.
    let spot = null;
    for (let k = 0; k < 9 && !spot; k++) {
        const lng = it.lng + (k ? Math.cos(k) * 0.5 * k * 0.35 : 0),
            lat = it.lat + (k ? Math.sin(k) * 0.5 * k * 0.35 : 0);
        if (!placementBlocked(w, lng, lat, null)) spot = {lng, lat};
    }
    if (!spot) {
        n.points += it.paid;
        return;
    }
    const base = {
        id: nextId(w, "u"),
        slot: n.slot,
        type: it.type,
        lng: spot.lng,
        lat: spot.lat,
        hp: def.hp,
        cooldown: 0,
        targetId: null,
        warhead: def.kind === "offense" ? initialWarhead(it.type) : null
    };
    if (def.wing) {
        base.hangar = {...HANGAR_SPEC[it.type]};   // full complement in stock
        base.patrolSize = 0;                        // patrols launch on command
        base.awacsPatrol = false;
        base.op = null;
        base.runwayA = it.type === "carrier" ? Math.PI / 2 : AIRSTRIP_RUNWAY;
        if (it.type !== "carrier") base.face = polarFrom(base, 150, base.runwayA); // canted runway icon
    }
    w.units.push(base);
}
