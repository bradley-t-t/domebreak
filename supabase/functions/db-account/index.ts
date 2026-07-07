// DomeBreak account writes. The client NEVER touches profiles/matches
// directly — it calls here with a user JWT; we derive the user id from the
// verified token and write with the service role. Actions:
//   {action: "touch"}                      -> stamp last_login
//   {action: "report_match", match: {...}} -> insert one match row
//   {action: "set_avatar", avatar: "tank"} -> store the profile picture (a unit
//     icon slug) in auth user_metadata; "" clears it back to the initial glyph
import {createClient} from "npm:@supabase/supabase-js@2";

// A cosmetic profile picture is a short unit-icon slug. The picker only ever
// offers real icons; this bound just keeps arbitrary strings out of metadata.
const AVATAR_RE = /^[a-z0-9-]{1,32}$/;

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {status, headers: {...CORS, "Content-Type": "application/json"}});

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", {headers: CORS});

    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const asUser = createClient(URL, ANON, {global: {headers: {Authorization: `Bearer ${jwt}`}}});
    const {data: {user} = {user: null}, error: authErr} = await asUser.auth.getUser();
    if (authErr || !user) return json({error: "unauthorized"}, 401);

    const service = createClient(URL, SERVICE);
    const body = await req.json().catch(() => ({}));

    if (body.action === "touch") {
        const {error} = await service.from("profiles")
            .update({last_login: new Date().toISOString()}).eq("id", user.id);
        if (error) return json({error: error.message}, 500);
        return json({ok: true});
    }

    // Presence heartbeat: stamp last_seen so a friend who has gone offline still
    // shows a "last online" time. Called periodically by the client while online.
    if (body.action === "heartbeat") {
        const {error} = await service.from("profiles")
            .update({last_seen: new Date().toISOString()}).eq("id", user.id);
        if (error) return json({error: error.message}, 500);
        return json({ok: true});
    }

    if (body.action === "report_match") {
        const m = body.match ?? {};
        if (!["win", "loss", "quit"].includes(m.result)) return json({error: "bad result"}, 400);
        const {error} = await service.from("matches").insert({
            user_id: user.id, // from the verified JWT, never the payload
            started_at: typeof m.startedAt === "string" ? m.startedAt : null,
            result: m.result,
            nation_iso: typeof m.nationIso === "string" ? m.nationIso.slice(0, 3).toUpperCase() : null,
            opponents: Number.isFinite(m.opponents) ? m.opponents : null,
            duration_s: Number.isFinite(m.durationS) ? Math.max(0, m.durationS) : null,
            stats: m.stats && typeof m.stats === "object" && !Array.isArray(m.stats) ? m.stats : {},
        });
        if (error) return json({error: error.message}, 500);
        return json({ok: true});
    }

    if (body.action === "set_avatar") {
        const raw = typeof body.avatar === "string" ? body.avatar : "";
        const avatar = raw === "" ? null : raw;
        if (avatar !== null && !AVATAR_RE.test(avatar)) return json({error: "bad avatar"}, 400);
        // Merge into existing metadata so username (and anything else) survives.
        const {error} = await service.auth.admin.updateUserById(user.id, {
            user_metadata: {...(user.user_metadata ?? {}), avatar},
        });
        if (error) return json({error: error.message}, 500);
        return json({ok: true, avatar});
    }

    return json({error: "unknown action"}, 400);
});
