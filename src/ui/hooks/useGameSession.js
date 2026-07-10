// One hook, both modes. Solo: the plain local engine. Online: the SAME local
// engine loop runs as client-side prediction over the net client's world
// (snapshots overwrite it in place, the server always wins), and every api
// call is applied optimistically AND sent to the server. LiveGame stays
// completely mode-blind.
import {useEffect, useMemo} from "react";
import {useEngine} from "./useEngine.js";

// api methods that are purely local session controls — never sent online.
// dismissWarPopup only clears a client-side UI queue (the war-outcome modal), so
// it stays local; the rest mutate game state and go to the authoritative server.
const LOCAL_ONLY = new Set(["setSpeed", "pause", "play", "dismissWarPopup"]);

export function useGameSession(world, client) {
    const [w, localApi, force] = useEngine(world, !!client);

    // Snapshot arrivals re-render immediately instead of waiting for the 30fps tick.
    useEffect(() => {
        if (!client) return;
        client._forceRender = force;
        return () => {
            if (client._forceRender === force) client._forceRender = null;
        };
    }, [client, force]);

    // Replay still-in-flight commands over each fresh snapshot: the net client hands
    // us back its pending buffer and we re-apply each one through the RAW local engine
    // (never the net wrapper below — no re-send), so an optimistic action holds until
    // the server's snapshot actually reflects it instead of blinking back for a frame.
    useEffect(() => {
        if (!client) return;
        client._reapply = () => {
            for (const c of client._pending) {
                const fn = localApi[c.name];
                if (fn) try { fn(...c.args); } catch { /* prediction only — server is authoritative */ }
            }
        };
        return () => {
            if (client._reapply) client._reapply = null;
        };
    }, [client, localApi]);

    const api = useMemo(() => {
        if (!client) return localApi;
        const net = {};
        for (const [name, fn] of Object.entries(localApi)) {
            if (LOCAL_ONLY.has(name)) {
                net[name] = () => ({error: "The war waits for no one."});
                continue;
            }
            net[name] = (...args) => {
                const r = fn(...args);      // optimistic — next snapshot reconciles
                client.send(name, args);
                return r;
            };
        }
        return net;
    }, [client, localApi]);

    return [w, api];
}
