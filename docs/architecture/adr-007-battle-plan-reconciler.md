<h1 align="center">ADR-0007: Battle Plans as Client-Side Intent Driven by a Reconciler</h1>

<p align="center">
  <b>A battle plan is client-side intent; a reconciler turns it into ordinary engine attack commands, so the UI never owns game state and online play stays server-authoritative.</b>
</p>

<br />

- **Status**: Accepted
- **Date**: 2026-07-07
- **Related**: `design/gdd/battle-planning.md`, ADR-003 (authoritative server),
  `.claude/rules/ui-code.md` (UI never owns game state)

## Context

Battle Planning lets a player author reusable plans of attack — a roster of
offensive units, a set of enemy targets, an engagement range, and standing /
one-shot / overkill / auto-build behavior. We needed to decide where a "plan"
lives and how it turns into actual shots.

Two facts about the existing engine shaped the decision:

1. A strike order is already just `unit.targetId`, set by `commandAttack`, and the
   tick loop fires a unit at its target whenever it is in range and off cooldown
   (`tickPhases.js`). There is no separate "fire" concept to build.
2. UI must never own or mutate world state directly (`ui-code.md`); every change
   goes through an engine command, and in online play those commands are sent to
   the authoritative server (ADR-003).

## Decision

Plans are **player intent held in the UI** (`useBattlePlans`, session-scoped React
state), not world state. A **pure solver** (`src/game/sim/battlePlan.js`,
`solvePlan`) computes the fire allocation from world state + a plan, mutating
nothing. A **reconciler** (`useBattlePlanReconciler`) runs on a fixed cadence and
pushes the solve onto units through the *existing* sanctioned commands —
`commandAttack` for standing orders, `queueAmmo` (via `api.produceAmmo`) for
resupply — diffing so a steady state emits no commands.

- Standing plans are re-solved while armed and kept in sync; disarming clears only
  the orders the reconciler itself set.
- One-shot plans apply the solve once on an Execute nonce.
- The globe preview is drawn from the same solver (`planPreview`), so what the
  player sees is what will fire.

## Consequences

**Positive**

- No new firing/combat/tick code: reuses the standing-order pipeline wholesale.
- Complies with "UI never owns world state" — all mutation is through commands.
- The allocation core is a pure, deterministic function with unit tests
  (`tests/unit/battle-plan/`), independent of React and the renderer.
- Fog of war is respected for free — the client only sees/targets visible enemies.
- Online-safe: the reconciler only ever orders the local player's own units and
  diffs before sending; the server stays authoritative over whether a shot fires.

**Negative / trade-offs**

- Plans are session-scoped and do **not** persist across save/load in v1 (they
  reference match-specific unit ids). Persisting them would mean serializing intent
  with the save — a future extension.
- Two clients could re-solve slightly differently, but since each only orders its
  own units and firing is server-authoritative, that is cosmetic, not desync.
- The reconciler issues commands from the UI layer on a cadence; this is bounded by
  diffing (no change → no command) and a 300 ms throttle.

## Alternatives considered

- **Plans as first-class world state, solved in the tick.** Fully authoritative and
  deterministic across clients, but a large new engine subsystem with save-format
  and balance-test surface, for what is really player intent. Deferred; this ADR's
  approach is the smaller correct step and can be upgraded to this if online
  play later demands server-authoritative plans.
- **Explicit per-unit target assignment (no solver).** Maximum control but loses the
  auto-allocation that is the point of the feature; revisited only as an optional
  override layer later.
