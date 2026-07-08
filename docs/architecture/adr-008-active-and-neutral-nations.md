<h1 align="center">ADR-0008: Bounded Active Nations Over a Passive-Neutral World</h1>

<p align="center">
  <b>At most 8 live AI nations per match, with every other country a passive, capturable neutral — trading a 222-nation free-for-all for a focused match and a full-capability AI.</b>
</p>

<br />

- **Status**: Accepted (design) — implementation sequenced per the roadmap
- **Date**: 2026-07-08
- **Related**: `design/ai-match-model-redesign-roadmap.md`,
  `design/gdd/match-model-and-neutral-world.md`, `design/gdd/lobby-and-ai-fill.md`,
  `design/gdd/ai-behavior-overhaul.md`, ADR-003 (authoritative server),
  ADR-004 (matchmaking bot lobby)

## Context

DomeBreak instantiates **every country on the world map as a live AI nation** (~222):
`buildSetup(data, playerIso, null, …)` enumerates all ISOs with cities
(`newGame.js:31-34`); solo and multiplayer both build the full world and differ only
in which slots have `isAi = false` (`match.js:50-61`). This forces performance
compromises (a level-of-detail think throttle, a global unit cap `aiUnitCap`, sparse
cadence) and yields a shallow AI. We are moving to **at most 8 active nations per
match**, with every other country a **passive, capturable neutral**, so we can afford
a full-capability AI and a focused match.

The design constraints:
- The map, territory (a Voronoi partition keyed on `c.slot`), and economy are all
  `c.slot`-keyed and indifferent to who "participates."
- Relations start empty (`engine.js:23`) and **all wars are AI-emergent** via
  `diploTick`; no nation is scripted into a war at setup.
- Victory (`stepVictory`, `tickPhases.js:404-435`) is coupled to the 222-count via
  `aliveNations.length ≤ 1` and a `myPop / totPop` domination denominator.
- The server is the sole authority for AI/diplomacy/occupation/victory
  (`tick.js:40` predict-skip); clients only predict their own actions (ADR-003).

## Decision

Introduce a per-nation **`active` flag** rather than removing nations from the world.

- **Keep all 222 nation objects.** Add `active` in the single fleshing-out point
  (`createWorld`, `engine.js:14`) and select the active set in `buildSetup` (player's
  ISO + up to 7 scattered great-power ISOs). The map, territory, and economy keep
  working unchanged.
- **Neutral = never scheduled.** Gate the four AI/diplomacy loops on `active`
  (`aiTick.js:236`, `diploTick.js:131`, the two candidate scans, and
  `warResolution.js warTick`). Because relations start empty and wars are emergent, a
  nation that never runs these loops is automatically passive — **no new stand-down
  code**. Neutrals stay capturable; occupation reads only `c.slot`, positions, and a
  relaxed capture gate.
- **Rework victory to reason about the active set**, not the world count: last-active-
  standing, plus a domination win measured as the human's share of *world* population
  (so captured neutrals count toward the win). New `NEUTRAL` tuning block replaces
  `DIPLOMACY.dominationPopFrac`.
- **AI-fill and all AI run server-side.** The lobby seats AI bots into unclaimed
  active slots via the existing per-slot `isAi` seam; authority is unchanged.

## Consequences

**Positive**
- Minimal blast radius: one flag, one selection point; rendering/territory/economy
  untouched. `AttractSim.jsx:82` already proves the small-roster `buildSetup` path.
- Removes the reason for the LOD throttle and unit cap; the AI can think fully.
- Neutral world becomes meaningful gameplay (expansion/capture) and a design surface
  for the new AI, at essentially no simulation cost (neutrals never tick).
- Server authority model is preserved as-is.

**Negative / risk**
- **Victory logic must be rewritten** and is the highest-risk change; it must be unit-
  tested against a constructed active set before anything downstream is trusted.
- **Capturing neutrals needs the `atWar` gate relaxed** (`occupation.js:51`) so actives
  can occupy without a formal declaration — a deliberate divergence from active-vs-
  active rules.
- Several files narrate the "~222 world" in comments and compute
  `opponents = nations.length − 1`; these become stale and must be swept
  (`App.jsx:287,306`, `match.js:208`, save metadata, and the doc-block comments).

## Alternatives considered

- **Actually remove non-active nations from the world array.** Smaller `nations`
  array, but breaks slot-indexed assumptions, drops the countries off the map, and
  kills the conquerable-world gameplay. Rejected — the whole-map identity is core.
- **Model neutrals as a special low-effort AI that "stands down."** More code and per-
  tick cost for the same result the "never schedule" approach gets for free.
- **Keep 222 active but deepen the AI in place.** Doesn't remove the performance
  ceiling that caps AI quality, and keeps matches unfocused. Rejected.
