// The two point-defense additions: the C-RAM close-in gun and the Laser
// Defense Grid. Locks in their build gates, their engage geometry via the
// engine, and the Laser's defining economics (expensive upfront, cheap to
// run). Deterministic, no RNG, no I/O.
import {describe, expect, it} from "vitest";
import {defenseMinRange, defenseRange} from "../../../src/game/engine.js";
import {UNITS, UNIT_ICON} from "../../../src/game/data/constants.js";
import {TECHS} from "../../../src/game/data/techs.js";

function world() {
    return {nations: [{slot: 0, alive: true, relations: {}}], units: [], cities: []};
}

const unit = (type) => ({id: "u", slot: 0, type, lng: 0, lat: 0, hp: 100});

describe("C-RAM", () => {
    const cram = UNITS.cram;
    it("test_registered_as_gated_defense", () => {
        expect(cram.kind).toBe("defense");
        expect(cram.requiresTech).toBe("def4");
        expect(TECHS[cram.requiresTech]).toBeTruthy();
        expect(UNIT_ICON.cram).toBe("cram");
    });
    it("test_shortest_reach_of_the_gun_defenses", () => {
        // A close-in gun: the tightest engage range of any defense unit.
        const defenseRanges = Object.values(UNITS)
            .filter((u) => u.kind === "defense")
            .map((u) => u.range);
        expect(cram.range).toBe(Math.min(...defenseRanges));
        expect(defenseMinRange(world(), unit("cram"))).toBe(0);
    });
    it("test_fastest_and_cheapest_to_re_engage", () => {
        // Gatling gun: fires back faster and cheaper per burst than the SAMs.
        expect(cram.reload).toBeLessThan(UNITS.battery.reload);
        expect(cram.fireCost).toBeLessThan(UNITS.battery.fireCost);
    });
    it("test_engages_inside_its_range", () => {
        const w = world(), c = unit("cram");
        expect(defenseRange(w, c)).toBe(cram.range);
        expect(cram.range).toBeGreaterThan(0);
    });
});

describe("Laser Defense Grid", () => {
    const laser = UNITS.laser;
    const defenses = Object.values(UNITS).filter((u) => u.kind === "defense");
    it("test_registered_as_gated_anti_ballistic_defense", () => {
        expect(laser.kind).toBe("defense");
        expect(laser.antiBallistic).toBe(true);
        expect(laser.requiresTech).toBe("def10");
        expect(TECHS.def10.unlocks).toBe("laser");
        expect(UNIT_ICON.laser).toBe("laser");
    });
    it("test_most_expensive_defense_to_build", () => {
        const maxCost = Math.max(...defenses.map((u) => u.cost));
        expect(laser.cost).toBe(maxCost);
    });
    it("test_cheapest_defense_to_run", () => {
        // The whole point: costs the most upfront yet drains the least over time.
        const minUpkeep = Math.min(...defenses.map((u) => u.upkeep));
        const minFireCost = Math.min(...defenses.map((u) => u.fireCost));
        expect(laser.upkeep).toBe(minUpkeep);
        expect(laser.fireCost).toBe(minFireCost);
    });
    it("test_engages_across_its_full_reach", () => {
        const w = world(), l = unit("laser");
        expect(defenseRange(w, l)).toBe(laser.range);
        // Line-of-sight energy weapon: no inner keep-out like an area ABM.
        expect(defenseMinRange(w, l)).toBe(0);
    });
});
