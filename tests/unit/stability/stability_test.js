// National Stability & Civil War: the live-target penalty model, easing/recovery,
// and the civil-war fracture. Deterministic; the only RNG is the seeded rand used
// for a new rebel's think timer. Spec: design/gdd/stability-and-civil-war.md.
import {describe, expect, it} from "vitest";
import {fractureNation, stabilityStatus, stabilityTarget, updateStability} from "../../../src/game/engine.js";
import {evacTick} from "../../../src/game/sim/leadership.js";
import {STABILITY} from "../../../src/game/data/constants.js";

// A living, healthy city with matching pop0 baseline unless overridden.
function city(over = {}) {
    const pop = over.pop ?? 1e6;
    return {id: over.id || "c", slot: over.slot ?? 5, name: over.name || "C", cap: over.cap ?? 0, pop, pop0: pop, econ: over.econ ?? 0.2, hp: 100, maxHp: 100, alive: true, lng: 0, lat: 0, ...over};
}

// A nation with the fields the stability/economy queries read.
function nation(over = {}) {
    return {slot: 5, name: "Testland", iso: "TL", isAi: true, gdp: 0, alive: true, relations: {}, lead: {total: 12, lost: 0, sheltered: 0}, points: 500, ...over};
}

function world({nations = [], cities = [], units = []} = {}) {
    return {nations, cities, units, events: [], _r: 12345, _id: 0, time: 100};
}

describe("stabilityTarget — penalties", () => {
    it("test_healthy_nation_targets_100", () => {
        const n = nation();
        const w = world({nations: [n], cities: [city({pop: 3e6}), city({id: "c2", pop: 2e6})]});
        expect(stabilityTarget(w, n)).toBe(100);
    });

    it("test_population_loss_lowers_target", () => {
        // Both cities at half hp → living pop is half of base → lostFrac 0.5.
        const n = nation();
        const w = world({nations: [n], cities: [city({hp: 50}), city({id: "c2", hp: 50})]});
        expect(stabilityTarget(w, n)).toBe(100 - 0.5 * STABILITY.wPopLoss);
    });

    it("test_first_war_is_free_extra_wars_penalize", () => {
        const one = nation({relations: {1: "war"}});
        const three = nation({relations: {1: "war", 2: "war", 3: "war"}});
        const w = world({nations: [one], cities: [city()]});
        const w3 = world({nations: [three], cities: [city()]});
        expect(stabilityTarget(w, one)).toBe(100);                       // 1 war = free
        expect(stabilityTarget(w3, three)).toBe(100 - 2 * STABILITY.wPerWar); // 2 beyond free
    });

    it("test_leadership_loss_penalizes_more_than_bunkering", () => {
        const lost = nation({lead: {total: 12, lost: 12, sheltered: 0}});
        const bunkered = nation({lead: {total: 12, lost: 0, sheltered: 12}});
        const wl = world({nations: [lost], cities: [city()]});
        const wb = world({nations: [bunkered], cities: [city()]});
        expect(stabilityTarget(wl, lost)).toBe(100 - STABILITY.wLeadLoss);
        expect(stabilityTarget(wb, bunkered)).toBe(100 - STABILITY.wBunkered);
        expect(STABILITY.wBunkered).toBeLessThan(STABILITY.wLeadLoss); // bunkering hurts less
    });

    it("test_deficit_penalizes", () => {
        // No living cities → income == fallbackBase (2); a silo upkeep (4) → net < 0.
        const def = nation({gdp: 0});
        const surplus = nation({gdp: 0});
        const wDef = world({nations: [def], units: [{slot: 5, type: "silo", hp: 60}]});
        const wSurplus = world({nations: [surplus]});
        expect(stabilityTarget(wDef, def)).toBe(100 - STABILITY.wDeficit);
        expect(stabilityTarget(wSurplus, surplus)).toBe(100);
    });

    it("test_penalties_combine_and_clamp_to_zero", () => {
        const n = nation({relations: {1: "war", 2: "war", 3: "war", 4: "war", 5: "war", 6: "war", 7: "war", 8: "war", 9: "war", 10: "war"}});
        const w = world({nations: [n], cities: [city(), city({id: "c2"})]});
        expect(stabilityTarget(w, n)).toBe(0); // 9×12 = 108 penalty → clamped
    });
});

describe("updateStability — easing and recovery", () => {
    it("test_eases_toward_target_without_snapping", () => {
        const n = nation({stability: 100, relations: {1: "war", 2: "war", 3: "war"}}); // target 76
        const w = world({nations: [n], cities: [city()]});
        updateStability(w, 1);
        expect(n.stability).toBeLessThan(100);
        expect(n.stability).toBeGreaterThan(76); // moved partway, not all the way
    });

    it("test_recovers_upward_when_strains_clear", () => {
        const n = nation({stability: 50, relations: {}}); // target 100
        const w = world({nations: [n], cities: [city()]});
        updateStability(w, 1);
        expect(n.stability).toBeGreaterThan(50);
    });

    it("test_noop_on_nonpositive_dt", () => {
        const n = nation({stability: 30});
        const w = world({nations: [n], cities: [city()]});
        updateStability(w, 0);
        expect(n.stability).toBe(30);
    });
});

describe("stabilityStatus", () => {
    it("test_reports_pct_and_not_collapsing_when_stable", () => {
        const n = nation({stability: 88});
        const w = world({nations: [n], cities: [city()]});
        const s = stabilityStatus(w, 5);
        expect(s.pct).toBe(88);
        expect(s.collapsing).toBe(false);
    });

    it("test_reports_collapse_countdown", () => {
        const n = nation({stability: 0, _unrest: 20});
        const w = world({nations: [n], cities: [city()]});
        const s = stabilityStatus(w, 5);
        expect(s.collapsing).toBe(true);
        expect(s.secToCivilWar).toBe(STABILITY.civilWarSec - 20);
    });
});

describe("fractureNation — the civil war", () => {
    // Four cities spread west→east; capital at the far west.
    function fourCityWorld() {
        const parent = nation({slot: 5, name: "Testland", points: 1000, gdp: 20});
        const cities = [
            city({id: "cap", slot: 5, cap: 1, lng: -10, pop: 4e6}),
            city({id: "w2", slot: 5, lng: -5, pop: 2e6}),
            city({id: "e1", slot: 5, lng: 5, pop: 2e6}),
            city({id: "e2", slot: 5, lng: 10, pop: 3e6}),
        ];
        const units = [
            {id: "uW", slot: 5, type: "battery", hp: 60, lng: -9, lat: 0}, // near capital → loyal
            {id: "uE", slot: 5, type: "battery", hp: 60, lng: 8, lat: 0},  // in the east → defects
        ];
        return {parent, w: world({nations: [parent], cities, units})};
    }

    it("test_capital_half_stays_east_half_secedes", () => {
        const {parent, w} = fourCityWorld();
        const rebel = fractureNation(w, parent);
        expect(rebel).toBeTruthy();
        expect(w.nations.length).toBe(2);
        expect(rebel.slot).toBe(6);
        expect(rebel.rebel).toBe(true);
        expect(rebel.isAi).toBe(true);
        // Eastern cities changed hands; capital stayed loyal.
        expect(w.cities.find((c) => c.id === "e1").slot).toBe(6);
        expect(w.cities.find((c) => c.id === "e2").slot).toBe(6);
        expect(w.cities.find((c) => c.id === "cap").slot).toBe(5);
        expect(w.cities.find((c) => c.id === "w2").slot).toBe(5);
    });

    it("test_local_units_defect_others_stay", () => {
        const {parent, w} = fourCityWorld();
        fractureNation(w, parent);
        expect(w.units.find((u) => u.id === "uE").slot).toBe(6); // eastern unit defects
        expect(w.units.find((u) => u.id === "uW").slot).toBe(5); // western unit loyal
    });

    it("test_both_sides_at_war_and_reseeded", () => {
        const {parent, w} = fourCityWorld();
        const rebel = fractureNation(w, parent);
        expect(parent.relations[6]).toBe("war");
        expect(rebel.relations[5]).toBe("war");
        // Fresh leadership for both, summing to the full pool over their cities.
        expect(parent.lead.total).toBe(12);
        expect(rebel.lead.total).toBe(12);
        const parentLeaders = w.cities.filter((c) => c.slot === 5).reduce((s, c) => s + (c.leaders || 0), 0);
        const rebelLeaders = w.cities.filter((c) => c.slot === 6).reduce((s, c) => s + (c.leaders || 0), 0);
        expect(parentLeaders).toBe(12);
        expect(rebelLeaders).toBe(12);
        // Pressure relieved on both.
        expect(parent.stability).toBe(STABILITY.resetStability);
        expect(rebel.stability).toBe(STABILITY.resetStability);
        expect(parent._unrest).toBe(0);
    });

    it("test_single_city_nation_cannot_fracture", () => {
        const parent = nation({slot: 5, stability: 0, _unrest: 999});
        const w = world({nations: [parent], cities: [city({id: "only", slot: 5, cap: 1})]});
        const rebel = fractureNation(w, parent);
        expect(rebel).toBe(null);
        expect(w.nations.length).toBe(1);
        expect(parent.stability).toBe(STABILITY.resetStability); // pressure relieved instead
        expect(parent._unrest).toBe(0);
    });

    it("test_updateStability_triggers_civil_war_after_civilWarSec", () => {
        const n = nation({slot: 5, stability: 0, relations: {100: "war", 101: "war", 102: "war", 103: "war", 104: "war", 105: "war", 106: "war", 107: "war", 108: "war", 109: "war"}});
        const w = world({nations: [n], cities: [city({id: "a", slot: 5, cap: 1, lng: 0}), city({id: "b", slot: 5, lng: 10})]});
        updateStability(w, STABILITY.civilWarSec); // one big tick past the threshold
        expect(w.nations.length).toBe(2);
        expect(w.nations.some((m) => m.rebel)).toBe(true);
        expect(n.stability).toBe(STABILITY.resetStability);
    });
});

describe("fractureNation — leadership ferries caught in transit", () => {
    // Capital far west (loyal); east secedes. A bunker + a laden ferry sit in the
    // east, a second laden ferry and an airstrip in the west, so we can assert each
    // successor's in-flight planes get re-aimed at assets it actually owns.
    function ferryWorld() {
        const parent = nation({slot: 5, name: "Testland", points: 1000, gdp: 20});
        const cities = [
            city({id: "cap", slot: 5, cap: 1, lng: -10, pop: 4e6}),
            city({id: "w2", slot: 5, lng: -6, pop: 2e6}),
            city({id: "e1", slot: 5, lng: 6, pop: 2e6}),
            city({id: "e2", slot: 5, lng: 10, pop: 3e6}),
        ];
        const ferry = ({id, lng, mission = {}}) => ({
            id, slot: 5, type: "transport", hp: 50, lng, lat: 0,
            mission: {role: "leadershipFerry", mode: "shelter", phase: "toPickup", capId: "cap", bunkerId: "bk", homeId: "as", timer: 0, cargo: 0, ...mission},
        });
        const units = [
            {id: "bk", slot: 5, type: "bunker", hp: 200, lng: 9, lat: 0},    // east → defects to rebel
            {id: "as", slot: 5, type: "airstrip", hp: 100, lng: -9, lat: 0}, // west → stays loyal
            ferry({id: "fEast", lng: 8, mission: {cargo: 2}}),              // laden, defects to rebel
            ferry({id: "fWest", lng: -8, mission: {cargo: 3}}),            // laden, stays loyal
            ferry({id: "fEmpty", lng: -7, mission: {cargo: 0, phase: "toPickup"}}), // empty, loyal
            {id: "escE", slot: 5, type: "fighter", hp: 40, lng: -9, lat: 0, mission: {role: "leadershipEscort", leadId: "fEast"}},
        ];
        return {parent, w: world({nations: [parent], cities, units})};
    }
    const ferryOf = (w, id) => w.units.find((u) => u.id === id).mission;

    it("test_laden_rebel_ferry_delivers_to_its_own_bunker", () => {
        const {parent, w} = ferryWorld();
        fractureNation(w, parent);
        expect(w.units.find((u) => u.id === "fEast").slot).toBe(6); // defected to the breakaway
        expect(w.units.find((u) => u.id === "bk").slot).toBe(6);    // bunker went with the east
        const m = ferryOf(w, "fEast");
        expect(m.mode).toBe("shelter");   // dropping cargo INTO the bunker
        expect(m.bunkerId).toBe("bk");
        expect(m.phase).toBe("toDrop");
    });

    it("test_laden_ferry_with_no_owned_bunker_falls_back_to_owned_city", () => {
        const {parent, w} = ferryWorld();
        fractureNation(w, parent);
        // The loyalist half lost its only bunker to the rebels → drop at an owned city.
        expect(w.units.find((u) => u.id === "fWest").slot).toBe(5);
        const m = ferryOf(w, "fWest");
        expect(m.mode).toBe("release"); // release drops INTO a city
        expect(m.phase).toBe("toDrop");
        const dropCity = w.cities.find((c) => c.id === m.capId);
        expect(dropCity.slot).toBe(5);   // and it's a city the loyalists actually own
        expect(dropCity.alive).toBe(true);
    });

    it("test_empty_ferry_abandons_run_and_heads_home", () => {
        const {parent, w} = ferryWorld();
        fractureNation(w, parent);
        expect(ferryOf(w, "fEmpty").phase).toBe("toHome");
        expect(ferryOf(w, "fEmpty").homeId).toBe("as"); // an owned airstrip
    });

    it("test_escort_follows_its_ferry_to_the_new_state", () => {
        const {parent, w} = ferryWorld();
        fractureNation(w, parent);
        // Escort sat in the west (would stay loyal on its own) but tracks fEast → rebel.
        expect(w.units.find((u) => u.id === "escE").slot).toBe(6);
    });
});

describe("AI leadership doctrine (evacTick)", () => {
    it("test_ai_shelters_when_at_war_with_exposed_leaders", () => {
        const ai = nation({slot: 0, isAi: true, relations: {1: "war"}, lead: {total: 12, lost: 0, sheltered: 0}, _evac: false});
        const enemy = nation({slot: 1, isAi: true, relations: {0: "war"}});
        const w = world({nations: [ai, enemy], cities: [city({id: "cap", slot: 0, cap: 1, leaders: 12})]});
        evacTick(w);
        expect(ai._evac).toBe("shelter");
    });

    it("test_ai_releases_when_at_peace_with_sheltered_leaders", () => {
        const ai = nation({slot: 0, isAi: true, relations: {}, lead: {total: 12, lost: 0, sheltered: 6}, _evac: false});
        // A bunker exists (so release isn't cancelled), but no airstrip → flag stays set.
        const w = world({nations: [ai], cities: [city({id: "cap", slot: 0, cap: 1})], units: [{slot: 0, type: "bunker", hp: 200}]});
        evacTick(w);
        expect(ai._evac).toBe("release");
    });
});
