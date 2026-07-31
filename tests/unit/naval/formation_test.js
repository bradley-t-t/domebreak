// Naval formation station-keeping (sim/formation.js) and the follow orders that
// drive it. A following ship steams to a doctrinal station off its guide, holds
// there when the guide is idle, and is freed the instant its guide is gone.
// Deterministic — no RNG.
import {describe, expect, it} from "vitest";
import {createWorld, haversine, setFollow, setSail, stopFollow, step, UNITS} from "../../../src/game/engine.js";
import {bearing} from "../../../src/game/geo/geo.js";
import {stationRoleOf} from "../../../src/game/sim/formation.js";
import {FORMATION} from "../../../src/game/data/constants.js";

// A mid-Atlantic sandbox — every coordinate below is open ocean.
function seaWorld() {
    return createWorld({
        mySlot: 0, seed: 3,
        nations: [
            {slot: 0, name: "A", iso: "USA", isAi: false, gdp: 5},
            {slot: 1, name: "B", iso: "RUS", isAi: false, gdp: 5},
        ],
        cities: [
            {id: "a1", slot: 0, name: "ACap", cap: 1, pop: 100, econ: 1, lng: -60, lat: 40},
            {id: "b1", slot: 1, name: "BCap", cap: 1, pop: 100, econ: 1, lng: 40, lat: 40},
        ],
        rules: {playerGraceSec: 0},
    });
}

const ship = (o) => ({
    id: o.id, slot: o.slot ?? 0, type: o.type, hp: UNITS[o.type].hp,
    lng: o.lng, lat: o.lat, cooldown: 0, targetId: null, warhead: null, ...o,
});

// Advance only the motion phases (formation logic lives in stepMovement) N times.
function steam(w, ticks, dt = 0.5) {
    for (let i = 0; i < ticks; i++) step(w, dt, true);
}

describe("stationRoleOf — doctrinal buckets by hull", () => {
    it("test_roles", () => {
        expect(stationRoleOf("destroyer")).toBe("screen");
        expect(stationRoleOf("cruiser")).toBe("inner");
        expect(stationRoleOf("battleship")).toBe("stern");
        expect(stationRoleOf("carrier")).toBe("hvu");
        expect(stationRoleOf("amphib")).toBe("hvu");
        expect(stationRoleOf("sub-ssn")).toBe("van");
    });
});

describe("setFollow — validation", () => {
    it("test_rejects_non_ship_follower", () => {
        const w = seaWorld();
        w.units.push(ship({id: "tank", type: "tank", lng: -50, lat: 30}));
        w.units.push(ship({id: "dd", type: "destroyer", lng: -40, lat: 30}));
        expect(setFollow(w, 0, "tank", "dd").error).toBeTruthy();
    });

    it("test_rejects_following_self", () => {
        const w = seaWorld();
        w.units.push(ship({id: "dd", type: "destroyer", lng: -40, lat: 30}));
        expect(setFollow(w, 0, "dd", "dd").error).toBeTruthy();
    });

    it("test_rejects_a_non_ship_guide", () => {
        const w = seaWorld();
        w.units.push(ship({id: "dd", type: "destroyer", lng: -40, lat: 30}));
        w.units.push(ship({id: "tank", type: "tank", lng: -40, lat: 31}));
        expect(setFollow(w, 0, "dd", "tank").error).toBeTruthy();
    });

    it("test_rejects_a_guide_owned_by_another_nation", () => {
        const w = seaWorld();
        w.units.push(ship({id: "dd", type: "destroyer", lng: -40, lat: 30}));
        w.units.push(ship({id: "enemy", slot: 1, type: "cruiser", lng: -40, lat: 31}));
        expect(setFollow(w, 0, "dd", "enemy").error).toBeTruthy();
    });

    it("test_rejects_a_follow_cycle", () => {
        const w = seaWorld();
        w.units.push(ship({id: "a", type: "destroyer", lng: -40, lat: 30}));
        w.units.push(ship({id: "b", type: "cruiser", lng: -41, lat: 30}));
        expect(setFollow(w, 0, "a", "b")).toEqual({ok: true});
        // b following a would close the loop a->b->a.
        expect(setFollow(w, 0, "b", "a").error).toBeTruthy();
    });

    it("test_valid_follow_sets_followId_and_clears_any_sail_order", () => {
        const w = seaWorld();
        w.units.push(ship({id: "carrier", type: "carrier", lng: -40, lat: 30}));
        w.units.push(ship({id: "dd", type: "destroyer", lng: -42, lat: 30, dest: {lng: -42, lat: 32}, route: [{lng: -42, lat: 32}]}));
        expect(setFollow(w, 0, "dd", "carrier")).toEqual({ok: true});
        const dd = w.units.find((u) => u.id === "dd");
        expect(dd.followId).toBe("carrier");
        expect(dd.dest).toBeNull();
        expect(dd.route).toBeNull();
    });
});

describe("station-keeping", () => {
    it("test_follower_closes_on_its_station_and_holds", () => {
        const w = seaWorld();
        w.units.push(ship({id: "carrier", type: "carrier", lng: -40, lat: 30, face: {lng: -40, lat: 31}}));
        // Start the escort far off; it should steam in and settle in the screen.
        w.units.push(ship({id: "dd", type: "destroyer", lng: -45, lat: 30}));
        setFollow(w, 0, "dd", "carrier");
        steam(w, 60);
        const carrier = w.units.find((u) => u.id === "carrier");
        const dd = w.units.find((u) => u.id === "dd");
        const d = haversine(dd.lng, dd.lat, carrier.lng, carrier.lat);
        // It parks in the destroyer screen ring, not on top of the guide.
        expect(d).toBeLessThan(FORMATION.destroyerKm + FORMATION.holdKm + 5);
        expect(d).toBeGreaterThan(5);
    });

    it("test_follower_chases_a_moving_guide", () => {
        const w = seaWorld();
        w.units.push(ship({id: "carrier", type: "carrier", lng: -40, lat: 30}));
        w.units.push(ship({id: "dd", type: "destroyer", lng: -40.3, lat: 30}));
        setFollow(w, 0, "dd", "carrier");
        // Steam the carrier a long way east; the escort must stay in company.
        setSail(w, 0, "carrier", -20, 30);
        steam(w, 400);
        const carrier = w.units.find((u) => u.id === "carrier");
        const dd = w.units.find((u) => u.id === "dd");
        expect(carrier.lng).toBeGreaterThan(-25); // guide made good most of the leg
        expect(haversine(dd.lng, dd.lat, carrier.lng, carrier.lat)).toBeLessThan(FORMATION.destroyerKm + 30);
    });

    it("test_a_dead_guide_frees_its_followers", () => {
        const w = seaWorld();
        w.units.push(ship({id: "carrier", type: "carrier", lng: -40, lat: 30}));
        w.units.push(ship({id: "dd", type: "destroyer", lng: -41, lat: 30}));
        setFollow(w, 0, "dd", "carrier");
        w.units.find((u) => u.id === "carrier").hp = 0; // guide destroyed
        steam(w, 1);
        expect(w.units.find((u) => u.id === "dd").followId).toBeNull();
    });

    it("test_manual_sail_order_breaks_formation", () => {
        const w = seaWorld();
        w.units.push(ship({id: "carrier", type: "carrier", lng: -40, lat: 30}));
        w.units.push(ship({id: "dd", type: "destroyer", lng: -41, lat: 30}));
        setFollow(w, 0, "dd", "carrier");
        setSail(w, 0, "dd", -35, 30);
        expect(w.units.find((u) => u.id === "dd").followId).toBeNull();
    });

    it("test_stopFollow_clears_the_order", () => {
        const w = seaWorld();
        w.units.push(ship({id: "carrier", type: "carrier", lng: -40, lat: 30}));
        w.units.push(ship({id: "dd", type: "destroyer", lng: -41, lat: 30}));
        setFollow(w, 0, "dd", "carrier");
        expect(stopFollow(w, 0, "dd")).toEqual({ok: true});
        expect(w.units.find((u) => u.id === "dd").followId).toBeNull();
    });

    it("test_mixed_group_fans_into_a_wedge_not_a_line", () => {
        // A screen must spread across a wide span of bearings around the guide.
        // The failure mode this guards is one hull of each type landing on the
        // guide's centerline (every bearing 0 or 180), which forms a straight
        // line instead of a wedge.
        const w = seaWorld();
        w.units.push(ship({id: "cv", type: "carrier", lng: -40, lat: 30, face: {lng: -40, lat: 31}})); // heading north
        const escorts = [["dd1", "destroyer"], ["dd2", "destroyer"], ["cg", "cruiser"], ["bb", "battleship"], ["ssn", "sub-ssn"]];
        const starts = [[-41, 28.9], [-39, 28.8], [-40.5, 28.7], [-41.5, 28.6], [-39.5, 28.5]];
        escorts.forEach(([id, type], i) => w.units.push(ship({id, type, lng: starts[i][0], lat: starts[i][1]})));
        for (const [id] of escorts) setFollow(w, 0, id, "cv");
        steam(w, 90);
        const cv = w.units.find((u) => u.id === "cv");
        const bearings = escorts.map(([id]) => {
            const u = w.units.find((x) => x.id === id);
            return bearing(cv.lng, cv.lat, u.lng, u.lat);
        });
        // Both arms of the wedge are occupied — starboard (bearings ~0-170) and port
        // (~190-350). A centerline line could never satisfy both; every ship would
        // share bearing 0 or 180.
        const hasStarboard = bearings.some((b) => b > 5 && b < 175);
        const hasPort = bearings.some((b) => b > 185 && b < 355);
        expect(hasStarboard).toBe(true);
        expect(hasPort).toBe(true);
    });
});
