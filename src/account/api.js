// Account surface for the UI: auth session, profile/stats reads (RLS), and
// mutations via the db-account edge function. The client never writes tables.
import {supabase} from "./client.js";
import {createEdgeInvoker, currentUserId, readRow} from "../lib/database.js";

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

// Scope the read to the signed-in user's own id. Do NOT rely on RLS alone to
// return a single row — if more than one profile is visible, .maybeSingle()
// resolves to null and the whole account panel goes blank. Falls back to the
// username carried in auth metadata so the badge always has something to show.
export async function fetchProfile() {
    const {data: {session}} = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return null;
    const data = await readRow("profiles", {eq: ["id", user.id]});
    if (data) return data;
    return {id: user.id, username: user.user_metadata?.username ?? null, created_at: user.created_at ?? null};
}

// Lifetime aggregates from the player_stats view; zeroed shape when no matches
// yet. Scoped to the current user for the same reason as fetchProfile.
export async function fetchStats() {
    const zero = {total_matches: 0, wins: 0, losses: 0, quits: 0, total_playtime_s: 0, last_match_at: null};
    const uid = await currentUserId();
    if (!uid) return zero;
    return await readRow("player_stats", {eq: ["user_id", uid], fallback: zero});
}

// The profile picture (a unit-icon slug) lives in auth user_metadata alongside
// the username. Read it from the cached local session (no network call, no
// contention on the auth lock) — setAvatar refreshes that session on write.
export async function fetchAvatar() {
    const {data} = await supabase.auth.getSession();
    return data?.session?.user?.user_metadata?.avatar ?? null;
}

const invokeAccount = createEdgeInvoker("db-account");

// Stamp last_login after a successful sign-in.
export function touch() {
    return invokeAccount({action: "touch"});
}

// Presence heartbeat — stamp last_seen while online, so offline friends still
// show a "last online" time. Fire-and-forget; a missed beat is harmless.
export function heartbeat() {
    return invokeAccount({action: "heartbeat"});
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
const invokeAccountRetry = createEdgeInvoker("db-account", {retries: 1});
export function reportMatch(match) {
    return invokeAccountRetry({action: "report_match", match});
}
