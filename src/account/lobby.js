// Lobby/matchmaking surface: reads + Realtime under RLS, writes through
// db-lobby. The lobby row is also how a started match hands the client its
// game server (server_url is a comma-separated WS URL list, best-first).
//
// Quick-match only: there is no lobby browser, no host, no create/find/set_ai.
// Pressing Play enrolls the caller in `matchmaking_queue`; the authoritative
// server groups/forms/bot-fills/auto-launches the lobby.
import {supabase} from "./client.js";

async function invoke(body) {
    const {data, error} = await supabase.functions.invoke("db-lobby", {body});
    return error ? {error: error.message} : (data ?? {ok: true});
}

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

// The caller's own matchmaking_queue row (RLS scopes this to own row only).
export async function fetchMyQueue() {
    const {data} = await supabase.from("matchmaking_queue").select("*").maybeSingle();
    return data ?? null;
}

// Realtime on the caller's own queue row, plus a heartbeat refetch fallback
// so a missed/late Realtime event can't strand the Searching screen. Mirrors
// watchLobby's pattern below. Returns an unsubscribe fn.
export function watchQueue(cb) {
    let ch = null;
    let beat = null;
    let stopped = false;
    supabase.auth.getUser().then(({data}) => {
        const uid = data?.user?.id;
        if (stopped || !uid) return;
        ch = supabase.channel(`queue-${uid}`)
            .on("postgres_changes", {
                event: "*",
                schema: "public",
                table: "matchmaking_queue",
                filter: `user_id=eq.${uid}`,
            }, cb)
            .subscribe();
        beat = setInterval(cb, 3000);
    });
    return () => {
        stopped = true;
        if (beat) clearInterval(beat);
        if (ch) supabase.removeChannel(ch);
    };
}

// Full room state for one lobby: row + members (human + bot), sorted by slot.
export async function fetchLobby(lobbyId) {
    const [{data: lobby}, {data: members}] = await Promise.all([
        supabase.from("lobbies").select("*").eq("id", lobbyId).maybeSingle(),
        supabase.from("lobby_members")
            .select("user_id, slot, iso, ready, is_bot, display_name, profiles(username)")
            .eq("lobby_id", lobbyId).order("slot"),
    ]);
    if (!lobby) return null;
    return {
        ...lobby,
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
    const ch = supabase.channel(`lobby-${lobbyId}`)
        .on("postgres_changes", {event: "*", schema: "public", table: "lobbies", filter: `id=eq.${lobbyId}`}, cb)
        .on("postgres_changes", {
            event: "*",
            schema: "public",
            table: "lobby_members",
            filter: `lobby_id=eq.${lobbyId}`
        }, cb)
        .subscribe();
    const beat = setInterval(cb, 5000);
    return () => {
        clearInterval(beat);
        supabase.removeChannel(ch);
    };
}
