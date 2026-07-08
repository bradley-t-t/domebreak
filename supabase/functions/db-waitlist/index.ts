// DomeBreak waitlist capture (public, unauthenticated). The landing page posts
// an email here; we validate it and insert one row with the service role. The
// `waitlist` table is not client-readable — only this function (service role)
// touches it. Mirrors the write-server-side discipline of db-account.
//
// Table (apply once):
//   create table if not exists public.waitlist (
//     id uuid primary key default gen_random_uuid(),
//     email text not null,
//     source text,
//     user_agent text,
//     created_at timestamptz not null default now()
//   );
//   create unique index if not exists waitlist_email_key on public.waitlist (lower(email));
//   alter table public.waitlist enable row level security; -- deny all; service role bypasses
import {createClient} from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SOURCE_RE = /^[a-z0-9_-]{1,32}$/;

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {status, headers: {...CORS, "Content-Type": "application/json"}});

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", {headers: CORS});
    if (req.method !== "POST") return json({error: "method not allowed"}, 405);

    const body = await req.json().catch(() => ({}));

    // Honeypot: real users never fill this. Silently accept so bots get no signal.
    if (typeof body.company === "string" && body.company.trim() !== "") return json({ok: true});

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!EMAIL_RE.test(email) || email.length > 254) return json({error: "invalid email"}, 400);

    const source = typeof body.source === "string" && SOURCE_RE.test(body.source) ? body.source : "landing";
    const ua = (req.headers.get("user-agent") ?? "").slice(0, 256) || null;

    const service = createClient(URL, SERVICE);

    // Already registered? Treat as success so the UI can say "you're on the list".
    const {data: existing} = await service.from("waitlist").select("id").eq("email", email).maybeSingle();
    if (existing) return json({ok: true, already: true});

    const {error} = await service.from("waitlist").insert({email, source, user_agent: ua});
    if (error) {
        // Unique-violation race: another request inserted the same email first.
        if ((error as {code?: string}).code === "23505") return json({ok: true, already: true});
        return json({error: error.message}, 500);
    }
    return json({ok: true, already: false});
});
