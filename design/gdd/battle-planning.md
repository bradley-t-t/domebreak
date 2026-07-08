<h1 align="center">Battle Planning</h1>

<p align="center">
  <b>Author reusable plans of attack — pick your launchers, choose targets, set the reach, and let the plan fly.</b>
</p>

<br />

## 1. Overview

Battle Planning is a left-docked command surface where the player authors one or
more named **attack plans**. A plan is a roster of the player's offensive
platforms (missile silos, TELs, and other `kind:"offense"` units), a set of enemy
targets, an **engagement-range** dial, and a handful of toggles. A plan can run as
a **standing order** (armed, continuously re-solved as the battlefield changes) or
be **executed one-shot**. The system auto-allocates each attacker to a target
under a no-overkill rule and a fair-spread rule across enemy nations, previews the
whole strike on the globe as attacker→target arcs, and can optionally auto-build
the munitions the plan consumes. Plans are player **intent** only — a pure solver
(`src/game/sim/battlePlan.js`) computes the fire allocation and a reconciler pushes
it onto units through the existing `commandAttack` standing-order pipeline, so no
new firing/combat code is introduced.

## 2. Player Fantasy

You are the war planner, not the trigger-puller. You draw up "Decapitation
Strike" and "Coastal Suppression" the way a real staff drafts contingencies:
these silos, those cities, this reach. You minimize the panel and watch your plan
laid over the globe — lines reaching from every silo to its mark. Then you arm it
and the campaign runs itself, re-tasking as targets fall and topping up warheads
so the pressure never lets up. When you want a single decisive blow, you load a
one-shot plan and fire it all at once.

## 3. Detailed Rules

- **Plans**: up to `BATTLE_PLAN.maxPlans` named plans. Each carries a color
  (preview hue), an attacker roster, a target set, an engagement range, a mode,
  and the overkill / auto-build toggles.
- **Attacker rosters are exclusive**: a unit belongs to at most one plan. Adding a
  unit to plan B removes it from plan A, so every attacker draws exactly one
  preview line and the allocation is unambiguous. Target sets may overlap between
  plans.
- **Attackers** are the player's live, commandable offensive units
  (`UNITS[type].kind === "offense"`, `hp > 0`). Airbases/carriers field aircraft
  that auto-engage and are **not** commandable via `commandAttack`, so they are out
  of scope for v1 rosters (see Edge Cases).
- **Targets** are enemy entities the player is at war with (`atWar`), resolved to
  cities or units by `findTarget`. Enemy units must be visible (fog of war) to be
  picked; dead or now-neutral targets are ignored by the solver.
- **Assignment** (auto): each attacker is matched to at most one in-reach target.
  - *No-overkill* (default): attackers stack on a target only until their combined
    shot damage covers its remaining hp; once a target is **saturated** no further
    attackers commit to it. With **Overkill** on, attackers keep piling on.
  - *Fair spread*: when several enemy **nations** are targeted, each attacker
    prefers the enemy nation that has drawn the least committed firepower so far, so
    no single enemy is dogpiled while another is ignored. Ties break to the nearest
    target, then to the one with the most hp still standing.
- **Engagement range** (one dial per plan): an attacker may fire at a target only
  if it is within the dial's distance **and** within the platform's own hardware
  range. The dial can only shorten reach, never extend it. Targets past the dial
  are held-fire (they show as out-of-range in the status readout).
- **Modes**:
  - *Standing* — while **armed**, the plan is re-solved on a fixed cadence and each
    attacker's standing order is kept in sync with the solve. Disarming clears the
    orders the plan set (hold fire).
  - *One-shot* — **Execute** applies the current solve once (sets standing orders)
    and does not keep managing them.
- **Auto-build munitions** (per plan): when on, the plan keeps the nation's warhead
  stock topped up for its assigned attackers, queuing at most one round per plan
  per `autoBuildIntervalSec` through the existing `queueAmmo`. Skipped silently when
  the nation is in deficit / out of points (the underlying command's own guard).
- **Preview**: while the Battle Planning screen is open on a plan with any roster,
  the globe draws that plan's attacker→target great-circle arcs and a ring on each
  planned target, in the plan's color, from the same solve the reconciler fires.
  Minimizing the panel keeps the preview so the player can read the whole strike.

## 4. Formulas

Variables: `u` = attacker unit, `t` = target, `n` = attacker's nation, `plan` =
the plan, `dial` = `plan.engagementKm`.

- **Shot damage**: `shot(u) = UNITS[u.type].damage × n.dmgMult × WARHEADS[loaded(u)].dmgMult`,
  where `loaded(u)` is the unit's loaded warhead or `initialWarhead(u.type)`.
  Example: a silo (`damage 55`) with the default Standard round (`dmgMult 1.0`) at
  `dmgMult 1` → `55`.
- **Reach**: `reach(u) = min(UNITS[u.type].range × n.rangeMult, dial)`. Example:
  silo `range 20000`, `rangeMult 1`, `dial 12000` → `12000` km. A launcher
  (`range 8000`) with `dial 12000` → `8000` km (hardware governs).
- **In range**: `t` is eligible for `u` iff `canEngage(u,t)` and
  `haversine(u, t) ≤ reach(u)`. `canEngage` mirrors `commandAttack`: ground units
  (`targets:"land"`) may not engage sea/air units.
- **Saturation** (no-overkill): a target is saturated once
  `Σ shot(assigned attackers) ≥ remainingHp(t)`, where
  `remainingHp(city) = city.hp ?? city.maxHp` and `remainingHp(unit) = unit.hp`.
- **Fair-spread pick**: among a unit's in-reach, non-saturated targets, choose
  `argmin` of committed damage to the target's **nation**, tie-broken by ascending
  `haversine(u, t)`, then by descending `remainingHp(t) − allocated(t)`.
- **Auto-build want**: for each assigned warhead-capable attacker, one desired
  round of its loaded warhead. The reconciler queues warhead `wh` while
  `nation.ammo[wh] + prodCount(n,"ammo",wh) < wantShots(wh)`.

## 5. Edge Cases

- **No target in reach** → the attacker is reported *out of range* and is given no
  order (it holds fire).
- **All in-reach targets saturated** (no-overkill) → the attacker is reported
  *idle* and given no order. Turning on Overkill assigns it anyway.
- **Target dies / makes peace / leaves fog** → dropped from the next solve; a
  standing plan re-tasks its attackers, and any attacker left with nothing is
  released to hold fire.
- **Attacker destroyed or scrapped** → silently removed from the solve; its plan
  membership is inert (the missing id is ignored). No stale order remains because
  the unit is gone.
- **Unit stolen by another plan** (exclusive rosters) → removed from the old plan's
  roster immediately; if the old plan was standing and had it firing, the release
  pass clears that unit's order unless the new plan re-commits it.
- **Nation in deficit** with auto-build on → the resupply queue call is rejected by
  `queueAmmo`'s own guard; the plan simply does not build until points recover.
- **Airbases / carriers** in a roster → not supported in v1 (their air wings
  auto-engage and take no `commandAttack` order). They are excluded by the
  `kind === "offense"` filter; tasking air wings is a future extension.
- **Online play** → orders still flow through `api.commandAttack`, which sends to
  the authoritative server; the reconciler only ever orders the local player's own
  units and diffs before sending, so steady state emits nothing.

## 6. Dependencies

- **Combat / orders** (`src/game/sim/combat.js`, `production.js`): `findTarget`,
  `commandAttack` (standing orders), `queueAmmo`, `prodCount`. Battle Planning is a
  new consumer of these; the firing itself remains entirely in the existing tick
  (`tickPhases.js`). See `ground-combat-and-occupation.md` for the ground-target
  rule this system mirrors.
- **Queries** (`queries.js`): `atWar` (target eligibility). **World state**
  (`worldState.js`): `nationOf`.
- **Data** (`units.js`, `warheads.js`): `UNITS` (range/damage/kind/targets),
  `WARHEADS` (`dmgMult`), `initialWarhead`, `armamentOf`, `unitLabel`.
- **Fog of war** (`fog-of-war.md`): enemy-unit targets must be visible to be
  picked; this system respects that (targets are added from the visible map).
- **HUD** (`useLiveLayers.js` / `MapLayers.jsx`, `hudLayout.js`, `LiveHud.jsx`,
  `AdjustablePanel.jsx`): the preview overlay and the docked panel reuse the
  existing command-line / range-ring / adjustable-panel patterns.

## 7. Tuning Knobs

All in `BATTLE_PLAN` (`src/game/data/constants.js`):

- `maxPlans` (default 8; safe 1–16) — how many plans a player may hold at once.
- `defaultEngagementKm` (12000; 500–20000) — starting reach dial for a new plan.
- `minEngagementKm` / `maxEngagementKm` (500 / 20000) — slider bounds; the ceiling
  matches the silo's global range so the dial never claims more than any platform
  can do.
- `engagementStepKm` (500) — slider granularity.
- `autoBuildIntervalSec` (4; 1–20) — min game-seconds between auto-resupply queue
  actions per plan; higher spreads out spending, lower refills faster.
- `planColors` (8 hues) — per-plan preview arc/target colors, deliberately distinct
  from the faction palette.

## 8. Acceptance Criteria

1. A "Battle Plan" entry appears in the top command bar; opening it docks the
   Battle Planning panel on the left and closing it (or opening another screen)
   dismisses it and cancels pick-on-map.
2. The player can create, rename, duplicate, and delete multiple plans; a unit
   added to a second plan is removed from the first (exclusive rosters).
3. Attackers and targets can be added both from the panel (quick-add-by-type) and
   by clicking units/cities on the map in the matching pick mode; only own
   offensive units qualify as attackers and only at-war enemies as targets.
4. With two enemy nations targeted and two attackers, the solver sends one attacker
   to each nation rather than both to the nearer one (verified by
   `test_solver_spreads_two_attackers_across_two_enemy_nations`).
5. With no-overkill, attackers stack on a target only until its hp is covered, then
   idle; Overkill commits them all
   (`test_solver_stacks_just_enough_attackers_to_kill_then_idles_the_rest`,
   `test_solver_overkill_toggle_commits_every_attacker`).
6. Lowering the engagement dial below a target's distance holds fire even though the
   platform could physically reach it; raising it re-enables the shot
   (`test_solver_engagement_dial_*`).
7. Arming a standing plan issues `commandAttack` orders matching the solve;
   disarming clears exactly those orders. Executing a one-shot plan applies the
   solve once.
8. While the panel is open on a plan with a roster, the globe shows attacker→target
   arcs and target rings in the plan's color; minimizing keeps the preview.
9. `npm run build` is green and `npm run lint` reports 0 errors.
