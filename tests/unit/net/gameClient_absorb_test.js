// Snapshot reconciliation (src/net/gameClient.js absorb): the client keeps ONE
// world object for the whole match and overwrites it in place from each server
// snapshot, so every engine ref stays valid. absorb must add the snapshot's keys,
// drop keys the snapshot no longer has, keep the same object identity, and re-stamp
// mySlot. Deterministic.
import {describe, expect, it} from "vitest";
import {absorb} from "../../../src/net/gameClient.js";

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
