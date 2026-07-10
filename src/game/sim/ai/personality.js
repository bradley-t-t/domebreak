// Per-nation personality: a nine-trait bias vector every AI decision layer reads.
// Seeded once, deterministically, from (world seed, slot, iso) — the same nation
// feels the same across replays of a seed but different from its neighbours. The
// vector is stored on the nation (n.personality) as plain data so it serializes
// with the save; legacy saves that predate it are seeded lazily on first think
// with an identical result (the hash never consumes the world's RNG stream).
import {PERSONALITY} from "./tuning.js";

export const TRAITS = [
    "aggression",      // bias toward pressing / opening wars
    "paranoia",        // extra defense weight, earlier bunker
    "industrialism",   // how deep into industry before pivoting to military
    "navalism",        // fleet appetite (only meaningful for coastal nations)
    "spaceRush",       // bias toward the Space HQ path once GDP allows
    "decapFocus",      // willingness to prioritize leadership strikes
    "loyalty",         // readiness to honor alliances vs backstab
    "vindictiveness",  // weight of the grudge ledger on future decisions
    "patience",        // readiness to endure a stall vs sue for peace
];

// Small deterministic hash stream over (seed, slot, iso). Not the world PRNG —
// personality must come out identical no matter when in a match it's seeded.
function traitStream(seed, slot, iso) {
    let h = (seed >>> 0) ^ Math.imul(slot + 1, 0x9E3779B1);
    for (let i = 0; i < (iso || "").length; i++) h = Math.imul(h ^ iso.charCodeAt(i), 0x85EBCA6B);
    return () => {
        h = (h + 0x6D2B79F5) | 0;
        let t = Math.imul(h ^ (h >>> 15), 1 | h);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// The nation's personality, seeding it on first read. Values live in
// [floor, floor + span] and are rounded so saves stay byte-stable.
export function ensurePersonality(w, n) {
    if (n.personality) return n.personality;
    const next = traitStream(w.seed || 1, n.slot, n.iso);
    const p = {};
    for (const t of TRAITS) p[t] = Math.round((PERSONALITY.floor + PERSONALITY.span * next()) * 100) / 100;
    n.personality = p;
    return p;
}
