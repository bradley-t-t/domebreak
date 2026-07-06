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
export const SNAPSHOT_MS = 500;  // full-world broadcast cadence

// ---- matchmaker (ADR-0004) --------------------------------------------------
// Nations per formed lobby (humans + bot fill). Range 2-16 per the GDD.
export const TARGET_NATIONS = parseInt(process.env.GD_TARGET_NATIONS || "6", 10);
// Human-gather window (ms) measured from the anchor (oldest waiter)'s
// enqueued_at; a group closes early if it fills to TARGET_NATIONS first.
export const MATCH_WINDOW_MS = parseInt(process.env.GD_MATCH_WINDOW_MS || "6000", 10);
// Per-bot delay (ms), from lobby formation, before that bot's iso write lands
// (its visible "join"). Randomized independently per bot within this range.
export const BOT_JOIN_STAGGER_MS = [400, 1600];
// Per-bot additional delay (ms), from that bot's own join time, before its
// ready write lands. Randomized independently per bot within this range.
export const BOT_READY_DELAY_MS = [1000, 4000];
// Hard ceiling (ms) from lobby formation: force-launch regardless of ready
// state if every member hasn't readied by then.
export const LOBBY_READY_TIMEOUT_MS = parseInt(process.env.GD_LOBBY_READY_TIMEOUT_MS || "45000", 10);
// Plausible commander callsigns bots draw from (unique per lobby; recycled
// across lobbies since the pool only needs to avoid collision within one).
export const BOT_CALLSIGNS = [
    "Vanguard", "Ironside", "Reaper", "Falcon", "Sentinel", "Marauder", "Cipher", "Warden",
    "Hollowpoint", "Ashfall", "Nightshade", "Ironclad", "Talon", "Ragnarok", "Specter", "Bulwark",
    "Havoc", "Grimwald", "Stormcrow", "Ironwolf", "Blackout", "Vulcan", "Dreadnought", "Wraith",
];
