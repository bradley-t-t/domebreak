// Political map tint shared by the live map (useMapVisualEffects) and the menu
// attract sim (AttractSim) so both paint nations the same way and can't drift
// apart: active belligerents wear their flag color, nations wiped out in war fall
// to a scorched grey-green wash stripped of the flag hue, and every other country
// is neutral scenery grey. Keyed by GID_0 against the bundled flag-color table.
import {rgbTuple} from "../../lib/color.js";

// Wiped-out nations (surrendered or decapitated in war): remnant land washed a
// darker grey-green so a knocked-out power reads as scorched — distinct from both
// the neutral-grey non-participant and its former flag color.
export const WIPEOUT_TINT = "#3f4a3b";
export const WIPEOUT_LINE = "#2d3729";
// Non-participant / fallback scenery color.
export const NEUTRAL_TINT = "#767b84";
export const NEUTRAL_LINE = "#454b53";

// Build the `country-tint` fill-color and `country-line` line-color MapLibre
// match expressions from the GID_0 -> [r,g,b] flag-color table. `activeGids` and
// `wipedGids` are GID_0 sets: only active gids are flag-colored, wiped gids take
// the scorched wash, and everything else falls to the neutral default. When
// `activeGids` is null/empty every country keeps its flag color (an all-active
// world with no bounded roster).
export function buildPoliticalTint(cols, {activeGids, wipedGids} = {}) {
    const only = activeGids && activeGids.size ? activeGids : null;
    const wiped = wipedGids && wipedGids.size ? wipedGids : null;
    const mix = (v, g) => Math.round(v * 0.6 + g * 0.4); // borders blend toward neutral grey
    const line = [], tint = [];
    for (const [gid, c] of Object.entries(cols)) {
        if (wiped && wiped.has(gid)) continue; // handled by the wipeout branch below
        if (only && !only.has(gid)) continue;  // neutrals fall to the shared default
        line.push(gid, rgbTuple([mix(c[0], 96), mix(c[1], 100), mix(c[2], 108)]));
        tint.push(gid, rgbTuple(c));
    }
    if (wiped) for (const gid of wiped) {
        line.push(gid, WIPEOUT_LINE);
        tint.push(gid, WIPEOUT_TINT);
    }
    return {
        line: line.length ? ["match", ["get", "GID_0"], ...line, NEUTRAL_LINE] : NEUTRAL_LINE,
        tint: tint.length ? ["match", ["get", "GID_0"], ...tint, NEUTRAL_TINT] : NEUTRAL_TINT,
    };
}

// Flag color for a nation as a CSS `rgb()` string, or null if the table has no
// entry for its GID_0. Callers fall back to their own palette when null.
export function flagColor(cols, gid) {
    const c = gid && cols?.[gid];
    return c ? rgbTuple(c) : null;
}
