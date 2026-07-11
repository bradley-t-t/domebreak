// Builds a match setup from the bundled state-level city data. Player is slot 0.
// Every full-world match is bounded: `activeCount` nations participate (the
// player(s) plus scattered great powers, capped at NEUTRAL.maxActive) and every
// other country stays on the map as a passive, capturable NEUTRAL. Only a curated
// `aiIsos` cast (the menu attract sim's handful of great powers) runs all-active.
import {GDP_FALLBACK_T, GDP_T, NEUTRAL, REAL_POP} from "../data/constants.js";
import {haversine} from "../geo/geo.js";
import {clamp} from "../../lib/math.js";
import {cmpStr} from "../../lib/iter.js";
import {normalizeRules} from "./gameRules.js";

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

// The 30 most powerful nations AI belligerents are drawn from when filling the
// active-nation slots players don't claim. A per-match seed randomly samples this
// pool (see pickActiveIsos) so each game fields a different cast instead of the
// same great powers every time. Every ISO here has GDP_T / REAL_POP entries in
// constants.js so a randomly-picked opponent is economically sized like a real
// power, not a fallback minnow.
export const POWER_POOL = [
    "US", "CN", "RU", "DE", "IN", "GB", "FR", "JP", "KR", "IT",
    "BR", "CA", "AU", "ES", "TR", "SA", "IR", "IL", "PK", "ID",
    "MX", "NL", "PL", "EG", "UA", "ZA", "TW", "SE", "AE", "NG",
];

// Small self-contained mulberry32 PRNG (the same stream the sim's worldState.rand
// uses) so active-nation selection is randomized yet fully reproducible: a given
// match seed always yields the same cast, which keeps saves and replays stable.
function seededRng(seed) {
    let a = (seed >>> 0) || 1;
    return () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Seeded Fisher-Yates shuffle (returns a new array; input untouched).
function shuffled(arr, rng) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

// Capital coordinates for an ISO (its flagged capital, else its first city) — used
// to space active nations apart when seeding a match.
function capitalOf(data, iso) {
    const arr = data.cities[iso];
    if (!arr?.length) return null;
    const cap = arr.find((c) => c.cap) || arr[0];
    return {lng: cap.lng, lat: cap.lat};
}

// Choose the active nations for a match: start from the participants (the human
// player, plus any other humans), then fill up to `count` from `pool` with a
// RANDOM-but-scattered cast. `seed` seeds a local PRNG that shuffles the pool, so
// the same participants + pool + count + seed always yield the same roster (saves
// and replays stay reproducible) while different seeds field different opponents.
//
// Fill order: walk the shuffled pool and take the first candidate whose capital is
// at least NEUTRAL.scatterMinKm from every already-chosen capital — the shuffle
// picks WHO, the spacing gate keeps the map spread. If no remaining candidate
// clears the gate but slots are still open, fall back to the farthest-available
// nation so the roster always reaches `count`. Exported for tests.
export function pickActiveIsos(data, participants, pool, count, seed = 1) {
    const active = participants.filter((iso) => data.cities[iso]?.length);
    const caps = active.map((iso) => capitalOf(data, iso)).filter(Boolean);
    const rng = seededRng(seed);
    const cand = shuffled(pool.filter((iso) => data.cities[iso]?.length && !active.includes(iso)), rng);
    const minGapKm = NEUTRAL.scatterMinKm;
    const minDistOf = (cap) => {
        if (!caps.length) return Infinity;
        let m = Infinity;
        for (const cc of caps) m = Math.min(m, haversine(cap.lng, cap.lat, cc.lng, cc.lat));
        return m;
    };
    const take = (i) => {
        const iso = cand.splice(i, 1)[0];
        active.push(iso);
        caps.push(capitalOf(data, iso));
    };
    while (active.length < count && cand.length) {
        // First choice that clears the spacing gate (shuffled order → random pick).
        let picked = cand.findIndex((iso) => {
            const cap = capitalOf(data, iso);
            return cap && minDistOf(cap) >= minGapKm;
        });
        // Crowded: nobody clears the gate — take the farthest remaining instead.
        if (picked < 0) {
            let bestD = -1;
            for (let i = 0; i < cand.length; i++) {
                const cap = capitalOf(data, cand[i]);
                if (!cap) continue;
                const d = minDistOf(cap);
                if (d > bestD) { bestD = d; picked = i; }
            }
        }
        if (picked < 0) break;
        take(picked);
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
    // Active set: the participating nations (human + AI). Every full-world roster
    // (aiIsos == null) is a bounded neutral-world match: start from the
    // participants and scatter-fill from the seed pool up to `activeCount`
    // (defaulted and clamped to the NEUTRAL bounds); every other country in
    // `chosen` stays on the map as a passive NEUTRAL. There is deliberately no
    // all-active full-world path — ~222 simultaneously warring nations is far past
    // what the sim and renderer are sized for. A curated `aiIsos` cast (attract
    // sim) is already small, so it stays fully active.
    let activeSet = null;
    if (aiIsos == null) {
        const participants = (opts.participantIsos?.length ? opts.participantIsos : [playerIso])
            .filter((iso) => data.cities[iso]?.length);
        const count = clamp(opts.activeCount || NEUTRAL.defaultActive, NEUTRAL.minActive, NEUTRAL.maxActive);
        activeSet = new Set(pickActiveIsos(data, participants, opts.seedPool || POWER_POOL, count, seed || 1));
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
    // Author's rules ride along on the setup so createWorld can stamp them onto
    // world.rules — normalized here so any downstream reader sees a valid shape.
    const rules = normalizeRules(opts.rules);
    // Balanced start: level the economic playing field across ACTIVE participants
    // (neutrals stay real-world sized — they're scenery, not opponents). Every
    // active nation is given the average of the active roster's GDP, and each of
    // its cities is scaled so its total population matches the active-average pop.
    // Preserves the per-city share within a nation (capital > minor city) but
    // erases inter-nation head starts.
    if (rules.balanced) applyBalanced(nations, cities);
    return {mySlot: 0, seed: seed || 1, nations, cities, belligerents, rules};
}

function applyBalanced(nations, cities) {
    const activeNations = nations.filter((n) => n.active !== false);
    if (!activeNations.length) return;
    const totalGdp = activeNations.reduce((s, n) => s + (n.gdp || 0), 0);
    const avgGdp = totalGdp / activeNations.length;
    const activeSlots = new Set(activeNations.map((n) => n.slot));
    const popBySlot = new Map();
    for (const c of cities) {
        if (!activeSlots.has(c.slot)) continue;
        popBySlot.set(c.slot, (popBySlot.get(c.slot) || 0) + (c.pop || 0));
    }
    const totalPop = [...popBySlot.values()].reduce((s, p) => s + p, 0);
    const avgPop = totalPop / activeNations.length;
    for (const n of activeNations) n.gdp = avgGdp;
    for (const c of cities) {
        if (!activeSlots.has(c.slot)) continue;
        const nationTotal = popBySlot.get(c.slot) || 0;
        if (nationTotal <= 0) continue;
        const share = (c.pop || 0) / nationTotal; // per-city weight within the nation
        c.pop = Math.max(1, Math.round(avgPop * share));
    }
}
