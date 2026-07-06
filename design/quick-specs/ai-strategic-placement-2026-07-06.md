<h1 align="center">AI Strategic Placement & Defensive Doctrine</h1>

<p align="center">
  <b>The opponent AI stops piling everything onto its capital and instead sites each unit where it belongs — defenses over its cities, radar toward the front, industry in the safe interior — and defends its command bunker.</b>
</p>

<br />

Engine-side, all in `src/game/sim/tick.js` (+ tuning in `src/game/data/constants.js`).

## Problem

Every AI build was placed by `aiSpot(w, slot, myCap)` — a random point within ±2.4°
of the nation's **first city**. Consequences: everything clusters on the capital;
only ever one dome and one radar are built (`count === 0` gates), so every other
city is undefended; there is no notion of covering cities, facing a threat, or
protecting command assets. Units of every type stack in one blob.

Production timing was **not** a defect: the AI builds only through `queueUnit`
(pays cost, enters `n.prod.queue`) and units spawn only when the line completes in
`step()`. It already waits full build time, exactly like the player — this pass
preserves that and adds a regression check.

## Rules

- **Role-based siting** — every AI placement goes through `aiPlace(type)`, which
  classifies the unit and anchors it on a role-appropriate city, then samples spots
  around that city:
  - **Defense** → the most valuable **uncovered** protect-point (city or command
    asset), placed inside its own engagement range so it actually shields it.
  - **Sensor** (radar/OTH/sats) → the **frontier** city nearest the threat, biased
    toward the front, for early warning where it matters.
  - **Offense** → regional weapons (launcher/hypersonic) bias **forward** toward the
    front; global weapons (silo/orbital) sit in the **safe interior**.
  - **Industry** → the **safest** (farthest-from-front) city interior.
  - **Command** (leadership bunker, space HQ) → deep interior near the capital.
- **Spread, don't stack** — a candidate spot is rejected if it crowds a live
  **same-role** unit within `spreadKm`, so two radars / two factories / two domes
  never sit on top of each other. Different roles may co-locate (a dome beside a
  radar is good — radar-linking extends its range).
- **Cover the cities** — defenses are built until a target count is reached, each
  aimed at the most valuable point not yet inside a friendly defense envelope. The
  target scales with the number of protect-points, capped for the unit budget.
- **Protect command** — the AI raises exactly one leadership bunker once
  established, sites it deep in the interior, and the bunker counts as a
  high-value protect-point so defenses cover it.
- **Front awareness** — `frontPos` is the nearest at-war enemy capital (nearest
  neighbour in peacetime), the reference every directional bias orients to.
- **Determinism preserved** — all sampling uses the seeded `rand(w)`.

## Formulas

- `cityValue(c) = pop · (cap ? 1.5 : 1) + (cap ? 5e6 : 0)` — capital and population
  weighting for anchor/target ranking.
- `defenseCovers(pt) ⇔ ∃ friendly defense d : haversine(d, pt) ≤ defenseRange(d)`.
- `defenseTarget = clamp(round(protectPoints · defensePerPoint), 1, defenseMax)`.
- `radarTarget = clamp(round(cities · radarPerCity), 1, radarMax)`.
- Placement rejects a spot iff `∃ same-role live unit u : haversine(u, spot) < spreadKm`.

## Edge Cases

- **No reachable enemy** → `frontPos` falls back to the nearest neighbour capital;
  a truly isolated nation gets `null` and places without directional bias.
- **Landlocked capital / naval build** → `aiSeaSpot` still probes coastal water near
  the chosen anchor; returns null (skip) if none in reach — unchanged behavior.
- **All protect-points already covered** → defense target met; AI moves on to
  economy/offense instead of stacking redundant domes.
- **Anchor crowded** → after `spreadKm` candidates fail, `aiPlace` falls back to a
  plain valid spot near the anchor so a build is never silently dropped.
- **Fielding cap / deficit / queue gates** — all pre-existing gates
  (`aiUnitCap`, deficit-only-industry, `queueMax`) still apply first.

## Dependencies

- `sim/queries.js` — `inTerritory`, `placementBlocked`, `defenseRange` (reused).
- `sim/production.js` — `queueUnit` (unchanged; still the only build path → prod time).
- `data/constants.js` — new `AI_TUNING` knobs (below).
- `ai-economy-fairness-and-bmd-rules.md` — economic fairness preserved (still pays).

## Tuning Knobs

New in `AI_TUNING`: `spreadKm` (same-role spacing), `defensePerPoint`, `defenseMax`,
`radarPerCity`, `radarMax`, `bunkerMinCities`, `bunkerReserve`.

## Acceptance Criteria

- **GIVEN** an AI nation with several cities, **WHEN** it builds out, **THEN** its
  units are spread across multiple cities (not all within one cluster) and no two
  same-role units sit within `spreadKm`.
- **GIVEN** an AI with N protect-points, **WHEN** established, **THEN** it builds
  more than one defense and each of its most valuable points ends up inside a
  friendly defense envelope up to the defense target.
- **GIVEN** an established solvent AI, **WHEN** it can afford it, **THEN** it raises
  exactly one leadership bunker in its interior and a defense covers it.
- **GIVEN** any AI unit, **WHEN** queued, **THEN** it only appears after its full
  build time elapses (production-time regression check).
- **DETERMINISM** — identical `(seed, playerIso)` ⇒ identical AI placements.
