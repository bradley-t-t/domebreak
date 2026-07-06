// Builds a single-player match setup from the bundled state-level city data.
// Player is slot 0; every other country on the map is a live AI nation.
import {GDP_FALLBACK_T, GDP_T, REAL_POP} from "../data/constants.js";

let _data = null;

// Fetches (once) and caches the bundled city/country datasets from /data.
export async function loadGameData() {
    if (_data) return _data;
    const [cities, countries] = await Promise.all([
        fetch("/data/cities.json").then((r) => r.json()),
        fetch("/data/countries.json").then((r) => r.json()),
    ]);
    _data = {cities, countries};
    return _data;
}

// Default AI opponent roster offered on the New Game screen, in display order.
export const GREAT_POWERS = ["US", "RU", "CN", "IN", "GB", "FR", "DE", "JP", "BR", "KR", "IR", "TR", "SA", "PK", "CA", "AU"];

// The player claims one country; every other country becomes a live AI nation.
// When `aiIsos` is null/undefined the roster is the WHOLE WORLD — every ISO in the
// dataset with cities, ordered by GDP (descending) then ISO so slot→nation is
// deterministic for a given dataset (required for saves, replays, and the seeded
// diplomacy). An explicit `aiIsos` array still selects a curated cast (the menu
// attract sim uses this for a cheap handful of great powers). There are no neutral
// backdrop nations anymore — an unselected country simply doesn't exist as a
// nation only in the curated path.
export function buildSetup(data, playerIso, aiIsos, seed) {
    let chosen;
    if (aiIsos == null) {
        const rest = Object.keys(data.cities)
            .filter((iso) => iso !== playerIso && data.cities[iso]?.length)
            .sort((a, b) => (GDP_T[b] || GDP_FALLBACK_T) - (GDP_T[a] || GDP_FALLBACK_T) || (a < b ? -1 : a > b ? 1 : 0));
        chosen = (data.cities[playerIso]?.length ? [playerIso] : []).concat(rest);
    } else {
        const others = aiIsos.filter((i) => i !== playerIso && data.cities[i]?.length);
        chosen = [playerIso, ...others].filter((iso) => data.cities[iso]?.length);
    }
    const nations = [], cities = [];
    chosen.forEach((iso, slot) => {
        const cn = data.countries.find((c) => c.iso === iso);
        nations.push({slot, iso, name: cn?.name || iso, isAi: iso !== playerIso, gdp: GDP_T[iso] || GDP_FALLBACK_T});
        const arr = data.cities[iso];
        const metroTotal = arr.reduce((s, c) => s + (c.p || 0), 0) || 1;
        const realPop = REAL_POP[iso];
        arr.forEach((c, i) => {
            const econ = (c.p || 0) / metroTotal; // this state's share of the national economy
            const pop = realPop ? Math.round(realPop * econ) : (c.p || 0);
            cities.push({
                id: `${iso}-${i}`,
                slot,
                name: c.n,
                state: c.s,
                cap: c.cap,
                pop,
                econ,
                lng: c.lng,
                lat: c.lat
            });
        });
    });
    return {mySlot: 0, seed: seed || 1, nations, cities, belligerents: chosen};
}
