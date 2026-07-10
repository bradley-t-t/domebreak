// Forward budget (economy/budget.js) + the wants side of doctrine/lib.js.
// buildBuyPlan packs urgency-sorted wants into an ordered BuyPlan bounded by the
// treasury, per-item reserves, and the net-income floor: must-haves (urgency >=
// BLOCK_URGENCY) hold the treasury while unaffordable, routine wants are merely
// skipped, deficit admits only industry, and the plan never exceeds queueMax.
// The wants builders must keep every routine item under the block band and put
// only the deliberate emergencies (bootstrap industry, a naked wartime capital)
// above it. Deterministic — hand-built frames plus one real buildFrame world.
import {describe, expect, it} from "vitest";
import {buildBuyPlan} from "../../../src/game/sim/ai/economy/budget.js";
import {
    BLOCK_URGENCY,
    defenseWants,
    have,
    haveAmmo,
    industryWants,
    offenseWants,
    wantList,
} from "../../../src/game/sim/ai/doctrine/lib.js";
import {BUDGET, THINK, WANTS} from "../../../src/game/sim/ai/tuning.js";
import {buildFrame, capPositions} from "../../../src/game/sim/ai/perception/perception.js";
import {createWorld, UNITS} from "../../../src/game/engine.js";
import {ECONOMY} from "../../../src/game/data/constants.js";

// buildBuyPlan reads only me.points / me.net from the frame.
const frameOf = (points, net) => ({me: {points, net, units: []}, n: {}});
const want = (kind, type, urgency, extra = {}) => ({kind, type, target: 1, urgency, reserve: 0, ...extra});

// Hand-built frame for the wants builders. The stub world carries no research
// record, so every requiresTech unit reads as locked — battery and dome are the
// only buildable defense tiers, a stable deterministic option set.
function wantsFrame({units = [], indCap = 8, coastal = false, atWar = false, ammo = {}} = {}) {
    const slot = 1;
    return {
        me: {slot, units, indCap, coastal, ammo, protect: [{lng: 0, lat: 0, val: 1}], cities: []},
        n: {},
        _w: {units: [], nations: [{slot}], cities: []},
        world: {atWar},
    };
}

describe("buildBuyPlan — packing order and affordability", () => {
    it("test_packs_wants_in_urgency_order_while_affordable", () => {
        const wants = [
            want("unit", "battery", 8),
            want("unit", "silo", 7),
            want("ammo", "standard", 5),
        ];
        const {buys} = buildBuyPlan(frameOf(1000, 20), wants);
        expect(buys).toEqual([
            {kind: "unit", type: "battery"},
            {kind: "unit", type: "silo"},
            {kind: "ammo", type: "standard"},
        ]);
    });

    it("test_unaffordable_must_have_holds_the_treasury", () => {
        // Carrier (800) is out of reach at 300 points. At BLOCK_URGENCY it stops
        // the whole plan — the affordable battery behind it may not drain the
        // points the must-have is saving toward.
        const blocked = buildBuyPlan(frameOf(300, 50), [
            want("unit", "carrier", BLOCK_URGENCY),
            want("unit", "battery", 5),
        ]);
        expect(blocked.buys).toEqual([]);
        // The same carrier just under the block band no longer holds anything.
        const open = buildBuyPlan(frameOf(300, 50), [
            want("unit", "carrier", BLOCK_URGENCY - 0.5),
            want("unit", "battery", 5),
        ]);
        expect(open.buys).toEqual([{kind: "unit", type: "battery"}]);
    });

    it("test_unaffordable_routine_want_is_merely_skipped", () => {
        const {buys} = buildBuyPlan(frameOf(300, 50), [
            want("unit", "carrier", 5),
            want("unit", "battery", 4),
        ]);
        expect(buys).toEqual([{kind: "unit", type: "battery"}]);
    });

    it("test_reserve_counts_toward_affordability", () => {
        const wants = () => [want("unit", "battery", 5, {reserve: 100})];
        // cost 150 + reserve 100 > 200 points -> skipped.
        expect(buildBuyPlan(frameOf(200, 10), wants()).buys).toEqual([]);
        // 260 clears cost + reserve -> bought.
        expect(buildBuyPlan(frameOf(260, 10), wants()).buys).toEqual([{kind: "unit", type: "battery"}]);
    });
});

describe("buildBuyPlan — net-income floor and deficit", () => {
    it("test_net_floor_skips_non_industry_and_tracks_running_net", () => {
        // Net covers exactly two batteries above the floor; the silo would dive
        // far below it and the third battery lands on the wrong side too. The AI
        // pays the reduced upkeep rate, so marginal upkeep is scaled to match.
        const net = BUDGET.minNet + 2 * UNITS.battery.upkeep * ECONOMY.aiUpkeepMult;
        const {buys} = buildBuyPlan(frameOf(5000, net), [
            want("unit", "silo", 8),
            want("unit", "battery", 7),
            want("unit", "battery", 6),
            want("unit", "battery", 5),
        ]);
        expect(buys).toEqual([
            {kind: "unit", type: "battery"},
            {kind: "unit", type: "battery"},
        ]);
    });

    it("test_item_min_net_ask_overrides_the_global_floor", () => {
        const ask = UNITS.silo.upkeep * ECONOMY.aiUpkeepMult + 1; // projects net exactly 1 after the buy
        // Projected net clears BUDGET.minNet but not the item's own ask -> skip.
        expect(buildBuyPlan(frameOf(5000, ask - 0.1), [want("unit", "silo", 6, {minNet: 1})]).buys).toEqual([]);
        // Exactly meeting the ask buys.
        expect(buildBuyPlan(frameOf(5000, ask), [want("unit", "silo", 6, {minNet: 1})]).buys)
            .toEqual([{kind: "unit", type: "silo"}]);
    });

    it("test_industry_is_exempt_from_the_net_floor", () => {
        // A factory projects net below BUDGET.minNet yet still buys — industry
        // is the way back out of a weak economy.
        const {buys} = buildBuyPlan(frameOf(1000, BUDGET.minNet), [want("unit", "factory", 6)]);
        expect(buys).toEqual([{kind: "unit", type: "factory"}]);
    });

    it("test_deficit_admits_only_industry", () => {
        const {buys} = buildBuyPlan(frameOf(5000, -1), [
            want("unit", "battery", 8),
            want("ammo", "standard", 7),
            want("unit", "factory", 6),
        ]);
        expect(buys).toEqual([{kind: "unit", type: "factory"}]);
    });

    it("test_need_scrap_flags_below_the_scrap_floor", () => {
        // In deficit but above the scrap floor, with points to build out of it:
        // hold, don't dismantle.
        expect(buildBuyPlan(frameOf(BUDGET.brokePoints, BUDGET.scrapMinNet + 0.1), []).needScrap).toBe(false);
        // The floor itself is not yet scrapping (strict <).
        expect(buildBuyPlan(frameOf(BUDGET.brokePoints, BUDGET.scrapMinNet), []).needScrap).toBe(false);
        expect(buildBuyPlan(frameOf(BUDGET.brokePoints, BUDGET.scrapMinNet - 0.1), []).needScrap).toBe(true);
    });

    it("test_broke_deficit_scraps_even_above_the_floor", () => {
        // A shallow deficit with an empty treasury would deadlock forever —
        // never enough points for the industry that fixes the income — so any
        // deficit below the broke-points line also scraps.
        expect(buildBuyPlan(frameOf(0, BUDGET.scrapMinNet + 0.1), []).needScrap).toBe(true);
        expect(buildBuyPlan(frameOf(BUDGET.brokePoints - 1, -0.1), []).needScrap).toBe(true);
        // Solvent or funded nations don't.
        expect(buildBuyPlan(frameOf(0, 0.5), []).needScrap).toBe(false);
        expect(buildBuyPlan(frameOf(BUDGET.brokePoints, -0.1), []).needScrap).toBe(false);
    });

    it("test_queue_max_caps_the_plan", () => {
        const wants = [];
        for (let i = 0; i < THINK.queueMax + 2; i++) wants.push(want("unit", "battery", 8 - i * 0.5));
        const {buys} = buildBuyPlan(frameOf(100000, 1000), wants);
        expect(buys).toHaveLength(THINK.queueMax);
    });
});

describe("doctrine wants — urgency bands and counting", () => {
    it("test_bootstrap_industry_wants_the_first_factory_above_the_block_band", () => {
        const list = wantList(wantsFrame({units: []}));
        industryWants(list, 1);
        expect(list.items).toHaveLength(1);
        const [item] = list.items;
        expect(item.kind).toBe("unit");
        expect(item.type).toBe("factory");
        expect(item.urgency).toBeGreaterThanOrEqual(BLOCK_URGENCY);
        expect(item.reserve).toBe(WANTS.factoryReserve);
    });

    it("test_routine_industry_clamps_under_the_block_band_and_stops_at_cap", () => {
        const units = [{type: "factory"}, {type: "factory"}, {type: "techpark"}, {type: "refinery"}];
        // Past bootstrap with room under the cap: a hot economy axis must still
        // never push a routine industry want into the treasury-holding band.
        const below = wantList(wantsFrame({units, indCap: 8}));
        industryWants(below, 3);
        expect(below.items.length).toBeGreaterThan(0);
        for (const item of below.items) expect(item.urgency).toBeLessThan(BLOCK_URGENCY);
        // At the population cap the ladder emits nothing.
        const capped = wantList(wantsFrame({units, indCap: units.length}));
        industryWants(capped, 3);
        expect(capped.items).toEqual([]);
    });

    it("test_wartime_zero_defenders_is_a_blocking_emergency_peacetime_is_not", () => {
        const atWar = wantList(wantsFrame({atWar: true}));
        defenseWants(atWar, 1);
        expect(atWar.items.length).toBeGreaterThan(0);
        expect(atWar.items[0].urgency).toBeGreaterThanOrEqual(BLOCK_URGENCY);
        for (const item of atWar.items.slice(1)) expect(item.urgency).toBeLessThan(BLOCK_URGENCY);
        // The same naked nation at peace wants defense, but nothing blocks.
        const peace = wantList(wantsFrame({atWar: false}));
        defenseWants(peace, 1);
        expect(peace.items.length).toBeGreaterThan(0);
        for (const item of peace.items) expect(item.urgency).toBeLessThan(BLOCK_URGENCY);
    });

    it("test_offense_deterrent_scaling_lifts_a_naked_arsenal", () => {
        // No strike platform at all: full deficiency plus the strikers-zero
        // axis floor pushes the launcher to the routine-want ceiling.
        const naked = wantList(wantsFrame({units: []}));
        offenseWants(naked, 0.5);
        const first = naked.items.find((i) => i.type === "launcher");
        expect(first.urgency).toBe(BLOCK_URGENCY - 0.5);
        // A standing striker shrinks the deficiency and drops the axis floor —
        // urgency falls back toward the plain axis price.
        const armed = wantList(wantsFrame({units: [{type: "silo"}]}));
        offenseWants(armed, 0.5);
        const second = armed.items.find((i) => i.type === "launcher");
        expect(second.urgency).toBeCloseTo((5 + 2.5 * (1 - 1 / 6)) * 0.5, 5);
        // The silo want carries its own net-income ask for the budget to honor.
        const silo = armed.items.find((i) => i.type === "silo");
        expect(silo.minNet).toBe(WANTS.siloMinNet);
    });

    it("test_have_counts_live_plus_queued_production", () => {
        const frame = wantsFrame({units: [{type: "factory"}], ammo: {standard: 2}});
        frame.n = {
            prod: {
                current: {item: {kind: "unit", type: "factory"}, progress: 0},
                queue: [{kind: "unit", type: "factory"}, {kind: "ammo", type: "standard"}],
            },
        };
        expect(have(frame, "factory")).toBe(3);       // 1 live + current + queued
        expect(haveAmmo(frame, "standard")).toBe(3);  // 2 stocked + 1 on the line
    });
});

describe("wants -> budget through a real PerceptionFrame", () => {
    // Real world, real frame: a fresh nation's bootstrap-industry want must
    // survive the whole wants -> plan path and queue the first factory.
    function freshFrame(points) {
        const w = createWorld({
            mySlot: 0, seed: 7,
            nations: [
                {slot: 0, name: "A", iso: "US", isAi: false, gdp: 5},
                {slot: 1, name: "B", iso: "RU", isAi: true, gdp: 5},
            ],
            cities: [
                {id: "a1", slot: 0, name: "A-Cap", state: "S", cap: 1, pop: 1e6, econ: 1, lng: -98, lat: 39},
                {id: "b1", slot: 1, name: "B-Cap", state: "S", cap: 1, pop: 1e6, econ: 1, lng: 37.6, lat: 55.75},
            ],
            rules: {playerGraceSec: 0},
        });
        const n = w.nations[1];
        n.points = points;
        return buildFrame(w, n, {unitsBySlot: new Map(), caps: capPositions(w)});
    }

    it("test_fresh_nation_bootstrap_buys_the_first_factory", () => {
        const frame = freshFrame(UNITS.factory.cost + WANTS.factoryReserve);
        const list = wantList(frame);
        industryWants(list, 1);
        const {buys} = buildBuyPlan(frame, list.items);
        expect(buys).toEqual([{kind: "unit", type: "factory"}]);
    });

    it("test_fresh_nation_too_poor_for_bootstrap_holds_the_treasury", () => {
        const frame = freshFrame(UNITS.factory.cost - 1);
        const list = wantList(frame);
        industryWants(list, 1);
        offenseWants(list, 1); // cheaper wants queue behind the blocked factory
        const {buys} = buildBuyPlan(frame, list.items);
        expect(buys).toEqual([]);
    });
});
