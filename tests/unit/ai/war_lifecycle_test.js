// War lifecycle: deriveWarStates turns observable facts (war age, surviving-city
// fraction, leadership, the damage ledger, strength/city trends) into a per-foe
// state — opening/prosecute/stall/losing/routed/collapsed — and drops entries for
// wars that ended; updateTrends keeps the per-think power/cities baseline and the
// city-loss rate those derivations read. Deterministic — no RNG consumed.
import {describe, expect, it} from "vitest";
import {createWorld, declareWar} from "../../../src/game/engine.js";
import {DIPLOMACY} from "../../../src/game/data/constants.js";
import {deriveWarStates, updateTrends} from "../../../src/game/sim/ai/diplomacy/warLifecycle.js";
import {ensureDiplo, rel} from "../../../src/game/sim/ai/diplomacy/ledger.js";
import {buildFrame, capPositions} from "../../../src/game/sim/ai/perception/perception.js";
import {WAR_STATE} from "../../../src/game/sim/ai/tuning.js";

// slot 0 = player (US), slot 1 = the AI under test (RU, five cities so its
// surviving fraction can land between the surrender floor and the rout margin),
// slot 2 = a second AI (CN). Real ISO codes on real soil.
function fresh() {
    return createWorld({
        mySlot: 0, seed: 7,
        nations: [
            {slot: 0, name: "America", iso: "US", isAi: false, gdp: 5},
            {slot: 1, name: "Russia", iso: "RU", isAi: true, gdp: 5},
            {slot: 2, name: "China", iso: "CN", isAi: true, gdp: 5},
        ],
        cities: [
            {id: "u1", slot: 0, name: "Topeka", state: "KS", cap: 1, pop: 1e6, econ: 1, lng: -98, lat: 39},
            {id: "u2", slot: 0, name: "Denver", state: "CO", cap: 0, pop: 7e5, econ: 1, lng: -104.99, lat: 39.74},
            {id: "r1", slot: 1, name: "Moscow", state: "MOW", cap: 1, pop: 1e6, econ: 1, lng: 37.62, lat: 55.75},
            {id: "r2", slot: 1, name: "St Petersburg", state: "SPE", cap: 0, pop: 8e5, econ: 1, lng: 30.32, lat: 59.93},
            {id: "r3", slot: 1, name: "Kazan", state: "TA", cap: 0, pop: 6e5, econ: 1, lng: 49.11, lat: 55.79},
            {id: "r4", slot: 1, name: "Yekaterinburg", state: "SVE", cap: 0, pop: 6e5, econ: 1, lng: 60.6, lat: 56.84},
            {id: "r5", slot: 1, name: "Novosibirsk", state: "NVS", cap: 0, pop: 5e5, econ: 1, lng: 82.93, lat: 55.03},
            {id: "c1", slot: 2, name: "Beijing", state: "BJ", cap: 1, pop: 1e6, econ: 1, lng: 116.4, lat: 39.9},
            {id: "c2", slot: 2, name: "Shanghai", state: "SH", cap: 0, pop: 9e5, econ: 1, lng: 121.47, lat: 31.23},
        ],
        rules: {playerGraceSec: 0}, // so t=0 declareWar calls stand up their wars
    });
}

const nation = (w, slot) => w.nations.find((n) => n.slot === slot);
const kill = (w, id) => { w.cities.find((c) => c.id === id).alive = false; };

function frameFor(w, slot) {
    const unitsBySlot = new Map();
    for (const u of w.units) {
        if (u.hp <= 0) continue;
        if (!unitsBySlot.has(u.slot)) unitsBySlot.set(u.slot, []);
        unitsBySlot.get(u.slot).push(u);
    }
    return buildFrame(w, nation(w, slot), {unitsBySlot, caps: capPositions(w)});
}

describe("deriveWarStates — state per active war", () => {
    it("test_opening_for_war_younger_than_min_war_sec", () => {
        const w = fresh();
        declareWar(w, 1, 0);
        w.time = DIPLOMACY.minWarSec - 10;              // healthy nation, young war
        const states = deriveWarStates(frameFor(w, 1));
        expect(states[0]).toBe("opening");
        expect(ensureDiplo(nation(w, 1)).warState[0]).toBe("opening");
    });

    it("test_routed_when_surviving_fraction_sits_within_margin_of_surrender_floor", () => {
        const w = fresh();
        declareWar(w, 1, 0);
        kill(w, "r3"); kill(w, "r4"); kill(w, "r5");    // 2/5 alive = 0.4
        w.time = DIPLOMACY.minWarSec + 60;
        const frame = frameFor(w, 1);
        expect(frame.me.frac).toBeCloseTo(0.4, 6);      // inside [threshold, threshold+margin)
        expect(frame.me.frac).toBeGreaterThanOrEqual(DIPLOMACY.surrenderThreshold);
        expect(frame.me.frac).toBeLessThan(DIPLOMACY.surrenderThreshold + WAR_STATE.routedFracMargin);
        expect(deriveWarStates(frame)[0]).toBe("routed");
    });

    it("test_collapsed_below_the_surrender_floor", () => {
        const w = fresh();
        declareWar(w, 1, 0);
        kill(w, "r2"); kill(w, "r3"); kill(w, "r4"); kill(w, "r5"); // 1/5 alive = 0.2
        w.time = DIPLOMACY.minWarSec + 60;
        expect(deriveWarStates(frameFor(w, 1))[0]).toBe("collapsed");
    });

    it("test_routed_when_leadership_at_or_below_rout_threshold", () => {
        const w = fresh();
        declareWar(w, 1, 0);
        nation(w, 1).lead = {total: 100, lost: 75, sheltered: 0};   // leadPct = 25
        w.time = DIPLOMACY.minWarSec + 60;
        const frame = frameFor(w, 1);
        expect(frame.me.frac).toBe(1);                  // cities intact — leadership alone routs
        expect(deriveWarStates(frame)[0]).toBe("routed");
    });

    it("test_losing_when_damage_ratio_high_with_negative_trend_only", () => {
        const w = fresh();
        declareWar(w, 1, 0);
        w.time = DIPLOMACY.minWarSec + 60;
        const n = nation(w, 1);
        rel(n, 0).taken = 200;                          // ratio 2 > losingDamageRatio
        rel(n, 0).dealt = 100;
        const d = ensureDiplo(n);
        d.trend = -5;
        expect(deriveWarStates(frameFor(w, 1))[0]).toBe("losing");
        d.trend = 5;                                    // same ledger, improving strength
        expect(deriveWarStates(frameFor(w, 1))[0]).toBe("prosecute");
    });

    it("test_losing_when_bleeding_cities_fast", () => {
        const w = fresh();
        declareWar(w, 1, 0);
        w.time = DIPLOMACY.minWarSec + 60;
        const d = ensureDiplo(nation(w, 1));
        d.cityRate = WAR_STATE.cityLossPerMinLosing + 0.1; // losing on rate alone, ledger even
        expect(deriveWarStates(frameFor(w, 1))[0]).toBe("losing");
    });

    it("test_stall_for_an_old_quiet_war", () => {
        const w = fresh();
        declareWar(w, 1, 0);
        w.time = WAR_STATE.stallAfterSec + 50;          // old and quiet
        const n = nation(w, 1);
        rel(n, 0).taken = 100;                          // ratio 1 — neither side gaining
        rel(n, 0).dealt = 100;
        expect(deriveWarStates(frameFor(w, 1))[0]).toBe("stall");
    });

    it("test_prosecute_while_clearly_winning_an_old_war", () => {
        const w = fresh();
        declareWar(w, 1, 0);
        w.time = WAR_STATE.stallAfterSec + 50;
        const n = nation(w, 1);
        rel(n, 0).taken = 30;                           // ratio 0.1 < winningDamageRatio — no stall
        rel(n, 0).dealt = 300;
        expect(deriveWarStates(frameFor(w, 1))[0]).toBe("prosecute");
    });

    it("test_stale_war_state_entries_for_ended_wars_are_dropped", () => {
        const w = fresh();
        declareWar(w, 1, 0);
        w.time = DIPLOMACY.minWarSec + 60;
        const d = ensureDiplo(nation(w, 1));
        d.warState[2] = "stall";                        // leftover from a war that ended
        deriveWarStates(frameFor(w, 1));
        expect(Object.keys(d.warState)).toEqual(["0"]); // live front kept, stale foe purged
    });
});

describe("updateTrends — per-think power/cities bookkeeping", () => {
    it("test_first_think_stamps_the_baseline_without_a_rate", () => {
        const w = fresh();
        w.time = 100;
        const frame = frameFor(w, 1);
        updateTrends(frame);
        const d = frame.diplo;
        expect(d.power).toBe(frame.me.power);
        expect(d.winT0).toBe(100);                      // loss window opens on the first think
        expect(d.winCities).toBe(5);
        expect(d.at).toBe(100);
        expect(d.cityRate).toBeUndefined();             // no completed window to rate yet
    });

    it("test_city_rate_reads_the_windowed_drop_per_game_minute", () => {
        const w = fresh();
        w.time = 100;
        updateTrends(frameFor(w, 1));                   // window opens: 5 cities at t=100
        kill(w, "r5");
        // A think INSIDE the window computes no rate — a single unlucky loss
        // between two close thinks must not read as a 10x/min collapse.
        w.time = 110;
        const early = frameFor(w, 1);
        updateTrends(early);
        expect(early.diplo.cityRate).toBeUndefined();
        // Once the window has run its course, the loss reads at its true rate.
        w.time = 160;                                   // one city lost over one game-minute
        const frame = frameFor(w, 1);
        updateTrends(frame);
        expect(frame.diplo.cityRate).toBeCloseTo(1, 6);
        expect(frame.diplo.winCities).toBe(4);          // window rolls forward
        expect(frame.diplo.winT0).toBe(160);
        expect(frame.diplo.at).toBe(160);
    });

    it("test_strength_trend_is_an_ema_of_the_power_delta", () => {
        const w = fresh();
        w.time = 100;
        const frame = frameFor(w, 1);
        updateTrends(frame);                            // seeds d.power
        const d = frame.diplo;
        d.power = frame.me.power + 40;                  // pretend we were 40 stronger last think
        updateTrends(frame);
        expect(d.trend).toBeCloseTo(WAR_STATE.trendAlpha * -40, 6);
        d.power = frame.me.power + 40;                  // a second identical drop compounds the EMA
        updateTrends(frame);
        expect(d.trend).toBeCloseTo(WAR_STATE.trendAlpha * -40 * (2 - WAR_STATE.trendAlpha), 6);
        expect(d.power).toBe(frame.me.power);           // baseline restored after each pass
    });
});
