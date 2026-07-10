// Assessment stage: posture (the one-word strategic stance derived from the
// strength ratio, war state, and decapitation windows), focus (the spending-axis
// weight vector reshaped by enemy force profiles), and warPlan (per-war goals and
// the target categories they imply for the fires solver). Every test builds a
// synthetic two-nation world, derives a real PerceptionFrame from it, and asserts
// on the pure assessment functions. Deterministic — no RNG is consumed.
import {describe, expect, it} from "vitest";
import {UNITS, createWorld} from "../../../src/game/engine.js";
import {buildFrame, capPositions} from "../../../src/game/sim/ai/perception/perception.js";
import {assessPosture} from "../../../src/game/sim/ai/assessment/posture.js";
import {AXES, assessFocus} from "../../../src/game/sim/ai/assessment/focus.js";
import {assessWarPlans} from "../../../src/game/sim/ai/assessment/warPlan.js";
import {TRAITS} from "../../../src/game/sim/ai/personality.js";

// Real ISO codes on real soil: the frame rasterizes borders and probes sea
// access, so cities must sit in their nation's actual country.
const KANSAS = {lng: -98, lat: 39};            // landlocked US interior
const LOS_ANGELES = {lng: -118.24, lat: 34.05}; // US Pacific coast
const MOSCOW = {lng: 37.6, lat: 55.75};        // RU — beyond peacetime war range of Kansas
const OTTAWA = {lng: -75.7, lat: 45.4};        // CA — a near, reachable front (~2000 km)

// slot 0 = the assessing nation, slot 1 = the other side.
function makeWorld({me = {}, foe = {}, war = false} = {}) {
    const w = createWorld({
        mySlot: 0, seed: 7,
        nations: [
            {slot: 0, name: "Aland", iso: me.iso || "US", isAi: false, gdp: me.gdp ?? 5},
            {slot: 1, name: "Bland", iso: foe.iso || "RU", isAi: true, gdp: foe.gdp ?? 5},
        ],
        cities: [
            {id: "a1", slot: 0, name: "A-Cap", state: "AS", cap: 1, pop: 1e6, econ: 1, ...(me.city || KANSAS)},
            {id: "b1", slot: 1, name: "B-Cap", state: "BS", cap: 1, pop: 1e6, econ: 1, ...(foe.city || MOSCOW)},
        ],
        rules: {playerGraceSec: 0},
    });
    if (war) {
        w.nations[0].relations[1] = "war";
        w.nations[1].relations[0] = "war";
        (w.nations[0]._warStart ??= {})[1] = 0;
        (w.nations[1]._warStart ??= {})[0] = 0;
    }
    return w;
}

function addUnits(w, slot, type, count, at) {
    for (let i = 0; i < count; i++) {
        w.units.push({id: `${type}-${slot}-${i}`, slot, type, lng: at.lng + i * 0.4, lat: at.lat, hp: UNITS[type].hp});
    }
}

function frameFor(w, slot = 0) {
    const unitsBySlot = new Map();
    for (const n of w.nations) unitsBySlot.set(n.slot, w.units.filter((u) => u.slot === n.slot && u.hp > 0));
    return buildFrame(w, w.nations.find((n) => n.slot === slot), {unitsBySlot, caps: capPositions(w)});
}

// Explicit personality: every trait 0.5 unless a test overrides it.
function persona(overrides = {}) {
    const p = {};
    for (const t of TRAITS) p[t] = 0.5;
    return {...p, ...overrides};
}

describe("assessPosture — stance from the strength ratio", () => {
    it("test_badly_outgunned_nation_turtles", () => {
        const w = makeWorld({me: {gdp: 1}, foe: {gdp: 20}, war: true});
        const frame = frameFor(w);
        expect(frame.world.strengthRatio).toBeLessThan(0.6);
        const res = assessPosture(frame, persona());
        expect(res.mode).toBe("turtle");
    });

    it("test_even_war_presses", () => {
        const w = makeWorld({war: true});           // equal gdp, no units — ratio 1
        const frame = frameFor(w);
        expect(assessPosture(frame, persona()).mode).toBe("press");
        expect(assessPosture(frame, persona({aggression: 0.9})).mode).toBe("press");
    });

    it("test_blitz_needs_both_superiority_and_aggression", () => {
        const w = makeWorld({me: {gdp: 20}, foe: {gdp: 5}, war: true});
        const frame = frameFor(w);
        expect(frame.world.strengthRatio).toBeGreaterThanOrEqual(1.5);
        expect(assessPosture(frame, persona({aggression: 0.9})).mode).toBe("blitz");
        expect(assessPosture(frame, persona({aggression: 0.3})).mode).toBe("press");
    });

    it("test_peacetime_aggression_splits_hold_vs_press", () => {
        // A near neighbour (within war range) so an opposing bloc exists at peace.
        const w = makeWorld({foe: {iso: "CA", city: OTTAWA}});
        const frame = frameFor(w);
        expect(frame.world.atWar).toBe(false);
        expect(assessPosture(frame, persona()).mode).toBe("hold");
        expect(assessPosture(frame, persona({aggression: 0.9})).mode).toBe("press");
    });

    it("test_broken_enemy_leadership_invites_decap", () => {
        const w = makeWorld({war: true});
        addUnits(w, 0, "silo", 3, KANSAS);          // >= POSTURE.decapStrikeMin strike platforms
        const foe = w.nations[1];
        foe.lead.lost = Math.ceil(foe.lead.total * 0.7);   // leadership pct ~30 < 40
        const frame = frameFor(w);
        expect(frame.world.profiles[1].lead.pct).toBeLessThan(40);
        expect(frame.world.profiles[1].lead.exposed).toBe(true);
        const res = assessPosture(frame, persona({decapFocus: 0.6}));
        expect(res.mode).toBe("decap");
        expect(res.decapFoe).toBe(1);
        expect(res.aggression).toBeGreaterThanOrEqual(0.7);
        // The same window is ignored by a nation without the trait.
        expect(assessPosture(frame, persona({decapFocus: 0.2})).mode).not.toBe("decap");
    });
});

describe("assessFocus — spending axes react to enemy profiles", () => {
    it("test_first_strike_profile_raises_defense_and_radar", () => {
        const hold = {mode: "hold", aggression: 0.5};
        const silos = makeWorld({war: true});
        addUnits(silos, 1, "silo", 8, MOSCOW);      // strike-heavy: reads first-strike
        const balancedW = makeWorld({war: true});
        addUnits(balancedW, 1, "silo", 1, MOSCOW);  // tiny force: reads balanced
        addUnits(balancedW, 1, "battery", 1, MOSCOW);
        const fSilos = frameFor(silos), fBal = frameFor(balancedW);
        expect(fSilos.world.profiles[1].posture).toBe("first-strike");
        expect(fBal.world.profiles[1].posture).toBe("balanced");
        const a = assessFocus(fSilos, hold, persona());
        const b = assessFocus(fBal, hold, persona());
        expect(a.defense).toBeGreaterThan(b.defense);
        expect(a.radar).toBeGreaterThan(b.radar);
    });

    it("test_landlocked_nation_has_zero_navy_axis", () => {
        const w = makeWorld();                       // capital deep in Kansas
        const frame = frameFor(w);
        expect(frame.me.coastal).toBe(false);
        const f = assessFocus(frame, {mode: "hold", aggression: 0.5}, persona());
        expect(f.navy).toBe(0);
    });

    it("test_coastal_nation_keeps_naval_appetite", () => {
        const w = makeWorld({me: {city: LOS_ANGELES}});
        const frame = frameFor(w);
        expect(frame.me.coastal).toBe(true);
        const f = assessFocus(frame, {mode: "hold", aggression: 0.5}, persona());
        expect(f.navy).toBeGreaterThan(0);
    });

    it("test_every_axis_is_bounded_even_under_hot_multipliers", () => {
        const w = makeWorld({war: true});
        addUnits(w, 1, "silo", 8, MOSCOW);           // heavy inbound pressure
        const frame = frameFor(w);
        const maxed = {};
        for (const t of TRAITS) maxed[t] = 1;
        const f = assessFocus(frame, {mode: "blitz", aggression: 1}, maxed);
        for (const k of AXES) {
            expect(f[k]).toBeGreaterThanOrEqual(0);
            expect(f[k]).toBeLessThanOrEqual(2);
        }
    });
});

describe("assessWarPlans — per-war goals and target categories", () => {
    it("test_decap_posture_drives_a_decap_goal_at_command_targets", () => {
        const w = makeWorld({war: true});
        const frame = frameFor(w);
        const plans = assessWarPlans(frame, {mode: "decap", decapFoe: 1, aggression: 0.8}, persona());
        expect(plans[1].goal).toBe("decap");
        expect(plans[1].targets[0]).toBe("command");
        expect(plans[1].targets).toEqual(["command", "sensors", "airdef"]);
    });

    it("test_losing_war_drops_the_decap_dream_for_attrition", () => {
        const w = makeWorld({war: true});
        const frame = frameFor(w);
        frame.diplo.warState[1] = "losing";          // cached lifecycle state says we're bleeding
        const plans = assessWarPlans(frame, {mode: "decap", decapFoe: 1, aggression: 0.8}, persona());
        expect(plans[1].goal).toBe("attritional");
        expect(plans[1].state).toBe("losing");
        expect(plans[1].targets[0]).toBe("strike");  // grind their shooters, not their throne
    });

    it("test_blitz_goes_counter_value_but_a_holding_stance_grinds", () => {
        const w = makeWorld({war: true});            // distant foe: capture is unreachable
        const frame = frameFor(w);
        const blitz = assessWarPlans(frame, {mode: "blitz", aggression: 0.9}, persona());
        expect(blitz[1].goal).toBe("cityStrike");
        expect(blitz[1].targets).toEqual(["city", "strike"]);
        const hold = assessWarPlans(frame, {mode: "hold", aggression: 0.5}, persona());
        expect(hold[1].goal).toBe("attritional");
    });

    it("test_ground_superiority_on_a_reachable_front_goes_capture", () => {
        const w = makeWorld({foe: {iso: "CA", city: OTTAWA}, war: true});
        addUnits(w, 0, "infantry", 3, KANSAS);       // >= max(3, foe ground) on a < 2800 km front
        const frame = frameFor(w);
        const plans = assessWarPlans(frame, {mode: "hold", aggression: 0.5}, persona());
        expect(plans[1].goal).toBe("capture");
        expect(plans[1].targets[0]).toBe("ground");
    });

    it("test_young_war_opens_then_rolls_with_age", () => {
        const w = makeWorld({war: true});
        const young = assessWarPlans(frameFor(w), {mode: "press", aggression: 0.6}, persona());
        expect(young[1].phase).toBe("opening");
        w.time = 120;                                // same war, past the opening window
        const older = assessWarPlans(frameFor(w), {mode: "press", aggression: 0.6}, persona());
        expect(older[1].phase).toBe("rolling");
    });
});
