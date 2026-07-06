<h1 align="center">Ground Forces Expansion</h1>

<p align="center">
  <b>Adds the fourth combat domain — ground forces that march over land and deliver close-range conventional strikes against land targets only.</b>
</p>

<br />

**Type**: New Small System (borderline — occupation mechanics explicitly deferred, see Phase 2)
**Scope**: Adds a land-warfare unit roster (Infantry, Artillery, Tank Battalion, Attack/Transport
Helicopters, Army Base) plus a unique Leadership Bunker, land movement mirroring naval steaming,
a ground-target engagement restriction, and a generic per-unit build-limit mechanic.
**Date**: 2026-07-05
**Estimated Implementation**: ~1 day (Phase 1). Phase 2 (occupation) is out of scope here.

## Overview

The game currently fights in three domains: missiles, air, and sea. This adds the fourth — ground
forces. The Army Base is the land counterpart of the Airstrip: a support structure that fields a
helicopter wing and is the build prerequisite for all mobile ground units. Infantry, Artillery,
and Tank Battalions are mobile land units that march over land (routed around oceans, exactly as
ships route around land) and deliver close-range conventional strikes against land targets only.
The Leadership Bunker is a unique (one per nation) hardened command structure with no gameplay
effect yet — a deliberate placeholder for future command mechanics (per Trenton, 2026-07-05:
"For now, nothing, I have later plans").

## Core Rules

### Land movement (new mechanic, mirrors naval)

1. Any unit with `landSpeed` marches like a ship sails: free (no point cost), continuous,
   waypoint-routed via `landRoute()` — the same A* used by `seaRoute()`, run over the
   complement of the 0.25° water mask, so marches path around oceans (and route through
   non-navigable inland water, which reads as terrain, not sea).
2. March destination may be anywhere on land, inside or outside territory (same freedom ships
   have at sea). `stopSail` (already generic) halts a march.
3. `landSpeed < navalSpeed` across the board — armies are the slowest movers in the game.

### Ground engagement restriction (new rule)

4. Units with `targets: "land"` (all three mobile ground units) may attack cities, land
   structures, and land units — **never** naval units (`domain: "sea"`) and never aircraft
   (`airSpeed`). Enforced in `commandAttack` with a clear error.
5. Helicopters carry no such restriction (they engage sea targets like other aircraft), and
   they cannot engage ballistic reentry vehicles (existing fighter rule, they're not
   `kind: "defense"` anyway).

### Army Base (mirrors Airstrip)

6. Fields a helicopter wing via the existing hangar/patrol system: `HANGAR_SPEC.armybase`,
   patrol type = attack helicopter. Attack helicopters fly CAS patrols; transport helicopters
   are wing logistics (like the transport aircraft).
7. All mobile ground units require an Army Base (`requires: "armybase"`), the same
   prerequisite pattern as Refinery → Factory.

### Leadership Bunker + build limits (new mechanic)

8. `maxCount: N` on any UNITS entry caps that type per nation: living units of that type plus
   queued orders must stay below N or `queueUnit` refuses. Generic — any unit can be capped later.
9. Leadership Bunker: `maxCount: 1`, highest structure HP in the game, cheap upkeep, **no other
   effect yet**. Its function arrives in a future design pass.

### AI

10. The opponent AI does not build ground forces in Phase 1 (out of its build order). Noted as
    a follow-up alongside occupation.

## Tuning Knobs

All values live in `src/game/data/constants.js` (UNITS entries / HANGAR_SPEC / PATROL_FIGHTER),
never hardcoded in systems — per repo standards.

| Unit                 | cost | build s | hp  | upkeep | landSpeed/airSpeed | range km | dmg | reload s | fireCost |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Army Base            | 480  | 20      | 85  | 1      | —                  | 60       | —   | —        | —        |
| Leadership Bunker    | 650  | 32      | 220 | 0.5    | —                  | —        | —   | —        | —        |
| Infantry             | 110  | 7       | 75  | 0.8    | 18                 | 250      | 14  | 2.2      | 6        |
| Artillery            | 210  | 11      | 45  | 1.2    | 13                 | 550      | 34  | 4.2      | 12       |
| Tank Battalion       | 190  | 9       | 70  | 1.5    | 26                 | 380      | 26  | 3.0      | 9        |
| Attack Helicopter    | 170  | 9       | 34  | 1.5    | 38 (air)           | 900      | 24  | 3.0      | 10       |
| Transport Helicopter | 120  | 7       | 40  | 0.8    | 34 (air)           | 60       | —   | —        | —        |

Wing: `armybase: {helo: 6, transporthelo: 2}`. Rationale: infantry = cheap, tough, weak punch;
artillery = glass cannon with the longest ground reach; tanks = fast flankers; all ground ranges
sit far below missile ranges so armies must march into theater. Balance pass via
`/balance-check` after playtest.

## Acceptance Criteria

- [ ] `landRoute()` returns a land-only path between two points on the same landmass and null
  across oceans; marching units follow it at `landSpeed`
- [ ] Infantry ordered against a destroyer or airborne jet is refused with an explanatory error;
  the same order against a city or SAM battery succeeds
- [ ] A second Leadership Bunker cannot be queued (limit error), including while the first is
  still in the production queue
- [ ] Army Base fields its helicopter patrol via the existing hangar system with no
  aircraft-code changes beyond data
- [ ] Regression: naval sailing, airstrip/carrier wings, and existing combat are unchanged
  (headless engine test passes)

## Phase 2 — Occupation (explicitly deferred)

Trenton's direction: infantry "should be able to occupy units/places as well such as cities,
airstrips, etc." Occupation transfers ownership — it touches income, city state, win conditions,
map rendering, and multiplayer authority, which exceeds quick-spec scope. **Run
`/design-system ground-occupation` before implementing.** Sketch to seed that pass: an infantry
unit holding position within capture radius of an enemy city/structure whose HP is below a
threshold for T uninterrupted seconds flips it to the attacker's slot.

## Systems Index

No `design/gdd/systems-index.md` exists yet (flagged in the compliance audit). When it is
created, ground forces belong as a Core-tier combat system alongside naval and air.
