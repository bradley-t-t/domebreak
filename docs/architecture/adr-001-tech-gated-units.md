<h1 align="center">ADR-001: Tech-Gated Units</h1>

<p align="center">
  <b>Techs unlock units through a paired <code>unlocks</code>/<code>requiresTech</code> data contract enforced by a single <code>queueUnit</code> guard.</b>
</p>

<br />

## Status

Accepted

## Date

2026-07-05

## Last Verified

2026-07-05

## Decision Makers

Sunday (studio agent) on behalf of Trenton; data-contract phase of the tech-tree
eras expansion.

## Summary

The 12-tier tech tree must unlock new units as a nation advances, not merely
boost stats. This ADR establishes the mechanism: a tech carries `unlocks:
"<unitType>"` and the corresponding unit carries `requiresTech: "<techId>"`,
enforced by a single guard in `queueUnit`; space assets additionally require a
standing `Space Command HQ` via `requiresUnit`.

## Engine Compatibility

| Field                     | Value                                                                 |
| :--- | :--- |
| **Engine**                | GoldenDome custom real-time tick engine (this repo's own JS)          |
| **Domain**                | Core / Scripting (production + research systems)                      |
| **Knowledge Risk**        | LOW — no third-party engine API; all in-repo code                     |
| **References Consulted**  | `src/game/data/constants.js`, `src/game/sim/production.js`, `docs/spec.md` |
| **Post-Cutoff APIs Used** | None                                                                   |
| **Verification Required** | Headless: research an unlock tech → gated unit builds; before it, refused. |

## ADR Dependencies

| Field             | Value                                                                         |
| :--- | :--- |
| **Depends On**    | None                                                                           |
| **Enables**       | Naval subs/ASW and space-asset units; deeper AI build logic                    |
| **Blocks**        | Phase-2 engine/production work (the `requiresTech` guard) cannot start until this is Accepted |
| **Ordering Note** | Data contract (this ADR + `constants.js`) lands before any Phase-2 fan-out.    |

## Context

### Problem Statement

The old flat 30-tech tree only multiplied nation stats. The expansion needs the
arsenal to *modernize* over a match — completing a tech must make a new unit
buildable. We need a mechanism that is data-driven, uniform across all 14 new
units, and cheap to enforce in the hot production path.

### Current State

`UNITS` entries already support a `requires: "<unitType>"` field (structural
prerequisite, e.g. refinery requires factory) and `maxCount`. Research completion
is recorded in `nation.research.done` (array of tech ids). `queueUnit` in
`sim/production.js` validates affordability, siting, and `requires` before
enqueuing. There is no tech→unit gate today.

### Constraints

- No new systems in the hot path — the gate must be a single membership check.
- Fully data-driven: the gate is declared in `constants.js`, never hardcoded in
  systems (per `src/CLAUDE.md`).
- Backward compatible: existing Cold War units carry no `requiresTech` and stay
  buildable from turn one.

### Requirements

- Every unlock tech maps to exactly one buildable unit; every gated unit has a
  reachable tech gate (no orphans).
- Space assets require a standing `Space Command HQ` in addition to their tech.
- The gate reads `nation.research.done` (already populated on tech completion).

## Decision

Introduce two paired, optional fields:

- On a tech (`TECHS[id]`): `unlocks: "<unitType>"`.
- On a unit (`UNITS[type]`): `requiresTech: "<techId>"` and, for orbital assets,
  `requiresUnit: "spacehq"`.

`queueUnit` gains guards (owned by the Phase-2 engine agent, specified here):

```
if (def.requiresTech && !n.research.done.includes(def.requiresTech))
    return { error: `Requires ${TECHS[def.requiresTech].name}.` };
if (def.requiresUnit && !ownsUnit(w, n.slot, def.requiresUnit))
    return { error: `Requires ${UNITS[def.requiresUnit].label}.` };
```

`unlocks` is otherwise inert — tech completion already appends to `done`, so no
separate unlock event is needed; the gate reads `done` directly.

### Architecture

```
TECHS[id].unlocks ──┐
                    ├─ (must match) ─→ enforced by queueUnit guard
UNITS[type].requiresTech ┘
                                       reads nation.research.done
UNITS[type].requiresUnit: "spacehq" ─→ reads owned-units query
```

### Key Interfaces

```
tech:  { ..., unlocks?: string /* unitType */ }
unit:  { ..., requiresTech?: string /* techId */, requiresUnit?: string /* unitType */ }
```

### Implementation Guidelines

- The `unlocks ↔ requiresTech` pairing is a hard invariant; the data contract
  ships a self-check (see `constants.js` verification). The `eco5` tech unlocks
  the amphib/replenish pair — both units carry `requiresTech: "eco5"`, so one
  `unlocks` string legitimately gates two units.
- UI greys locked units with a "Requires <Tech>" tooltip; the Phase-2 UI agent
  reads `requiresTech`/`requiresUnit` and `nation.research.done`.

## Alternatives Considered

### Alternative 1: Unlock event list on the nation

- **Description**: On tech completion, push unit types into `nation.unlockedUnits`.
- **Pros**: O(1) lookup without dereferencing the tech.
- **Cons**: Duplicates state already in `research.done`; risks desync on load;
  more code in the tick.
- **Rejection Reason**: `research.done` already is the source of truth; a derived
  membership check is simpler and desync-proof.

### Alternative 2: Encode gates in production UI only

- **Description**: Grey units in the UI but let the engine build anything.
- **Cons**: Non-authoritative; AI and any scripted build path bypass the gate.
- **Rejection Reason**: The gate must be authoritative in `queueUnit`.

## Consequences

### Positive

- One uniform, data-driven mechanism for all 14 new units.
- The arsenal modernizes exactly as the tree advances; no bespoke per-unit logic.

### Negative

- Two fields must be kept in sync across `TECHS` and `UNITS` (mitigated by the
  self-check in the data contract).

### Neutral

- `requiresUnit` generalizes the existing `requires` idea to owned-unit prereqs
  for the space branch.

## Risks

| Risk | Probability | Impact | Mitigation |
| :--- | :--- | :--- | :--- |
| `unlocks`/`requiresTech` drift out of sync | Low | Med | Data-contract self-check + this ADR's invariant |
| Space assets buildable without HQ | Low | Med | `requiresUnit` guard in `queueUnit` |

## Performance Implications

| Metric           | Before | Expected After | Budget |
| :--- | :--- | :--- | :--- |
| CPU (frame time) | n/a    | +1 array `.includes` per queue action (not per tick) | negligible |

## Migration Plan

1. Land the data contract (`constants.js`: `unlocks`, `requiresTech`,
   `requiresUnit`, new units) — this file's Phase 1.
2. Phase-2 engine agent adds the `queueUnit` guards.
3. Phase-2 UI agent greys locked units.

**Rollback plan**: Remove `requiresTech`/`requiresUnit` from `UNITS` and the
guard from `queueUnit`; units revert to unconditionally buildable.

## Validation Criteria

- [ ] Researching an unlock tech makes its gated unit buildable.
- [ ] Before the tech, `queueUnit` refuses with the tech name.
- [ ] A space asset is refused until a `Space Command HQ` stands.
- [ ] No orphan techs (unlock with no unit) or orphan gated units (no reachable tech).

## GDD Requirements Addressed

| GDD Document                   | System    | Requirement                                              | How This ADR Satisfies It                              |
| :--- | :--- | :--- | :--- |
| `design/gdd/tech-tree-eras.md` | Tech Tree | "Completing a tech unlocks a new buildable unit"         | `unlocks`/`requiresTech` pairing enforced in `queueUnit` |
| `design/gdd/naval-subs-asw.md` | Naval     | "Subs and logistics ships gate on economy/command techs" | Naval units carry `requiresTech` matching those techs   |

## Related

- `design/gdd/tech-tree-eras.md`, `design/gdd/naval-subs-asw.md`
- `src/game/data/constants.js` (TECHS `unlocks`, UNITS `requiresTech`/`requiresUnit`)
- `src/game/sim/production.js` (`queueUnit` guard — Phase 2)
