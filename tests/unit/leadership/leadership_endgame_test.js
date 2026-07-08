// Leadership endgame: capturing an unsheltered leader city kills its command (it
// does NOT defect to the conqueror), capturing the Leadership Bunker decapitates its
// owner outright, and a fully-decapitated nation surrenders every war and is
// eliminated from the match. Deterministic — capture and decapitation are pure
// functions of positions, ownership, war state, and dt (no RNG, no I/O).
import {describe, expect, it} from "vitest";
import {captureTick} from "../../../src/game/sim/occupation.js";
import {decapitationTick} from "../../../src/game/sim/warResolution.js";
import {atWar} from "../../../src/game/sim/queries.js";

// Two belligerents at war. slot 0 is the player (loser), slot 1 the invader. A big dt
// (past CAPTURE.captureSec = 22s) drives a held, uncontested capture to completion in
// a single tick, so the test asserts the outcome without a hold loop.
function warWorld({cities, units, lead0}) {
    return {
        time: 0, _id: 0, mySlot: 0, events: [], warPopups: [], pendingPeace: [], pendingAlliance: [],
        nations: [
            {slot: 0, name: "A", alive: true, active: true, relations: {1: "war"}, _warStart: {1: 0}, lead: lead0},
            {slot: 1, name: "B", alive: true, active: true, relations: {0: "war"}, _warStart: {0: 0}, lead: {total: 12, lost: 0, sheltered: 0}},
        ],
        cities,
        units,
    };
}

describe("capture kills exposed leadership", () => {
    it("test_capturing_a_leader_city_kills_its_leaders_for_the_loser", () => {
        const w = warWorld({
            cities: [{id: "c1", slot: 0, alive: true, state: "S", pop: 100, leaders: 5, lng: 0, lat: 0}],
            units: [{id: "inf", slot: 1, type: "infantry", hp: 100, lng: 0.1, lat: 0}],
            lead0: {total: 12, lost: 0, sheltered: 0},
        });
        captureTick(w, 30);
        const c1 = w.cities[0];
        expect(c1.slot).toBe(1);                 // province flipped to the invader
        expect(c1.leaders).toBe(0);              // leaders did NOT transfer
        expect(w.nations[0].lead.lost).toBe(5);  // they were killed, credited to the loser
        expect(w.events.some((e) => e.type === "leadership" && e.captured && e.slot === 0)).toBe(true);
    });
});

describe("capturing the bunker decapitates the owner", () => {
    it("test_infantry_capturing_the_bunker_wipes_all_leadership_and_drops_it", () => {
        const w = warWorld({
            cities: [{id: "c0", slot: 0, alive: true, state: "S", pop: 100, leaders: 0, lng: 9, lat: 9}],
            units: [
                {id: "bunk", slot: 0, type: "bunker", hp: 220, lng: 0, lat: 0},
                {id: "inf", slot: 1, type: "infantry", hp: 100, lng: 0.1, lat: 0},
            ],
            lead0: {total: 12, lost: 0, sheltered: 12},
        });
        captureTick(w, 30);
        const bunk = w.units.find((u) => u.id === "bunk");
        expect(bunk.hp).toBe(0);                     // the bunker falls with its command
        expect(w.nations[0].lead.lost).toBe(12);     // total decapitation
        expect(w.nations[0].lead.sheltered).toBe(0);
        expect(w.events.some((e) => e.type === "captured" && e.bunker && e.fromSlot === 0)).toBe(true);
    });
});

describe("decapitation ends the match for the decapitated nation", () => {
    it("test_fully_decapitated_nation_surrenders_all_wars_and_is_eliminated", () => {
        const w = warWorld({
            cities: [{id: "c0", slot: 0, alive: true, state: "S", pop: 100, leaders: 0, lng: 0, lat: 0}],
            units: [],
            lead0: {total: 12, lost: 12, sheltered: 0},   // already wiped out
        });
        expect(atWar(w, 0, 1)).toBe(true);
        decapitationTick(w);
        expect(w.nations[0].alive).toBe(false);       // eliminated
        expect(atWar(w, 0, 1)).toBe(false);           // war ended (foe won)
        expect(w.events.some((e) => e.type === "conquest" && e.loser === 0 && e.decapitated)).toBe(true);
    });

    it("test_nation_with_surviving_leadership_is_not_eliminated", () => {
        const w = warWorld({
            cities: [{id: "c0", slot: 0, alive: true, state: "S", pop: 100, leaders: 3, lng: 0, lat: 0}],
            units: [],
            lead0: {total: 12, lost: 9, sheltered: 0},   // 3 leaders still alive
        });
        decapitationTick(w);
        expect(w.nations[0].alive).toBe(true);
        expect(atWar(w, 0, 1)).toBe(true);
    });
});
