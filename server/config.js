// Server configuration from environment (.env is loaded by the systemd unit).
const need = (k) => {
    const v = process.env[k];
    if (!v) throw new Error(`missing required env ${k}`);
    return v;
};

export const SUPABASE_URL = need("SUPABASE_URL");
export const SERVICE_ROLE_KEY = need("SUPABASE_SERVICE_ROLE_KEY");
export const PORT = parseInt(process.env.GD_PORT || "8790", 10);
// Advertised WebSocket endpoints, best-first. Clients try each in order.
export const WS_URLS = (process.env.GD_WS_URLS || `ws://127.0.0.1:${PORT}`).split(",").map((s) => s.trim());
// Seconds a disconnected human keeps their nation before the AI takes over.
export const RECONNECT_GRACE_S = parseInt(process.env.GD_RECONNECT_GRACE_S || "60", 10);
// Seconds a match may run with NO human connected before it is reaped and its
// capacity slot freed. Covers a client that never dials in and one whose humans
// all left: a headless AI-vs-AI game that never reaches a win condition would
// otherwise hold a MAX_MATCHES slot forever and jam matchmaking. Must exceed
// RECONNECT_GRACE_S so a genuine reconnect is never pre-empted.
export const ABANDON_GRACE_S = parseInt(process.env.GD_ABANDON_GRACE_S || "120", 10);
// Most live matches this server will host at once; lobbies beyond it stay
// 'starting' and get re-swept until a slot frees.
export const MAX_MATCHES = parseInt(process.env.GD_MAX_MATCHES || "3", 10);
export const TICK_MS = 100;      // simulation step cadence
// Full-world broadcast cadence. Lower = more realtime economy/production/spawns
// (motion is already client-predicted), at a serialize+gzip + bandwidth cost that
// scales with match count on this single-threaded process. 200ms (5Hz) is safe
// on the Sunday host even at MAX_MATCHES; env-tunable without a redeploy.
export const SNAPSHOT_MS = parseInt(process.env.GD_SNAPSHOT_MS || "200", 10);
// Opening freeze (seconds): an online match holds paused this long at the start
// so every commander loads in before the war begins, then releases to
// permanently-locked 1x play (online has no pause/speed control at all).
export const MATCH_START_PAUSE_S = parseInt(process.env.GD_MATCH_START_PAUSE_S || "30", 10);

// ---- matchmaker -------------------------------------------------------------
// Human-only matchmaking: no bots. A match forms once at least MIN_PLAYERS real
// players are queued, admitting up to MAX_PLAYERS, and each player claims their
// own nation inside the full living world (every other country is world AI). A
// lone waiter keeps waiting — a match never starts below MIN_PLAYERS.
export const MIN_PLAYERS = parseInt(process.env.GD_MIN_PLAYERS || "2", 10);
export const MAX_PLAYERS = parseInt(process.env.GD_MAX_PLAYERS || "6", 10);
// Human-gather window (ms) measured from the anchor (oldest waiter)'s
// enqueued_at: once MIN_PLAYERS are present the group waits this long for more
// before forming (it closes early if it fills to MAX_PLAYERS first).
export const MATCH_WINDOW_MS = parseInt(process.env.GD_MATCH_WINDOW_MS || "12000", 10);
// Hard ceiling (ms) from lobby formation: launch regardless of ready state if
// every member hasn't readied by then (an unready human's nation runs as AI
// until they connect). MIN_PLAYERS are always present, so this never starts an
// empty match.
export const LOBBY_READY_TIMEOUT_MS = parseInt(process.env.GD_LOBBY_READY_TIMEOUT_MS || "45000", 10);
// Queue liveness (ms): a 'waiting' row is only grouped if its owner has
// heartbeated within this window. The Searching client refreshes last_seen every
// ~5s; a row that goes silent (app closed, crash, network drop) falls stale and
// is skipped, so real players are never matched to an offline ghost that quit
// without cancelling. db-lobby deletes rows staler than this on its sweep. Must
// comfortably exceed the client heartbeat cadence so jitter never drops a live
// waiter.
export const QUEUE_STALE_MS = parseInt(process.env.GD_QUEUE_STALE_MS || "20000", 10);
