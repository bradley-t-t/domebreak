// Game-account access. Players sign in with their existing DomeBreak account.
// The client only reads profile/stats (RLS scopes to the signed-in user); the
// single write (last_login) goes through the db-account edge function.
import {createClient} from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(URL, ANON, {
    auth: {persistSession: true, autoRefreshToken: true, storageKey: "domebreak.auth"},
});

export async function signIn(email, password) {
    const {error} = await supabase.auth.signInWithPassword({email, password});
    return {error: error?.message || null};
}

export async function signUp(email, password, username) {
    const {error} = await supabase.auth.signUp({email, password, options: {data: {username}}});
    if (error) return {error: error.message};
    // signUp may not return a session under autoconfirm — sign in to be sure.
    return signIn(email, password);
}

export async function signOut() {
    await supabase.auth.signOut();
}

export async function getSession() {
    const {data} = await supabase.auth.getSession();
    return data.session ?? null;
}

export function onAuth(cb) {
    const {data} = supabase.auth.onAuthStateChange((_evt, session) => cb(session));
    return () => data.subscription.unsubscribe();
}

export async function fetchProfile() {
    const {data: {session}} = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return null;
    const {data} = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (data) return {...data, avatar: user.user_metadata?.avatar ?? null};
    return {
        id: user.id,
        username: user.user_metadata?.username ?? null,
        created_at: user.created_at ?? null,
        avatar: user.user_metadata?.avatar ?? null,
    };
}

export async function fetchStats() {
    const zero = {total_matches: 0, wins: 0, losses: 0, quits: 0, total_playtime_s: 0, last_match_at: null};
    const {data: {session}} = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return zero;
    const {data} = await supabase.from("player_stats").select("*").eq("user_id", uid).maybeSingle();
    return data ?? zero;
}

export function touch() {
    return supabase.functions.invoke("db-account", {body: {action: "touch"}}).catch(() => {});
}

// Admin-only: read the closed-beta applications through the db-beta function.
// Sends the signed-in user's access token so the function can confirm is_admin;
// returns a tagged result so the panel can distinguish "not authorized" (403)
// from a real failure.
export async function listBeta() {
    const {data: {session}} = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return {ok: false, status: 401, error: "Sign in required."};
    try {
        const res = await fetch(`${URL}/functions/v1/db-beta`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: ANON,
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({action: "list"}),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return {ok: false, status: res.status, error: data.error || "Failed to load applications."};
        return {ok: true, applications: data.applications ?? []};
    } catch {
        return {ok: false, status: 0, error: "Network error. Try again."};
    }
}

// Client-side auth validation rules.
export const AUTH_RULES = {username: {min: 3, max: 24}, password: {min: 8}};
