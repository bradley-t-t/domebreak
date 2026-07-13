// Offensive aircraft system: airstrip bomber sorties, air-to-air homing missiles,
// the strike flight mission, engagement stances, and the Battle-Plan integration
// for sortie platforms. Deterministic — no RNG; world time is driven by hand.
import {describe, expect, it} from "vitest";
import {advanceHoming, nearestEnemyTarget} from "../../../src/game/sim/combat.js";
import {launchStrikeSortie} from "../../../src/game/sim/aircraft.js";
import {flyStrike} from "../../../src/game/sim/flight.js";
import {setStance} from "../../../src/game/sim/production.js";
import {reachKm, shotDamage} from "../../../src/game/sim/battlePlan.js";
import {STRIKE, UNITS} from "../../../src/game/data/constants.js";
import {haversine} from "../../../src/game/geo/geo.js";

// Two nations at war (slot 0 vs slot 1) plus the arrays the sim touches.
function war(units = [], cities = []) {
    return {
        time: 0, _id: 0, events: [], projectiles: [], effects: [],
        nations: [
            {slot: 0, alive: true, relations: {1: "war"}},
            {slot: 1, alive: true, relations: {0: "war"}},
        ],
        units, cities,
    };
}

describe("nearestEnemyTarget", () => {
    it("test_picks_the_closest_at_war_enemy", () => {
        const me = {slot: 0, lng: 0, lat: 0};
        const w = war([
            {id: "far", slot: 1, type: "tank", hp: 10, lng: 0, lat: 3},
            {id: "near", slot: 1, type: "tank", hp: 10, lng: 0, lat: 1},
        ]);
        expect(nearestEnemyTarget(w, me, 5000).id).toBe("near");
    });

    it("test_ignores_friendly_neutral_and_out_of_range", () => {
        const me = {slot: 0, lng: 0, lat: 0};
        const w = war([
            {id: "friend", slot: 0, type: "tank", hp: 10, lng: 0, lat: 0.2},
            {id: "toofar", slot: 1, type: "tank", hp: 10, lng: 0, lat: 40},
        ]);
        // Nearest enemy is 40° (~4400 km) away — outside a 1000 km scan.
        expect(nearestEnemyTarget(w, me, 1000)).toBe(null);
    });

    it("test_can_exclude_aircraft_so_bombers_hit_ground", () => {
        const me = {slot: 0, lng: 0, lat: 0};
        const w = war([
            {id: "jet", slot: 1, type: "multirole", hp: 10, lng: 0, lat: 1},
            {id: "base", slot: 1, type: "factory", hp: 10, lng: 0, lat: 2},
        ]);
        expect(nearestEnemyTarget(w, me, 5000, {includeAircraft: false}).id).toBe("base");
    });

    it("test_never_targets_the_bunker", () => {
        const me = {slot: 0, lng: 0, lat: 0};
        const w = war([{id: "bunker", slot: 1, type: "bunker", hp: 10, lng: 0, lat: 1}]);
        expect(nearestEnemyTarget(w, me, 5000)).toBe(null);
    });
});

describe("advanceHoming (air-to-air missile)", () => {
    it("test_tracks_and_destroys_an_enemy_aircraft", () => {
        const jet = {id: "jet", slot: 1, type: "multirole", hp: 20, lng: 0, lat: 1, alt: 1};
        const w = war([jet]);
        const p = {
            id: "p1", homing: true, muni: "a2a", slot: 0, by: "e", targetId: "jet",
            damage: 40, speed: 140, lng: 0, lat: 0, toLng: 0, toLat: 1,
            dist: haversine(0, 0, 0, 1), travelled: 0, progress: 0,
        };
        for (let i = 0; i < 20 && !p._dead; i++) advanceHoming(w, p, 0.2, undefined);
        expect(p._dead).toBe(true);
        expect(jet.hp).toBeLessThanOrEqual(0);
        // A destroy event was emitted, tagged as the air-to-air munition.
        expect(w.events.some((e) => e.type === "destroy" && e.muni === "a2a")).toBe(true);
    });

    it("test_fizzles_when_the_target_is_already_gone", () => {
        const w = war([]); // no such unit
        const p = {id: "p2", homing: true, muni: "a2a", slot: 0, targetId: "ghost", damage: 40, speed: 140, lng: 0, lat: 0, dist: 100};
        advanceHoming(w, p, 0.2, undefined);
        expect(p._dead).toBe(true);
        expect(w.events.some((e) => e.type === "fizzle")).toBe(true);
    });
});

describe("launchStrikeSortie", () => {
    function stripWorld() {
        return war([{id: "strip", slot: 0, type: "airstrip", hp: 45, lng: 0, lat: 0}]);
    }

    it("test_launches_bombers_and_escorts_from_stock", () => {
        const w = stripWorld();
        const strip = w.units[0];
        const bombers = launchStrikeSortie(w, strip, "tgt");
        expect(bombers.length).toBe(STRIKE.bombersPerSortie);
        const flown = w.units.filter((u) => u.mission?.role === "strike");
        const escorts = w.units.filter((u) => u.mission?.role === "sortieEscort");
        expect(flown.length).toBe(STRIKE.bombersPerSortie);
        expect(escorts.length).toBe(STRIKE.escortsPerSortie);
        // Every launched airframe is the player's, aimed at the tasked target,
        // starts Hostile, and drew down the hangar.
        expect(flown.every((u) => u.slot === 0 && u.mission.targetId === "tgt" && u.stance === "hostile")).toBe(true);
        expect(escorts.every((u) => u.type === "multirole")).toBe(true);
        expect(strip.hangar.bomber).toBe(6 - STRIKE.bombersPerSortie); // HANGAR_SPEC.airstrip.bomber = 6
        expect(strip.sortieCd).toBe(STRIKE.sortieCooldownSec);
    });

    it("test_no_sortie_without_bombers_in_stock", () => {
        const w = stripWorld();
        const strip = w.units[0];
        strip.hangar = {bomber: 0, multirole: 10};
        expect(launchStrikeSortie(w, strip, "tgt")).toBe(null);
        expect(w.units.filter((u) => u.mission).length).toBe(0);
    });
});

describe("flyStrike mission", () => {
    it("test_runs_in_on_the_target_then_recovers_after_its_passes", () => {
        const strip = {id: "strip", slot: 0, type: "airstrip", hp: 45, lng: 0, lat: 0, hangar: {bomber: 0}};
        const city = {id: "c", slot: 1, alive: true, hp: 100, maxHp: 100, lng: 0, lat: 5};
        const w = war([strip], [city]);
        const bomber = {
            id: "b", slot: 0, type: "bomber", hp: 60, lng: 0, lat: 4, alt: 1,
            baseId: "strip", targetId: null,
            mission: {role: "strike", targetId: "c", homeId: "strip", phase: "outbound", passes: 0},
        };
        w.units.push(bomber);
        const before = haversine(bomber.lng, bomber.lat, city.lng, city.lat);
        for (let i = 0; i < 5; i++) flyStrike(w, bomber, UNITS.bomber, 0.4);
        expect(bomber.targetId).toBe("c");                        // mirrored for the fire phase
        expect(haversine(bomber.lng, bomber.lat, city.lng, city.lat)).toBeLessThan(before); // closed in
        // Spend its passes: it breaks off, turns around (turn-rate limited), and
        // makes net progress back toward base — eventually stowing into stock.
        bomber.mission.passes = STRIKE.maxPasses;
        flyStrike(w, bomber, UNITS.bomber, 0.4);
        expect(bomber.mission.phase).toBe("rtb");
        expect(bomber.targetId).toBe(null);
        const apex = haversine(bomber.lng, bomber.lat, strip.lng, strip.lat);
        for (let i = 0; i < 80 && bomber.hp > 0; i++) flyStrike(w, bomber, UNITS.bomber, 0.6);
        // Either it has already stowed (hp 0) or it is now much closer to home.
        expect(bomber.hp <= 0 || haversine(bomber.lng, bomber.lat, strip.lng, strip.lat) < apex).toBe(true);
    });

    it("test_recovers_over_the_pole_instead_of_around_the_globe", () => {
        // A high-latitude strip whose returning bomber is most of a hemisphere
        // away in longitude. The great-circle route home cuts straight over the
        // pole; a flat "shortest change in longitude" heading would instead sweep
        // the bomber the long way around its parallel — the around-the-whole-globe
        // glitch. So the recovery must CLIMB toward the pole, not hold its latitude.
        const strip = {id: "strip", slot: 0, type: "airstrip", hp: 45, lng: 150, lat: 72, hangar: {bomber: 0}};
        const w = war([strip], []);
        const bomber = {
            id: "b", slot: 0, type: "bomber", hp: 60, lng: -30, lat: 72, alt: 1,
            baseId: "strip", targetId: null,
            mission: {role: "strike", targetId: "c", homeId: "strip", phase: "rtb", passes: STRIKE.maxPasses},
        };
        w.units.push(bomber);
        let peakLat = Math.abs(bomber.lat);
        for (let i = 0; i < 400 && bomber.hp > 0; i++) {
            flyStrike(w, bomber, UNITS.bomber, 0.6);
            peakLat = Math.max(peakLat, Math.abs(bomber.lat));
            expect(Math.abs(bomber.lat)).toBeLessThanOrEqual(90); // never an invalid coordinate
        }
        expect(peakLat).toBeGreaterThan(85);   // it went over the top of the world
        expect(bomber.hp).toBeLessThanOrEqual(0); // and made it home to stow
    });

    it("test_committed_bomber_re_targets_when_a_wingmate_kills_its_target", () => {
        // Two enemy targets side by side. A bomber inbound on the first has its
        // target destroyed by a wing-mate while it's still en route — it must press
        // on to the neighbouring target rather than wheeling straight home.
        const strip = {id: "strip", slot: 0, type: "airstrip", hp: 45, lng: 0, lat: 0, hangar: {bomber: 0}};
        const city = {id: "c", slot: 1, alive: true, hp: 100, maxHp: 100, lng: 0, lat: 5};
        const other = {id: "c2", slot: 1, alive: true, hp: 100, maxHp: 100, lng: 1, lat: 5};
        const w = war([strip], [city, other]);
        const bomber = {
            id: "b", slot: 0, type: "bomber", hp: 60, lng: 0, lat: 4, alt: 1,
            baseId: "strip", targetId: null,
            mission: {role: "strike", targetId: "c", homeId: "strip", phase: "outbound", passes: 0},
        };
        w.units.push(bomber);
        flyStrike(w, bomber, UNITS.bomber, 0.4);          // records the run-in point
        city.alive = false;                                // a wing-mate kills the target
        flyStrike(w, bomber, UNITS.bomber, 0.4);
        expect(bomber.mission.phase).not.toBe("rtb");      // did not bug out
        expect(bomber.mission.targetId).toBe("c2");        // pressed on to the neighbour
        expect(bomber.targetId).toBe("c2");
    });

    it("test_committed_bomber_turns_around_when_we_make_peace", () => {
        // We're at war with slot 1 (the target) and slot 2. A bomber inbound on a
        // slot-1 city — with a slot-2 city sitting right beside it — must fly home
        // the moment we make peace with slot 1, NOT divert to the other nation.
        const strip = {id: "strip", slot: 0, type: "airstrip", hp: 45, lng: 0, lat: 0, hangar: {bomber: 0}};
        const city = {id: "c", slot: 1, alive: true, hp: 100, maxHp: 100, lng: 0, lat: 5};
        const neighbour = {id: "c2", slot: 2, alive: true, hp: 100, maxHp: 100, lng: 1, lat: 5};
        const w = {
            time: 0, _id: 0, events: [], projectiles: [], effects: [],
            nations: [
                {slot: 0, alive: true, relations: {1: "war", 2: "war"}},
                {slot: 1, alive: true, relations: {0: "war"}},
                {slot: 2, alive: true, relations: {0: "war"}},
            ],
            units: [strip], cities: [city, neighbour],
        };
        const bomber = {
            id: "b", slot: 0, type: "bomber", hp: 60, lng: 0, lat: 4, alt: 1,
            baseId: "strip", targetId: null,
            mission: {role: "strike", targetId: "c", homeId: "strip", phase: "outbound", passes: 0},
        };
        w.units.push(bomber);
        flyStrike(w, bomber, UNITS.bomber, 0.4);           // records the run-in + its nation
        // White peace with slot 1 (the target's nation); still at war with slot 2.
        w.nations[0].relations[1] = "peace";
        w.nations[1].relations[0] = "peace";
        flyStrike(w, bomber, UNITS.bomber, 0.4);
        expect(bomber.mission.phase).toBe("rtb");           // heading home
        expect(bomber.targetId).toBe(null);
        expect(bomber.mission.targetId).toBe("c");          // never re-tasked onto slot 2
    });

    it("test_committed_bomber_recovers_when_nothing_is_left_to_hit", () => {
        // Sole target dies with no other enemy near the run-in: the bomber has
        // nowhere to press, so it correctly recovers to base.
        const strip = {id: "strip", slot: 0, type: "airstrip", hp: 45, lng: 0, lat: 0, hangar: {bomber: 0}};
        const city = {id: "c", slot: 1, alive: true, hp: 100, maxHp: 100, lng: 0, lat: 5};
        const w = war([strip], [city]);
        const bomber = {
            id: "b", slot: 0, type: "bomber", hp: 60, lng: 0, lat: 4, alt: 1,
            baseId: "strip", targetId: null,
            mission: {role: "strike", targetId: "c", homeId: "strip", phase: "outbound", passes: 0},
        };
        w.units.push(bomber);
        flyStrike(w, bomber, UNITS.bomber, 0.4);
        city.alive = false;
        flyStrike(w, bomber, UNITS.bomber, 0.4);
        expect(bomber.mission.phase).toBe("rtb");
        expect(bomber.targetId).toBe(null);
    });
});

describe("setStance", () => {
    it("test_sets_stance_on_aircraft_and_airbases", () => {
        const w = war([
            {id: "jet", slot: 0, type: "multirole", hp: 40, lng: 0, lat: 0},
            {id: "strip", slot: 0, type: "airstrip", hp: 45, lng: 0, lat: 0},
        ]);
        expect(setStance(w, 0, "jet", "hostile").ok).toBe(true);
        expect(w.units[0].stance).toBe("hostile");
        expect(setStance(w, 0, "strip", "defensive").ok).toBe(true);
        expect(w.units[1].stance).toBe("defensive");
    });

    it("test_rejects_non_aircraft_and_bad_values", () => {
        const w = war([{id: "silo", slot: 0, type: "silo", hp: 60, lng: 0, lat: 0}]);
        expect(setStance(w, 0, "silo", "hostile").error).toBeTruthy();
        const w2 = war([{id: "jet", slot: 0, type: "multirole", hp: 40, lng: 0, lat: 0}]);
        expect(setStance(w2, 0, "jet", "berserk").error).toBeTruthy();
    });
});

describe("battle-plan sortie platform", () => {
    it("test_airstrip_reaches_by_sortie_range_not_footprint", () => {
        const strip = {type: "airstrip"};
        // Hardware sortie reach (4200) capped by the dial, never the 60 km footprint.
        expect(reachKm(null, strip, 99999)).toBe(UNITS.airstrip.sortieKm);
        expect(reachKm(null, strip, 1000)).toBe(1000);
    });

    it("test_airstrip_shot_is_rated_by_the_bomber_package", () => {
        const strip = {type: "airstrip"};
        expect(shotDamage(null, strip)).toBe(UNITS.bomber.damage * STRIKE.bombersPerSortie);
    });
});
