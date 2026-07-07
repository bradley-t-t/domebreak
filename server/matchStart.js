// Opening freeze for online matches: at the start of a match the world holds
// paused for a fixed countdown so every commander loads in before the war
// begins, then releases to permanently-locked 1x play. Pure/deterministic so
// the pause -> live transition is unit-testable without standing up a Match.
//
// Given the current wall time and the release deadline, returns whether the sim
// should still be frozen and the whole-second countdown to show the players.
export function openingFreeze(now, until) {
    const remain = Math.max(0, until - now);
    return {paused: remain > 0, startsIn: Math.ceil(remain / 1000)};
}
