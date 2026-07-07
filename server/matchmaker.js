// GoldenDome matchmaker (ADR-0004: real-players-only). Second responsibility of
// the same authoritative server process introduced in ADR-0003: groups waiting
// `matchmaking_queue` rows into a match and forms the `lobbies`/`lobby_members`
// rows — REAL PLAYERS ONLY, no bots. A match forms once at least MIN_PLAYERS are
// queued (admitting up to MAX_PLAYERS); a lone waiter keeps waiting. It then
// auto-launches by flipping `lobbies.status` to `'starting'` — which the existing
// claim path (server/index.js `claimLobby`) picks up unchanged. Each player
// claims their own nation inside the full living world (server/match.js).
//
// Outbound-only, same as ADR-0003: a periodic sweep (the only thing that MUST
// exist, since it is what fires window-expiry with no new queue event) plus a
// best-effort Realtime subscription to react a little faster when a new waiter
// arrives. Every write uses the service-role `db` client passed in from
// server/index.js — never a client-supplied identity.
import {
    LOBBY_READY_TIMEOUT_MS,
    MATCH_WINDOW_MS,
    MAX_PLAYERS,
    MIN_PLAYERS,
} from "./config.js";

const SWEEP_MS = 1000;        // must exist: fires window-expiry with no new events
const READY_POLL_MS = 700;    // per-lobby all-ready re-check cadence

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
    // THIS process, so two overlapping sweeps (sweep tick landing mid-await of a
    // prior sweep) never try to form the same waiters into two groups. The
    // guarded status='waiting' -> 'matched' update is the real cross-process
    // safety net; this Set just avoids redundant local work.
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
        // Real players only: never form below MIN_PLAYERS. A single waiter keeps
        // waiting until a second real player queues.
        if (waiting.length < MIN_PLAYERS) return;

        const anchor = waiting[0];
        const anchorAgeMs = Date.now() - Date.parse(anchor.enqueued_at);
        const groupFull = waiting.length >= MAX_PLAYERS;
        const windowElapsed = anchorAgeMs >= MATCH_WINDOW_MS;
        if (!groupFull && !windowElapsed) return; // MIN met — hold briefly for more

        const players = waiting.slice(0, MAX_PLAYERS);
        for (const p of players) claiming.add(p.user_id);
        try {
            await formLobby(db, log, players);
        } catch (e) {
            log("matchmaker: form lobby failed:", e?.message || e);
        } finally {
            for (const p of players) claiming.delete(p.user_id);
        }
    }

    setInterval(() => void sweep(), SWEEP_MS);
    void sweep(); // don't wait a full interval for the very first check

    // Best-effort Realtime nudge: react faster to a fresh waiter than the 1s
    // sweep would alone. Not load-bearing — the sweep interval above is what
    // guarantees window-expiry and grouping correctness even if this never fires
    // or the subscription drops.
    try {
        db.channel("gd-server-matchmaking")
            .on("postgres_changes", {event: "*", schema: "public", table: "matchmaking_queue"}, (payload) => {
                if (payload.new?.status === "waiting") void sweep();
            })
            .subscribe((status) => log("matchmaker realtime:", status));
    } catch (e) {
        log("matchmaker: realtime subscribe failed (sweep interval still covers grouping):", e?.message || e);
    }

    log("matchmaker started (real players only): min", MIN_PLAYERS, "max", MAX_PLAYERS, "window", MATCH_WINDOW_MS + "ms", "timeout", LOBBY_READY_TIMEOUT_MS + "ms");
}

// ---- group -> lobby formation ----------------------------------------------

async function formLobby(db, log, players) {
    // 1. Create the lobby row. host is NOT NULL; the anchor fills it, but
    // quick-match lobbies confer no host powers (no host-only actions remain in
    // gd-lobby).
    const anchor = players[0];
    const {data: lobby, error: lobbyErr} = await db.from("lobbies")
        .insert({host: anchor.user_id, name: "Quick Match", status: "open", max_players: MAX_PLAYERS})
        .select().single();
    if (lobbyErr || !lobby) {
        log("matchmaker: could not create lobby:", lobbyErr?.message);
        return;
    }

    // 2. Claim the chosen queue rows for this lobby. Only proceed with rows
    // actually flipped (guards against a double-form race across process
    // restarts / a second server instance).
    const userIds = players.map((p) => p.user_id);
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
    // Real players only: if a race left us with fewer than MIN_PLAYERS, don't
    // seat a sub-minimum lobby — release any we did claim back to 'waiting' and
    // drop the empty lobby so they regroup on the next sweep.
    if (claimed.length < MIN_PLAYERS) {
        if (claimed.length) {
            await db.from("matchmaking_queue")
                .update({status: "waiting", lobby_id: null})
                .in("user_id", claimed.map((c) => c.user_id));
        }
        await db.from("lobbies").delete().eq("id", lobby.id);
        return;
    }

    trackLobby(lobby.id);

    // 3. Insert human lobby_members (slots 0..H-1), fetching each username so
    // display_name is populated even before claimLobby's own profiles join.
    const memberRows = [];
    for (let i = 0; i < claimed.length; i++) {
        const h = claimed[i];
        let username = null;
        try {
            const {data: prof} = await db.from("profiles").select("username").eq("id", h.user_id).maybeSingle();
            username = prof?.username ?? null;
        } catch { /* fall back to null; claimLobby's join covers it too */
        }
        memberRows.push({
            lobby_id: lobby.id,
            user_id: h.user_id,
            slot: i,
            is_bot: false,
            display_name: username,
            iso: h.iso ?? null,
            ready: false,
        });
    }

    const {error: insertErr} = await db.from("lobby_members").insert(memberRows);
    if (insertErr) {
        log("matchmaker: member insert failed for lobby", lobby.id, ":", insertErr.message);
        // Best-effort cleanup; the 45s starting-sweep in gd-lobby only reverts
        // stuck 'starting' lobbies, not malformed 'open' ones, so close it
        // directly rather than leaving a half-seated lobby around.
        await db.from("lobbies").update({status: "closed"}).eq("id", lobby.id);
        clearLobbyState(lobby.id);
        return;
    }

    log("matchmaker: formed lobby", lobby.id, "players", memberRows.length);

    // 4. Auto-launch: poll all-ready on an interval, plus a hard timeout ceiling
    // that launches regardless of ready state.
    const st = trackLobby(lobby.id);
    st.readyPoll = setInterval(() => void checkAutoLaunch(db, log, lobby.id), READY_POLL_MS);
    setLobbyTimeout(lobby.id, () => void forceLaunch(db, log, lobby.id), LOBBY_READY_TIMEOUT_MS);
    void checkAutoLaunch(db, log, lobby.id); // in case everyone is already ready
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
            log("matchmaker: ready-timeout launch", lobbyId);
            clearLobbyState(lobbyId);
        }
    } catch (e) {
        log("matchmaker: force-launch failed", lobbyId, e?.message || e);
    }
}
