// Party surface: all writes go through the db-party edge function; reads of my
// own party are watched live under RLS. A party is a social group I lead and
// friends join, separate from a match lobby.
import {createEdgeInvoker, currentUserId, readRow, watchRows} from "../lib/database.js";

const invoke = createEdgeInvoker("db-party");

export const createParty = (opts = {}) => invoke({action: "create", ...opts});
export const getParty = (party_id) => invoke({action: "get", party_id});
export const joinParty = (party_id) => invoke({action: "join", party_id});
export const leaveParty = () => invoke({action: "leave"});
export const inviteToParty = (to_user) => invoke({action: "invite", to_user});
export const setPartyIso = (iso) => invoke({action: "set_iso", iso});
export const setPartyReady = (ready) => invoke({action: "ready", ready});
export const setPartyJoinMode = (join_mode) => invoke({action: "set_join_mode", join_mode});
export const kickFromParty = (user_id) => invoke({action: "kick", user_id});
export const launchPartyPrivate = () => invoke({action: "launch_private"});
export const queuePartyPublic = () => invoke({action: "queue_public"});

// My current party id (or null) — the seat row is readable under RLS.
export async function fetchMyPartyId() {
    const uid = await currentUserId();
    if (!uid) return null;
    const data = await readRow("party_members", {select: "party_id", eq: ["user_id", uid]});
    return data?.party_id ?? null;
}

// Live-watch a party row + its members; cb() fires on any change (caller
// re-fetches via getParty). Poll fallback covers a dropped subscription.
export function watchParty(partyId, cb) {
    return watchRows({
        channel: `db-party-${partyId}`,
        tables: [
            {table: "parties", filter: `id=eq.${partyId}`},
            {table: "party_members", filter: `party_id=eq.${partyId}`},
        ],
        pollMs: 5000,
        cb,
    });
}
