// Diplomacy map filter: recolors every nation's territory by YOUR standing toward
// it — green for you and your allies, red for anyone you're at war with, grey for
// the neutral rest. Keyed by GID_0 (the native country), so it covers whole
// countries in one small match (~one entry per living nation) regardless of which
// provinces hold cities. Toggled by the "Diplomacy" layer button; the paint is
// applied in MapLayers only while that layer is on.
//
// Recompute is gated on a rolling checksum of the player's relations + who's alive,
// so the (cheap) rebuild runs only when a war/alliance actually changes.
import {useEffect, useRef, useState} from "react";
import {toGid3} from "../../game/data/iso3.js";

const EMPTY = "rgba(0,0,0,0)";
// Standing colors (this mode only — allies read GREEN here, not the map's usual blue).
const C_FRIEND = "#46d38a";   // you + your allies
const C_WAR = "#f0556a";      // at war with you
const C_NEUTRAL = "#6a707a";  // everyone else

export function useDiplomacyLayer(w, mySlot) {
    const sigRef = useRef(null);
    const [fill, setFill] = useState(EMPTY);

    useEffect(() => {
        const me = w.nations.find((n) => n.slot === mySlot);
        if (!me) return;
        // Change-detector: fold each nation's slot, alive flag, and my relation to it
        // into a rolling checksum. Rebuild the match only when one of those moves.
        let sig = 0;
        for (const n of w.nations) {
            const rel = n.slot === mySlot ? 3 : me.relations[n.slot] === "war" ? 2 : me.relations[n.slot] === "ally" ? 1 : 0;
            sig = (Math.imul(sig, 31) + n.slot * 4 + (n.alive ? 1 : 0) * 2 + rel) | 0;
        }
        if (sig === sigRef.current) return;
        sigRef.current = sig;

        const pairs = [];   // gid0, color, ...
        for (const n of w.nations) {
            const gid0 = toGid3(n.iso);
            if (!gid0) continue;
            const color = n.slot === mySlot ? C_FRIEND
                : me.relations[n.slot] === "war" ? C_WAR
                    : me.relations[n.slot] === "ally" ? C_FRIEND
                        : C_NEUTRAL;
            pairs.push(gid0, color);
        }
        setFill(pairs.length ? ["match", ["get", "GID_0"], ...pairs, C_NEUTRAL] : EMPTY);
    }, [w, w.time, mySlot]);

    return {fill};
}
