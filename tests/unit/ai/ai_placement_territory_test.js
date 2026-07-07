// AI placement must respect the nation's real POLITICAL border — the same rule
// the human player is bound to — instead of the Voronoi `inTerritory` disk that
// spills across frontiers into a neighbour's (or the player's) land.
//
// Regression for "AI still places units in my territory": near a border, a point
// inside country A can be nearest to country B's city. The old rule
// (`inTerritory`) let B build there (and even barred A from its own soil); the
// new gate (`inOwnCountry`, backed by the rasterized country grid) ties placement
// to the political outline, so only the true owner may build.
//
// Deterministic, no RNG, no I/O — the country grid is a bundled constant.
import {describe, expect, it} from "vitest";
import {countryGidAt, inOwnCountry, inTerritory} from "../../../src/game/engine.js";
import {toGid3} from "../../../src/game/data/iso3.js";

// A US point ~80 km north of the border and a Mexican city just south of it.
const US_POINT = {lng: -106.75, lat: 32.1};        // resolves to USA
const MX_CITY = {lng: -106.6, lat: 31.4};          // resolves to MEX, ~80 km away
const US_CITY_FAR = {lng: -104.99, lat: 39.74};    // Denver, ~865 km from US_POINT

// Two neighbours: slot 0 = United States, slot 1 = Mexico. Mexico's only city
// sits closer to US_POINT than the United States' (interior) city does.
function borderWorld() {
    return {
        nations: [
            {slot: 0, iso: "US", alive: true, relations: {}},
            {slot: 1, iso: "MX", alive: true, relations: {}},
        ],
        cities: [
            {slot: 0, alive: true, ...US_CITY_FAR},
            {slot: 1, alive: true, ...MX_CITY},
        ],
        units: [],
    };
}

describe("countryGidAt — political ownership grid", () => {
    it("test_interior_points_resolve_to_their_country", () => {
        expect(countryGidAt(-98, 39)).toBe("USA");      // Kansas
        expect(countryGidAt(37.6, 55.75)).toBe("RUS");  // Moscow
        expect(countryGidAt(-80, 49)).toBe("CAN");      // Ontario
    });
    it("test_open_ocean_is_unowned", () => {
        expect(countryGidAt(-140, 20)).toBeNull();
        expect(countryGidAt(-30, 30)).toBeNull();
    });
    it("test_grid_agrees_with_nation_iso_mapping", () => {
        // The grid's GID_0 codes are the same alpha-3 the human placement gate
        // compares against (toGid3(nation.iso)).
        expect(countryGidAt(US_POINT.lng, US_POINT.lat)).toBe(toGid3("US"));
        expect(countryGidAt(MX_CITY.lng, MX_CITY.lat)).toBe(toGid3("MX"));
    });
});

describe("inOwnCountry — the AI placement gate", () => {
    it("test_nation_may_build_on_its_own_soil", () => {
        const w = borderWorld();
        expect(inOwnCountry(w, 0, US_POINT.lng, US_POINT.lat)).toBe(true);
    });
    it("test_neighbour_may_not_build_across_the_border", () => {
        const w = borderWorld();
        // The core bug: US_POINT is inside the USA, so Mexico must be refused —
        // even though its city is the nearest one to that point.
        expect(inOwnCountry(w, 1, US_POINT.lng, US_POINT.lat)).toBe(false);
    });
    it("test_ocean_point_is_not_own_country", () => {
        const w = borderWorld();
        expect(inOwnCountry(w, 0, -140, 20)).toBe(false);
    });
});

describe("regression: the Voronoi rule leaked across the border", () => {
    it("test_old_inTerritory_would_have_let_the_neighbour_in", () => {
        const w = borderWorld();
        // Under the OLD gate, the nearest city to US_POINT is Mexico's, within
        // 550 km — so inTerritory permitted Mexico to build on US soil...
        expect(inTerritory(w, 1, US_POINT.lng, US_POINT.lat)).toBe(true);
        // ...and simultaneously barred the United States from its own ground.
        expect(inTerritory(w, 0, US_POINT.lng, US_POINT.lat)).toBe(false);
        // The political-border gate fixes both directions.
        expect(inOwnCountry(w, 1, US_POINT.lng, US_POINT.lat)).toBe(false);
        expect(inOwnCountry(w, 0, US_POINT.lng, US_POINT.lat)).toBe(true);
    });
});
