// Builds a match setup from the bundled state-level city data. Player is slot 0.
// With an `activeCount` (singleplayer), only that many nations participate — the
// player plus scattered great powers — and every other country stays on the map as
// a passive, capturable NEUTRAL. Without one (multiplayer / attract sim), every
// country is a live participant.
import {GDP_FALLBACK_T, GDP_T, NEUTRAL, REAL_POP} from "../data/constants.js";
import {haversine} from "../geo/geo.js";
import {clamp} from "../../lib/math.js";
import {cmpStr} from "../../lib/iter.js";

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

// Capital coordinates for an ISO (its flagged capital, else its first city) — used
// to space active nations apart when seeding a match.
function capitalOf(data, iso) {
    const arr = data.cities[iso];
    if (!arr?.length) return null;
    const cap = arr.find((c) => c.cap) || arr[0];
    return {lng: cap.lng, lat: cap.lat};
}

// Choose the active nations for a match: start from the participants (the human
// player, plus any other humans), then greedily add the pool nation whose capital
// is FARTHEST from every already-chosen capital, until `count` is reached.
// Deterministic (no rng) — the same participants + pool + count always yield the
// same scattered cast, so seeding is reproducible for saves and replays. Exported
// for tests.
export function pickActiveIsos(data, participants, pool, count) {
    const active = participants.filter((iso) => data.cities[iso]?.length);
    const caps = active.map((iso) => capitalOf(data, iso)).filter(Boolean);
    const cand = pool.filter((iso) => data.cities[iso]?.length && !active.includes(iso));
    while (active.length < count && cand.length) {
        let bestI = -1, bestD = -1;
        for (let i = 0; i < cand.length; i++) {
            const cap = capitalOf(data, cand[i]);
            if (!cap) continue;
            let minD = caps.length ? Infinity : 0;
            for (const cc of caps) minD = Math.min(minD, haversine(cap.lng, cap.lat, cc.lng, cc.lat));
            if (minD > bestD) { bestD = minD; bestI = i; }
        }
        if (bestI < 0) break;
        const iso = cand.splice(bestI, 1)[0];
        active.push(iso);
        caps.push(capitalOf(data, iso));
    }
    return active;
}

// The player claims one country; every other country becomes a live AI nation.
// When `aiIsos` is null/undefined the roster is the WHOLE WORLD — every ISO in the
// dataset with cities, ordered by GDP (descending) then ISO so slot→nation is
// deterministic for a given dataset (required for saves, replays, and the seeded
// diplomacy). An explicit `aiIsos` array instead selects a curated cast (the menu
// attract sim uses this for a cheap handful of great powers); in that path an
// unselected country simply doesn't exist as a nation.
export function buildSetup(data, playerIso, aiIsos, seed, opts = {}) {
    let chosen;
    if (aiIsos == null) {
        const rest = Object.keys(data.cities)
            .filter((iso) => iso !== playerIso && data.cities[iso]?.length)
            .sort((a, b) => (GDP_T[b] || GDP_FALLBACK_T) - (GDP_T[a] || GDP_FALLBACK_T) || cmpStr()(a, b));
        chosen = (data.cities[playerIso]?.length ? [playerIso] : []).concat(rest);
    } else {
        const others = aiIsos.filter((i) => i !== playerIso && data.cities[i]?.length);
        chosen = [playerIso, ...others].filter((iso) => data.cities[iso]?.length);
    }
    // Active set: the participating nations (human + AI). When an `activeCount` is
    // given (singleplayer's bounded neutral-world model), start from the participants
    // and scatter-fill from the seed pool to that count; every other country in
    // `chosen` stays on the map as a passive NEUTRAL. With no `activeCount`
    // (multiplayer / attract sim), `activeSet` stays null and EVERY nation is active.
    let activeSet = null;
    if (aiIsos == null && opts.activeCount) {
        const participants = (opts.participantIsos?.length ? opts.participantIsos : [playerIso])
            .filter((iso) => data.cities[iso]?.length);
        const count = clamp(opts.activeCount, NEUTRAL.minActive, NEUTRAL.maxActive);
        activeSet = new Set(pickActiveIsos(data, participants, opts.seedPool || GREAT_POWERS, count));
    }
    const nations = [], cities = [];
    chosen.forEach((iso, slot) => {
        const cn = data.countries.find((c) => c.iso === iso);
        nations.push({slot, iso, name: cn?.name || iso, isAi: iso !== playerIso, gdp: GDP_T[iso] || GDP_FALLBACK_T, active: activeSet ? activeSet.has(iso) : true});
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
    // Belligerents (the named, prominently-labelled nations) = the active set; in an
    // all-active match that's everyone.
    const belligerents = activeSet ? chosen.filter((iso) => activeSet.has(iso)) : chosen;
    return {mySlot: 0, seed: seed || 1, nations, cities, belligerents};
}
