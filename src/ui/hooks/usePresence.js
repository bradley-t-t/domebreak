// Live presence over a single global Realtime channel. Every signed-in client
// tracks itself (keyed by user id, so multiple tabs/devices collapse to one) with
// its current activity; other clients read the presence map to see who's online
// and what they're doing. Also drives a periodic last_seen heartbeat so a friend
// who has gone offline still shows a "last online" time.
//
// Returns {count, byId}:
//   count — distinct online users (the Multiplayer-menu head count; null until sync)
//   byId  — { [userId]: {at, activity} } for everyone currently online
import {useEffect, useRef, useState} from "react";
import {supabase} from "../../account/client.js";
import {heartbeat} from "../../account/api.js";

const HEARTBEAT_MS = 90_000;

export function usePresence(enabled, activity) {
    const [state, setState] = useState({count: null, byId: {}});
    const chRef = useRef(null);
    const activityRef = useRef(activity);

    useEffect(() => {
        if (!enabled) {
            setState({count: null, byId: {}});
            return;
        }
        let cancelled = false, ch = null, hb = null;
        supabase.auth.getUser().then(({data}) => {
            if (cancelled) return;
            const uid = data?.user?.id;
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
                    ch.track({at: Date.now(), activity: activityRef.current});
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

    // Re-broadcast whenever my activity changes (menu → in a match, etc.).
    useEffect(() => {
        activityRef.current = activity;
        if (chRef.current) chRef.current.track({at: Date.now(), activity});
    }, [activity]);

    return state;
}
