// Live presence over a single global Realtime channel. Every signed-in client
// tracks itself (keyed by user id, so multiple tabs/devices collapse to one) with
// its current activity; other clients read the presence map to see who's online
// and what they're doing. Also drives a periodic last_seen heartbeat so a friend
// who has gone offline still shows a "last online" time.
//
// Returns {count, byId}:
//   count — distinct online users (the Multiplayer-menu head count; null until sync)
//   byId  — { [userId]: {at, activity, party} } for everyone currently online,
//           where party (when set) is {id, join_mode, seats, max, leaderName} so
//           a friend can see and join an open party with room.
import {useEffect, useRef, useState} from "react";
import {supabase} from "../../account/client.js";
import {heartbeat} from "../../account/api.js";
import {currentUserId} from "../../lib/supabase.js";

const HEARTBEAT_MS = 90_000;

export function usePresence(enabled, activity, party) {
    const [state, setState] = useState({count: null, byId: {}});
    const chRef = useRef(null);
    const payloadRef = useRef({activity, party: party ?? null});

    useEffect(() => {
        if (!enabled) {
            setState({count: null, byId: {}});
            return;
        }
        let cancelled = false, ch = null, hb = null;
        currentUserId().then((uid) => {
            if (cancelled) return;
            ch = supabase.channel("db-online", {config: {presence: {key: uid || undefined}}});
            chRef.current = ch;
            const sync = () => {
                if (chRef.current !== ch) return;
                const st = ch.presenceState();
                const byId = {};
                for (const [key, metas] of Object.entries(st)) byId[key] = metas[metas.length - 1] || {};
                setState({count: Object.keys(st).length, byId});
            };
            ch.on("presence", {event: "sync"}, sync)
                .on("presence", {event: "join"}, sync)
                .on("presence", {event: "leave"}, sync)
                .subscribe((status) => {
                    if (status !== "SUBSCRIBED") return;
                    ch.track({at: Date.now(), ...payloadRef.current});
                    heartbeat();
                    hb = setInterval(heartbeat, HEARTBEAT_MS);
                });
        });
        return () => {
            cancelled = true;
            chRef.current = null;
            if (hb) clearInterval(hb);
            if (ch) supabase.removeChannel(ch);
        };
    }, [enabled]);

    // Re-broadcast whenever my activity or party changes (menu → in a match;
    // created/joined/left a party). Keyed on a serialized digest of both.
    const key = `${activity}|${party ? `${party.id}:${party.seats}/${party.max}:${party.join_mode}` : ""}`;
    useEffect(() => {
        payloadRef.current = {activity, party: party ?? null};
        if (chRef.current) chRef.current.track({at: Date.now(), ...payloadRef.current});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    return state;
}
