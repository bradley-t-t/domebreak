// Lobby/matchmaking writes. The client reads lobbies over RLS + Realtime and
// calls here for every mutation; identity always derives from the verified
// JWT. "start" only flips status to 'starting' — the game server (subscribed
// with the service role) claims it, spins the match, and advertises its
// WebSocket URL back on the row.
//   {action:"create", name?, maxPlayers?}   {action:"join", lobbyId}
//   {action:"leave"}                        {action:"set_iso", iso}
//   {action:"ready", ready}                 {action:"set_ai", count}   (host)
//   {action:"start"}                        (host)
//   {action:"find"}                         quick match: join oldest open or create
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

const touch = (db: ReturnType<typeof createClient>, lobbyId: string) =>
    db.from("lobbies").update({updated_at: new Date().toISOString()}).eq("id", lobbyId);

// Housekeeping on every call: un-stick lobbies the server never claimed and
// close abandoned rooms so the browser stays clean.
async function sweep(db: ReturnType<typeof createClient>) {
    const cutoff = new Date(Date.now() - 45_000).toISOString();
    await db.from("lobbies").update({status: "open"}).eq("status", "starting").lt("updated_at", cutoff);
    const stale = new Date(Date.now() - 2 * 3600_000).toISOString();
    await db.from("lobbies").update({status: "closed"}).eq("status", "open").lt("updated_at", stale);
}

// Pull the caller out of any open/starting lobby; transfer or close hosted rooms.
async function leaveAll(db: ReturnType<typeof createClient>, userId: string) {
    const {data: mine} = await db.from("lobby_members").select("lobby_id, lobbies!inner(id, host, status)")
        .eq("user_id", userId).in("lobbies.status", ["open", "starting"]);
    for (const m of mine ?? []) {
        await db.from("lobby_members").delete().eq("lobby_id", m.lobby_id).eq("user_id", userId);
        const lob = Array.isArray(m.lobbies) ? m.lobbies[0] : m.lobbies;
        const {data: rest} = await db.from("lobby_members").select("user_id, joined_at")
            .eq("lobby_id", m.lobby_id).order("joined_at");
        if (!rest?.length) {
            await db.from("lobbies").update({status: "closed"}).eq("id", m.lobby_id);
        } else if (lob.host === userId) {
            await db.from("lobbies").update({host: rest[0].user_id}).eq("id", m.lobby_id);
        }
        await touch(db, m.lobby_id);
    }
}

async function joinLobby(db: ReturnType<typeof createClient>, userId: string, lobbyId: string) {
    const {data: lob} = await db.from("lobbies").select("*").eq("id", lobbyId).maybeSingle();
    if (!lob || lob.status !== "open") return {error: "lobby is not open", status: 409};
    const {data: members} = await db.from("lobby_members").select("slot").eq("lobby_id", lobbyId);
    const taken = new Set((members ?? []).map((m) => m.slot));
    if (taken.size + lob.ai_slots >= lob.max_players) return {error: "lobby is full", status: 409};
    // lowest free slot; the unique constraint referees join races
    for (let slot = 0; slot < lob.max_players; slot++) {
        if (taken.has(slot)) continue;
        const {error} = await db.from("lobby_members").insert({lobby_id: lobbyId, user_id: userId, slot});
        if (!error) {
            await touch(db, lobbyId);
            return {lobbyId};
        }
        if (!/duplicate|unique/i.test(error.message)) return {error: error.message, status: 500};
        taken.add(slot); // lost the race for this seat — try the next
    }
    return {error: "lobby is full", status: 409};
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", {headers: CORS});

    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const asUser = createClient(URL, ANON, {global: {headers: {Authorization: `Bearer ${jwt}`}}});
    const {data: {user} = {user: null}, error: authErr} = await asUser.auth.getUser();
    if (authErr || !user) return json({error: "unauthorized"}, 401);

    const db = createClient(URL, SERVICE);
    const body = await req.json().catch(() => ({}));
    await sweep(db);

    // Resolve the caller's current open/starting lobby + row once for the
    // member-scoped actions below.
    const myLobby = async () => {
        const {data} = await db.from("lobby_members")
            .select("lobby_id, slot, ready, iso, lobbies!inner(id, host, status, max_players, ai_slots)")
            .eq("user_id", user.id).in("lobbies.status", ["open", "starting"]).maybeSingle();
        if (!data) return null;
        const lob = Array.isArray(data.lobbies) ? data.lobbies[0] : data.lobbies;
        return {member: data, lobby: lob};
    };

    if (body.action === "create") {
        await leaveAll(db, user.id);
        const {data: prof} = await db.from("profiles").select("username").eq("id", user.id).single();
        const name = (typeof body.name === "string" && body.name.trim().slice(0, 40)) || `${prof?.username ?? "Commander"}'s War`;
        const maxPlayers = Number.isInteger(body.maxPlayers) && body.maxPlayers >= 2 && body.maxPlayers <= 16 ? body.maxPlayers : 8;
        const {data: lob, error} = await db.from("lobbies")
            .insert({host: user.id, name, max_players: maxPlayers}).select().single();
        if (error) return json({error: error.message}, 500);
        await db.from("lobby_members").insert({lobby_id: lob.id, user_id: user.id, slot: 0});
        return json({ok: true, lobbyId: lob.id});
    }

    if (body.action === "join") {
        if (typeof body.lobbyId !== "string") return json({error: "lobbyId required"}, 400);
        await leaveAll(db, user.id);
        const r = await joinLobby(db, user.id, body.lobbyId);
        return r.error ? json({error: r.error}, r.status) : json({ok: true, lobbyId: r.lobbyId});
    }

    if (body.action === "leave") {
        await leaveAll(db, user.id);
        return json({ok: true});
    }

    if (body.action === "find") {
        await leaveAll(db, user.id);
        const {data: open} = await db.from("lobbies").select("id, max_players, ai_slots")
            .eq("status", "open").order("created_at").limit(20);
        for (const lob of open ?? []) {
            const r = await joinLobby(db, user.id, lob.id);
            if (!r.error) return json({ok: true, lobbyId: lob.id, joined: true});
        }
        const {data: prof} = await db.from("profiles").select("username").eq("id", user.id).single();
        const {data: lob, error} = await db.from("lobbies")
            .insert({host: user.id, name: `${prof?.username ?? "Commander"}'s War`}).select().single();
        if (error) return json({error: error.message}, 500);
        await db.from("lobby_members").insert({lobby_id: lob.id, user_id: user.id, slot: 0});
        return json({ok: true, lobbyId: lob.id, created: true});
    }

    const ctx = await myLobby();
    if (!ctx) return json({error: "not in a lobby"}, 409);
    const {lobby} = ctx;

    if (body.action === "set_iso") {
        const iso = typeof body.iso === "string" ? body.iso.trim().toUpperCase().slice(0, 3) : "";
        if (!/^[A-Z]{2,3}$/.test(iso)) return json({error: "bad iso"}, 400);
        await db.from("lobby_members").update({iso}).eq("lobby_id", lobby.id).eq("user_id", user.id);
        await touch(db, lobby.id);
        return json({ok: true});
    }

    if (body.action === "ready") {
        await db.from("lobby_members").update({ready: !!body.ready}).eq("lobby_id", lobby.id).eq("user_id", user.id);
        await touch(db, lobby.id);
        return json({ok: true});
    }

    if (body.action === "set_ai") {
        if (lobby.host !== user.id) return json({error: "host only"}, 403);
        const {count} = await db.from("lobby_members").select("*", {
            count: "exact",
            head: true
        }).eq("lobby_id", lobby.id);
        const maxAi = lobby.max_players - (count ?? 1);
        const n = Number.isInteger(body.count) ? Math.max(0, Math.min(body.count, maxAi)) : 0;
        await db.from("lobbies").update({ai_slots: n, updated_at: new Date().toISOString()}).eq("id", lobby.id);
        return json({ok: true, aiSlots: n});
    }

    if (body.action === "start") {
        if (lobby.host !== user.id) return json({error: "host only"}, 403);
        if (lobby.status !== "open") return json({error: "already starting"}, 409);
        const {data: members} = await db.from("lobby_members").select("user_id, ready").eq("lobby_id", lobby.id);
        const humans = members ?? [];
        if (humans.length + lobby.ai_slots < 2) return json({error: "need at least 2 players (add AI or wait for a friend)"}, 409);
        const notReady = humans.filter((m) => m.user_id !== user.id && !m.ready);
        if (notReady.length) return json({error: "everyone must ready up first"}, 409);
        const {error} = await db.from("lobbies")
            .update({status: "starting", updated_at: new Date().toISOString()}).eq("id", lobby.id).eq("status", "open");
        if (error) return json({error: error.message}, 500);
        return json({ok: true});
    }

    return json({error: "unknown action"}, 400);
});
