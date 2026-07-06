<h1 align="center">City Vitality</h1>

<p align="center">
  <b>A city's health ratio scales its population, economy, and industry, so damage erodes a nation's war machine instead of merely counting kills.</b>
</p>

<br />

## Overview

Every city has a health pool (`hp`/`maxHp`). Vitality — the ratio `hp / maxHp` — is a
single derived factor (0..1) by which every economic and demographic contribution a
city makes to its nation is scaled. Damaging a city no longer does nothing until it
dies; it linearly erodes that city's living population, its share of the national
economy, and therefore the nation's GDP and point income. Population in turn gates how
many industry structures a nation can sustain. Population is no longer fixed: each living
city's people grow over time, scaled by that same vitality, so healthy cities repopulate
across a match while battered ones barely recover — growth is capped at a multiple of
each city's starting population. A full-health, undamaged city grows at the full rate; the
downstream economy/industry formulas are otherwise unchanged.

## Player Fantasy

Bombing an enemy's cities should feel like strangling their war machine, not just
ticking down a kill count. Each warhead that lands visibly bleeds the target: fewer
people, less money, fewer points, and — over time — a shrinking industrial base they
can no longer rebuild. Defending your own cities is defending your economy. The map
shows the toll at a glance through a health halo that reddens as a city is worn down,
and a toast marks the moment a city falls.

## Detailed Rules

- `vitality(c) = c.alive ? clamp(c.hp / c.maxHp, 0, 1) : 0`. Dead cities contribute 0.
- **Living population** of a city = `c.pop * vitality(c)`. A nation's population is the
  sum over its living cities. All population readouts show living population.
- **Population growth**: each tick, every living city's raw `c.pop` grows by
  `c.pop * POPULATION.growthPerSec * vitality(c) * dt`, clamped so it never exceeds
  `c.pop0 * POPULATION.growthCapMult` (where `c.pop0` is the starting population set at
  world creation). Full-health cities grow at the full rate, a 50 %-hp city at half, a
  dead city not at all. Growth is applied in `tick.js` before the per-tick population
  tally, so income, industry cap, and the domination check all read the updated figure.
- **Economic weight** of a city = `c.econ * vitality(c)`. `c.econ` is the city's share
  of its nation's economy (and, because setup derives `pop = realPop * econ`, its share
  of the population). Summed over living cities this is the nation's surviving economic
  fraction.
- **Income** (points/s) for a GDP-rated nation =
  `incomeBase + incomeGdpCoef * sqrt(gdp) * (Σ econ*vitality) + industryOutput`, times
  the nation's `incomeMult`. Unrated (gdp = 0) nations use
  `fallbackBase + fallbackPerCity * (Σ vitality) + industryOutput`.
- **GDP** = `gdp * (Σ econ*vitality) + Σ unit.gdpAdd`.
- **Industry capacity cap** =
  `clamp(BASE_INDUSTRY + floor(livingPop / POP_PER_INDUSTRY), BASE_INDUSTRY, MAX_INDUSTRY)`.
  Shared across all `kind: "industry"` unit types (factory, port, refinery, techpark).
- Queuing an industry structure is refused when living + queued industry ≥ cap.
  Structures already standing above the cap are grandfathered — never destroyed.
- Combat, hp, missile behavior, and AI targeting are unchanged; this system only reads
  hp and scales downstream economy/population/build-limit values by it.

## Formulas

Let `v(c) = c.alive ? min(1, max(0, c.hp / c.maxHp)) : 0`.

```
grow(c, dt)         = c.pop ← min(c.pop0 * growthCapMult, c.pop * (1 + growthPerSec * v(c) * dt))
livingPop(nation)   = Σ_c c.pop  * v(c)          for c in nation's cities
econShare(nation)   = Σ_c c.econ * v(c)
income(nation)      = (incomeBase + incomeGdpCoef*√gdp*econShare + industryOutput) * incomeMult      (gdp > 0)
                    = (fallbackBase + fallbackPerCity*Σv(c) + industryOutput) * incomeMult            (gdp = 0)
gdp(nation)         = nation.gdp * econShare + Σ_u u.gdpAdd
industryCap(nation) = clamp(BASE_INDUSTRY + ⌊livingPop / POP_PER_INDUSTRY⌋, BASE_INDUSTRY, MAX_INDUSTRY)
```

Where `growthPerSec` is the fractional growth per game-second at full vitality, `dt` is
game-seconds advanced this tick, and `c.pop0` is the city's starting population. Example:
a full-health city (`v = 1`) of 10 M people with `growthPerSec = 0.00015` gains
`10e6 * 0.00015 * 1 * 1 = 1 500` people per game-second, and over a ~1200 s match rises to
≈ 11.97 M (≈ +20 %) before the `pop0 * 1.5` ceiling would bind at 15 M.

Starting tuning values: `incomeBase 1.5`, `incomeGdpCoef 4`, `fallbackBase 2`,
`fallbackPerCity 0.6` (unchanged); `BASE_INDUSTRY 3`, `POP_PER_INDUSTRY 40e6`,
`MAX_INDUSTRY 24`; `growthPerSec 0.00015`, `growthCapMult 1.5`.

## Edge Cases

- Full health ⇒ `v = 1` ⇒ every formula reduces to its pre-vitality value. No balance
  regression for undamaged nations.
- Dead city ⇒ `v = 0` ⇒ contributes nothing (matches old `alive` gating).
- A nation whose living population would allow fewer industry slots than it currently
  owns keeps the surplus structures; it simply cannot queue more until population
  recovers past the next threshold.
- Legacy saves already carry `hp`/`maxHp` on cities (set at world creation), so no
  migration is required; vitality is computed live and never persisted.
- Growth is capped: raw `c.pop` never exceeds `c.pop0 * growthCapMult`. A city already at
  its ceiling is skipped. Setting `growthCapMult` to `1.0` (or `growthPerSec` to `0`)
  disables growth entirely, restoring fixed populations.
- Legacy saves predating growth lack `c.pop0`; growth falls back to the city's current
  `pop` as the baseline (cap = `pop * growthCapMult`), so old saves still grow rather than
  crash. `pop0` is stamped for all newly created worlds.
- Determinism preserved: vitality is a pure function of stored hp, and growth is a pure
  function of stored `pop`/`pop0`/`hp` and `dt` — no RNG. Growth carries the same
  dt-dependence the point-income accrual already has.
- A MIRV can destroy several cities in one tick; the death toast aggregates them into a
  single notification rather than stacking.

## Dependencies

- `src/game/sim/combat.js` — owns city hp and the `destroy` event (unchanged; read-only
  consumer relationship).
- `src/game/sim/tick.js` — `growCities(w, dt)` applies per-tick population growth (reads
  `vitalityOf`, `POPULATION`) before the domination tally in `step`.
- `src/game/engine.js` — stamps `c.pop0` (starting population) at world creation and
  re-exports `growCities`.
- `src/game/sim/queries.js` — `incomeOf`, `gdpOf`, `populationOf` gain vitality scaling;
  new `vitalityOf`, `industryCapOf`, `industryCountOf`.
- `src/game/sim/production.js` — `queueUnit` enforces the industry cap.
- `src/game/data/constants.js` — new tuning knobs.
- `src/ui/live/*` — city health halo on the `live-cities` layer, hp bars and living-pop
  readouts in probes/panels, industry cap in the production panel, city-death toast.

## Tuning Knobs

- `CITY_HP`, `CAPITAL_HP` — city/capital max health (existing).
- `ECONOMY.incomeBase / incomeGdpCoef / fallbackBase / fallbackPerCity` — income shape
  (existing).
- `BASE_INDUSTRY` — industry slots every nation gets regardless of population.
- `POP_PER_INDUSTRY` — living population required per additional industry slot.
- `MAX_INDUSTRY` — hard ceiling on the industry cap.
- `POPULATION.growthPerSec` — fractional population growth per game-second at full
  vitality (range 0–0.001; `0` disables growth). Controls how fast healthy nations
  repopulate over a match.
- `POPULATION.growthCapMult` — population ceiling as a multiple of each city's starting
  population (range 1.0–3.0; `1.0` disables growth). Bounds the long-game economy so
  growth can't run away.

## Acceptance Criteria

1. A city at full hp yields the same `incomeOf`, `gdpOf`, and `populationOf` as before
   this system (baseline invariant, unit-tested).
2. Reducing a city to 50% hp halves its contribution to its nation's living population,
   economic share, GDP, and income (unit-tested).
3. `industryCapOf` returns `BASE_INDUSTRY` at zero living population and is clamped at
   `MAX_INDUSTRY`; it decreases as cities are lost (unit-tested).
4. Queuing an industry structure at the cap is refused with a clear message; below the
   cap it succeeds (unit-tested).
5. In-app: damaged cities show a reddening halo on the map and an hp bar in their probe;
   destroying a city raises a toast; the production panel shows current/cap industry.
6. A full-health city's population grows each tick by `growthPerSec * dt`, a 50 %-hp city
   at half that rate, and a dead city not at all; raw population is capped at
   `pop0 * growthCapMult`; growth is deterministic with no RNG (unit-tested).

<br />

<p align="center">
  <sub>Every warhead that lands bleeds a nation's war machine, not just its kill count.</sub>
</p>
