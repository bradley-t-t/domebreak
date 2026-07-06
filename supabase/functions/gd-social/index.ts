// Friend-graph writes. Identity always derives from the verified JWT; the
// client only ever names the OTHER party (by username or friendship id).
//   {action: "request", username}  -> pending request (auto-accepts a reverse pending)
//   {action: "accept",  id}        -> addressee accepts
//   {action: "remove",  id}        -> either party cancels/declines/unfriends
import {createClient} from "npm:@supabase/supabase-js@2";

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

    const db = createClient(URL, SERVICE);
    const body = await req.json().catch(() => ({}));

    if (body.action === "request") {
        const uname = typeof body.username === "string" ? body.username.trim() : "";
        if (!uname) return json({error: "username required"}, 400);
        const {data: target} = await db.from("profiles").select("id, username").ilike("username", uname).maybeSingle();
        if (!target) return json({error: "no commander by that name"}, 404);
        if (target.id === user.id) return json({error: "that's you"}, 400);
        const {data: existing} = await db.from("friendships").select("*")
            .or(`and(requester.eq.${user.id},addressee.eq.${target.id}),and(requester.eq.${target.id},addressee.eq.${user.id})`);
        const fwd = existing?.find((f) => f.requester === user.id);
        const rev = existing?.find((f) => f.requester === target.id);
        if (fwd || rev?.status === "accepted") return json({ok: true, already: true});
        if (rev) { // they already asked us — asking back means yes
            const {error} = await db.from("friendships").update({status: "accepted"}).eq("id", rev.id);
            if (error) return json({error: error.message}, 500);
            return json({ok: true, accepted: true});
        }
        const {error} = await db.from("friendships").insert({requester: user.id, addressee: target.id});
        if (error) return json({error: error.message}, 500);
        return json({ok: true});
    }

    if (body.action === "accept") {
        const {error, count} = await db.from("friendships")
            .update({status: "accepted"}, {count: "exact"})
            .eq("id", body.id).eq("addressee", user.id).eq("status", "pending");
        if (error) return json({error: error.message}, 500);
        if (!count) return json({error: "no such pending request"}, 404);
        return json({ok: true});
    }

    if (body.action === "remove") {
        const {error, count} = await db.from("friendships")
            .delete({count: "exact"})
            .eq("id", body.id)
            .or(`requester.eq.${user.id},addressee.eq.${user.id}`);
        if (error) return json({error: error.message}, 500);
        if (!count) return json({error: "not yours to remove"}, 404);
        return json({ok: true});
    }

    return json({error: "unknown action"}, 400);
});
