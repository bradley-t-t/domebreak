// Matchmaker group formation (server/matchmaker/matchmaker.js buildGroup): from
// FIFO-ordered live waiters, pick the next lobby group keeping publicly-queued
// parties intact — never split a party across the seat cap, never seat more than
// the cap. Pure and deterministic. Companion to matchmaker_liveness_test.js
// (the offline-ghost filter).
import {describe, expect, it} from "vitest";

// server/config.js validates SUPABASE_* at import; stub before importing.
process.env.SUPABASE_URL ||= "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-key";
const {buildGroup} = await import("../../../server/matchmaker/matchmaker.js");

const solo = (id) => ({user_id: id, party_id: null});
const party = (id, pid) => ({user_id: id, party_id: pid});
const ids = (rows) => rows.map((r) => r.user_id);

describe("buildGroup — solo waiters", () => {
    it("test_fewer_than_cap_takes_all_in_fifo_order", () => {
        expect(ids(buildGroup([solo("a"), solo("b"), solo("c")], 4))).toEqual(["a", "b", "c"]);
    });

    it("test_more_than_cap_takes_the_first_cap_in_fifo_order", () => {
        expect(ids(buildGroup([solo("a"), solo("b"), solo("c"), solo("d"), solo("e")], 4)))
            .toEqual(["a", "b", "c", "d"]);
    });
});

describe("buildGroup — parties stay intact", () => {
    it("test_party_is_grouped_together_with_solos", () => {
        const g = buildGroup([party("a", "P"), party("b", "P"), solo("c")], 4);
        expect(ids(g)).toEqual(["a", "b", "c"]);
    });

    it("test_party_that_fills_the_cap_takes_the_whole_match", () => {
        expect(ids(buildGroup([party("a", "P"), party("b", "P"), party("c", "P"), party("d", "P")], 4)))
            .toEqual(["a", "b", "c", "d"]);
    });

    it("test_party_that_wont_fit_the_remaining_seats_is_held_not_split", () => {
        // 3 solos take 3 of 4 seats; the 2-person party can't fit the last seat, so
        // it is skipped entirely (never split) — the group forms with the solos.
        const g = buildGroup([solo("a"), solo("b"), solo("c"), party("d", "P"), party("e", "P")], 4);
        expect(ids(g)).toEqual(["a", "b", "c"]);
    });

    it("test_oversized_party_fills_alone_when_it_anchors", () => {
        // A party bigger than the cap, first in line, fills the match truncated to cap.
        const rows = [party("a", "P"), party("b", "P"), party("c", "P"), party("d", "P"), party("e", "P")];
        expect(ids(buildGroup(rows, 4))).toEqual(["a", "b", "c", "d"]);
    });

    it("test_oversized_party_is_held_when_it_does_not_anchor", () => {
        // A solo anchors; the oversized party behind it can't fit and is held, so only
        // the solo comes back (the sweep's MIN check then keeps everyone waiting).
        const rows = [solo("s"), party("a", "P"), party("b", "P"), party("c", "P"), party("d", "P"), party("e", "P")];
        expect(ids(buildGroup(rows, 4))).toEqual(["s"]);
    });

    it("test_a_party_is_never_double_counted", () => {
        // The party's later members are iterated too, but usedParties prevents re-adding.
        const g = buildGroup([party("a", "P"), solo("b"), party("c", "P")], 6);
        expect(ids(g)).toEqual(["a", "c", "b"]); // party A (both) then the solo
        expect(new Set(ids(g)).size).toBe(ids(g).length); // no duplicates
    });
});
