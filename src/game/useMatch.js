import {useCallback, useEffect, useState} from "react";
import {supabase} from "../lib/supabase.js";
import {api} from "../lib/api.js";

// Loads full match state through the edge function and refetches on any realtime
// change to the match's rows. Refetching (rather than merging) keeps the client
// simple and always consistent with the server's authoritative view.
export function useMatch(matchId, player) {
    const [state, setState] = useState(null);

    const refetch = useCallback(async () => {
        if (!matchId) return;
        try {
            setState(await api.state(matchId, player));
        } catch { /* transient */
        }
    }, [matchId, player?.id, player?.secret]);

    useEffect(() => {
        setState(null);
        refetch();
    }, [refetch]);

    useEffect(() => {
        if (!matchId) return;
        const ch = supabase.channel(`match-${matchId}`);
        for (const table of ["gd_matches", "gd_match_players", "gd_cities", "gd_results"]) {
            const filter = table === "gd_matches" ? `id=eq.${matchId}` : `match_id=eq.${matchId}`;
            ch.on("postgres_changes", {event: "*", schema: "public", table, filter}, refetch);
        }
        ch.subscribe();
        return () => {
            supabase.removeChannel(ch);
        };
    }, [matchId, refetch]);

    return {state, refetch};
}
