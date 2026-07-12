// DomeBreak closed-beta applications. Two request shapes:
//
//   POST {action:"apply", email, platform, reason?, source?, company?}  (public)
//     -> validate and insert one row with the service role. `company` is a
//        honeypot; real users never fill it. Re-applying the same email is
//        reported back as {already:true} rather than erroring.
//
//   POST {action:"list"}  (admin only)
//     -> requires a signed-in account whose profiles.is_admin is true; returns
//        every application, newest first.
//
// The `beta_applications` table is deny-all under RLS — only this function
// (service role) touches it. See supabase/migrations/*_beta_applications.sql.
// Both shapes still send a valid JWT in Authorization (the anon key for the
// public apply, the user's access token for the admin list), so the platform's
// default JWT verification is satisfied without --no-verify-jwt.
import {createClient} from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SOURCE_RE = /^[a-z0-9_-]{1,32}$/;
const PLATFORMS = new Set(["mac", "win", "both"]);

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
    const action = typeof body.action === "string" ? body.action : "apply";
    const service = createClient(URL, SERVICE);

    if (action === "apply") {
        // Honeypot: silently accept so bots get no signal.
        if (typeof body.company === "string" && body.company.trim() !== "") return json({ok: true});

        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        if (!EMAIL_RE.test(email) || email.length > 254) return json({error: "invalid email"}, 400);

        const platform = typeof body.platform === "string" && PLATFORMS.has(body.platform) ? body.platform : "";
        if (!platform) return json({error: "choose a platform"}, 400);

        const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : "";
        const source = typeof body.source === "string" && SOURCE_RE.test(body.source) ? body.source : "landing";
        const ua = (req.headers.get("user-agent") ?? "").slice(0, 256) || null;

        // Already applied? Treat as success so the UI can say "you're in the queue".
        const {data: existing} = await service.from("beta_applications").select("id").eq("email", email).maybeSingle();
        if (existing) return json({ok: true, already: true});

        const {error} = await service.from("beta_applications")
            .insert({email, platform, reason: reason || null, source, user_agent: ua});
        if (error) {
            // Unique-violation race: another request inserted the same email first.
            if ((error as {code?: string}).code === "23505") return json({ok: true, already: true});
            return json({error: error.message}, 500);
        }
        return json({ok: true, already: false});
    }

    if (action === "list") {
        const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (!jwt) return json({error: "unauthorized"}, 401);

        // Resolve the caller from their token, then confirm they are an admin.
        const asUser = createClient(URL, ANON, {global: {headers: {Authorization: `Bearer ${jwt}`}}});
        const {data: {user} = {user: null}, error: authErr} = await asUser.auth.getUser();
        if (authErr || !user) return json({error: "unauthorized"}, 401);

        const {data: prof} = await service.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
        if (!prof?.is_admin) return json({error: "forbidden"}, 403);

        const {data, error} = await service.from("beta_applications")
            .select("id,email,platform,reason,source,created_at")
            .order("created_at", {ascending: false})
            .limit(1000);
        if (error) return json({error: error.message}, 500);
        return json({ok: true, applications: data ?? []});
    }

    return json({error: "unknown action"}, 400);
});
