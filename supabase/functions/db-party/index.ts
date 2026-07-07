// Party writes. A party is a persistent social group a player leads and friends
// join, distinct from a match lobby. Identity always derives from the verified
// JWT; every write runs service-role here so a client can never forge membership.
//
//   {action:"create", join_mode?, iso?}   make a party (I lead it), seat me
//   {action:"get", party_id}              full party state (members + usernames)
//   {action:"set_join_mode", join_mode}   leader: open | invite | both
//   {action:"set_iso", iso}               my seat's nation
//   {action:"ready", ready}               my seat's ready flag
//   {action:"invite", to_user}            member: invite a friend (for invite/both)
//   {action:"join", party_id}             join if online + room + allowed by mode
//   {action:"leave"}                      leave; leader hands off or the party closes
//   {action:"kick", user_id}              leader: remove a member
//   {action:"launch_private", party_id?}  leader: start a private match (party + AI)
//   {action:"queue_public", party_id?}    leader: queue the whole party together
import {createClient} from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_SEATS = 6;

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {status, headers: {...CORS, "Content-Type": "application/json"}});

type DB = ReturnType<typeof createClient>;

// My current party membership row, if any.
async function myParty(db: DB, uid: string) {
    const {data} = await db.from("party_members").select("party_id").eq("user_id", uid).maybeSingle();
    return data?.party_id ?? null;
}

async function areFriends(db: DB, a: string, b: string) {
    const {data} = await db.from("friendships").select("id")
        .eq("status", "accepted")
        .or(`and(requester.eq.${a},addressee.eq.${b}),and(requester.eq.${b},addressee.eq.${a})`)
        .maybeSingle();
    return !!data;
}

// Full state for a party: settings + seated members with usernames.
async function partyState(db: DB, partyId: string) {
    const {data: party} = await db.from("parties").select("*").eq("id", partyId).maybeSingle();
    if (!party) return null;
    const {data: members} = await db.from("party_members")
        .select("user_id, iso, ready, joined_at, profiles(username)")
        .eq("party_id", partyId).order("joined_at");
    const roster = (members ?? []).map((m: Record<string, unknown>) => ({
        user_id: m.user_id,
        username: (m.profiles as {username?: string} | null)?.username ?? null,
        iso: m.iso ?? null,
        ready: !!m.ready,
        is_leader: m.user_id === party.leader,
    }));
    return {party, members: roster};
}

// Remove a user from their party; if they lead it, hand off to the earliest
// remaining member, or close the party when it empties.
async function leaveParty(db: DB, partyId: string, uid: string) {
    await db.from("party_members").delete().eq("party_id", partyId).eq("user_id", uid);
    await db.from("party_invites").delete().eq("party_id", partyId).eq("to_user", uid);
    const {data: rest} = await db.from("party_members")
        .select("user_id").eq("party_id", partyId).order("joined_at");
    if (!rest || rest.length === 0) {
        await db.from("parties").delete().eq("id", partyId); // cascades members/invites
        return;
    }
    const {data: party} = await db.from("parties").select("leader").eq("id", partyId).maybeSingle();
    if (party && party.leader === uid) {
        await db.from("parties").update({leader: rest[0].user_id, updated_at: new Date().toISOString()})
            .eq("id", partyId);
    }
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", {headers: CORS});

    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const asUser = createClient(URL, ANON, {global: {headers: {Authorization: `Bearer ${jwt}`}}});
    const {data: {user} = {user: null}, error: authErr} = await asUser.auth.getUser();
    if (authErr || !user) return json({error: "unauthorized"}, 401);
    const uid = user.id;

    const db = createClient(URL, SERVICE);
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // Housekeeping: drop parties abandoned for over 3h so presence stays clean.
    await db.from("parties").delete().lt("updated_at", new Date(Date.now() - 3 * 3600_000).toISOString());

    const leaderOf = async (partyId: string) => {
        const {data} = await db.from("parties").select("leader, status, max_seats, join_mode").eq("id", partyId).maybeSingle();
        return data;
    };

    if (action === "create") {
        const existing = await myParty(db, uid);
        if (existing) await leaveParty(db, existing, uid);
        const join_mode = ["open", "invite", "both"].includes(body.join_mode) ? body.join_mode : "both";
        const {data: party, error} = await db.from("parties")
            .insert({leader: uid, join_mode, max_seats: MAX_SEATS}).select().single();
        if (error || !party) return json({error: error?.message || "create failed"}, 500);
        await db.from("party_members").insert({party_id: party.id, user_id: uid, iso: body.iso ?? null});
        return json(await partyState(db, party.id));
    }

    if (action === "get") {
        const pid = body.party_id;
        if (!pid) return json({error: "party_id required"}, 400);
        const state = await partyState(db, pid);
        if (!state) return json({party: null, members: []});
        return json(state);
    }

    if (action === "set_join_mode") {
        const pid = await myParty(db, uid);
        const party = pid && await leaderOf(pid);
        if (!pid || !party || party.leader !== uid) return json({error: "not the party leader"}, 403);
        if (!["open", "invite", "both"].includes(body.join_mode)) return json({error: "bad mode"}, 400);
        await db.from("parties").update({join_mode: body.join_mode, updated_at: new Date().toISOString()}).eq("id", pid);
        return json(await partyState(db, pid));
    }

    if (action === "set_iso") {
        const pid = await myParty(db, uid);
        if (!pid) return json({error: "not in a party"}, 400);
        await db.from("party_members").update({iso: body.iso ?? null}).eq("party_id", pid).eq("user_id", uid);
        return json(await partyState(db, pid));
    }

    if (action === "ready") {
        const pid = await myParty(db, uid);
        if (!pid) return json({error: "not in a party"}, 400);
        await db.from("party_members").update({ready: !!body.ready}).eq("party_id", pid).eq("user_id", uid);
        return json(await partyState(db, pid));
    }

    if (action === "invite") {
        const pid = await myParty(db, uid);
        if (!pid) return json({error: "not in a party"}, 400);
        const target = body.to_user;
        if (!target || target === uid) return json({error: "bad target"}, 400);
        if (!(await areFriends(db, uid, target))) return json({error: "not friends"}, 403);
        await db.from("party_invites").upsert({party_id: pid, from_user: uid, to_user: target}, {onConflict: "party_id,to_user"});
        return json({ok: true});
    }

    if (action === "join") {
        const pid = body.party_id;
        if (!pid) return json({error: "party_id required"}, 400);
        const party = await leaderOf(pid);
        if (!party || party.status !== "open") return json({error: "party unavailable"}, 400);
        const {count} = await db.from("party_members").select("*", {count: "exact", head: true}).eq("party_id", pid);
        if ((count ?? 0) >= (party.max_seats ?? MAX_SEATS)) return json({error: "party full"}, 400);
        // Must know the party: an invite, or a friendship with the leader when the
        // party allows open joins. join_mode: open = friends may click-join;
        // invite = invite required; both = either.
        const {data: invite} = await db.from("party_invites").select("party_id")
            .eq("party_id", pid).eq("to_user", uid).maybeSingle();
        const mode = party.join_mode;
        const openOk = (mode === "open" || mode === "both") && await areFriends(db, uid, party.leader);
        const inviteOk = (mode === "invite" || mode === "both") && !!invite;
        if (!openOk && !inviteOk) return json({error: "cannot join this party"}, 403);
        const existing = await myParty(db, uid);
        if (existing && existing !== pid) await leaveParty(db, existing, uid);
        await db.from("party_members").upsert({party_id: pid, user_id: uid}, {onConflict: "party_id,user_id"});
        await db.from("party_invites").delete().eq("party_id", pid).eq("to_user", uid);
        return json(await partyState(db, pid));
    }

    if (action === "leave") {
        const pid = await myParty(db, uid);
        if (pid) await leaveParty(db, pid, uid);
        return json({ok: true});
    }

    if (action === "kick") {
        const pid = await myParty(db, uid);
        const party = pid && await leaderOf(pid);
        if (!pid || !party || party.leader !== uid) return json({error: "not the party leader"}, 403);
        if (body.user_id && body.user_id !== uid) await leaveParty(db, pid, body.user_id);
        return json(await partyState(db, pid));
    }

    if (action === "launch_private" || action === "queue_public") {
        const pid = await myParty(db, uid);
        const party = pid && await leaderOf(pid);
        if (!pid || !party || party.leader !== uid) return json({error: "not the party leader"}, 403);
        const {data: members} = await db.from("party_members")
            .select("user_id, iso, profiles(username)").eq("party_id", pid).order("joined_at");
        const seated = members ?? [];
        if (seated.length === 0) return json({error: "empty party"}, 400);

        if (action === "launch_private") {
            // Mirror the matchmaker's formLobby: open lobby -> seat members ->
            // flip to 'starting'. The game server claims it and AI-fills the rest.
            const {data: lobby, error: lErr} = await db.from("lobbies")
                .insert({host: uid, name: "Party", status: "open", max_players: seated.length}).select().single();
            if (lErr || !lobby) return json({error: lErr?.message || "lobby failed"}, 500);
            const memberRows = seated.map((m: Record<string, unknown>, i: number) => ({
                lobby_id: lobby.id, user_id: m.user_id, slot: i, is_bot: false,
                display_name: (m.profiles as {username?: string} | null)?.username ?? null,
                iso: m.iso ?? null, ready: true,
            }));
            const {error: mErr} = await db.from("lobby_members").insert(memberRows);
            if (mErr) {
                await db.from("lobbies").update({status: "closed"}).eq("id", lobby.id);
                return json({error: mErr.message}, 500);
            }
            await db.from("lobbies").update({status: "starting", updated_at: new Date().toISOString()}).eq("id", lobby.id);
            // Stamp the lobby on the party so every member's client (watching the
            // party) picks it up and connects, not just the leader.
            await db.from("parties").update({status: "launching", lobby_id: lobby.id, updated_at: new Date().toISOString()}).eq("id", pid);
            return json({ok: true, lobby_id: lobby.id});
        }

        // queue_public: enroll every member as a waiting queue row tagged with the
        // party id so the matchmaker seats them into the same match.
        const rows = seated.map((m: Record<string, unknown>) => ({
            user_id: m.user_id, iso: m.iso ?? null, status: "waiting",
            enqueued_at: new Date().toISOString(), party_id: pid, lobby_id: null,
        }));
        const {error: qErr} = await db.from("matchmaking_queue").upsert(rows, {onConflict: "user_id"});
        if (qErr) return json({error: qErr.message}, 500);
        await db.from("parties").update({status: "launching", updated_at: new Date().toISOString()}).eq("id", pid);
        return json({ok: true, queued: rows.length});
    }

    return json({error: "unknown action"}, 400);
});
