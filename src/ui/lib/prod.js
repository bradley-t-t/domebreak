import {UNIT_ICON, unitLabel, UNITS, WARHEADS} from "../../game/engine.js";
import {DEFAULT_BUILD_TIME, WARHEAD_ICON} from "../../game/data/constants.js";

// Shared production-item descriptors — a build-queue/line item is either a unit
// (default) or a warhead ("kind" === "ammo"). One source for the label/icon/
// build-time lookups so the production bar (HUD), the production screen
// (arsenal), and anything else reading the queue never drift apart.
export function prodLabel(it, iso) {
    return it.kind === "ammo" ? WARHEADS[it.type].name : unitLabel(it.type, iso);
}

export function prodIcon(it) {
    return it.kind === "ammo" ? WARHEAD_ICON[it.type] : UNIT_ICON[it.type];
}

export function prodTime(it) {
    return it.kind === "ammo" ? WARHEADS[it.type].prodTime : (UNITS[it.type].buildTime || DEFAULT_BUILD_TIME);
}
