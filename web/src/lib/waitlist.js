// Waitlist signup — posts to the public `db-waitlist` edge function on the
// DomeBreak Supabase project. The insert happens server-side with the service
// role (client never writes the table directly), mirroring the game's
// db-account pattern. Only the public anon key + URL ship in the bundle.

const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email) {
    return EMAIL_RE.test((email || "").trim());
}

export async function joinWaitlist(email, source = "landing") {
    const clean = (email || "").trim().toLowerCase();
    if (!isValidEmail(clean)) return {ok: false, error: "Enter a valid email address."};
    if (!URL || !ANON) {
        // Backend not wired in this environment — fail loudly rather than
        // pretend a signup succeeded.
        return {ok: false, error: "Signup is not available yet. Check back soon."};
    }
    try {
        const res = await fetch(`${URL}/functions/v1/db-waitlist`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: ANON,
                Authorization: `Bearer ${ANON}`,
            },
            body: JSON.stringify({email: clean, source}),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return {ok: false, error: data.error || "Something went wrong. Try again."};
        return {ok: true, already: !!data.already};
    } catch {
        return {ok: false, error: "Network error. Try again."};
    }
}
