// Diplomatic ledger: the per-rival memory block (wars fought, damage exchanged,
// declined and honored peaces, backstabs) plus the coarse war-damage attribution
// pass. Covers ensureDiplo/rel shape, hp-drop attribution while at war (and its
// absence at peace), the cadence gate, the equal split across foes, damageRatio
// math, and the event recorders warResolution/diplomacy call into.
import {describe, expect, it} from "vitest";
import {createWorld, declareWar} from "../../../src/game/engine.js";
import {
    damageRatio,
    ensureDiplo,
    recordAllianceBroken,
    recordPeaceDeclined,
    recordWarEnd,
    rel,
    trackWarDamage,
} from "../../../src/game/sim/ai/diplomacy/ledger.js";
import {THINK} from "../../../src/game/sim/ai/tuning.js";

// slot 0 = player, slots 1 & 2 = AI. B(1) carries a spare city whose hp the
// tests drop to simulate war damage. Coordinates are abstract — the ledger
// never rasterizes territory.
function fresh() {
    const w = createWorld({
        mySlot: 0, seed: 7,
        nations: [
            {slot: 0, name: "Aland", iso: "USA", isAi: false, gdp: 5},
            {slot: 1, name: "Bland", iso: "RUS", isAi: true, gdp: 5},
            {slot: 2, name: "Cland", iso: "CHN", isAi: true, gdp: 5},
        ],
        cities: [
            {id: "a1", slot: 0, name: "A-Cap", state: "AS1", cap: 1, pop: 100, econ: 1, lng: 0, lat: 0},
            {id: "b1", slot: 1, name: "B-Cap", state: "BS1", cap: 1, pop: 100, econ: 1, lng: 10, lat: 0},
            {id: "b2", slot: 1, name: "B-2", state: "BS2", cap: 0, pop: 50, econ: 1, lng: 11, lat: 0},
            {id: "c1", slot: 2, name: "C-Cap", state: "CS1", cap: 1, pop: 100, econ: 1, lng: 20, lat: 0},
        ],
        rules: {playerGraceSec: 0},   // opening ceasefire off so t=0 declareWar calls stand up their wars
    });
    w.city = (id) => w.cities.find((c) => c.id === id);
    return w;
}

describe("ensureDiplo / rel — the memory block", () => {
    it("test_ensure_diplo_creates_the_block_once", () => {
        const n = {};
        const d = ensureDiplo(n);
        expect(d).toEqual({ledger: {}, suing: {}, ceaseFire: {}, warState: {}, trend: 0, val: null});
        expect(n.diplo).toBe(d);
        d.trend = 0.4;
        expect(ensureDiplo(n)).toBe(d);       // second call returns the same block, untouched
        expect(n.diplo.trend).toBe(0.4);
    });

    it("test_rel_creates_a_zeroed_entry_on_first_contact", () => {
        const n = {};
        const r = rel(n, 3);
        expect(r).toEqual({
            wars: 0, dealt: 0, taken: 0, declined: 0, declinedWar: 0, honored: 0, backstabs: 0,
            lastPeaceAt: -1e9, lastAllyAt: -1e9, lastWarAt: -1e9,
        });
        expect(n.diplo.ledger[3]).toBe(r);
        r.wars = 2;
        expect(rel(n, 3)).toBe(r);            // subsequent reads keep the same entry
    });
});

describe("trackWarDamage — attribution of standing-value loss", () => {
    it("test_city_hp_drop_at_war_lands_as_taken_on_victim_and_dealt_on_foe", () => {
        const w = fresh();
        declareWar(w, 0, 1);
        trackWarDamage(w);                    // baseline pass at t=0
        w.time += THINK.lossTrackSec + 1;
        w.city("b2").hp *= 0.5;               // B's city bleeds between passes
        trackWarDamage(w);
        const na = w.nations[0], nb = w.nations[1];
        expect(rel(nb, 0).taken).toBeGreaterThan(0);
        expect(rel(na, 1).dealt).toBeCloseTo(rel(nb, 0).taken, 6);   // mirrored on the foe
        expect(rel(nb, 0).dealt).toBe(0);     // the undamaged side inflicted, never suffered
        expect(rel(na, 1).taken).toBe(0);
    });

    it("test_cadence_gate_defers_attribution_until_loss_track_sec_elapses", () => {
        const w = fresh();
        declareWar(w, 0, 1);
        trackWarDamage(w);                    // baseline at t=0
        w.time += THINK.lossTrackSec - 1;     // still inside the window
        w.city("b2").hp *= 0.5;
        trackWarDamage(w);
        expect(rel(w.nations[1], 0).taken).toBe(0);
        w.time += THINK.lossTrackSec + 1;     // past the gate the same loss is picked up
        trackWarDamage(w);
        expect(rel(w.nations[1], 0).taken).toBeGreaterThan(0);
    });

    it("test_loss_splits_equally_across_two_foes", () => {
        const w = fresh();
        declareWar(w, 0, 1);
        declareWar(w, 2, 1);
        trackWarDamage(w);
        w.time += THINK.lossTrackSec + 1;
        w.city("b2").hp *= 0.5;
        trackWarDamage(w);
        const nb = w.nations[1];
        const shareA = rel(nb, 0).taken, shareC = rel(nb, 2).taken;
        expect(shareA).toBeGreaterThan(0);
        expect(shareA).toBeCloseTo(shareC, 6);
        expect(rel(w.nations[0], 1).dealt).toBeCloseTo(shareA, 6);
        expect(rel(w.nations[2], 1).dealt).toBeCloseTo(shareC, 6);
    });

    it("test_no_attribution_at_peace", () => {
        const w = fresh();
        trackWarDamage(w);
        w.time += THINK.lossTrackSec + 1;
        w.city("b2").hp *= 0.5;               // damage with no war anywhere
        trackWarDamage(w);
        expect(rel(w.nations[1], 0).taken).toBe(0);
        expect(rel(w.nations[0], 1).dealt).toBe(0);
        expect(rel(w.nations[2], 1).dealt).toBe(0);
    });
});

describe("damageRatio — taken over dealt", () => {
    it("test_ratio_is_taken_over_dealt_with_floored_denominator", () => {
        const n = {};
        const r = rel(n, 1);
        r.taken = 30;
        r.dealt = 10;
        expect(damageRatio(n, 1)).toBeCloseTo(3);
        r.dealt = 0.25;                       // sub-1 denominators clamp to 1
        expect(damageRatio(n, 1)).toBeCloseTo(30);
        expect(damageRatio(n, 2)).toBe(0);    // untouched rival: nothing taken
    });
});

describe("event records — war endings, refusals, backstabs", () => {
    it("test_record_war_end_decisive_stamps_wars_and_last_peace_only", () => {
        const w = fresh();
        w.time = 321;
        ensureDiplo(w.nations[0]).suing[1] = 300;          // transient war state must clear
        ensureDiplo(w.nations[1]).warState[0] = "losing";
        recordWarEnd(w, 0, 1, 0);                          // decisive: A won
        const ra = rel(w.nations[0], 1), rb = rel(w.nations[1], 0);
        expect(ra.wars).toBe(1);
        expect(rb.wars).toBe(1);
        expect(ra.lastPeaceAt).toBe(321);
        expect(rb.lastPeaceAt).toBe(321);
        expect(ra.honored).toBe(0);                        // decisive ends honor nothing
        expect(rb.honored).toBe(0);
        expect(w.nations[0].diplo.ceaseFire[1]).toBeUndefined();
        expect(w.nations[0].diplo.suing[1]).toBeUndefined();
        expect(w.nations[1].diplo.warState[0]).toBeUndefined();
    });

    it("test_record_war_end_white_peace_honors_and_ceasefires_both_sides", () => {
        const w = fresh();
        w.time = 500;
        recordWarEnd(w, 0, 1, null);                       // white peace
        const ra = rel(w.nations[0], 1), rb = rel(w.nations[1], 0);
        expect(ra.honored).toBe(1);
        expect(rb.honored).toBe(1);
        expect(ra.wars).toBe(1);
        expect(ra.lastPeaceAt).toBe(500);
        expect(w.nations[0].diplo.ceaseFire[1]).toBe(500);
        expect(w.nations[1].diplo.ceaseFire[0]).toBe(500);
    });

    it("test_record_peace_declined_marks_only_the_offerer", () => {
        const w = fresh();
        recordPeaceDeclined(w, 0, 1);
        recordPeaceDeclined(w, 0, 1);
        expect(rel(w.nations[0], 1).declined).toBe(2);     // the offerer remembers
        expect(rel(w.nations[1], 0).declined).toBe(0);     // the refuser records nothing
    });

    it("test_record_alliance_broken_marks_backstabs_on_both_sides", () => {
        const w = fresh();
        recordAllianceBroken(w, 0, 1);
        expect(rel(w.nations[0], 1).backstabs).toBe(1);
        expect(rel(w.nations[1], 0).backstabs).toBe(1);
        expect(rel(w.nations[0], 2).backstabs).toBe(0);    // third parties untouched
    });
});
