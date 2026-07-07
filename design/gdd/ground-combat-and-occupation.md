<h1 align="center">Ground Combat &amp; Occupation</h1>

<p align="center">
  <b>Ground forces fight as ground forces — direct fire, not interceptable missiles — and infantry/tanks capture the states they hold.</b>
</p>

<br />

**Type**: Combat-model change (ground direct fire) + New System (occupation / territory capture)
**Supersedes**: Phase 2 of `design/quick-specs/ground-forces-expansion-2026-07-05.md` (occupation, previously deferred)
**Date**: 2026-07-06

## 1. Overview

Two coupled changes to the land war:

1. **Direct-fire ground combat.** Infantry, Tanks, and Artillery (`targets: "land"`) no
   longer route their attacks through `launch()` — the shared code path that fires an
   interceptable projectile through the missile-defense loop (SAM/Patriot/THAAD/Aegis).
   That path is for missile and warhead platforms (silos, launchers, hypersonic
   batteries, ships, aircraft). Ground units instead deal **direct fire**: damage lands
   immediately on the target when the unit is in range and off cooldown. A tank shell is
   not something a THAAD battery shoots down.
2. **Occupation.** An Infantry or Tank battalion that holds an enemy city — after the
   city's local defenders have been cleared — captures it over time. Because territory in
   DomeBreak is a Voronoi partition of living cities (see `inTerritory`), flipping a
   captured city's `slot` transfers its surrounding territory automatically. Capture flips
   the **entire state** the city belongs to, so a captured province becomes part of the
   occupier's nation — income, population, and map all follow.

## 2. Player Fantasy

Missiles level cities; armies *take* them. The player who has only ever traded strikes now
has a second way to win: land an army, grind down the garrison, and roll the flag forward
across the map, watching enemy provinces turn their color. Each unit finally feels like
itself — infantry is the cheap, tough occupier that plants the flag; tanks are the fast
maneuver arm that both punches and captures; artillery is the long-reach gun that softens a
target but can't hold ground.

## 3. Detailed Rules

### 3.1 Direct-fire ground combat

- A unit is a **ground combatant** iff `UNITS[type].targets === "land"` (Infantry,
  Artillery, Tank). These are `kind: "offense"` and already restricted to land targets by
  `commandAttack`.
- On the firing tick, when a ground combatant has a live, in-range, at-war target and its
  cooldown is clear, it deals `damage × dmgMult` **directly** to the target's hp (no
  projectile is created, nothing enters `w.projectiles`, no interceptor can engage it).
  Cooldown resets to `reload × reloadMult`.
- The strike emits the existing `hit` / `destroy` events, so map explosions, kill toasts,
  and the news ticker all fire exactly as they do for a missile impact — only the
  in-flight, interceptable phase is removed.
- All other offensive units (missile/warhead platforms, ships, aircraft, helicopters) are
  unchanged and still fire interceptable projectiles via `launch()`.

### 3.2 Occupation / capture

- **Eligible captors**: units with `UNITS[type].capture === true` — Infantry and Tank
  only. Artillery cannot capture.
- **Target**: any living city not already owned by the captor, whose owner the captor is at
  war with.
- **Contest gate ("clear enemies first")**: capture only progresses while **no** unit
  hostile to the captor (`hp > 0` and at war with the captor, of any kind — the garrison,
  its SAMs, anything) is within `CAPTURE.contestKm` of the city. Any hostile presence
  freezes and decays progress.
- **Hold**: while at least one eligible captor of slot S sits within `CAPTURE.holdKm` of the
  city and the contest gate is clear, the city accrues capture progress toward S at
  `dt / CAPTURE.captureSec` per second. Progress is tracked per city as
  `c.capture = {slot, progress}`.
- **Decay / reset**: if no eligible captor of the tracked slot is present, or the contest
  gate is not clear, progress decays at `CAPTURE.decayPerSec`. Progress hitting 0 clears
  the tracker so a different attacker can start fresh. A captor of a *different* slot
  arriving while progress belongs to another resets the tracker to the new slot.
- **Flip (whole state)**: when progress reaches 1, every living city sharing the captured
  city's **current owner and `state` name** flips `slot` to S (the whole province, per
  Trenton's direction). Captured cities keep their hp/pop/econ — they are occupied, not
  destroyed — and immediately produce for the occupier. The tracker clears. A `captured`
  event is emitted (news headline + sfx).

## 4. Formulas

- Direct-fire damage: `dealt = UNITS[type].damage × (nation.dmgMult ?? 1)` (identical to the
  conventional damage the projectile path computed; warhead multiplier is always 1 for
  conventional units, so nothing changes but the delivery).
- Capture progress per tick: `progress += dt / CAPTURE.captureSec` when held & uncontested;
  else `progress -= CAPTURE.decayPerSec × dt`, clamped to `[0, 1]`.
- Time to capture an uncontested city from 0: `CAPTURE.captureSec` game-seconds.

## 5. Edge Cases

- **City dies mid-capture** (hp → 0 from bombardment): a dead city is not capturable; its
  tracker is dropped. You occupy living cities, you don't capture rubble.
- **Contest arrives mid-capture**: progress freezes then decays; it does not instantly
  reset, so a brief skirmish doesn't wipe a nearly-complete capture.
- **Two attackers, different nations**: last eligible captor present owns the tracker;
  arrival of a different slot resets progress (no shared progress bar).
- **Peace/war flips**: if the captor is no longer at war with the owner, the city is no
  longer a valid target and its tracker is dropped.
- **Capital capture**: no special case — a capital flips its own state like any city
  (Trenton chose state-scope, not decapitation-scope). Eliminating a nation still happens
  through the existing "no living cities" path once all its cities are captured or destroyed.
- **Determinism**: capture is a pure function of positions, ownership, war state, and dt —
  no RNG — so replays/tests stay stable.

## 6. Dependencies

- `inTerritory` (queries.js) — territory is derived from city ownership; capture needs no
  separate territory bookkeeping.
- `atWar` (queries.js) — captor/owner and contest hostility checks.
- `commandAttack` (production.js) — already enforces the land-target restriction.
- Event pipeline (`hit`/`destroy`/`captured`) — LiveGame explosions & toasts, NewsTicker.
- Income/population/industry queries — all read `c.slot` live, so a flipped city is picked
  up with no cache invalidation.

## 7. Tuning Knobs

All in `src/game/data/constants.js` (`CAPTURE` block + per-unit `capture` flag) — never
hardcoded in systems:

| Knob                  | Default | Meaning                                                        |
| :-------------------- | :------ | :------------------------------------------------------------- |
| `CAPTURE.holdKm`      | 70      | captor must be within this of the city center to hold it       |
| `CAPTURE.contestKm`   | 140     | any hostile unit within this of the city freezes capture       |
| `CAPTURE.captureSec`  | 22      | uninterrupted game-seconds on-site to flip the state           |
| `CAPTURE.decayPerSec` | 0.15    | fraction/sec progress bleeds off when unheld or contested      |
| `UNITS.infantry.capture` | true | infantry can occupy                                            |
| `UNITS.tank.capture`  | true    | tanks can occupy                                               |

## 8. Acceptance Criteria

- [ ] An infantry/tank/artillery attack order lands damage with **no** projectile created
      and **no** interceptor engagement (a SAM battery next to the target never fires at it).
- [ ] Ground strikes still produce map explosions, kill toasts, and news headlines.
- [ ] Infantry held on an enemy city with its defenders cleared captures it within
      ~`captureSec` seconds; the city and every city in its state flip to the player's color
      and start producing income for the player.
- [ ] A hostile unit within `contestKm` of the city halts capture progress.
- [ ] Artillery alone cannot capture (no `capture` flag), even when holding an undefended city.
- [ ] Regression: missile/naval/air combat, interception, MIRV split, and fallout are
      unchanged; `npm run lint` clean, `npm run build` green.
