// Lobby/matchmaking surface: reads + Realtime under RLS, writes through
// db-lobby. The lobby row is also how a started match hands the client its
// game server (server_url is a comma-separated WS URL list, best-first).
//
// Quick-match only: there is no lobby browser, no host, no create/find/set_ai.
// Pressing Play enrolls the caller in `matchmaking_queue`; the authoritative
// server groups/forms/bot-fills/auto-launches the lobby.
import {supabase} from "./client.js";
import {createEdgeInvoker, currentUserId, readRow, watchRows} from "../lib/database.js";

const invoke = createEdgeInvoker("db-lobby");

// Enroll the caller as a 'waiting' matchmaking_queue row. Idempotent server-side.
export const quickMatch = (iso) => invoke({action: "quick_match", ...(iso ? {iso} : {})});
// Delete the caller's 'waiting' row. Safe no-op if already matched / not queued.
export const cancelMatch = () => invoke({action: "cancel"});
// Liveness ping while searching — refreshes the caller's 'waiting' row so the
// server doesn't sweep it as an offline ghost. FIFO place (enqueued_at) is kept.
export const heartbeatQueue = () => invoke({action: "heartbeat_queue"});

export const leaveLobby = () => invoke({action: "leave"});
export const setLobbyIso = (iso) => invoke({action: "set_iso", iso});
export const setReady = (ready) => invoke({action: "ready", ready});
// Shared match rules for this lobby. Any seated member may propose a change;
// the last write wins so the panel behaves like a live shared config.
export const setLobbyRules = (rules) => invoke({action: "set_rules", rules});

// The caller's own matchmaking_queue row (RLS scopes this to own row only).
export function fetchMyQueue() {
    return readRow("matchmaking_queue");
}

// Realtime on the caller's own queue row, plus a heartbeat refetch fallback
// so a missed/late Realtime event can't strand the Searching screen. Returns
// an unsubscribe fn.
export function watchQueue(cb) {
    let stopped = false;
    let unwatch = null;
    currentUserId().then((uid) => {
        if (stopped || !uid) return;
        unwatch = watchRows({
            channel: `queue-${uid}`,
            tables: [{table: "matchmaking_queue", filter: `user_id=eq.${uid}`}],
            pollMs: 3000,
            cb,
        });
    });
    return () => {
        stopped = true;
        if (unwatch) unwatch();
    };
}

// Full room state for one lobby: row + members (human + bot), sorted by slot.
// The row's `rules` JSONB (may be null on older schemas) is the shared match
// config all members read/write via set_rules.
export async function fetchLobby(lobbyId) {
    const [lobby, {data: members}] = await Promise.all([
        readRow("lobbies", {eq: ["id", lobbyId]}),
        supabase.from("lobby_members")
            .select("user_id, slot, iso, ready, is_bot, display_name, profiles(username)")
            .eq("lobby_id", lobbyId).order("slot"),
    ]);
    if (!lobby) return null;
    return {
        ...lobby,
        rules: lobby.rules ?? null,
        members: (members ?? []).map((m) => ({
            userId: m.user_id, slot: m.slot, iso: m.iso, ready: m.ready, isBot: m.is_bot,
            username: (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles)?.username
                ?? m.display_name ?? "Commander",
        })),
    };
}

// Realtime: cb fires on any change to the lobby row or its members (and on a
// heartbeat refetch every 5s as a fallback). Returns an unsubscribe fn.
export function watchLobby(lobbyId, cb) {
    return watchRows({
        channel: `lobby-${lobbyId}`,
        tables: [
            {table: "lobbies", filter: `id=eq.${lobbyId}`},
            {table: "lobby_members", filter: `lobby_id=eq.${lobbyId}`},
        ],
        pollMs: 5000,
        cb,
    });
}
