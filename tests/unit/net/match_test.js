// Match lifecycle (server/match/match.js): the authoritative per-match runner —
// roster to world, opening freeze, command gating, reconnect grace with AI
// stewardship, the abandon reaper that frees a capacity slot, and result
// recording. Fake timers make the timing deterministic. Companion to
// tests/unit/matchmaking/match_reap_test.js (reaper focus).
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

// config.js reads these at import; set before importing match.js. Short-ish windows
// keep the freeze paused through the quick tests (so no full-world stepping) while
// staying long enough to advance past deliberately.
process.env.SUPABASE_URL ||= "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-key";
process.env.GD_MATCH_START_PAUSE_S ||= "30";
process.env.GD_ABANDON_GRACE_S ||= "2";
process.env.GD_RECONNECT_GRACE_S ||= "1";
const {Match} = await import("../../../server/match/match.js");

const roster = () => ([
    {userId: "u0", username: "P0", iso: "US", ready: true},
    {userId: "u1", username: "P1", iso: "RU", ready: false},
]);
const fakeWs = () => ({readyState: 1, OPEN: 1, sent: [], send(p) { this.sent.push(p); }, close() {}});

let live = [];
const mk = (onFinished) => {
    // Opening grace is on by default (playerGraceSec: 45); these tests declare war
    // at t=0 to exercise routing/gating, so switch it off for the fixture world.
    const m = new Match({lobbyId: "L", roster: roster(), rules: {playerGraceSec: 0}, onFinished});
    live.push(m);
    return m;
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
    for (const m of live) { try { m.dispose(); } catch { /* already gone */ } }
    live = [];
    vi.useRealTimers();
});

describe("Match construction", () => {
    it("test_each_player_gets_a_world_slot_and_the_full_world_is_built", () => {
        const m = mk();
        expect(m.players).toHaveLength(2);
        for (const p of m.players) expect(typeof p.slot).toBe("number");
        expect(m.players[0].slot).not.toBe(m.players[1].slot); // distinct nations
        expect(m.world.nations.length).toBeGreaterThan(2);      // whole world, not just the two
        expect(m.world.meta.mode).toBe("online");
        expect(m.world.speed).toBe(1);                          // online is locked to 1x
    });

    it("test_ready_players_are_human_unready_players_stay_ai_until_they_connect", () => {
        const m = mk();
        const nation = (slot) => m.world.nations.find((n) => n.slot === slot);
        expect(nation(m.players[0].slot).isAi).toBe(false); // u0 readied
        expect(nation(m.players[1].slot).isAi).toBe(true);  // u1 did not
    });

    it("test_opens_on_a_countdown_freeze", () => {
        const m = mk();
        expect(m.world.paused).toBe(true);
        expect(m.world.startsIn).toBeGreaterThan(0);
    });
});

describe("Match.command gating", () => {
    it("test_unknown_command_is_rejected", () => {
        expect(mk().command(0, "selfDestruct", [])).toEqual({error: "unknown command"});
    });

    it("test_no_commands_once_the_war_is_over", () => {
        const m = mk();
        m.world.over = true;
        expect(m.command(m.players[0].slot, "declareWar", [0])).toEqual({error: "the war is over"});
    });

    it("test_a_valid_command_routes_with_the_sender_slot", () => {
        const m = mk();
        const [a, b] = m.players;
        const r = m.command(a.slot, "declareWar", [b.slot]);
        expect(r).toEqual({ok: true});
        expect(m.world.nations.find((n) => n.slot === a.slot).relations[b.slot]).toBe("war");
    });
});

describe("attach / detach — reconnect grace and AI stewardship", () => {
    it("test_attach_takes_the_nation_back_from_the_ai", () => {
        const m = mk();
        const p = m.players[1]; // started AI (unready)
        const ws = fakeWs();
        expect(m.attach("u1", ws)).toBeTruthy();
        expect(m.world.nations.find((n) => n.slot === p.slot).isAi).toBe(false);
    });

    it("test_detach_hands_the_nation_to_the_ai_after_the_grace_window_and_records_a_quit", () => {
        const m = mk();
        const p = m.players[0];
        m.attach("u0", fakeWs());
        m.detach(p.slot);
        vi.advanceTimersByTime(1100); // past RECONNECT_GRACE_S (1s) — world stays frozen, no stepping
        expect(m.world.nations.find((n) => n.slot === p.slot).isAi).toBe(true);
        expect(m.quit.has("u0")).toBe(true);
    });
});

describe("walkover — a PvP match ends when only one human is left connected", () => {
    it("test_the_reaper_stays_armed_until_both_humans_are_connected", () => {
        const m = mk();
        m.attach("u0", fakeWs());
        expect(m.reapTimer).not.toBeNull(); // one short — armed for the walkover
        m.attach("u1", fakeWs());
        expect(m.reapTimer).toBeNull();     // both present — nothing to reap
    });

    it("test_dropping_to_the_last_connected_human_ends_the_game_with_them_as_winner", () => {
        let finished = null;
        const m = mk((x) => { finished = x; });
        m.attach("u0", fakeWs());
        m.attach("u1", fakeWs());
        m.detach(m.players[1].slot); // u1 leaves; u0 is the sole survivor
        vi.advanceTimersByTime(2100); // past ABANDON_GRACE_S (2s)
        expect(m.reported).toBe(true);
        expect(finished).toBe(m);
        expect(m.world.over).toBe(true);
        expect(m.world.winnerSlot).toBe(m.players[0].slot); // the one still connected wins
        expect(m.quit.has("u1")).toBe(true);                // the one who left is a quit
        expect(m.quit.has("u0")).toBe(false);               // the winner did not quit
    });

    it("test_a_reconnect_within_grace_keeps_the_match_alive", () => {
        const m = mk();
        m.attach("u0", fakeWs());
        m.attach("u1", fakeWs());
        m.detach(m.players[1].slot);
        vi.advanceTimersByTime(1000); // within ABANDON_GRACE_S
        m.attach("u1", fakeWs());     // u1 returns before the walkover fires
        vi.advanceTimersByTime(2100); // past the original grace
        expect(m.reported).toBe(false); // both present again — never reaped
    });
});

describe("abandon reaper — frees the capacity slot when nobody connects", () => {
    it("test_a_match_no_one_dials_into_is_reaped_and_its_humans_recorded_as_quit", () => {
        let finished = null;
        const m = mk((x) => { finished = x; });
        expect(m.reported).toBe(false);
        vi.advanceTimersByTime(2100); // past ABANDON_GRACE_S (2s)
        expect(m.reported).toBe(true);
        expect(finished).toBe(m);
        expect(m.quit.has("u0")).toBe(true);
        expect(m.quit.has("u1")).toBe(true);
    });

    it("test_rereporting_is_idempotent", () => {
        let n = 0;
        const m = mk(() => { n++; });
        m.finish();
        m.finish();
        expect(n).toBe(1);
    });
});

describe("result rows — the server is the authority on outcomes", () => {
    it("test_quit_players_are_recorded_as_quit", () => {
        const m = mk();
        vi.advanceTimersByTime(2100); // reaped -> both quit
        const rows = m.resultRows();
        expect(rows).toHaveLength(2);
        for (const r of rows) {
            expect(r.result).toBe("quit");
            expect(r.mode).toBe("online");
            expect(r.match_id).toBe(m.id);
        }
    });

    it("test_winner_and_losers_are_scored_from_winnerSlot", () => {
        const m = mk();
        m.world.winnerSlot = m.players[0].slot; // u0 wins
        const byUser = Object.fromEntries(m.resultRows().map((r) => [r.user_id, r.result]));
        expect(byUser.u0).toBe("win");
        expect(byUser.u1).toBe("loss");
    });
});
