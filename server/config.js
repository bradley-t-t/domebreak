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
// Most live matches this server will host at once; lobbies beyond it stay
// 'starting' and get re-swept until a slot frees.
export const MAX_MATCHES = parseInt(process.env.GD_MAX_MATCHES || "3", 10);
export const TICK_MS = 100;      // simulation step cadence
export const SNAPSHOT_MS = 500;  // full-world broadcast cadence
