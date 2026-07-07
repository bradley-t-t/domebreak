// Live count of commanders currently in the app, via a single global Realtime
// presence channel. Every enabled client tracks itself once (keyed by user id
// so multiple tabs/devices of one account collapse to a single head-count); the
// count is the number of distinct presence keys. Read-only — no DB rows, no
// writes, no RLS surface. Returns null until the first presence sync lands.
import {useEffect, useState} from "react";
import {supabase} from "../../account/client.js";

export function useOnlineCount(enabled) {
    const [count, setCount] = useState(null);
    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        let ch = null;
        supabase.auth.getUser().then(({data}) => {
            if (cancelled) return;
            const uid = data?.user?.id;
            ch = supabase.channel("gd-online", {config: {presence: {key: uid || undefined}}});
            const sync = () => {
                if (!ch) return;
                setCount(Object.keys(ch.presenceState()).length);
            };
            ch.on("presence", {event: "sync"}, sync)
                .subscribe((status) => {
                    if (status === "SUBSCRIBED") ch.track({at: Date.now()});
                });
        });
        return () => {
            cancelled = true;
            if (ch) supabase.removeChannel(ch);
        };
    }, [enabled]);
    return count;
}
