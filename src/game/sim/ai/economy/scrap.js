// Deliberate divestment. When the budget flags a structural deficit the AI
// sheds the highest-upkeep redundant hull — never the capital/bunker shield,
// never an engaged unit, never the last of a kind, never industry (industry is
// the way OUT of deficit), and biased by the current doctrine's scrapBias so a
// projection navy is the last thing a projection nation sells.
import {UNITS} from "../../../data/constants.js";
import {haversine} from "../../../geo/geo.js";
import {PLACE} from "../tuning.js";

// Coarse role for bias lookup — matches the scrapBias keys doctrines publish.
export function unitRole(def) {
    if (def.kind === "industry") return "industry";
    if (def.domain === "sea") return "naval";
    if (def.capture || (def.targets === "land" && def.landSpeed)) return "ground";
    if (def.kind === "defense") return "defense";
    if (def.kind === "offense") return "offense";
    return "support";
}

export function pickScrapCandidate(frame, bias) {
    const {units: myUnits, cap} = frame.me;
    const bunker = myUnits.find((u) => u.type === "bunker" && u.hp > 0);
    const defenders = myUnits.filter((u) => UNITS[u.type].kind === "defense").length;
    const isRedundantKind = (u) => {
        const kin = myUnits.filter((x) => x.type === u.type && x.hp > 0).length;
        if (kin <= 1) return false;                       // last of its kind — keep it
        if (UNITS[u.type].maxCount) return false;         // never scrap uniques
        if (UNITS[u.type].kind === "defense" && defenders <= 2) return false;
        return true;
    };
    let best = null, bestScore = -Infinity;
    for (const u of myUnits) {
        if (u.hp <= 0 || u.targetId) continue;            // engaged — leave it
        const def = UNITS[u.type];
        if (!def || def.kind === "industry") continue;
        if (u.type === "bunker" || u.type === "spacehq") continue;
        if (u.baseId) continue;                           // hangar aircraft aren't standing upkeep to shed
        // Preserve anything defending the heart of the nation.
        if (def.kind === "defense") {
            if (cap && haversine(cap.lng, cap.lat, u.lng, u.lat) <= PLACE.scrapSafeRadiusKm) continue;
            if (bunker && haversine(bunker.lng, bunker.lat, u.lng, u.lat) <= PLACE.scrapSafeRadiusKm) continue;
        }
        if (!isRedundantKind(u)) continue;
        const hpFrac = def.hp ? u.hp / def.hp : 1;
        const score = ((def.upkeep ?? 0) + (1 - hpFrac) * 0.3) * (bias[unitRole(def)] ?? 1);
        if (score > bestScore) { bestScore = score; best = u; }
    }
    return best;
}
