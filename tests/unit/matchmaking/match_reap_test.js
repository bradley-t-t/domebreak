// A match with no connected human must free its capacity slot after the abandon
// grace; a match with a live socket must not. Guards against an AI-vs-AI game
// that never ends holding a MAX_MATCHES slot forever.
import {describe, expect, it} from "vitest";

// match.js pulls in config.js, which reads these at import time. A 1s grace keeps
// the timing waits short.
process.env.SUPABASE_URL ||= "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-key";
process.env.GD_ABANDON_GRACE_S = "1";
const {Match} = await import("../../../server/match/match.js");

const roster = [
    {userId: "u-human", username: "Trent", iso: "US", isBot: false, ready: true},
    {userId: null, username: "Vanguard", iso: "RU", isBot: true, ready: true},
    {userId: null, username: "Reaper", iso: "CN", isBot: true, ready: true},
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe("Match reaper — frees the capacity slot when no human is connected", () => {
    it("test_reaps_a_match_nobody_connects_to", async () => {
        let finished = null;
        const m = new Match({lobbyId: "L1", roster, onFinished: (x) => (finished = x)});
        expect(m.reported).toBe(false);
        await sleep(1400);
        expect(m.reported).toBe(true);
        expect(finished).toBe(m);
        expect(m.quit.has("u-human")).toBe(true);
        m.dispose();
    }, 3000);

    it("test_holds_while_a_human_is_connected_then_reaps_after_they_leave", async () => {
        let finished = null;
        const m = new Match({lobbyId: "L2", roster, onFinished: (x) => (finished = x)});
        const fakeWs = {readyState: 1, OPEN: 1, send() {}, close() {}};
        const attached = m.attach("u-human", fakeWs);
        expect(attached).toBeTruthy();
        await sleep(1400);
        expect(m.reported).toBe(false);
        expect(finished).toBe(null);

        m.detach(attached.slot);
        await sleep(1400);
        expect(m.reported).toBe(true);
        m.dispose();
    }, 5000);
});
