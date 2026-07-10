// Match chat relay (server/match/match.js): a line broadcasts to every
// connected socket with the sender's authenticated slot and roster username,
// input is trimmed/capped/validated server-side, and a per-slot burst limit
// drops floods without touching other players. Fake timers make the
// rate-limit window deterministic.
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

// config.js reads these at import; set before importing match.js.
process.env.SUPABASE_URL ||= "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-key";
process.env.GD_MATCH_START_PAUSE_S ||= "30";
process.env.GD_ABANDON_GRACE_S ||= "2";
process.env.GD_RECONNECT_GRACE_S ||= "1";
const {Match} = await import("../../../server/match/match.js");

const roster = () => ([
    {userId: "u0", username: "P0", iso: "US", ready: true},
    {userId: "u1", username: "P1", iso: "RU", ready: true},
]);
const fakeWs = () => ({readyState: 1, OPEN: 1, sent: [], send(p) { this.sent.push(p); }, close() {}});
const chats = (ws) => ws.sent.map((p) => JSON.parse(p)).filter((m) => m.t === "chat");

let live = [];
const mk = () => {
    const m = new Match({lobbyId: "L", roster: roster(), rules: {playerGraceSec: 0}});
    live.push(m);
    return m;
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
    for (const m of live) { try { m.dispose(); } catch { /* already gone */ } }
    live = [];
    vi.useRealTimers();
});

describe("Match.chat", () => {
    it("test_a_message_broadcasts_to_every_connected_player_with_the_roster_username", () => {
        const m = mk();
        const a = fakeWs(), b = fakeWs();
        m.attach("u0", a);
        m.attach("u1", b);
        m.chat(m.players[0].slot, "  hello there  ");
        for (const ws of [a, b]) {
            const got = chats(ws);
            expect(got).toHaveLength(1);
            expect(got[0]).toMatchObject({slot: m.players[0].slot, username: "P0", text: "hello there"});
            expect(typeof got[0].ts).toBe("number");
        }
    });

    it("test_empty_non_string_and_non_player_input_is_dropped", () => {
        const m = mk();
        const a = fakeWs();
        m.attach("u0", a);
        m.chat(m.players[0].slot, "   ");
        m.chat(m.players[0].slot, {evil: true});
        m.chat(m.players[0].slot, null);
        m.chat(-1, "not a player slot");
        expect(chats(a)).toHaveLength(0);
    });

    it("test_overlong_text_is_capped", () => {
        const m = mk();
        const a = fakeWs();
        m.attach("u0", a);
        m.chat(m.players[0].slot, "x".repeat(1000));
        expect(chats(a)[0].text).toHaveLength(240);
    });

    it("test_a_flood_is_limited_per_slot_and_recovers_after_the_window", () => {
        const m = mk();
        const a = fakeWs();
        m.attach("u0", a);
        for (let i = 0; i < 10; i++) m.chat(m.players[0].slot, `msg ${i}`);
        expect(chats(a)).toHaveLength(5); // burst cap
        m.chat(m.players[1].slot, "still fine"); // the other player is unaffected
        expect(chats(a)).toHaveLength(6);
        vi.advanceTimersByTime(5100); // rolling window elapses
        m.chat(m.players[0].slot, "back");
        expect(chats(a)).toHaveLength(7);
    });

    it("test_chat_still_relays_after_the_war_is_over", () => {
        const m = mk();
        const a = fakeWs();
        m.attach("u0", a);
        m.world.over = true;
        m.chat(m.players[0].slot, "gg");
        expect(chats(a)).toHaveLength(1);
    });
});
