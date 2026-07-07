// Friends surface: reads under RLS, writes through db-social.
import {supabase} from "./client.js";

async function invoke(body) {
    const {data, error} = await supabase.functions.invoke("db-social", {body});
    return error ? {error: error.message} : (data ?? {ok: true});
}

export const requestFriend = (username) => invoke({action: "request", username});
export const acceptFriend = (id) => invoke({action: "accept", id});
export const removeFriend = (id) => invoke({action: "remove", id});

// All friendship rows touching me, with both usernames resolved. Shapes:
// {id, status, direction: 'in'|'out', other: {id, username}}
export async function fetchFriends() {
    const {data: {user} = {user: null}} = await supabase.auth.getUser();
    if (!user) return [];
    const {data} = await supabase.from("friendships")
        .select("id, status, requester, addressee, req:profiles!friendships_requester_fkey(id, username, last_seen), add:profiles!friendships_addressee_fkey(id, username, last_seen)");
    return (data ?? []).map((f) => {
        const out = f.requester === user.id;
        const other = out ? f.add : f.req;
        return {id: f.id, status: f.status, direction: out ? "out" : "in", other};
    });
}
