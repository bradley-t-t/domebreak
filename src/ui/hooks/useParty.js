// The signed-in player's current party: discovers it, keeps the roster/settings
// live, and exposes actions. `party` is null when not in one. Actions resolve to
// the fresh state (or {error}); membership-changing ones re-discover.
import {useCallback, useEffect, useRef, useState} from "react";
import {supabase} from "../../account/client.js";
import {
    createParty, fetchMyPartyId, getParty, inviteToParty, joinParty, kickFromParty,
    launchPartyPrivate, leaveParty, queuePartyPublic, setPartyIso, setPartyJoinMode,
    setPartyReady, watchParty,
} from "../../account/party.js";

export function useParty(enabled) {
    const [state, setState] = useState({party: null, members: []});
    const [meId, setMeId] = useState(null);
    const pidRef = useRef(null);
    const unwatchRef = useRef(null);

    useEffect(() => {
        if (!enabled) {
            setMeId(null);
            return;
        }
        supabase.auth.getUser().then(({data}) => setMeId(data?.user?.id ?? null));
    }, [enabled]);

    const stopWatch = () => {
        if (unwatchRef.current) unwatchRef.current();
        unwatchRef.current = null;
    };

    const refresh = useCallback(async () => {
        const pid = pidRef.current;
        if (!pid) {
            setState({party: null, members: []});
            return;
        }
        const res = await getParty(pid);
        if (res?.party) setState({party: res.party, members: res.members || []});
        else {
            pidRef.current = null;
            stopWatch();
            setState({party: null, members: []});
        }
    }, []);

    // Point the hook at a party id: (re)watch it and pull fresh state.
    const bind = useCallback((pid) => {
        if (pidRef.current === pid && unwatchRef.current) return refresh();
        stopWatch();
        pidRef.current = pid || null;
        if (pid) unwatchRef.current = watchParty(pid, refresh);
        return refresh();
    }, [refresh]);

    // Discover my membership on enable / auth change.
    useEffect(() => {
        if (!enabled) {
            stopWatch();
            pidRef.current = null;
            setState({party: null, members: []});
            return;
        }
        let cancelled = false;
        fetchMyPartyId().then((pid) => {
            if (!cancelled) bind(pid);
        });
        return () => {
            cancelled = true;
            stopWatch();
        };
    }, [enabled, bind]);

    // Actions. Membership-changing ones re-bind; in-party tweaks just refresh.
    const rebindTo = async (res, pid) => {
        if (res?.error) return res;
        await bind(pid);
        return res;
    };
    const actions = {
        create: async (opts) => rebindTo(await createParty(opts), (await fetchMyPartyId())),
        join: async (partyId) => rebindTo(await joinParty(partyId), partyId),
        leave: async () => {
            const res = await leaveParty();
            await bind(null);
            return res;
        },
        invite: (toUser) => inviteToParty(toUser),
        setIso: async (iso) => (await setPartyIso(iso), refresh()),
        setReady: async (ready) => (await setPartyReady(ready), refresh()),
        setJoinMode: async (mode) => (await setPartyJoinMode(mode), refresh()),
        kick: async (userId) => (await kickFromParty(userId), refresh()),
        launchPrivate: () => launchPartyPrivate(),
        queuePublic: () => queuePartyPublic(),
        refresh,
    };

    return {party: state.party, members: state.members, meId, ...actions};
}
