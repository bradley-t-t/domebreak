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
