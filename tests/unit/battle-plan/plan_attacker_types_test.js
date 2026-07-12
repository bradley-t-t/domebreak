// Battle Planning attacker-type availability — the options the screen's picker offers.
// A plan is intent, so availability is broader than ownership: owned live platforms,
// platforms on the production line, and types whose build prerequisites are met all
// count; individual aircraft never do (they're commanded through their airbase).
// Regression coverage for orbital strike platforms, which are planned around long
// before the first one reaches orbit.
import {describe, expect, it} from "vitest";
import {planAttackerTypeOptions} from "../../../src/game/engine.js";
import {TECHS} from "../../../src/game/data/techs.js";

// Nation 0 = me, with every tech done (matching createWorld's all-unlocked baseline).
// Fixtures only carry what unitLockReason and the option scan read.
function world(over = {}) {
    return {
        nations: [{slot: 0, name: "Me", research: {done: Object.keys(TECHS)}, prod: {current: null, queue: []}}],
        cities: [],
        units: [],
        ...over,
    };
}

const unit = (id, type, over = {}) => ({id, slot: 0, type, hp: 60, lng: 0, lat: 0, ...over});

describe("battle-plan attacker-type options", () => {
    it("test_options_include_owned_live_offense_types", () => {
        const w = world({units: [unit("o1", "orbitalstrike")]});
        expect(planAttackerTypeOptions(w, 0)).toContain("orbitalstrike");
    });

    it("test_options_include_buildable_but_unowned_types", () => {
        // Space Command HQ standing → orbital strike is buildable, so it's plannable
        // even though none has been built yet.
        const w = world({units: [unit("hq", "spacehq")]});
        expect(planAttackerTypeOptions(w, 0)).toContain("orbitalstrike");
    });

    it("test_options_hide_types_whose_prerequisite_is_missing", () => {
        // No Space Command HQ anywhere → orbital strike can't be built or planned.
        expect(planAttackerTypeOptions(world(), 0)).not.toContain("orbitalstrike");
    });

    it("test_options_include_types_on_the_production_line", () => {
        // The paid-for platform on the line counts even while its prerequisite HQ is
        // itself still building (so nothing is technically buildable yet).
        const w = world();
        w.nations[0].prod.queue.push({kind: "unit", type: "orbitalstrike", lng: 0, lat: 0, paid: 1100});
        expect(planAttackerTypeOptions(w, 0)).toContain("orbitalstrike");
    });

    it("test_options_always_offer_ungated_platforms", () => {
        // Silos and TELs have no build prerequisites — plannable from the first tick.
        const opts = planAttackerTypeOptions(world(), 0);
        expect(opts).toContain("silo");
        expect(opts).toContain("launcher");
    });

    it("test_options_exclude_individual_aircraft_and_offer_the_airstrip", () => {
        // Aircraft are commanded through their airbase, never as standalone plan
        // units: even an airborne jet is left out, while the airstrip (which sorties
        // the bombers) is the offensive air platform a plan actually controls.
        const flying = world({units: [unit("base", "airstrip"), unit("j1", "multirole", {baseId: "base", alt: 1})]});
        const opts = planAttackerTypeOptions(flying, 0);
        expect(opts).not.toContain("multirole");
        expect(opts).toContain("airstrip");
    });

    it("test_options_keep_a_type_an_existing_plan_selected", () => {
        // Every platform of a selected type died and its prerequisite fell — the plan's
        // selection stays visible so the player can still see and unpick it.
        const plans = [{attackerTypes: ["orbitalstrike"]}];
        expect(planAttackerTypeOptions(world(), 0, plans)).toContain("orbitalstrike");
    });

    it("test_options_ignore_enemy_and_dead_units", () => {
        const w = world({units: [unit("e1", "orbitalstrike", {slot: 1}), unit("d1", "orbitalstrike", {hp: 0})]});
        expect(planAttackerTypeOptions(w, 0)).not.toContain("orbitalstrike");
    });
});
