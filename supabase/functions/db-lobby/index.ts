// Quick-match + lobby writes (ADR-0004). The client never inserts/updates
// matchmaking_queue, lobbies, or lobby_members directly; identity always
// derives from the verified JWT. Match formation is entirely server-owned:
// the game server's matchmaker (server/matchmaker.js) groups waiting queue
// rows, forms lobbies, backfills bot lobby_members, and auto-launches by
// flipping status to 'starting', which the game server's existing claim path
// (ADR-0003) then picks up. This function only enrolls/cancels queue entries
// and lets a seated member (human or, moot for bots since they never call
// this function) adjust their own seat before launch.
//
//   {action:"quick_match", iso?}   enroll as a 'waiting' queue row (idempotent;
//                                  a no-op success if already 'waiting' — does
//                                  not reset enqueued_at, preserving FIFO order)
//   {action:"cancel"}              delete the caller's 'waiting' row only (no-op
//                                  if none, or if already 'matched' — use "leave"
//                                  on the formed lobby in that case)
//   {action:"heartbeat_queue"}     refresh the caller's 'waiting' row last_seen so
//                                  it isn't swept as an offline ghost (FIFO kept)
//   {action:"set_iso", iso}        caller's own lobby_members.iso (unchanged)
//   {action:"ready", ready}        caller's own lobby_members.ready (unchanged)
//   {action:"leave"}               remove caller from any open/starting lobby
//                                  (unchanged)
//
// REMOVED from the player path: "create", "join", "find" (lobby formation is
// now server-owned by the matchmaker, not a host/browser flow), "set_ai"
// (bots are matchmaker-inserted lobby_members, not a host-configured count),
// and "start" as a client action (the server's auto-launch writes
// status='starting' directly; there is no host to click Start).
import {createClient} from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// A 'waiting' row whose owner hasn't heartbeated (last_seen) within this window is
// abandoned — the player quit without cancelling. The sweep deletes them so the
// matchmaker never seats a ghost. Kept a touch longer than the matchmaker's own
// in-memory QUEUE_STALE_MS (20s) gate so the deletion is table hygiene, not the
// primary liveness check.
const QUEUE_EXPIRE_MS = 30_000;

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
    // Purge abandoned matchmaking rows: a 'waiting' row that stopped heartbeating
    // is an offline player who never cancelled. Removing it keeps the queue honest
    // so the matchmaker only ever groups players who are actually here.
    const qExpire = new Date(Date.now() - QUEUE_EXPIRE_MS).toISOString();
    await db.from("matchmaking_queue").delete().eq("status", "waiting").lt("last_seen", qExpire);
}

// Pull the caller out of any open/starting lobby they're seated in (quick-
// match lobbies are server-formed and host-less — see ADR-0004 — but this
// also tolerates a legacy hosted row if one still exists).
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
        } else if (lob?.host && lob.host === userId) {
            // Only legacy hosted lobbies have a host to reassign; quick-match
            // lobbies never do (host is null), so this branch is inert for them.
            await db.from("lobbies").update({host: rest[0].user_id}).eq("id", m.lobby_id);
        }
        await touch(db, m.lobby_id);
    }
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
    // member-scoped actions below (set_iso, ready, leave).
    const myLobby = async () => {
        const {data} = await db.from("lobby_members")
            .select("lobby_id, slot, ready, iso, lobbies!inner(id, status)")
            .eq("user_id", user.id).in("lobbies.status", ["open", "starting"]).maybeSingle();
        if (!data) return null;
        const lob = Array.isArray(data.lobbies) ? data.lobbies[0] : data.lobbies;
        return {member: data, lobby: lob};
    };

    if (body.action === "quick_match") {
        // Idempotent enroll: leave any stale lobby seat first so the caller
        // is never double-booked, then upsert a 'waiting' row. If a 'waiting'
        // row already exists this is a no-op success — enqueued_at is left
        // untouched so the caller keeps their FIFO place in the matchmaker's
        // grouping window (ADR-0004).
        await leaveAll(db, user.id);
        const iso = typeof body.iso === "string" && /^[A-Za-z]{2,3}$/.test(body.iso.trim())
            ? body.iso.trim().toUpperCase().slice(0, 3)
            : null;
        const {data: existing} = await db.from("matchmaking_queue")
            .select("user_id, status").eq("user_id", user.id).maybeSingle();
        // Already waiting: keep FIFO place (don't touch enqueued_at) but refresh
        // liveness so re-pressing Play counts as "still here".
        if (existing?.status === "waiting") {
            await db.from("matchmaking_queue").update({last_seen: new Date().toISOString()})
                .eq("user_id", user.id).eq("status", "waiting");
            return json({ok: true});
        }
        const now = new Date().toISOString();
        const {error} = await db.from("matchmaking_queue")
            .upsert({user_id: user.id, iso, status: "waiting", enqueued_at: now, last_seen: now, lobby_id: null});
        if (error) return json({error: error.message}, 500);
        return json({ok: true});
    }

    if (body.action === "heartbeat_queue") {
        // Liveness ping from the Searching screen: prove the caller is still here
        // so their 'waiting' row isn't swept as an offline ghost. enqueued_at is
        // untouched, so FIFO order is preserved.
        await db.from("matchmaking_queue").update({last_seen: new Date().toISOString()})
            .eq("user_id", user.id).eq("status", "waiting");
        return json({ok: true});
    }

    if (body.action === "cancel") {
        // Safe no-op if the caller has no 'waiting' row (never queued, or
        // already 'matched' — a matched caller must use "leave" instead).
        await db.from("matchmaking_queue").delete().eq("user_id", user.id).eq("status", "waiting");
        return json({ok: true});
    }

    if (body.action === "leave") {
        await leaveAll(db, user.id);
        return json({ok: true});
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

    return json({error: "unknown action"}, 400);
});
