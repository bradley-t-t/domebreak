import {useMemo} from "react";

// Shared read of the multiplayer roster the netClient hands the UI: `players` is
// [{slot, username, iso, isBot}], one row per real seat plus any bots. A seat
// reads as a human PLAYER when a non-bot row claims its slot; everything else on
// the map is AI. This is the authoritative signal for the seat label — a nation's
// `isAi` flag legitimately flips (a force-launched seat starts AI until its player
// attaches; a drop hands the chair to AI through the reconnect grace) while the
// seat still belongs to its human, so the label must follow the roster, not
// `isAi`. In singleplayer `players` is undefined: no seat is human and every power
// but you reads as AI.
export function useRoster(players) {
    return useMemo(() => {
        const usernameOf = new Map();
        const humanSlots = new Set();
        for (const p of (players || [])) {
            usernameOf.set(p.slot, p.username);
            if (!p.isBot) humanSlots.add(p.slot);
        }
        return {usernameOf, humanSlots, isHuman: (slot) => humanSlots.has(slot)};
    }, [players]);
}
