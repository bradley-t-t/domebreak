// Lobby/matchmaking surface: reads + Realtime under RLS, writes through
// gd-lobby. The lobby row is also how a started match hands the client its
// game server (server_url is a comma-separated WS URL list, best-first).
import {supabase} from "./client.js";

async function invoke(body) {
    const {data, error} = await supabase.functions.invoke("gd-lobby", {body});
    return error ? {error: error.message} : (data ?? {ok: true});
}

export const createLobby = (name, maxPlayers) => invoke({action: "create", name, maxPlayers});
export const joinLobby = (lobbyId) => invoke({action: "join", lobbyId});
export const leaveLobby = () => invoke({action: "leave"});
export const findGame = () => invoke({action: "find"});
export const setLobbyIso = (iso) => invoke({action: "set_iso", iso});
export const setReady = (ready) => invoke({action: "ready", ready});
export const setAiSlots = (count) => invoke({action: "set_ai", count});
export const startLobby = () => invoke({action: "start"});

export async function fetchOpenLobbies() {
    const {data} = await supabase.from("lobbies")
        .select("id, name, status, max_players, ai_slots, created_at, lobby_members(user_id)")
        .in("status", ["open"]).order("created_at", {ascending: false}).limit(30);
    return (data ?? []).map((l) => ({...l, humans: l.lobby_members?.length ?? 0}));
}

// Full room state for one lobby: row + members with usernames, sorted by slot.
export async function fetchLobby(lobbyId) {
    const [{data: lobby}, {data: members}] = await Promise.all([
        supabase.from("lobbies").select("*").eq("id", lobbyId).maybeSingle(),
        supabase.from("lobby_members")
            .select("user_id, slot, iso, ready, profiles(username)")
            .eq("lobby_id", lobbyId).order("slot"),
    ]);
    if (!lobby) return null;
    return {
        ...lobby,
        members: (members ?? []).map((m) => ({
            userId: m.user_id, slot: m.slot, iso: m.iso, ready: m.ready,
            username: (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles)?.username ?? "Commander",
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

// Realtime over the lobby browser list. Returns an unsubscribe fn.
export function watchLobbies(cb) {
    const ch = supabase.channel("lobby-browser")
        .on("postgres_changes", {event: "*", schema: "public", table: "lobbies"}, cb)
        .subscribe();
    const beat = setInterval(cb, 7000);
    return () => {
        clearInterval(beat);
        supabase.removeChannel(ch);
    };
}
