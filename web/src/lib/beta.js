// Closed-beta application submit — posts to the public `db-beta` edge function
// (action "apply"). Like the waitlist, the insert happens server-side with the
// service role; the client only carries the public anon key + URL, and this
// module stays free of supabase-js so the landing bundle isn't pulled onto the
// critical path.

const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The three platform choices the form offers; ids match the edge function's
// allow-list and the value stored on each row.
export const BETA_PLATFORMS = [
    {id: "mac", label: "macOS"},
    {id: "win", label: "Windows"},
    {id: "both", label: "Both"},
];

export function isValidEmail(email) {
    return EMAIL_RE.test((email || "").trim());
}

export async function applyBeta({email, platform, reason, company}, source = "landing") {
    const clean = (email || "").trim().toLowerCase();
    if (!isValidEmail(clean)) return {ok: false, error: "Enter a valid email address."};
    if (!BETA_PLATFORMS.some((p) => p.id === platform)) return {ok: false, error: "Choose a platform."};
    if (!URL || !ANON) {
        return {ok: false, error: "Applications aren't available yet. Check back soon."};
    }
    try {
        const res = await fetch(`${URL}/functions/v1/db-beta`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: ANON,
                Authorization: `Bearer ${ANON}`,
            },
            body: JSON.stringify({
                action: "apply",
                email: clean,
                platform,
                reason: (reason || "").trim(),
                company: company || "", // honeypot
                source,
            }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return {ok: false, error: data.error || "Something went wrong. Try again."};
        return {ok: true, already: !!data.already};
    } catch {
        return {ok: false, error: "Network error. Try again."};
    }
}
