// Role-aware placement (makePlacer): defense anchors on the worst threat gap —
// beside the threatened high-value city, not an untouched interior one —
// industry hides on the quietest ground, the command bunker digs in farther
// from the enemy-facing front city than the defense line, naval builds need
// real sea inside territory (landlocked nations skip them), and every land
// placement obeys the nation's own POLITICAL border (inOwnCountry). Real
// geographies because the border gate rasterizes real countries. Deterministic:
// all sampling runs on the seeded rand(w), so a fixed seed gives fixed spots —
// the assertions are properties, never exact coordinates.
import {describe, expect, it} from "vitest";
import {UNITS, createWorld, declareWar, haversine, inOwnCountry} from "../../../src/game/engine.js";
import {isSea} from "../../../src/game/geo/seaRoute.js";
import {buildFrame, capPositions} from "../../../src/game/sim/ai/perception/perception.js";
import {makePlacer} from "../../../src/game/sim/ai/placement/placer.js";

const NYC = {lng: -74.0, lat: 40.71};       // coastal capital — the threatened high-value city
const DENVER = {lng: -104.99, lat: 39.74};  // quiet interior second city
const MOSCOW = {lng: 37.6, lat: 55.75};     // the enemy silo sits here
const AGADEZ = {lng: 7.99, lat: 16.97};     // deep-Sahara city — no sea within naval probe reach

// slot 0 = United States (under test), slot 1 = Russia (the foe), slot 2 =
// Niger (landlocked naval case), slot 3 = a nation with no cities at all.
function fresh() {
    return createWorld({
        mySlot: 0, seed: 7,
        nations: [
            {slot: 0, name: "Aland", iso: "US", isAi: false, gdp: 5},
            {slot: 1, name: "Bland", iso: "RU", isAi: true, gdp: 5},
            {slot: 2, name: "Cland", iso: "NE", isAi: true, gdp: 5},
            {slot: 3, name: "Dland", iso: "CA", isAi: true, gdp: 5},
        ],
        cities: [
            {id: "a1", slot: 0, name: "A-Cap", state: "NY", cap: 1, pop: 9e6, econ: 1, ...NYC},
            {id: "a2", slot: 0, name: "A-2", state: "CO", cap: 0, pop: 5e5, econ: 1, ...DENVER},
            {id: "b1", slot: 1, name: "B-Cap", state: "MOW", cap: 1, pop: 1e6, econ: 1, ...MOSCOW},
            {id: "c1", slot: 2, name: "C-Cap", state: "AGZ", cap: 1, pop: 1e6, econ: 1, ...AGADEZ},
        ],
        rules: {playerGraceSec: 0},
    });
}

function frameFor(w, slot) {
    const unitsBySlot = new Map();
    for (const n of w.nations) unitsBySlot.set(n.slot, []);
    for (const u of w.units) if (u.hp > 0) unitsBySlot.get(u.slot)?.push(u);
    const n = w.nations.find((x) => x.slot === slot);
    return buildFrame(w, n, {unitsBySlot, caps: capPositions(w)});
}

// US at war with RU, one RU silo at Moscow pressing the whole map — the gap
// math concentrates on the coastal capital (value dwarfs the interior city).
function atWarUS() {
    const w = fresh();
    declareWar(w, 0, 1);
    w.units.push({id: "u1", slot: 1, type: "silo", lng: MOSCOW.lng, lat: MOSCOW.lat, hp: UNITS.silo.hp});
    return {w, frame: frameFor(w, 0)};
}

const WAR_PLANS = {1: {foe: 1, goal: "attritional", targets: ["strike", "airdef"], phase: "opening", state: "opening"}};

const distTo = (spot, city) => haversine(spot.lng, spot.lat, city.lng, city.lat);

describe("makePlacer — defense siting", () => {
    it("test_defense_lands_inside_own_political_border", () => {
        const {w, frame} = atWarUS();
        const spot = makePlacer(w, frame, WAR_PLANS)("battery");
        expect(spot).not.toBeNull();
        expect(inOwnCountry(w, 0, spot.lng, spot.lat)).toBe(true);
    });

    it("test_defense_sites_near_the_threatened_high_value_city", () => {
        const {w, frame} = atWarUS();
        const place = makePlacer(w, frame, WAR_PLANS);
        // Terminal layer answers total pressure; THAAD walks the ballistic-only
        // gap filter — both must converge on the pressed coastal capital, not
        // the untouched interior city.
        for (const type of ["battery", "thaad"]) {
            const spot = place(type);
            expect(spot).not.toBeNull();
            expect(distTo(spot, NYC)).toBeLessThan(600);
            expect(distTo(spot, NYC)).toBeLessThan(distTo(spot, DENVER));
        }
    });
});

describe("makePlacer — industry and command", () => {
    it("test_industry_hides_in_country_on_the_quietest_ground", () => {
        const {w, frame} = atWarUS();
        const spot = makePlacer(w, frame, WAR_PLANS)("factory");
        expect(spot).not.toBeNull();
        expect(inOwnCountry(w, 0, spot.lng, spot.lat)).toBe(true);
        // The interior city draws less silo pressure than the coastal capital,
        // so the techbase anchors there.
        expect(distTo(spot, DENVER)).toBeLessThan(distTo(spot, NYC));
    });

    it("test_bunker_sits_in_country_deeper_than_the_defense_line", () => {
        const {w, frame} = atWarUS();
        const place = makePlacer(w, frame, WAR_PLANS);
        const defense = place("battery");
        const bunker = place("bunker");
        expect(bunker).not.toBeNull();
        expect(inOwnCountry(w, 0, bunker.lng, bunker.lat)).toBe(true);
        // The command bunker hides in the quiet half of the country — farther
        // from the enemy-facing front city than the defense emplacement.
        expect(distTo(bunker, NYC)).toBeGreaterThan(distTo(defense, NYC));
        expect(distTo(bunker, DENVER)).toBeLessThan(distTo(bunker, NYC));
    });

    it("test_offense_lands_inside_own_political_border", () => {
        const {w, frame} = atWarUS();
        const spot = makePlacer(w, frame, WAR_PLANS)("silo");
        expect(spot).not.toBeNull();
        expect(inOwnCountry(w, 0, spot.lng, spot.lat)).toBe(true);
    });
});

describe("makePlacer — naval siting", () => {
    it("test_coastal_nation_gets_a_sea_spot_inside_territory", () => {
        const {w, frame} = atWarUS();
        const spot = makePlacer(w, frame, WAR_PLANS)("destroyer");
        expect(spot).not.toBeNull();
        expect(isSea(spot.lng, spot.lat)).toBe(true);
        // Water, so never "own country" — but staged off the coastal city, not
        // teleported to some far shore.
        expect(distTo(spot, NYC)).toBeLessThan(distTo(spot, DENVER));
    });

    it("test_landlocked_nation_skips_naval_builds", () => {
        const w = fresh();
        const frame = frameFor(w, 2);       // Niger — Agadez is deep Sahara
        expect(makePlacer(w, frame, {})("destroyer")).toBeNull();
    });
});

describe("makePlacer — degenerate nation", () => {
    it("test_nation_with_no_cities_places_nothing", () => {
        const w = fresh();
        const frame = frameFor(w, 3);       // no cities anywhere
        const place = makePlacer(w, frame, {});
        expect(place("battery")).toBeNull();
        expect(place("factory")).toBeNull();
        expect(place("destroyer")).toBeNull();
    });
});
