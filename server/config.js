// Server configuration from environment (.env is loaded by the systemd unit).
import {readFileSync} from "node:fs";

const need = (k) => {
    const v = process.env[k];
    if (!v) throw new Error(`missing required env ${k}`);
    return v;
};

// Build version from the repo-root package.json (the deploy ships it alongside
// server/ — see the /ship skill). It gates client hellos: a client whose
// version differs is rejected as outdated (src/net/version.js has the policy).
// Null (package.json missing or versionless) disables the gate rather than
// bricking multiplayer — index.js logs which mode it booted in.
export const APP_VERSION = (() => {
    try {
        return JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version || null;
    } catch {
        return null;
    }
})();

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
// Simulation step cadence. The sim is dt-scaled (see sim/tick.js), so this only
// sets granularity, not game speed — halving it just makes each step's dt smaller
// for the same real-time economy/combat rate. 50ms = 20Hz. env-tunable.
export const TICK_MS = parseInt(process.env.GD_TICK_MS || "50", 10);
// Full-world broadcast cadence — how fresh every player's view of all activity is.
// Default 50ms (20Hz) matches TICK_MS so every simulation step is shipped to all
// players immediately: fully realtime-synced, nothing waits for the next sweep.
// Keep >= TICK_MS — snapshots finer than the sim step just resend identical state.
// Cost is serialize+deflate + bandwidth, scaling with players x match count on this
// single-threaded process: a snapshot runs to hundreds of KB of JSON, so 20Hz is
// ~16MB/s of serialization per client and far more compression than a small vCPU
// can sustain. Size this to the host — a well-provisioned box can push
// GD_SNAPSHOT_MS=33 (30Hz); a 1-vCPU box belongs at 200 (5Hz). Sockets that can't
// drain the rate are skipped per sweep (SNAP_MAX_BUFFERED, match.js) so overload
// degrades freshness instead of OOMing the process. The client's prediction window
// (PREDICT_TTL_MS, gameClient.js) is wall-clock, so no client change is needed
// when tuning this.
export const SNAPSHOT_MS = parseInt(process.env.GD_SNAPSHOT_MS || "50", 10);
// Opening freeze (seconds): an online match holds paused this long at the start
// so every commander loads in before the war begins, then releases to
// permanently-locked 1x play (online has no pause/speed control at all).
export const MATCH_START_PAUSE_S = parseInt(process.env.GD_MATCH_START_PAUSE_S || "30", 10);

// ---- matchmaker -------------------------------------------------------------
// Human-only matchmaking: no bots. A match forms once at least MIN_PLAYERS real
// players are queued, admitting up to MAX_PLAYERS, and each player claims their
// own nation inside a bounded neutral-world war (activeCount belligerents, the
// rest of them AI, every other country a passive neutral — exactly as in single
// player). A lone waiter keeps waiting — a match never starts below MIN_PLAYERS.
export const MIN_PLAYERS = parseInt(process.env.GD_MIN_PLAYERS || "2", 10);
// Hard ceiling on humans per match. Mirrors NEUTRAL.maxActive (the sim's cap on
// active nations, src/game/data/constants.js): every human must claim an active
// belligerent slot, so admitting more than 8 would force the world past the
// bounded-match model the sim is sized for. env can lower this, never raise it.
export const HARD_MAX_PLAYERS = 8;
export const MAX_PLAYERS = Math.min(HARD_MAX_PLAYERS, parseInt(process.env.GD_MAX_PLAYERS || "8", 10));
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
