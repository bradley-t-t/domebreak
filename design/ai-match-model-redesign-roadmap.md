<h1 align="center">AI &amp; Match-Model Redesign — Roadmap</h1>

<p align="center">
  <b>From a 222-nation free-for-all to focused 8-nation matches on a living, conquerable world, played against AI that actually uses the whole game.</b>
</p>

<br />

## Why

Two problems, one root. The game currently spins up **every country on the map as a
live AI nation (~222)**, which (a) forces heavy performance compromises — a
level-of-detail throttle, a global unit cap, infrequent "thinking" — and (b) leaves
the AI shallow: it builds a defensive homeland, runs probabilistic diplomacy, and
lobs missiles at random populous cities. It ignores air power, naval maneuver, the
entire ground/capture war, submarines, amphibious assault, smart targeting,
reactive defense, alliance leverage, and the game's own objectives. It also places
units naively (every radar rings the same frontier city).

Capping a match at **8 active nations** removes the performance ceiling that made a
shallow AI necessary. With ≤7 AI opponents we can afford to give **every AI a
full-capability brain** and rich, sensible placement — and turn the rest of the
world into a **living, conquerable neutral map** worth fighting over.

## The end state

- A match has **at most 8 active nations** (human or AI). Singleplayer: selectable
  2–8, default 8. Multiplayer: 2–8 humans, with an **"AI fills empty slots" toggle**
  in a pre-ready lobby settings screen.
- **You pick your country;** the AI actives are scattered across the globe (seeding B).
- **Every other country stays on the map as a passive neutral** — it never builds or
  attacks, but its cities are capturable (inert but lightly garrisoned). The world is
  real estate to expand into.
- **AI opponents use the entire game** — air, naval, ground invasion, subs,
  amphibious, submarine and MIRV strikes, counterforce/counter-defense targeting,
  reactive defense, leadership evacuation, alliances — with **personality archetypes
  and difficulty tiers**, and placement that distributes forces by coverage and
  frontier instead of clustering.

## Locked decisions

| Decision | Choice |
|---|---|
| Active-nation cap | 8 (human + up to 7) |
| Singleplayer size | selectable 2–8, default 8 |
| Multiplayer size | 2–8 humans + optional AI-fill; host sets in lobby |
| World model | **A** — other countries are passive, capturable neutrals |
| Seeding | **B** — human picks country; AI actives scattered globally |
| Neutrals | inert but garrisoned (no brain; small static defense; capturable) |
| AI depth | full-capability brain on every active AI (perf no longer a constraint) |
| AI variety | personality archetypes + difficulty tiers |

## The three sub-projects (build in this order)

Dependencies run strictly downhill: **1 → 2 → 3**. Each gets its own GDD; the AI work
is meaningless until there's a bounded active set and a conquerable world to act on.

### 1. Match model &amp; neutral world — *foundational*
GDD: `design/gdd/match-model-and-neutral-world.md` · ADR: `docs/architecture/adr-008-active-and-neutral-nations.md`

Introduce a per-nation `active` flag in `createWorld` (`engine.js:14`); keep all 222
nation objects so the map, territory, and economy keep working untouched. Gate the
AI/diplomacy loops on `active` so neutrals are passive automatically. Make neutral
cities capturable by any active nation. **Rework `stepVictory`** to reason about the
active set, not the 222-count. Add the active-set selection (player's ISO + 7
scattered AI ISOs) to `buildSetup`.

*Highest-risk item: victory logic. Do it first and test it hard.*

### 2. Lobby &amp; AI-fill settings — *depends on 1*
GDD: `design/gdd/lobby-and-ai-fill.md`

A pre-ready **game-settings** surface. Singleplayer: an active-count (2–8) + global
difficulty picker in New Game. Multiplayer: host-owned settings in the lobby —
player count, **AI-fill toggle**, and per-empty-slot difficulty/personality. Raise
the server `MAX_PLAYERS` to 8 and let the match seat AI bots in the unfilled active
slots (the per-slot `isAi` seam already exists in `server/match.js`).

### 3. AI behavior &amp; placement overhaul — *depends on 1*
GDD: `design/gdd/ai-behavior-overhaul.md`

The full-capability brain: add the missing doctrines (air, naval, ground/capture,
subs, amphibious, smart targeting, reactive defense, warhead variety, alliance
leverage, objective pursuit), layer **personality archetypes + difficulty tiers**,
and rewrite strategic placement to distribute by coverage/frontier and layer defense.
Delete the vestigial tech-tree/research logic. Remove the now-unneeded LOD throttle
and unit cap (or repurpose the cap as a per-nation force ceiling).

## Sequencing &amp; milestones

1. **M1 — Match model playable.** 8-active match boots (SP), neutrals passive &amp;
   capturable, victory resolves against the active set. Existing (shallow) AI still
   drives the 7 actives. *Gate: a full SP match can be won and lost correctly.*
2. **M2 — Lobby &amp; setup.** SP active-count/difficulty picker; MP lobby settings +
   AI-fill seat bots into active slots. *Gate: host configures an 8-slot match, AI
   fills the empties, match launches.*
3. **M3 — AI depth, phased.** Land the new doctrines incrementally behind the
   difficulty tiers so each is testable in isolation, roughly:
   3a placement overhaul → 3b smart targeting + warhead variety → 3c ground/capture
   + expansion into neutrals → 3d air power → 3e naval/subs/amphibious → 3f reactive
   defense + leadership survival → 3g personality archetypes + difficulty tuning.
   *Gate per slice: `/balance-check` + a playtest that the behavior reads as intended.*

## Risks &amp; watch-items

- **Victory rework** (`stepVictory`, `tickPhases.js:404-435`) — decide how captured
  neutral population counts toward domination; measure win/last-standing over the
  active set only. Covered in GDD 1.
- **Capturing neutrals without a declared war** — `occupation.js`/`atWar` gating must
  treat neutral cities as capturable by actives. Covered in GDD 1.
- **Multiplayer authority** — the server owns AI/diplomacy/victory (`tick.js:40`
  predict-skip); all three sub-projects must keep the server as the single authority,
  and AI-fill bots run server-side. Covered in GDDs 1 &amp; 2.
- **Balance shift** — a bounded, aggressive, expanding AI is far deadlier than the
  current passive one; difficulty tiers exist partly to keep the floor approachable.
- **Stale "~222 world" comments &amp; stats** — several files narrate the old model
  (`worldState.js:6`, `aiTick.js:226`, `tickPhases.js:407`, `newGame.js`,
  `NewGame.jsx`, `DIPLOMACY` header) and `opponents = nations.length - 1` stats
  (`App.jsx:287,306`, `match.js:208`). Sweep as part of GDD 1.

## Framework path

Each GDD goes through `/design-review`; the set through `/review-all-gdds`. Then
`/create-epics` → `/create-stories` per sub-project, `/dev-story` implementation with
the gameplay/AI/UI specialists, `/code-review` + `/balance-check` before each story
closes. This roadmap is the epic-level index that ties the three together.
