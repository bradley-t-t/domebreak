// Ownership territory overlay for the political map.
//
// The base map colors every province by its native flag (GID_0 -> colors.json),
// which cannot show who actually *controls* land — provinces captured in war look
// identical to their neighbours. This hook recolors a province only when its
// controller is NOT its native nation: captured land takes the conqueror's flag
// color. Peacetime territory is left untouched, so the tuned flag map is unchanged
// until a border actually moves.
//
// A city's province comes from public/assets/city-region.json (precomputed
// point-in-polygon, see scripts/gen-city-region.mjs) — keyed by the engine's city
// ids — so the join to GADM geometry needs no province-name matching. The heavy
// recompute runs only when an ownership checksum changes; every other tick is a
// cheap O(cities) scan.
import {useEffect, useRef, useState} from "react";
import {colorForSlot} from "../../game/data/constants.js";
import {toGid3} from "../../game/data/iso3.js";
import {loadJsonAsset} from "../../lib/fetchJson.js";
import {rgbTuple} from "../../lib/color.js";
import {indexBy} from "../../lib/iter.js";
import {useCancellableEffect} from "../../lib/hooks/useCancellableEffect.js";

const EMPTY = "rgba(0,0,0,0)";

export function useOwnershipLayer(w) {
    const cityRegionRef = useRef(null); // cityId -> GID_1 (province)
    const flagRef = useRef(null);       // GID_0 -> "rgb(r,g,b)"
    const sigRef = useRef(null);
    const [fill, setFill] = useState(EMPTY);
    const [ids, setIds] = useState([]);

    // Static lookups, loaded once. Bump sigRef so the next tick rebuilds once ready.
    useCancellableEffect((t) => {
        loadJsonAsset("/assets/city-region.json", {cache: true}).then((j) => {
            if (t.cancelled || !j) return;
            cityRegionRef.current = j;
            sigRef.current = null;
        });
        loadJsonAsset("/assets/colors.json", {cache: true}).then((cols) => {
            if (t.cancelled || !cols) return;
            const f = {};
            for (const [gid, c] of Object.entries(cols)) f[gid] = rgbTuple(c);
            flagRef.current = f;
            sigRef.current = null;
        });
    }, []);

    useEffect(() => {
        const cityRegion = cityRegionRef.current;
        if (!cityRegion) return;
        // Cheap change-detector: a rolling checksum over (city -> owner, alive). The
        // expensive province grouping below runs only when a border has moved.
        let sig = 0;
        for (const c of w.cities) sig = (Math.imul(sig, 31) + c.slot * 2 + (c.alive ? 1 : 0)) | 0;
        if (sig === sigRef.current) return;
        sigRef.current = sig;

        // Owner of each province = the slot holding the most population there.
        const prov = new Map(); // GID_1 -> Map(slot -> pop)
        for (const c of w.cities) {
            if (!c.alive) continue;
            const gid1 = cityRegion[c.id];
            if (!gid1) continue;
            let m = prov.get(gid1);
            if (!m) prov.set(gid1, (m = new Map()));
            m.set(c.slot, (m.get(c.slot) || 0) + (c.pop || 1));
        }

        const nationBySlot = indexBy(w.nations, (n) => n.slot);
        const flags = flagRef.current || {};
        const pairs = [];   // gid1, color, ... for the fill match
        const lineIds = [];
        for (const [gid1, m] of prov) {
            let owner = -1, bestPop = -1;
            for (const [slot, pop] of m) if (pop > bestPop) { bestPop = pop; owner = slot; }
            const n = nationBySlot.get(owner);
            if (!n) continue;
            const nativeGid = gid1.split(".")[0]; // GADM: "USA.5_1" -> "USA"
            const ownerGid = toGid3(n.iso);
            // Recolor only conquered land — a province held by a nation other than its
            // native one, in the conqueror's flag color.
            if (ownerGid && ownerGid !== nativeGid) {
                const color = flags[ownerGid] || colorForSlot(n.slot);
                pairs.push(gid1, color);
                lineIds.push(gid1);
            }
        }

        setFill(pairs.length ? ["match", ["get", "GID_1"], ...pairs, EMPTY] : EMPTY);
        setIds(lineIds);
    }, [w, w.time]);

    return {fill, ids};
}
