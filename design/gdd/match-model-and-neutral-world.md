<h1 align="center">Match Model &amp; Neutral World</h1>

<p align="center">
  <b>Eight nations fight for a living planet — the rest of the world is real estate.</b>
</p>

<br />

## 1. Overview

A match has at most **8 active nations** (human or AI). Every other country on the
map remains a **passive neutral**: it never builds units, never declares war, and
never takes a turn — but its cities are owned, rendered, and **capturable**. The
human **picks their country**; up to 7 AI active nations are seeded scattered across
the globe. This replaces the current model where all ~222 countries are live AI
nations (`newGame.js:31-34`), which forced heavy performance compromises and a
shallow AI. The change is deliberately low-friction: all 222 nation objects still
exist (so territory, economy, and rendering are untouched), gated by one new
per-nation `active` flag. Victory is reworked to be measured against the **active
set**, not the whole world.

## 2. Player Fantasy

You are one of a handful of great powers contesting a real, recognizable Earth. The
map isn't a static backdrop — it's a board of neutral nations to liberate, occupy,
and absorb as you race your rivals to dominance. A match feels like a focused world
war with room to maneuver, not a 222-way scramble. Every neutral border is an
opportunity and a buffer; every rival is a named, capable adversary you can actually
track.

## 3. Detailed Rules

- **Active nations**: 2–8 per match. Exactly one is the human in singleplayer (the
  rest AI); in multiplayer 2–8 humans, optionally topped up with AI (see the Lobby
  GDD). An active nation is a full participant — it builds, researches-tier units,
  wages war, and can win or lose.
- **Neutral nations**: every country not chosen as active. A neutral:
  - never runs the AI build/decision loop (`aiTick`) or the diplomacy loop
    (`diploTick`) — so it builds nothing and declares no war, with **no new
    "stand-down" code** (its relations simply stay empty);
  - keeps its cities, territory (Voronoi on `c.slot`), population, and economy;
  - is **capturable** by any active nation without a formal war declaration;
  - is **inert but garrisoned** — each neutral city holds a small static defense
    value so taking it costs a real strike or ground assault, not a free click;
  - does not appear as a diplomacy partner (you can't ally a neutral) and is not an
    opponent for victory purposes.
- **Seeding (B)**: the human selects their country by ISO (existing New Game / Lobby
  flow). The 7 (or fewer) AI actives are chosen to be **geographically dispersed** —
  drawn from a great-power pool (`GREAT_POWERS`, `newGame.js:19`) and spread so no two
  actives (including the human) start crowded together, giving each room to expand
  into neutrals before colliding.
- **Capturing neutrals**: an active nation may strike and occupy neutral cities at
  will. Occupation uses the existing ground-capture mechanic (`occupation.js`), with
  the `atWar` gate relaxed so neutral cities are always capturable by an active
  nation. Captured neutral cities flip to the capturing nation's slot and become part
  of its territory and economy immediately.
- **Active vs active**: unchanged from today — war/peace/alliance via diplomacy, full
  combat, capture, and surrender.
- **Elimination**: an active nation "dies" when it holds zero living cities
  (`tickPhases.js:417`). A neutral is never "eliminated" as a player — losing all its
  cities just means it's been fully absorbed.

## 4. Formulas

Variables: `A` = set of active nation slots, `me` = human slot, `pop(slot)` = living
population held by a slot, `totActivePop = Σ_{s∈A} pop(s)`, `totWorldPop` = all living
population (active + neutral).

- **Active-set selection**: `A = {me} ∪ pickScattered(pool \ {me}, k)` where
  `k = activeCount − 1`, `pool = GREAT_POWERS`, and `pickScattered` greedily maximizes
  minimum pairwise great-circle distance between chosen capitals.
- **Neutral garrison**: each neutral city defends with a static value
  `garrison = NEUTRAL.garrisonBase` (data-driven), independent of any build system.
- **Victory (reworked)** — evaluated in `stepVictory` over the active set only:
  - **Last active standing**: `|{s ∈ A : alive(s)}| ≤ 1` → the survivor wins.
  - **Domination**: `pop(me) / totWorldPop ≥ NEUTRAL.dominationPopFrac` — the
    denominator is the *whole world's* population, so capturing neutrals now *counts
    toward* the win (rewarding expansion), while the threshold is reached by
    out-growing your rivals. Example: `dominationPopFrac = 0.5` → controlling half of
    all living people on Earth wins, whether taken from rivals or neutrals.
  - **Defeat**: `me` holds zero living cities → loss.

## 5. Edge Cases

- **Active nation reduced to neutral cities only around it** — still active until its
  own cities hit zero; it can keep fighting and recapturing.
- **Neutral city on a contested border** — capturable by whichever active occupies it
  first; standard occupation contest applies (no special neutral tie-break).
- **All AI actives eliminated but neutrals remain** — human wins (last active
  standing); remaining neutrals are irrelevant to victory.
- **Player picks a tiny/island country** — mitigated by the neutral world: early
  expansion into neutral neighbors is the intended opening; seeding keeps rivals from
  spawning on top of a weak start.
- **Multiplayer human disconnect** — an active human slot dropping to AI control
  (existing `attach`/`detach`, `match.js:125,145`) stays *active*; it never becomes
  neutral.
- **Fewer than 8 chosen (e.g. 3-player match)** — only those slots are active; the
  other five great-power ISOs remain neutral like everyone else.
- **A neutral with a single capital** — capturing it absorbs the whole nation in one
  occupation; no partial-nation neutral state is tracked.

## 6. Dependencies

- **Setup** (`newGame.js buildSetup`, `engine.js createWorld`): add the `active` flag
  and active-set selection; `createWorld:14` is the single fleshing-out point. The
  curated-cast path already exists (`AttractSim.jsx:82` passes an explicit small
  roster through `buildSetup`).
- **AI &amp; diplomacy** (`aiTick.js`, `diploTick`, `warResolution.js warTick`): each
  loop gates on `!n.isAi || !n.alive` and must additionally skip `!n.active`
  (`aiTick.js:236`, `diploTick.js:131`, candidate scans `aiTick.js:159-167,201-208`,
  `warResolution.js:224`). See the **AI Behavior Overhaul** GDD, which assumes this
  active set.
- **Occupation** (`occupation.js captureTick`): relax the `atWar` gate (`:51`) so
  actives capture neutral cities; neutral garrison read here.
- **Victory** (`tickPhases.js stepVictory:404`): reworked per §4; today it is coupled
  to the 222-count and must reason about `A` and `totWorldPop`.
- **Lobby &amp; setup**: the **Lobby &amp; AI-Fill** GDD owns choosing `activeCount` and
  seating humans vs AI into the active slots; this GDD owns what "active" means once
  chosen.
- **Stats/save**: `opponents = nations.length − 1` (`App.jsx:287,306`, `match.js:208`)
  and save metadata (`App.jsx:255`) switch to the active count.

## 7. Tuning Knobs

New `NEUTRAL` block in `constants.js` (data-driven, never hardcoded in systems):

- `maxActive` (8; range 2–8) — hard cap on active nations.
- `defaultActive` (8) — singleplayer default active count.
- `garrisonBase` (safe 20–120) — static defense of a neutral city; higher makes
  neutral expansion costlier and slower.
- `dominationPopFrac` (0.5; 0.35–0.7) — world-population share for a domination win;
  lower ends matches sooner. Replaces `DIPLOMACY.dominationPopFrac`.
- `scatterMinKm` (safe 2000–8000) — minimum capital separation the seeder enforces
  between active nations; higher spreads them farther apart.
- `seedPool` — the ISO pool AI actives are drawn from (defaults to `GREAT_POWERS`).

## 8. Acceptance Criteria

1. A singleplayer match with `activeCount = N` boots with exactly `N` active nations
   (1 human + N−1 AI) and all other countries flagged neutral; the world map,
   territory tint, and economy render unchanged.
2. Neutral nations never build a unit, never appear in the production/diplomacy of any
   active nation, and never declare war (verified over a long idle sim).
3. An active nation can strike and capture a neutral city with no war declaration; the
   city flips to its slot and joins its territory/economy; a neutral city resists per
   its garrison value (not a free capture).
4. Victory resolves against the active set: last-active-standing wins; a domination
   win triggers at `dominationPopFrac` of *world* population (captured neutrals
   included); human elimination is a loss — all verified by unit tests over a
   constructed active set.
5. AI active nations are seeded at least `scatterMinKm` apart at match start.
6. `opponents` stats and save metadata report the active count, not ~221.
7. `npm run build` green, `npm run lint` 0 errors, and new victory/seeding/neutral
   unit tests pass.
