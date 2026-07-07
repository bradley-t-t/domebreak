// Account surface for the UI: auth session, profile/stats reads (RLS), and
// mutations via the db-account edge function. The client never writes tables.
import {supabase} from "./client.js";

export async function signUp(email, password, username) {
    const {error} = await supabase.auth.signUp({email, password, options: {data: {username}}});
    return {error: error?.message || null};
}

export async function signIn(email, password) {
    const {error} = await supabase.auth.signInWithPassword({email, password});
    return {error: error?.message || null};
}

export async function signOut() {
    await supabase.auth.signOut();
}

export async function getSession() {
    const {data} = await supabase.auth.getSession();
    return data.session ?? null;
}

// Subscribe to session changes; returns an unsubscribe function.
export function onAuth(cb) {
    const {data} = supabase.auth.onAuthStateChange((_evt, session) => cb(session));
    return () => data.subscription.unsubscribe();
}

export async function fetchProfile() {
    const {data} = await supabase.from("profiles").select("*").maybeSingle();
    return data ?? null;
}

// Lifetime aggregates from the player_stats view; zeroed shape when no matches yet.
export async function fetchStats() {
    const {data} = await supabase.from("player_stats").select("*").maybeSingle();
    return data ?? {total_matches: 0, wins: 0, losses: 0, quits: 0, total_playtime_s: 0, last_match_at: null};
}

// The profile picture (a unit-icon slug) lives in auth user_metadata alongside
// the username. Read it from the cached local session (no network call, no
// contention on the auth lock) — setAvatar refreshes that session on write.
export async function fetchAvatar() {
    const {data} = await supabase.auth.getSession();
    return data?.session?.user?.user_metadata?.avatar ?? null;
}

async function invokeAccount(body) {
    const {error} = await supabase.functions.invoke("db-account", {body});
    return {error: error?.message || null};
}

// Stamp last_login after a successful sign-in.
export function touch() {
    return invokeAccount({action: "touch"});
}

// Set (or clear, with "") the profile picture. Writes go server-side; refresh
// the local session afterward so user_metadata.avatar reflects the new value.
export async function setAvatar(name) {
    const {error} = await invokeAccount({action: "set_avatar", avatar: name ?? ""});
    if (error) return {error};
    await supabase.auth.refreshSession();
    return {error: null};
}

// Report a finished/abandoned match. Fire-and-forget with one retry — a lost
// report is acceptable; blocking the player on it is not.
export async function reportMatch(match) {
    const body = {action: "report_match", match};
    const first = await invokeAccount(body);
    if (!first.error) return first;
    return invokeAccount(body);
}
