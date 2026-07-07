// Party surface: all writes go through the db-party edge function; reads of my
// own party are watched live under RLS. A party is a social group I lead and
// friends join, separate from a match lobby.
import {supabase} from "./client.js";

async function invoke(body) {
    const {data, error} = await supabase.functions.invoke("db-party", {body});
    return error ? {error: error.message} : (data ?? {ok: true});
}

export const createParty = (opts = {}) => invoke({action: "create", ...opts});
export const getParty = (party_id) => invoke({action: "get", party_id});
export const joinParty = (party_id) => invoke({action: "join", party_id});
export const leaveParty = () => invoke({action: "leave"});
export const inviteToParty = (to_user) => invoke({action: "invite", to_user});
export const setPartyIso = (iso) => invoke({action: "set_iso", iso});
export const setPartyReady = (ready) => invoke({action: "ready", ready});
export const setPartyJoinMode = (join_mode) => invoke({action: "set_join_mode", join_mode});
export const kickFromParty = (user_id) => invoke({action: "kick", user_id});
export const launchPartyPrivate = () => invoke({action: "launch_private"});
export const queuePartyPublic = () => invoke({action: "queue_public"});

// My current party id (or null) — the seat row is readable under RLS.
export async function fetchMyPartyId() {
    const {data: {user} = {user: null}} = await supabase.auth.getUser();
    if (!user) return null;
    const {data} = await supabase.from("party_members").select("party_id").eq("user_id", user.id).maybeSingle();
    return data?.party_id ?? null;
}

// Live-watch a party row + its members; cb() fires on any change (caller
// re-fetches via getParty). Poll fallback covers a dropped subscription.
export function watchParty(partyId, cb) {
    const ch = supabase.channel(`db-party-${partyId}`)
        .on("postgres_changes", {event: "*", schema: "public", table: "parties", filter: `id=eq.${partyId}`}, cb)
        .on("postgres_changes", {event: "*", schema: "public", table: "party_members", filter: `party_id=eq.${partyId}`}, cb)
        .subscribe();
    const poll = setInterval(cb, 5000);
    return () => {
        clearInterval(poll);
        supabase.removeChannel(ch);
    };
}
