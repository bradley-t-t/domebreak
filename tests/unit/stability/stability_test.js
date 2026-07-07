// National Stability: the live-target penalty model, easing/recovery, and the HUD
// status readout. Deterministic — no RNG, no history. Spec: design/gdd/stability.md.
import {describe, expect, it} from "vitest";
import {stabilityStatus, stabilityTarget, updateStability} from "../../../src/game/engine.js";
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
    it("test_reports_pct_and_target", () => {
        const n = nation({stability: 88});
        const w = world({nations: [n], cities: [city()]});
        const s = stabilityStatus(w, 5);
        expect(s.pct).toBe(88);
        expect(s.target).toBe(100); // healthy nation trends to 100
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
