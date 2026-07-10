// Per-slot world aggregates, computed in ONE pass over cities and one over
// units and cached per sim step (keyed on w.time). Everything the AI reads
// per-nation many times a think — gdp, income, upkeep, force, surviving
// fraction, exposed leadership, ledger value — comes from here instead of a
// fresh full-world scan per query. In an all-active multiplayer world (222
// nations, ~4000 cities) this is the difference between a feasible frame
// build and a quadratic one. Leaf module: only constants/queries above it, so
// perception, profiles, diplomacy, and the ledger can all read it cycle-free.
// The economy formulas MUST mirror queries.js (gdpOf / incomeOf / upkeepOf /
// netIncomeOf) — tests assert the agreement.
import {ECONOMY, UNITS} from "../../../data/constants.js";
import {vitalityOf} from "../../queries.js";

export function slotStats(w) {
    if (w._aiStats && w._aiStatsAt === w.time) return w._aiStats;
    const stats = {};
    const get = (slot) => stats[slot] || (stats[slot] = {
        cities: 0, start: 0, econ: 0, vit: 0, leaders: false, cityVal: 0,
        gdpAdd: 0, indOut: 0, upkeep: 0, force: 0, unitVal: 0,
    });
    for (const c of w.cities) {
        get(c.owner0 ?? c.slot).start++;
        if (!c.alive) continue;
        const s = get(c.slot);
        const v = vitalityOf(c);
        s.cities++;
        s.econ += (c.econ || 0) * v;
        s.vit += v;
        if ((c.leaders || 0) > 0) s.leaders = true;
        s.cityVal += (c.hp ?? c.maxHp ?? 0) * (c.cap ? 1.5 : 1) * (1 + v);
    }
    for (const u of w.units) {
        if (u.hp <= 0) continue;
        const def = UNITS[u.type];
        if (!def) continue;
        const s = get(u.slot);
        s.gdpAdd += def.gdpAdd || 0;
        s.indOut += def.output || 0;
        s.upkeep += def.upkeep ?? 0;
        if (def.hp) {
            const frac = u.hp / def.hp;
            s.force += (def.cost || 0) * frac;
            s.unitVal += (def.cost || 0) * frac * 0.2;
        }
    }
    for (const slot in stats) {
        const s = stats[slot];
        const direct = w.nations[+slot];
        const n = direct && direct.slot === +slot ? direct : w.nations.find((x) => x.slot === +slot);
        // Mirrors queries.gdpOf / incomeOf / netIncomeOf.
        s.gdp = n ? n.gdp * s.econ + s.gdpAdd : 0;
        const mult = n?.commandMult ?? 1;
        s.income = !n ? 0 : n.gdp > 0
            ? (ECONOMY.incomeBase + ECONOMY.incomeGdpCoef * Math.sqrt(n.gdp) * s.econ + s.indOut) * mult
            : (ECONOMY.fallbackBase + s.vit * ECONOMY.fallbackPerCity + s.indOut) * mult;
        s.net = s.income - s.upkeep;
        s.frac = s.cities / Math.max(1, s.start);
        s.power = Math.max(0.1, s.gdp) + s.force / 300;
        s.value = s.cityVal + s.unitVal;   // the war-damage ledger's standing-value figure
    }
    w._aiStats = stats;
    w._aiStatsAt = w.time;
    return stats;
}

// A single slot's aggregate (zeroed default for a slot with nothing left).
const EMPTY_STAT = {
    cities: 0, start: 0, econ: 0, vit: 0, leaders: false, cityVal: 0, gdpAdd: 0,
    indOut: 0, upkeep: 0, force: 0, unitVal: 0, gdp: 0, income: 0, net: 0,
    frac: 0, power: 0.1, value: 0,
};
export const statOf = (w, slot) => slotStats(w)[slot] || EMPTY_STAT;

// Surviving-city fraction against the match-start baseline (owner0) — the same
// figure warResolution's surrender math uses.
export const survivingFrac = (w, slot) => statOf(w, slot).frac;
