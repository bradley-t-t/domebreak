// inControlledTerritory — buildable land = your political border PLUS land you
// have CONQUERED (annexed from a neutral or captured in war), and NOTHING you
// haven't. The last part is the regression guard: a point inside a neighbour's
// intact country must NOT become buildable just because your border city is the
// nearest one (the old Voronoi leak). It flips to buildable only once you hold a
// city inside that same country — i.e. after you take the province.
//
// Real geographies, because the gate rasterizes real countries. Deterministic.
import {describe, expect, it} from "vitest";
import {countryGidAt, inControlledTerritory, inTerritory} from "../../../src/game/engine.js";

const US_POINT = {lng: -106.75, lat: 32.1};    // inside the USA
const MX_CITY = {lng: -106.6, lat: 31.4};      // inside MEX, ~80 km south
const US_CITY_FAR = {lng: -104.99, lat: 39.74}; // Denver, ~865 km from US_POINT

// slot 0 = USA, slot 1 = Mexico. Mexico's only city is nearer to US_POINT than
// the USA's interior city.
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

describe("inControlledTerritory — home country", () => {
    it("test_nation_controls_its_own_soil", () => {
        expect(inControlledTerritory(borderWorld(), 0, US_POINT.lng, US_POINT.lat)).toBe(true);
    });
    it("test_ocean_is_not_controlled_land", () => {
        expect(inControlledTerritory(borderWorld(), 0, -140, 20)).toBe(false);
    });
});

describe("inControlledTerritory — the cross-border leak stays closed", () => {
    it("test_neighbour_may_not_build_across_an_intact_frontier", () => {
        const w = borderWorld();
        // The Voronoi rule WOULD have let Mexico in (its city is nearest)...
        expect(inTerritory(w, 1, US_POINT.lng, US_POINT.lat)).toBe(true);
        // ...but inControlledTerritory refuses: US_POINT is in the USA and Mexico
        // holds no city inside the USA, so it hasn't conquered that ground.
        expect(inControlledTerritory(w, 1, US_POINT.lng, US_POINT.lat)).toBe(false);
    });
});

describe("inControlledTerritory — conquered land becomes buildable", () => {
    it("test_holding_a_city_inside_a_country_unlocks_the_land_around_it", () => {
        const w = borderWorld();
        // Mexico annexes/captures a province INSIDE the USA — model it by giving
        // slot 1 a city sitting on US soil near US_POINT.
        const annexed = {lng: -106.7, lat: 32.0};
        expect(countryGidAt(annexed.lng, annexed.lat)).toBe("USA");
        w.cities.push({slot: 1, alive: true, ...annexed});
        // Now the nearest city to US_POINT is Mexico's, and it sits in the USA just
        // like US_POINT — so Mexico controls (can build on) that conquered ground.
        expect(inControlledTerritory(w, 1, US_POINT.lng, US_POINT.lat)).toBe(true);
        // But a US point far from the annexed city (nearest city still the USA's)
        // is not Mexico's to build on.
        expect(inControlledTerritory(w, 1, US_CITY_FAR.lng, US_CITY_FAR.lat)).toBe(false);
    });
});
