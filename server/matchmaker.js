// GoldenDome matchmaker (ADR-0004). Second responsibility of the same
// authoritative server process introduced in ADR-0003: groups waiting
// `matchmaking_queue` rows into a match, forms the `lobbies`/`lobby_members`
// rows (bot seats included), simulates bot lobby behavior (staggered nation
// pick + ready) with timed writes only, and auto-launches by flipping
// `lobbies.status` to `'starting'` — which the existing claim path
// (server/index.js `claimLobby`) then picks up unchanged.
//
// Outbound-only, same as ADR-0003: a periodic sweep (the only thing that MUST
// exist, since it is what fires window-expiry with no new queue event) plus a
// best-effort Realtime subscription to react a little faster when a new
// waiter arrives. Every write uses the service-role `db` client passed in
// from server/index.js — never a client-supplied identity.
import {
    BOT_CALLSIGNS,
    BOT_JOIN_STAGGER_MS,
    BOT_READY_DELAY_MS,
    LOBBY_READY_TIMEOUT_MS,
    MATCH_WINDOW_MS,
    TARGET_NATIONS,
} from "./config.js";
import {GREAT_POWERS} from "../src/game/sim/newGame.js";

const SWEEP_MS = 1000;        // must exist: fires window-expiry with no new events
const READY_POLL_MS = 700;    // per-lobby all-ready re-check cadence

const rand = ([min, max]) => min + Math.random() * (max - min);

// Per-lobby bookkeeping so timers/intervals get cleared exactly once, the
// moment a lobby leaves 'open' (claimed by auto-launch or otherwise closed).
const lobbyState = new Map(); // lobbyId -> {timers: Set<Timeout>, readyPoll: Timeout|null, closed: boolean}

function trackLobby(lobbyId) {
    if (!lobbyState.has(lobbyId)) lobbyState.set(lobbyId, {timers: new Set(), readyPoll: null, closed: false});
    return lobbyState.get(lobbyId);
}

function clearLobbyState(lobbyId) {
    const st = lobbyState.get(lobbyId);
    if (!st) return;
    st.closed = true;
    for (const t of st.timers) clearTimeout(t);
    if (st.readyPoll) clearInterval(st.readyPoll);
    lobbyState.delete(lobbyId);
}

function setLobbyTimeout(lobbyId, fn, ms) {
    const st = trackLobby(lobbyId);
    const t = setTimeout(() => {
        st.timers.delete(t);
        if (!st.closed) fn();
    }, ms);
    st.timers.add(t);
    return t;
}

export function startMatchmaker(db, log) {
    // Track queue rows currently claimed by an in-flight group formation in
    // THIS process, so two overlapping sweeps (sweep tick landing mid-await
    // of a prior sweep) never try to form the same waiters into two groups.
    // The guarded status='waiting' -> 'matched' update is the real
    // cross-process safety net; this Set just avoids redundant local work.
    const claiming = new Set();

    async function sweep() {
        let waiting;
        try {
            const {data, error} = await db.from("matchmaking_queue")
                .select("user_id, iso, enqueued_at")
                .eq("status", "waiting")
                .order("enqueued_at");
            if (error) throw error;
            waiting = (data ?? []).filter((r) => !claiming.has(r.user_id));
        } catch (e) {
            log("matchmaker: sweep read failed:", e?.message || e);
            return;
        }
        if (!waiting.length) return;

        const anchor = waiting[0];
        const anchorAgeMs = Date.now() - Date.parse(anchor.enqueued_at);
        const groupFull = waiting.length >= TARGET_NATIONS;
        const windowElapsed = anchorAgeMs >= MATCH_WINDOW_MS;
        if (!groupFull && !windowElapsed) return; // still gathering; try again next sweep

        const humans = waiting.slice(0, TARGET_NATIONS);
        for (const h of humans) claiming.add(h.user_id);
        try {
            await formLobby(db, log, humans);
        } catch (e) {
            log("matchmaker: form lobby failed:", e?.message || e);
        } finally {
            for (const h of humans) claiming.delete(h.user_id);
        }
    }

    setInterval(() => void sweep(), SWEEP_MS);
    void sweep(); // don't wait a full interval for the very first check

    // Best-effort Realtime nudge: react faster to a fresh waiter than the 1s
    // sweep would alone. Not load-bearing — the sweep interval above is what
    // guarantees window-expiry and grouping correctness even if this never
    // fires or the subscription drops.
    try {
        db.channel("gd-server-matchmaking")
            .on("postgres_changes", {event: "*", schema: "public", table: "matchmaking_queue"}, (payload) => {
                if (payload.new?.status === "waiting") void sweep();
            })
            .subscribe((status) => log("matchmaker realtime:", status));
    } catch (e) {
        log("matchmaker: realtime subscribe failed (sweep interval still covers grouping):", e?.message || e);
    }

    log("matchmaker started: target", TARGET_NATIONS, "window", MATCH_WINDOW_MS + "ms", "timeout", LOBBY_READY_TIMEOUT_MS + "ms");
}

// ---- group -> lobby formation ----------------------------------------------

async function formLobby(db, log, humans) {
    // 1. Create the lobby row. host is NOT NULL; the anchor fills it, but
    // quick-match lobbies confer no host powers (no host-only actions remain
    // in gd-lobby).
    const anchor = humans[0];
    const {data: lobby, error: lobbyErr} = await db.from("lobbies")
        .insert({host: anchor.user_id, name: "Quick Match", status: "open", max_players: TARGET_NATIONS})
        .select().single();
    if (lobbyErr || !lobby) {
        log("matchmaker: could not create lobby:", lobbyErr?.message);
        return;
    }

    // 2. Claim the chosen queue rows for this lobby. Only proceed with rows
    // actually flipped (guards against a double-form race across process
    // restarts / a second server instance).
    const userIds = humans.map((h) => h.user_id);
    const {data: claimedRows, error: claimErr} = await db.from("matchmaking_queue")
        .update({status: "matched", lobby_id: lobby.id})
        .in("user_id", userIds)
        .eq("status", "waiting")
        .select("user_id, iso");
    if (claimErr) {
        log("matchmaker: queue claim failed:", claimErr.message);
        await db.from("lobbies").delete().eq("id", lobby.id);
        return;
    }
    const claimed = claimedRows ?? [];
    if (!claimed.length) {
        // Lost every one of these waiters to a racing formation elsewhere —
        // nothing to seat; drop the empty lobby we speculatively created.
        await db.from("lobbies").delete().eq("id", lobby.id);
        return;
    }

    trackLobby(lobby.id);
    const formedAt = Date.now();

    // 3. Insert human lobby_members (slots 0..H-1), fetching each username so
    // display_name is populated even before claimLobby's own profiles join.
    const humanRows = [];
    for (let i = 0; i < claimed.length; i++) {
        const h = claimed[i];
        let username = null;
        try {
            const {data: prof} = await db.from("profiles").select("username").eq("id", h.user_id).maybeSingle();
            username = prof?.username ?? null;
        } catch { /* fall back to null; claimLobby's join covers it too */
        }
        humanRows.push({
            lobby_id: lobby.id,
            user_id: h.user_id,
            slot: i,
            is_bot: false,
            display_name: username,
            iso: h.iso ?? null,
            ready: false,
        });
    }

    const humanCount = humanRows.length;
    const botCount = Math.max(0, TARGET_NATIONS - humanCount);
    const usedCallsigns = new Set();
    const botRows = [];
    for (let i = 0; i < botCount; i++) {
        const slot = humanCount + i;
        let callsign = BOT_CALLSIGNS[(Math.random() * BOT_CALLSIGNS.length) | 0];
        let guard = 0;
        while (usedCallsigns.has(callsign) && guard++ < BOT_CALLSIGNS.length) {
            callsign = BOT_CALLSIGNS[(Math.random() * BOT_CALLSIGNS.length) | 0];
        }
        usedCallsigns.add(callsign);
        botRows.push({
            lobby_id: lobby.id,
            user_id: null,
            slot,
            is_bot: true,
            display_name: callsign,
            iso: null,
            ready: false,
        });
    }

    const {error: insertErr} = await db.from("lobby_members").insert([...humanRows, ...botRows]);
    if (insertErr) {
        log("matchmaker: member insert failed for lobby", lobby.id, ":", insertErr.message);
        // Best-effort cleanup; the 45s starting-sweep in gd-lobby only reverts
        // stuck 'starting' lobbies, not malformed 'open' ones, so close it
        // directly rather than leaving a half-seated lobby around.
        await db.from("lobbies").update({status: "closed"}).eq("id", lobby.id);
        clearLobbyState(lobby.id);
        return;
    }

    log("matchmaker: formed lobby", lobby.id, "humans", humanCount, "bots", botCount);

    // 4. Simulate bots: staggered iso pick, then staggered ready, timed
    // writes only. Every write is guarded to no-op once the lobby has left
    // 'open' (auto-launched or otherwise closed).
    for (const bot of botRows) {
        const joinDelay = rand(BOT_JOIN_STAGGER_MS);
        setLobbyTimeout(lobby.id, () => void botJoin(db, log, lobby.id, bot.slot), joinDelay);
    }

    // 5. Auto-launch: poll all-ready on an interval, plus a hard timeout
    // ceiling that force-launches regardless of ready state.
    const st = trackLobby(lobby.id);
    st.readyPoll = setInterval(() => void checkAutoLaunch(db, log, lobby.id), READY_POLL_MS);
    setLobbyTimeout(lobby.id, () => void forceLaunch(db, log, lobby.id), LOBBY_READY_TIMEOUT_MS);
    void checkAutoLaunch(db, log, lobby.id); // in case all seats already happen to be ready (e.g. 0 bots, 1 human edge case never applies, but cheap to check)

    void formedAt; // formedAt kept for clarity/future logging; timeout above is relative already
}

// ---- bot lobby simulation ---------------------------------------------------

async function botJoin(db, log, lobbyId, slot) {
    try {
        const {data: lobby} = await db.from("lobbies").select("status").eq("id", lobbyId).maybeSingle();
        if (!lobby || lobby.status !== "open") return; // already launched/closed; no-op

        const {data: members} = await db.from("lobby_members").select("slot, iso").eq("lobby_id", lobbyId);
        const taken = new Set((members ?? []).map((m) => m.iso).filter(Boolean));
        const iso = GREAT_POWERS.find((g) => !taken.has(g)) ?? GREAT_POWERS[(Math.random() * GREAT_POWERS.length) | 0];

        await db.from("lobby_members").update({iso}).eq("lobby_id", lobbyId).eq("slot", slot).eq("is_bot", true);

        const readyDelay = rand(BOT_READY_DELAY_MS);
        setLobbyTimeout(lobbyId, () => void botReady(db, log, lobbyId, slot), readyDelay);
    } catch (e) {
        log("matchmaker: bot join write failed", lobbyId, slot, e?.message || e);
    }
}

async function botReady(db, log, lobbyId, slot) {
    try {
        const {data: lobby} = await db.from("lobbies").select("status").eq("id", lobbyId).maybeSingle();
        if (!lobby || lobby.status !== "open") return; // already launched/closed; no-op
        await db.from("lobby_members").update({ready: true}).eq("lobby_id", lobbyId).eq("slot", slot).eq("is_bot", true);
        void checkAutoLaunch(db, log, lobbyId);
    } catch (e) {
        log("matchmaker: bot ready write failed", lobbyId, slot, e?.message || e);
    }
}

// ---- auto-launch ------------------------------------------------------------

async function checkAutoLaunch(db, log, lobbyId) {
    const st = lobbyState.get(lobbyId);
    if (!st || st.closed) return;
    try {
        const {data: members} = await db.from("lobby_members").select("ready").eq("lobby_id", lobbyId);
        if (!members?.length) return;
        if (!members.every((m) => m.ready)) return;
        const {data: launched} = await db.from("lobbies")
            .update({status: "starting", updated_at: new Date().toISOString()})
            .eq("id", lobbyId).eq("status", "open").select().maybeSingle();
        if (launched) {
            log("matchmaker: all-ready launch", lobbyId);
            clearLobbyState(lobbyId);
        }
    } catch (e) {
        log("matchmaker: auto-launch check failed", lobbyId, e?.message || e);
    }
}

async function forceLaunch(db, log, lobbyId) {
    try {
        const {data: launched} = await db.from("lobbies")
            .update({status: "starting", updated_at: new Date().toISOString()})
            .eq("id", lobbyId).eq("status", "open").select().maybeSingle();
        if (launched) {
            log("matchmaker: ready-timeout force-launch", lobbyId);
            clearLobbyState(lobbyId);
        }
    } catch (e) {
        log("matchmaker: force-launch failed", lobbyId, e?.message || e);
    }
}
