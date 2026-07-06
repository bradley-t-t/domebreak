<h1 align="center">Full-World Nations & AI Diplomacy</h1>

<p align="center">
  <b>Every country on the map is a living, AI-run nation that fights its own wars — the world is in motion before you fire a shot.</b>
</p>

<br />

> **Status**: In Design
> **Last Updated**: 2026-07-06
> **Implements**: living-world strategic layer (single-player)

## 1. Overview

Every one of the **222 countries** in the bundled dataset becomes a live,
AI-controlled nation with full game state — economy, research, arsenal, and
cities that can be struck and lost. This replaces the old **backdrop** model, in
which only 16 belligerents (player + up to 15 AIs) were real nations and the
other ~206 countries were inert map decoration that could not be owned,
attacked, or go to war. The player now picks **only their own** country; every
other nation is auto-assigned to an AI at setup. A new **AI diplomacy** layer
makes the world alive: AIs declare war on and make peace with their regional
neighbors on their own initiative, so conflicts ignite and burn out across the
map independent of the player. To keep **2,565 live cities** and hundreds of
active nations inside frame budget, the simulation gains per-slot unit indexing,
a spatial index for the interception loop, per-AI unit caps, and
distance/activity-based level-of-detail throttling of AI reasoning.

Implementation is phased: **(P1)** full-world roster + colors + live cities +
win/loss, **(P2)** AI diplomacy, **(P3)** performance internals + LOD + caps,
**(P4)** UI scaling. P1 is playable on its own; P2 makes it a living world; P3
makes it fast; P4 makes it legible.

## 2. Player Fantasy

You are one power on a living planet, not the star of a curated 16-nation
scenario. Borders you have never touched flare into war on the far side of the
globe; opportunistic invasions and desperate ceasefires play out whether or not
you intervene. Your moves ripple into a world that was already turning — pick
your moment to strike a distracted rival, bait two neighbors into bleeding each
other white, then inherit the ruins. The map feels populated because it *is*:
every dot is someone's homeland with someone (something) defending it.

## 3. Detailed Rules

### 3.1 Full-world roster

- At setup, **every ISO in `data.cities` with ≥1 city (all 222 today) becomes a
  nation**. `buildSetup(data, playerIso, seed)` drops the `aiIsos` argument — the
  roster is the whole world, derived from data, not a hand-picked list.
- The player is **slot 0** (`isAi:false`). Every other nation takes the next slot
  with `isAi:true`. Slot order is deterministic: player first, then the remaining
  ISOs sorted by descending GDP (`GDP_T`), then alphabetically for ties — so
  `slot → nation` is stable for a given dataset (required for save/replay and
  determinism).
- **`MAX_SLOTS` stops being a roster cap.** Slots range `0..N-1` where `N` is the
  live nation count (222 today), read from data.
- **Backdrop is eliminated.** `belligerents` becomes all nations; the "World
  Cities" backdrop layer renders nothing. Every city carries a `slot` and full
  state (`hp`, `pop`, `econ`, `alive`) exactly like a belligerent city today.

### 3.2 Nation colors

- Slots **0–15** keep the hand-tuned `SLOT_COLOR` palette (player = white).
- Slots **≥16** get a deterministic procedural color from a new
  `colorForSlot(slot)` helper: golden-angle hue spacing so adjacent slots stay
  visually distinct on the dark map (§4). The player is always white regardless
  of slot.
- **Every** faction color lookup (map fills, unit icons, HUD) routes through
  `colorForSlot(slot)` — no code indexes `SLOT_COLOR` directly anymore.

### 3.3 AI diplomacy (new system)

Each AI nation runs a **diplomacy evaluation** on its own staggered `_diplo`
timer, on a slower cadence than the `_ai` combat-think timer.

- **Rivals are regional.** Nation *B* is a valid war target for *A* only if
  **reachable** — capital-to-capital great-circle distance ≤ `warRangeKm`.
  Declarations no unit could ever act on are disallowed, which is what keeps
  conflicts local instead of a global free-for-all.
- **Declaring war.** On a diplomacy tick, if *A* is below its war cap and rolls
  under `declareChance`, it selects a reachable rival weighted toward
  **opportunity** — wealthier and/or militarily weaker neighbors preferred (§4) —
  and calls the existing `declareWar`. The player is a valid target once past an
  opening `playerGraceSec` window.
- **War cap.** A nation fights at most `maxWars` simultaneous wars. This bounds
  both the combat load and how legible the map stays.
- **Making peace.** *A* sues for peace via the existing `makePeace` if it is badly
  losing (surviving-city fraction < `peaceLossThreshold`) **or** after
  `minWarSec` with probability `peaceChance` per diplomacy tick. Death of either
  side auto-clears the relation.
- **Determinism.** Every roll uses the seeded `rand(w)`, so the whole diplomatic
  history is reproducible from `(seed, playerIso)`.

Economic fairness from `ai-economy-fairness-and-bmd-rules.md` is preserved: war
is free to *declare* but everything it takes to *fight* (units, warheads,
research) is bought on the same production line as the player. A broke nation
can declare war and then do nothing about it.

### 3.4 Level-of-detail throttling

- **Every** nation is always fully simulated for income / research / production —
  these are cheap per-nation scalar updates.
- The expensive `aiTick` build/attack reasoning scales its cadence by an
  **activity tier**: a nation that is at war **or** within `activeRangeKm` of the
  player thinks at the normal `thinkMin..thinkSpan` cadence; a peaceful nation far
  from the player and from any front thinks on the slower `idleThink*` cadence and
  builds economy/defense only. Distant peaceful nations stay alive but bounded, so
  the number of nations doing heavy work each second is capped by the actual
  action on the map, not by the roster size.

### 3.5 Unit caps

- Each AI nation is capped at `aiUnitCap` live units, scaled down for small or
  idle nations. This bounds the global unit count, which is the multiplier on the
  interception hot loop (§3.7).

### 3.6 Win / loss

- **Defeat** — the moment the player's nation is eliminated (all its cities dead),
  the game is over as a defeat, regardless of how many of the other 221 remain.
- **Victory** — the player is the last nation alive **or** reaches a **domination**
  threshold: controls ≥ `dominationPopFrac` of surviving world population (§4).
  Last-of-222 is impractical as the only path, so domination is the reachable win.
- The old `alive.length <= 1` end-check is **replaced** by these player-centric
  conditions.

### 3.7 Performance internals

- **`w.unitsBySlot`** — units indexed by slot, maintained on spawn and prune, so
  every AI scan and per-nation query is O(own units), not O(all units).
- **Spatial grid over defense units** — the projectile interception loop
  (`for p of projectiles { for d of units }`, today O(P×U)) queries only grid
  cells within max defense range of each projectile, making it sub-quadratic in
  practice.
- **Sensor sweep prefilter** — the 4 Hz sweep checks the projectile's target
  nation plus only the nations whose sensors could plausibly cover it, not all 222.

## 4. Formulas

### 4.1 Procedural nation color

`colorForSlot(slot)`:

| Variable | Type  | Range   | Description                                  |
|----------|-------|---------|----------------------------------------------|
| slot     | int   | 0..N-1  | Nation slot index                            |
| hue      | float | 0..360  | Derived hue for slots ≥16                    |
| COLOR_S  | int   | 55..75  | Saturation % (tuning constant, default 68)   |
| COLOR_L  | int   | 55..68  | Lightness % (tuning constant, default 62)    |

`slot < 16` → `SLOT_COLOR[slot]`.
`slot ≥ 16` → `hsl( (slot × 137.508) mod 360 , COLOR_S%, COLOR_L% )`.
**Example:** slot 20 → hue = (20 × 137.508) mod 360 = 2750.16 mod 360 = 230.16 →
`hsl(230, 68%, 62%)` (a legible blue). Golden-angle spacing keeps slot 21 far in
hue from slot 20.

### 4.2 Rival reachability

`reachable(A, B)  ⇔  haversine(capA, capB) ≤ warRangeKm`.

| Variable   | Type  | Range (safe)   | Description                              |
|------------|-------|----------------|------------------------------------------|
| warRangeKm | float | 2000..6000     | Max capital distance for a war to start  |

**Example:** `warRangeKm = 4000`. France↔Germany (~880 km) reachable; France↔Japan
(~9700 km) not — Japan can only be dragged in by a reachable neighbor.

### 4.3 Rival target weighting

`weight(B) = clamp( (gdpB / gdpA)^wGdp × (aliveCitiesA / aliveCitiesB)^wWeak , wMin, wMax )`,
target chosen by weighted `rand(w)` over reachable rivals.

| Variable | Type  | Range (safe) | Description                                      |
|----------|-------|--------------|--------------------------------------------------|
| wGdp     | float | 0..1.5       | Bias toward wealthier targets (loot motive)      |
| wWeak    | float | 0..1.5       | Bias toward weaker targets (opportunism)         |
| wMin/Max | float | 0.1 / 8      | Clamp so no single target dominates the roll     |

**Example:** wealthy weak neighbor → high weight; poor strong neighbor → low
weight. With `wGdp=0.6, wWeak=0.8`, a target with 2× GDP and half the cities of
A scores `2^0.6 × 2^0.8 ≈ 1.52 × 1.74 ≈ 2.64`.

### 4.4 Peace trigger

Sue for peace if `aliveCitiesA / startCitiesA < peaceLossThreshold`
**OR** (`warAge > minWarSec` AND `rand(w) < peaceChance`).

| Variable          | Type  | Range (safe) | Description                             |
|-------------------|-------|--------------|-----------------------------------------|
| peaceLossThreshold| float | 0.2..0.5     | Surviving-city fraction that forces suing|
| minWarSec         | float | 30..180      | Minimum war duration before random peace |
| peaceChance       | float | 0.02..0.2    | Per-diplo-tick odds of a ceasefire       |

### 4.5 Activity tier (LOD)

`active(A) ⇔ atWar(A, ·)  ∨  min_over_playerCities haversine(capA, cityP) ≤ activeRangeKm`.
Think interval = `active ? thinkMin + rand·thinkSpan : idleThinkMin + rand·idleThinkSpan`.

| Variable      | Type  | Range (safe) | Description                            |
|---------------|-------|--------------|----------------------------------------|
| activeRangeKm | float | 2000..6000   | Player-proximity radius that stays hot |
| idleThinkMin  | float | 15..40       | Slow-tier base think interval (s)      |
| idleThinkSpan | float | 10..40       | Slow-tier think jitter (s)             |

### 4.6 Domination victory

`Σ pop(surviving player cities) / Σ pop(all surviving cities) ≥ dominationPopFrac`.

| Variable         | Type  | Range (safe) | Description                          |
|------------------|-------|--------------|--------------------------------------|
| dominationPopFrac| float | 0.4..0.7     | Share of world pop that wins the game|

## 5. Edge Cases

- **ISO with 0 cities** → not instantiated (none in current data; guarded so a
  future data change can't create a nation with no capital).
- **Landlocked / island nation** → valid; AI naval builds are simply skipped where
  `aiSeaSpot` finds no coastal water (existing behavior, unchanged).
- **Isolated nation (no reachable rival)** → never declares war; still a valid
  target if someone else can reach it; otherwise simulates its economy in peace.
- **Nation eliminated mid-war** → `alive=false`; all its relations drop; every war
  it was in ends; former enemies re-evaluate targets next diplo tick.
- **Player eliminated while other wars rage** → immediate defeat; sim halts
  (`w.over`, `w.paused`), the surviving 221 are irrelevant to the result.
- **Both sides sue for peace on the same tick** → `makePeace` is idempotent; ends
  one war, no error.
- **War cap reached** → a rolled declaration is dropped, not queued.
- **Everyone at peace and far from the player** → the world simulates economies
  quietly; the player can always declare war manually to start a fight.
- **Procedural color near a hand-picked slot color** → acceptable; golden-angle
  spacing minimizes clustering and player-white is reserved.
- **Determinism** → identical `(seed, playerIso)` ⇒ identical diplomacy sequence,
  war outcomes, and final map. No wall-clock or unseeded RNG in any new path.

## 6. Dependencies

- **New Game / setup** (`src/game/sim/newGame.js`) — full-world enumeration;
  removes `aiIsos`; deterministic slot ordering; drops `MAX_SLOTS` slicing.
- **Engine world** (`src/game/engine.js` `createWorld`) — nations + cities from the
  full roster; initializes `unitsBySlot`; per-nation multiplier defaults unchanged.
- **Tick / AI** (`src/game/sim/tick.js`) — new `diploTick`; activity-tier LOD in
  `aiTick`; unit-cap gate on AI build paths; spatial index in the interception
  loop; revised end-condition; `unitsBySlot` maintenance on spawn/prune.
- **Production / diplomacy** (`src/game/sim/production.js`) — reuse `declareWar` /
  `makePeace` (relations are a sparse per-slot map — scales fine to 222).
- **Constants** (`src/game/data/constants.js`) — `MAX_SLOTS` no longer caps the
  roster; new `DIPLOMACY` + LOD + perf tuning block; `colorForSlot`, `COLOR_S/L`.
- **Rendering** (`src/game/../ui/live/useLiveLayers.js`, `src/App.jsx`) — remove /
  empty the backdrop layer; live-city source scales to 2,565; faction color via
  `colorForSlot`; viewport-culled React overlays.
- **New Game UI** — opponent-selection step removed; player picks their own
  country only.
- **Nation list / scoreboard / minimap UI** — scale to 222 (collapse, top-N by
  strength, search / filter).
- **`ai-economy-fairness-and-bmd-rules.md`** — diplomacy must not reintroduce free
  war-making; economic fairness rules stand.
- **Bidirectional note**: the ai-economy spec and the sensors/fog GDDs are
  depended on by this system; any `MAX_SLOTS`/`SLOT_COLOR[` consumers become
  dependents of `colorForSlot`.

## 7. Tuning Knobs

New `DIPLOMACY` block in `src/game/data/constants.js`:

- `warRangeKm` — rival reachability. Too high → global chaos + load; too low →
  a dead, peaceful map.
- `maxWars` — simultaneous wars per nation. Too high → dogpiles + load; too low →
  static world.
- `declareChance`, `peaceChance`, `minWarSec`, `peaceLossThreshold` — the war/peace
  rhythm.
- `playerGraceSec` — opening protection so the player isn't dogpiled at t=0.
- `wGdp`, `wWeak`, `wMin`, `wMax` — rival target weighting.

LOD / performance:

- `idleThinkMin`, `idleThinkSpan`, `activeRangeKm` — how hard distant peaceful
  nations are throttled.
- `aiUnitCap` (+ small-nation scaling factor) — global unit ceiling lever.

Win condition:

- `dominationPopFrac` — how much of the world the player must hold to win.

Color:

- `COLOR_S`, `COLOR_L` — procedural nation-color saturation/lightness for map
  legibility.

## 8. Acceptance Criteria

- **GIVEN** a new game, **WHEN** it starts, **THEN** `w.nations.length` equals the
  count of ISOs with cities (222), exactly one nation has `isAi:false`, and every
  `w.cities` entry has a `slot` present in `w.nations` — no backdrop-only cities
  remain.
- **GIVEN** two AI neighbors within `warRangeKm` at peace, **WHEN** diplomacy ticks
  elapse, **THEN** eventually one declares war on the other (their relation shows
  `war`) with zero player involvement — and the exact tick is reproducible under a
  fixed seed.
- **GIVEN** a nation beyond `warRangeKm` of every other nation, **WHEN** the game
  runs to any length, **THEN** it never declares war.
- **GIVEN** a nation already in `maxWars` wars, **WHEN** a diplomacy tick rolls a
  declaration, **THEN** no new war is created.
- **GIVEN** an AI whose surviving-city fraction < `peaceLossThreshold`, **WHEN** it
  runs a diplomacy tick, **THEN** it sues for peace (relation → `peace`).
- **GIVEN** the player's last city dies, **WHEN** the tick resolves, **THEN**
  `w.over` is true and the result is defeat, regardless of other survivors.
- **GIVEN** the player holds ≥ `dominationPopFrac` of surviving world population,
  **WHEN** the tick resolves, **THEN** `w.over` is true and the result is victory.
- **GIVEN** any slot ≥ 16, **WHEN** its color is requested, **THEN**
  `colorForSlot` returns a stable, distinct hue; slot 0 is white.
- **PERF**: **GIVEN** a mid-game with many concurrent wars and the unit cap in
  force, **WHEN** running at 1× speed, **THEN** average tick time stays within the
  frame budget the perf pass establishes (spatial index + `unitsBySlot` keep the
  interception and AI-scan loops sub-quadratic in practice). Exact budget set in P3.
- **DETERMINISM**: identical `(seed, playerIso)` ⇒ identical nation evolution, war
  history, and final map across runs.

<br />

<p align="center">
  <sub>One power on a living planet — the wars were already burning before you launched a thing.</sub>
</p>
