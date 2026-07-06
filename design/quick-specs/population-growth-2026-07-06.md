# Quick Design Spec: Population Growth Over Time

**Type**: Addition
**System**: City Vitality / Population (`design/gdd/city-vitality.md`)
**Date**: 2026-07-06

## Change Summary

Cities' raw population grows each tick at a data-driven rate scaled by city
vitality (health), capped at a multiple of the city's starting population.
Damaged cities grow slowly; dead cities not at all. Growth feeds the existing
`populationOf` → industry-cap / domination pipeline unchanged.

## Motivation

Population is currently immutable — set once at world creation and only ever
eroded in effect (via vitality) when a city is bombed. The city-vitality GDD
already promises a nation "cannot queue more [industry] until population
**recovers** past the next threshold," but nothing makes population recover or
grow. This closes that gap: healthy, protected cities visibly grow their people
over a match, giving a long-game economic ramp and a reason to defend cities
beyond avoiding losses. Because growth is vitality-scaled, an unbombed nation
grows faster than a battered one — reinforcing the "bombing strangles their war
machine" fantasy and gently accelerating a dominant player toward the 50 %
domination victory instead of stalemating.

## Design Delta

The city-vitality GDD (Overview) currently states population is fixed and only
eroded by damage. This spec adds a growth term: between world creation and city
death, each living city's raw `pop` increases over time, bounded above.

## New Rules / Values

1. Each tick, for every **alive** city:
   `pop ← min(pop0 × growthCapMult, pop × (1 + growthPerSec × vitality(c) × dt))`,
   where `dt` is the game-seconds advanced this tick and `pop0` is the city's
   starting population (captured at world creation).
2. Growth is scaled by `vitality(c) = hp / maxHp`. A full-health city grows at
   the full `growthPerSec`; a 50 %-hp city at half; a dead city (`alive = false`)
   not at all.
3. Growth is capped: `pop` never exceeds `pop0 × growthCapMult`.
4. No RNG — growth is a pure, deterministic function of stored `pop`, `hp`, and
   `dt` (the same dt-dependence income already has).
5. Applied inside the existing single per-tick city pass in `tick.js` (before
   the domination tally), so it costs no extra iteration.

## Tuning Knobs (new `POPULATION` block in `src/game/data/constants.js`)

| Knob            | Default   | Range     | Category | Rationale                                                                                                                                                                     |
|-----------------|-----------|-----------|----------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `growthPerSec`  | `0.00015` | 0–0.001   | curve    | Fractional growth per game-second at full vitality. At default a full-health nation gains ≈ +20 % over a ~1200 s match, ≈ +5 % over a 300 s skirmish — visible, not dominant. |
| `growthCapMult` | `1.5`     | 1.0–3.0   | gate     | Ceiling as a multiple of starting pop; prevents runaway exponential and keeps industry-cap / domination math bounded. `1.0` disables growth.                                  |

## Affected Systems

| System                                 | Impact                                                     | Action Required                       |
|----------------------------------------|------------------------------------------------------------|---------------------------------------|
| Population (`queries.js populationOf`) | Reads higher `pop` over time                               | No change — reads live                |
| Industry cap (`industryCapOf`)         | Can cross `POP_PER_INDUSTRY` thresholds upward over a match | No change — intended economic ramp    |
| Income / GDP                           | Unaffected (keyed on `econ`, not `pop`)                    | No change                             |
| Domination win (`tick.js`)             | Vitality-scaled growth nudges a healthy leader toward 50 % | No change — reads live                |
| AI targeting                           | Weights by `pop`; grown cities marginally more attractive  | No change — acceptable                |
| Engine city creation (`engine.js`)     | Needs `pop0` baseline field                                | Add `pop0: c.pop \|\| 0`              |
| Legacy saves                           | Old cities lack `pop0`                                     | Fallback `pop0 ?? pop` (caps at 1.5× current) |

## Acceptance Criteria

1. A full-health city's `pop` increases each tick per `growthPerSec × dt` and is
   capped at `pop0 × growthCapMult` (unit-tested).
2. A city at 50 % hp grows at half the rate of an identical full-hp city; a dead
   city does not grow (unit-tested).
3. Growth is deterministic: identical `(pop, hp, dt)` sequence yields identical
   results, no RNG (unit-tested).
4. `growthCapMult = 1.0` yields zero net growth (disable switch works).
5. In-app: over a long, mostly-peaceful match a healthy nation's population
   readout visibly climbs; a heavily bombed nation's does not recover
   meaningfully.
6. No regression: for one tick at full health with tiny `growthPerSec`,
   pre-existing income / industry / domination values are unchanged within
   tolerance.

## GDD Update Required?

Yes — `design/gdd/city-vitality.md`: Overview, Detailed Rules, Formulas, Tuning
Knobs, and one Edge Case updated to introduce the growth term, the cap, and the
legacy-save `pop0` fallback.
