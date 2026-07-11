// The Orbital Laser is a dual-use directed-energy satellite: a boost-phase
// interceptor (kind:"defense") that can ALSO be tasked on a Battle Plan against
// surface targets (canAttack). This pins that opt-in — it must surface as a
// plannable attacker, accept a commandAttack order, and land instant,
// non-interceptable (directed-energy) damage when it fires — while staying a
// defense-kind unit so its interceptor role is untouched.
import {describe, expect, it} from "vitest";
import {planAttackerTypeOptions, commandAttack, UNITS, isAttacker} from "../../../src/game/engine.js";
import {stepMovement} from "../../../src/game/sim/tickPhases.js";
import {TECHS} from "../../../src/game/data/techs.js";

// Nation 0 = me, all tech done (matching createWorld's baseline), so build gating
// reduces to the requiresUnit (Space Command HQ) prerequisite.
function optionWorld(over = {}) {
    return {
        nations: [{slot: 0, name: "Me", research: {done: Object.keys(TECHS)}, prod: {current: null, queue: []}}],
        cities: [],
        units: [],
        ...over,
    };
}

const unit = (id, type, over = {}) => ({id, slot: 0, type, hp: 90, lng: 0, lat: 0, ...over});

describe("orbital laser as a plan attacker", () => {
    it("test_laser_is_an_attacker_but_still_defense_kind", () => {
        // The classification is unchanged (still a defender/interceptor); it merely
        // opts into being taskable as an attacker.
        expect(UNITS.orbitallaser.kind).toBe("defense");
        expect(isAttacker(UNITS.orbitallaser)).toBe(true);
    });

    it("test_options_include_laser_when_space_hq_stands", () => {
        // Space Command HQ standing → the laser is buildable, so it is plannable even
        // before one reaches orbit (same rule as the orbital strike platform).
        const w = optionWorld({units: [unit("hq", "spacehq")]});
        expect(planAttackerTypeOptions(w, 0)).toContain("orbitallaser");
    });

    it("test_options_hide_laser_without_space_hq", () => {
        // No Space Command HQ anywhere → the laser can't be built or planned.
        expect(planAttackerTypeOptions(optionWorld(), 0)).not.toContain("orbitallaser");
    });

    it("test_command_attack_accepts_the_laser", () => {
        const w = {
            nations: [{slot: 0, relations: {1: "war"}}, {slot: 1, relations: {0: "war"}}],
            units: [unit("l1", "orbitallaser"), {id: "e1", slot: 1, type: "silo", lng: 0, lat: 0, hp: 60}],
            cities: [],
        };
        expect(commandAttack(w, "l1", "e1")).toEqual({ok: true});
        expect(w.units[0].targetId).toBe("e1");
    });
});

describe("orbital laser offensive fire", () => {
    // A lone laser over an enemy silo, at war, already tasked. Directed energy is
    // instant: firing must debit the target's HP with no lofted, interceptable round.
    function theatre() {
        return {
            time: 0,
            events: [],
            projectiles: [],
            nations: [{slot: 0, relations: {1: "war"}}, {slot: 1, relations: {0: "war"}}],
            units: [
                {id: "l1", slot: 0, type: "orbitallaser", lng: 0, lat: 0, hp: 90, cooldown: 0, targetId: "e1"},
                {id: "e1", slot: 1, type: "silo", lng: 0, lat: 0, hp: 60, cooldown: 0},
            ],
            cities: [],
        };
    }

    it("test_laser_deals_directed_energy_damage_on_its_target", () => {
        const w = theatre();
        stepMovement(w, 1);
        expect(w.units[1].hp).toBe(60 - UNITS.orbitallaser.damage);
    });

    it("test_laser_fires_no_interceptable_projectile", () => {
        // Speed-of-light: instant hit, nothing enters the projectile/interception loop.
        const w = theatre();
        stepMovement(w, 1);
        expect(w.projectiles).toHaveLength(0);
    });

    it("test_laser_goes_on_cooldown_after_firing", () => {
        const w = theatre();
        stepMovement(w, 1);
        expect(w.units[0].cooldown).toBe(UNITS.orbitallaser.reload);
    });
});
