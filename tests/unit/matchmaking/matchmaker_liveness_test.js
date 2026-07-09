// Matchmaker liveness: a 'waiting' row is only groupable while its owner keeps
// heartbeating. A player who queued then went offline (app closed, crash, network
// drop) stops refreshing last_seen, so their row is filtered out and never seated
// against a real player. Deterministic — `now` is injected. Spec: the
// offline-matchmaking bug; see server/matchmaker/matchmaker.js liveWaiters +
// db-lobby sweep.
import {describe, expect, it} from "vitest";

// server/config.js validates SUPABASE_* at import time; stub them so the pure
// liveWaiters helper imports in a headless unit test.
process.env.SUPABASE_URL ||= "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-key";
const {liveWaiters} = await import("../../../server/matchmaker/matchmaker.js");

const now = 1_000_000_000_000;
const STALE = 20_000;
const ago = (ms) => new Date(now - ms).toISOString();

describe("matchmaker liveWaiters — offline ghosts are never grouped", () => {
    it("test_keeps_recent_waiters", () => {
        const rows = [{user_id: "a", last_seen: ago(3_000)}, {user_id: "b", last_seen: ago(19_000)}];
        expect(liveWaiters(rows, now, STALE).map((r) => r.user_id)).toEqual(["a", "b"]);
    });

    it("test_drops_stale_offline_waiters", () => {
        const rows = [{user_id: "live", last_seen: ago(5_000)}, {user_id: "ghost", last_seen: ago(25_000)}];
        expect(liveWaiters(rows, now, STALE).map((r) => r.user_id)).toEqual(["live"]);
    });

    it("test_missing_or_bad_last_seen_is_treated_as_offline", () => {
        const rows = [{user_id: "x"}, {user_id: "y", last_seen: "not-a-date"}, {user_id: "z", last_seen: null}];
        expect(liveWaiters(rows, now, STALE)).toEqual([]);
    });

    it("test_lone_real_player_plus_ghost_cannot_reach_a_pair", () => {
        // The bug itself: one live player + an abandoned ghost row used to form a
        // 2-player match. After the fix only the live player survives the filter,
        // so the matchmaker (MIN_PLAYERS = 2) can't form — the player keeps waiting.
        const rows = [{user_id: "me", last_seen: ago(2_000)}, {user_id: "ghost", last_seen: ago(120_000)}];
        expect(liveWaiters(rows, now, STALE)).toHaveLength(1);
    });

    it("test_boundary_exactly_at_threshold_is_kept", () => {
        // Exactly staleMs old is still live (<=), one ms past is not.
        expect(liveWaiters([{user_id: "edge", last_seen: ago(20_000)}], now, STALE)).toHaveLength(1);
        expect(liveWaiters([{user_id: "edge", last_seen: ago(20_001)}], now, STALE)).toHaveLength(0);
    });
});
