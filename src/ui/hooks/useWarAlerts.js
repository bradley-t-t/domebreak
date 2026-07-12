// Player-facing "war declared on you" alerts, derived from fresh world.events.
// A nation opening war against the local player — or an ally's war that drags the
// player in via call-to-arms — raises a modal notice (WarOutcomeModal). LiveGame
// pauses the sim while it's up in single-player and leaves it non-blocking online
// (see the pause effect there). Wars the player starts themselves, and distant
// AI-vs-AI wars, never raise one.
//
// This is purely a presentation concern, so it rides the broadcast event stream
// rather than the engine's per-seat warPopups queue — that lets one mechanism cover
// both solo and online, where the server can't address a popup to a single seat.
//
// The world mutates in place; the effect keys off w.time (the tick counter) to
// drain fresh events each tick, seeding `seen` on mount so loading a save mid-war
// doesn't replay old declarations.
import {useEffect, useRef, useState} from "react";

export function useWarAlerts({w, mySlot}) {
    const seen = useRef(null);
    if (!seen.current) seen.current = new Set(w.events.map((e) => e.id));
    const [alerts, setAlerts] = useState([]);

    useEffect(() => {
        const fresh = [];
        for (const e of w.events) {
            if (seen.current.has(e.id)) continue;
            seen.current.add(e.id);
            // War opened ON me (I'm the defender) — the aggressor is the foe.
            if (e.type === "war" && e.b === mySlot) fresh.push({id: e.id, kind: "war-declared", foe: e.a});
            // Pulled into a war by a defensive pact — the aggressor (e.b) is the foe.
            else if (e.type === "callToArms" && e.a === mySlot) fresh.push({id: e.id, kind: "called-to-arms", foe: e.b});
        }
        // Cap the seen set like useEventEffects does; everything current is already drained.
        if (seen.current.size > 500) seen.current = new Set(w.events.map((e) => e.id));
        if (fresh.length) setAlerts((q) => [...q, ...fresh]);
    }, [w.time]); // eslint-disable-line react-hooks/exhaustive-deps

    const dismiss = (id) => setAlerts((q) => q.filter((a) => a.id !== id));
    return {alerts, dismiss};
}
