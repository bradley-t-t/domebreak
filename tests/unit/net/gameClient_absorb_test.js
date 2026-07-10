// Snapshot reconciliation (src/net/gameClient.js absorb): the client keeps ONE
// world object for the whole match and overwrites it in place from each server
// snapshot, so every engine ref stays valid. absorb must add the snapshot's keys,
// drop keys the snapshot no longer has, keep the same object identity, and re-stamp
// mySlot. Deterministic.
import {describe, expect, it} from "vitest";
import {absorb, reconcile, PREDICT_TTL_MS} from "../../../src/net/gameClient.js";

// send() stamps every pending command with exp: Date.now() + PREDICT_TTL_MS;
// mirror that here against a fixed clock so the tests stay deterministic.
const NOW = 1_000_000;
const pending = (seq, name = "scrap", args = []) => ({seq, name, args, exp: NOW + PREDICT_TTL_MS});

describe("absorb — in-place snapshot overwrite", () => {
    it("test_preserves_object_identity", () => {
        const world = {time: 0, nations: []};
        const same = world;
        absorb(world, {time: 5, nations: [{slot: 0}]}, 0);
        expect(world).toBe(same); // never re-seated
        expect(world.time).toBe(5);
    });

    it("test_copies_snapshot_keys_over", () => {
        const world = {time: 0};
        absorb(world, {time: 9, units: [{id: "u"}], events: [{id: "e"}]}, 1);
        expect(world.units).toEqual([{id: "u"}]);
        expect(world.events).toEqual([{id: "e"}]);
    });

    it("test_drops_keys_absent_from_the_snapshot", () => {
        // A locally-predicted key the server doesn't send must be removed, else stale
        // client-only state would linger forever.
        const world = {time: 0, phantomUnit: {id: "ghost"}, nations: []};
        absorb(world, {time: 1, nations: []}, 0);
        expect("phantomUnit" in world).toBe(false);
    });

    it("test_restamps_my_slot_every_time", () => {
        const world = {mySlot: 3, time: 0};
        absorb(world, {time: 1}, 7);
        expect(world.mySlot).toBe(7);
    });

    it("test_replaces_nested_collections_wholesale", () => {
        // Object.assign is shallow: the nations array is replaced by the server's,
        // not merged — the authoritative snapshot wins.
        const world = {nations: [{slot: 0, points: 999}]};
        absorb(world, {nations: [{slot: 0, points: 10}, {slot: 1, points: 20}]}, 0);
        expect(world.nations).toHaveLength(2);
        expect(world.nations[0].points).toBe(10);
    });
});

describe("reconcile — client-side prediction replay", () => {
    it("test_drops_acked_and_replays_the_rest", () => {
        // seq 1 is now baked into the snapshot (ack=1); seq 2 is still in flight and
        // must be replayed so its optimistic effect survives the overwrite.
        const replayed = [];
        const client = {
            _pending: [pending(1, "scrap", ["a"]), pending(2, "scrap", ["b"])],
            _reapply: () => { for (const c of client._pending) replayed.push(c.seq); },
        };
        reconcile(client, 1, NOW);
        expect(client._pending.map((c) => c.seq)).toEqual([2]);
        expect(replayed).toEqual([2]);
    });

    it("test_keeps_everything_when_ack_predates_all_pending", () => {
        // A snapshot generated before the server processed any command (ack behind the
        // pending seqs) must not drop them — this is exactly the stale-snapshot case
        // that made a sold unit blink back before the fix.
        const client = {_pending: [pending(5, "scrap", ["a"])], _reapply: () => {}};
        reconcile(client, 4, NOW);
        expect(client._pending.map((c) => c.seq)).toEqual([5]);
    });

    it("test_ages_out_predictions_the_server_never_confirms", () => {
        // The regression that stalled the whole economy: against a server that never
        // acks (or a dropped command), pending must not grow forever. Once a
        // prediction has gone PREDICT_TTL_MS of wall clock unconfirmed it is
        // discarded so the authoritative snapshot wins instead of replayed economy
        // commands bleeding points to zero. Wall clock, not a snapshot count — the
        // window must hold whatever rate snapshots actually arrive at.
        const client = {_pending: [pending(1, "buyPlace", ["bunker"])], _reapply: () => {}};
        reconcile(client, undefined, NOW + PREDICT_TTL_MS - 1);
        expect(client._pending).toHaveLength(1); // still predicting within the window
        reconcile(client, undefined, NOW + PREDICT_TTL_MS);
        expect(client._pending).toHaveLength(0); // aged out — buffer stays bounded
    });

    it("test_reapply_runs_even_with_empty_pending", () => {
        let ran = false;
        const client = {_pending: [], _reapply: () => { ran = true; }};
        reconcile(client, 3);
        expect(ran).toBe(true);
    });
});
