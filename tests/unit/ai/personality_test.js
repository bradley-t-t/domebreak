// Personality: the nine-trait bias vector every AI decision layer reads, seeded
// deterministically from (world seed, slot, iso). Covers reproducibility across
// worlds and save-load timing (the hash never touches the world RNG stream),
// divergence across slots/isos/seeds, trait bounds, serialization onto the
// nation, and the no-reseed guarantee for an existing vector.
import {describe, expect, it} from "vitest";
import {createWorld} from "../../../src/game/engine.js";
import {TRAITS, ensurePersonality} from "../../../src/game/sim/ai/personality.js";
import {PERSONALITY} from "../../../src/game/sim/ai/tuning.js";

// Two nations on their real soil (placement never matters for personality, but
// the roster mirrors a normal match). isoB/seed vary per test.
function fresh({seed = 7, isoB = "RU"} = {}) {
    return createWorld({
        mySlot: 0, seed,
        nations: [
            {slot: 0, name: "A", iso: "US", isAi: false, gdp: 5},
            {slot: 1, name: "B", iso: isoB, isAi: true, gdp: 5},
        ],
        cities: [
            {id: "a1", slot: 0, name: "A-Cap", state: "S", cap: 1, pop: 1e6, econ: 1, lng: -98, lat: 39},
            {id: "b1", slot: 1, name: "B-Cap", state: "S", cap: 1, pop: 1e6, econ: 1, lng: 37.6, lat: 55.75},
        ],
        rules: {playerGraceSec: 0},
    });
}

describe("ensurePersonality — deterministic seeding", () => {
    it("test_same_seed_slot_iso_yields_identical_vector_across_worlds", () => {
        const w1 = fresh(), w2 = fresh();
        expect(ensurePersonality(w1, w1.nations[1])).toEqual(ensurePersonality(w2, w2.nations[1]));
    });

    it("test_seeding_never_consumes_the_world_rng_stream", () => {
        // A legacy save seeds lazily mid-match: the world RNG and clock have
        // moved on, and the vector must still come out identical.
        const early = fresh(), late = fresh();
        late._r = 0xDEADBEEF;
        late.time = 1234;
        expect(ensurePersonality(late, late.nations[1])).toEqual(ensurePersonality(early, early.nations[1]));
        expect(late._r).toBe(0xDEADBEEF);                  // stream untouched
    });

    it("test_different_slots_yield_different_vectors", () => {
        const w = fresh({isoB: "US"});                     // same iso — only the slot differs
        expect(ensurePersonality(w, w.nations[1])).not.toEqual(ensurePersonality(w, w.nations[0]));
    });

    it("test_different_isos_yield_different_vectors", () => {
        const ru = fresh({isoB: "RU"}), cn = fresh({isoB: "CN"});
        expect(ensurePersonality(cn, cn.nations[1])).not.toEqual(ensurePersonality(ru, ru.nations[1]));
    });

    it("test_different_seeds_yield_different_vectors", () => {
        const w7 = fresh({seed: 7}), w8 = fresh({seed: 8});
        expect(ensurePersonality(w8, w8.nations[1])).not.toEqual(ensurePersonality(w7, w7.nations[1]));
    });
});

describe("ensurePersonality — shape and persistence", () => {
    it("test_all_nine_traits_present_and_within_bounds", () => {
        const w = fresh();
        const p = ensurePersonality(w, w.nations[1]);
        expect(TRAITS).toHaveLength(9);
        expect(Object.keys(p).sort()).toEqual([...TRAITS].sort());
        for (const t of TRAITS) {
            expect(p[t]).toBeGreaterThanOrEqual(PERSONALITY.floor);
            expect(p[t]).toBeLessThanOrEqual(PERSONALITY.floor + PERSONALITY.span);
        }
    });

    it("test_vector_is_stored_on_the_nation_and_serializes", () => {
        const w = fresh();
        const n = w.nations[1];
        const p = ensurePersonality(w, n);
        expect(n.personality).toBe(p);                     // lives on the nation itself
        expect(JSON.parse(JSON.stringify(n)).personality).toEqual(p);   // plain data — save-safe
    });

    it("test_existing_personality_is_returned_untouched", () => {
        const w = fresh();
        const n = w.nations[1];
        const preset = {aggression: 0.99};                 // not even a full vector — still authoritative
        n.personality = preset;
        expect(ensurePersonality(w, n)).toBe(preset);
        expect(n.personality).toEqual({aggression: 0.99});
    });
});
