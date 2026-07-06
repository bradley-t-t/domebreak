# Stability & Civil War

## 1. Overview

Every nation carries a **Stability** score (0–100%) representing the cohesion of
its government and society. Stability is not set once — each tick it eases toward a
live **target** equal to `100 − Σ penalties`, where the penalties come from the
strains a nation is actually under right now: lost population, the cities and
territory lost to war, fighting too many wars at once, killed leadership, the
governance cost of keeping leaders bunkered, and running a points deficit. Relieve
those strains — make peace, regrow population, bring leaders home, balance the
books — and Stability climbs back. Let them pile up and it slides toward zero.

A nation that sits at **0% Stability for too long fractures in a Civil War**: its
territory splits along a geographic line, the half without the capital secedes as
a new hostile AI nation ("Free \<Name\>"), units standing in the breakaway
territory defect, and the two successor states begin the game at war with each
other. This applies to every nation, player and AI alike — which is exactly why
the AI now shelters its leadership when at war and brings it home in peacetime, to
manage its own Stability. Stability is displayed in the top HUD alongside
Leadership; it is a second survival bar, and unlike Leadership its failure state is
not death but schism.

## 2. Player Fantasy

Holding a nation together is its own front. The bombs falling on your cities,
the third war you couldn't avoid, the cabinet you sealed in a mountain bunker, the
red DEFICIT badge on your treasury — none of these is fatal on its own, but
together they hollow out the state from the inside. You watch the Stability meter
bleed and you triage: sue for peace on the quiet front, release your leaders back
to the capital now that the sky is clear, cut upkeep to stop the deficit. Ignore it
and the map itself betrays you — half your country tears away under a new flag and
turns its remaining missiles on you. You don't just fight enemies abroad; you keep
your own people from becoming one.

## 3. Detailed Rules

### 3.1 The Stability score

- Every nation begins at **100% Stability** (`nation.stability = 100`).
- Each tick, Stability eases toward its target:
  `stability += (target − stability) × min(1, easePerSec × dt)`, then clamped to
  `[0, 100]`. It never jumps — losses and recoveries are gradual.
- **Target** = `clamp(100 − Σ penalties, 0, 100)`, recomputed live every tick.

### 3.2 Penalties (what lowers the target)

1. **Population loss** — `(1 − livingPop / basePop) × wPopLoss`. `basePop` is the
   sum of every one of the nation's cities' starting population (`pop0`, alive or
   dead); `livingPop` is the current vitality-scaled population. This single term
   captures both raw depopulation and the **cities/territory lost to war** (a
   destroyed city drops both its people and its vitality to zero).
2. **Too many wars** — `max(0, warCount − freeWars) × wPerWar`. The first
   `freeWars` wars are "normal"; each simultaneous war beyond that erodes
   Stability.
3. **Leadership loss** — `(lead.lost / lead.total) × wLeadLoss`. Killing a
   nation's leaders is a heavy, lasting Stability hit.
4. **Bunkered leadership** — `(lead.sheltered / lead.total) × wBunkered`. Keeping
   leaders sealed in the bunker is a *smaller* ongoing governance cost — far less
   than losing them, but not free, which is why nations bring them home once the
   threat passes.
5. **Deficit** — flat `wDeficit` while `netIncome < 0`.

### 3.3 Effect of low Stability

- Stability is displayed in the HUD as a colored percentage with a status word
  (Stable / Strained / Unrest / Collapse imminent).
- Its failure mode is Civil War (§3.4), not a soft output penalty and not instant
  death. (Leadership already supplies the output penalty; Stability layers schism
  on top.)

### 3.4 Civil War (fracture)

- While `stability ≤ collapseAt` (default 1, i.e. effectively zero), an unrest
  timer `_unrest` accumulates game-seconds. Any tick Stability rises above
  `collapseAt`, the timer resets to 0.
- When `_unrest ≥ civilWarSec`, the nation **fractures**:
  - Its living cities are bisected along the axis of greatest geographic spread
    (longitude or latitude), split at the median. The group **containing the
    capital stays loyal**; the other **secedes**. If neither or both groups hold a
    capital, the **smaller-population** group secedes.
  - The seceding cities are reassigned to a **new AI nation** ("Free \<Name\>",
    `rebel: true`) on a fresh slot. It inherits a population-proportional share of
    the parent's GDP and points; the parent keeps the remainder.
  - **Units defect**: any of the parent's units whose nearest living city is now a
    rebel city join the rebel nation.
  - **Both** successor states are given a **fresh leadership pool** (seeded across
    their current cities, capital-first) and their Stability is reset to
    `resetStability` (default 50) with `_unrest = 0`, so neither instantly
    re-fractures.
  - The two are placed **at war** with each other; all other nations stay neutral
    to the newborn rebel state. A `civilwar` event is emitted for the news feed.
- A nation with fewer than `minCitiesToFracture` living cities **cannot** split;
  instead its pressure is relieved (Stability set to `resetStability`, timer
  reset) — a one-city rump state has no half to break away.

### 3.5 AI leadership doctrine

- An AI **shelters** its leadership (`_evac = "shelter"`) whenever it is at war and
  still has exposed leaders — protecting against the heavy leadership-loss penalty.
- An AI **releases** its leadership (`_evac = "release"`) whenever it is at peace
  and still has sheltered leaders — shedding the bunkered-leadership penalty so its
  Stability recovers. The player's evac orders remain fully manual.

## 4. Formulas

Let `dt` = game-seconds this tick, and for nation `n`:

```
basePop(n)      = Σ_c (c.pop0 ?? c.pop)          over all c with c.slot = n.slot (alive or dead)
livingPop(n)    = Σ_c c.pop · vitality(c)        over living c with c.slot = n.slot
popLossFrac(n)  = clamp(1 − livingPop(n)/basePop(n), 0, 1)
warCount(n)     = #{ s : n.relations[s] = "war" }

penalty(n)      = popLossFrac(n)·wPopLoss
                + max(0, warCount(n) − freeWars)·wPerWar
                + (n.lead.lost/n.lead.total)·wLeadLoss
                + (n.lead.sheltered/n.lead.total)·wBunkered
                + (netIncome(n) < 0 ? wDeficit : 0)

target(n)       = clamp(100 − penalty(n), 0, 100)
stability(n)   += (target(n) − stability(n)) · min(1, easePerSec·dt)   then clamp [0,100]
```

Civil-war trigger: `_unrest += dt` while `stability ≤ collapseAt` (else `_unrest = 0`);
fracture when `_unrest ≥ civilWarSec`.

**Worked example** (defaults): a nation that has lost 40% of its population
(−24), is fighting 3 wars (−`2·12` = −24), has lost 25% of its leaders
(−`0.25·40` = −10) and is running a deficit (−15) has
`target = 100 − 24 − 24 − 10 − 15 = 27` → Stability eases toward 27%. Sheltering
all its leaders instead of losing them would cost only `1·10 = 10` rather than up
to 40. A peaceful, undamaged nation with leaders home and a surplus sits at
`target = 100`.

## 5. Edge Cases

- **Undamaged & at peace** ⇒ every penalty is 0 ⇒ target 100; Stability holds at
  100 (no drift). Introduces no change for a nation that is doing fine.
- **One free war**: a single war carries no war-count penalty (only the second and
  beyond do), so ordinary conflicts don't by themselves spiral a nation into civil
  war.
- **Single-city nation at 0%**: cannot fracture; pressure is relieved to
  `resetStability` so it doesn't retrigger every tick.
- **Fracture while sheltering / mid-airlift**: both successor governments are
  re-seeded fresh; in-flight ferries finish their flight and reconcile against the
  new pool. Leadership continuity is intentionally reset by the schism.
- **Player fractures**: `w.mySlot` is unchanged — the player keeps the loyal,
  capital-holding half and immediately faces a new hostile AI on the seceded half.
  Not a defeat; the player fights the rebellion.
- **New nation mid-match**: the rebel is a full nation object appended to
  `w.nations`; it is picked up by diplomacy, AI, combat, rendering, and win-
  condition loops on the following tick. Its color comes from `colorForSlot(slot)`
  (golden-angle hue — any slot is distinct).
- **Determinism**: Stability and the fracture geometry are pure functions of stored
  state; the only RNG is the seeded `rand(w)` used to stagger the new AI's think
  timer, preserving replay/save reproducibility.
- **Rebel elimination**: a breakaway that loses all its cities dies like any
  nation; conquering it back is possible.

## 6. Dependencies

- **Population / city-vitality** (`queries.js populationOf`, `vitalityOf`; city
  `pop0`) — the population-loss penalty and `basePop` baseline.
  (See `design/gdd/city-vitality.md`, which owns population growth.)
- **Diplomacy / war** (`queries.js atWar`, `production.js declareWar/makePeace`,
  `tick.js diploTick`) — war count, and the civil-war war declaration.
- **Leadership** (`leadership.js`) — `lead.lost` and `lead.sheltered` feed the
  penalties; `seedLeadership` re-seeds both successor states; `evacTick` gains the
  AI shelter-at-war / release-at-peace doctrine. (See `design/gdd/leadership.md`.)
- **Economy** (`queries.js netIncomeOf`) — the deficit penalty.
- **Nation state / colors** (`engine.js`, `constants.js colorForSlot`) — the
  `stability` field and the runtime-created rebel nation.
- **Tick engine** (`tick.js step`) — `updateStability(w, dt)` runs each tick after
  population growth, before the win-condition tally.
- **UI** (`ui/hud/LiveHud.jsx`) — the Stability readout column.

## 7. Tuning Knobs (`STABILITY` block in `constants.js`)

| Knob                 | Default | Meaning                                                         |
|----------------------|---------|-----------------------------------------------------------------|
| `easePerSec`         | 0.05    | Fraction of the gap to target closed per game-second (recovery/decay speed) |
| `freeWars`           | 1       | Simultaneous wars before the "too many wars" penalty begins     |
| `wPerWar`            | 12      | Stability points lost per war beyond `freeWars`                 |
| `wPopLoss`           | 60      | Points lost at total population loss (linear in fraction lost)  |
| `wLeadLoss`          | 40      | Points lost at total leadership loss (linear in fraction lost)  |
| `wBunkered`          | 10      | Points lost while leadership is fully sheltered (linear)        |
| `wDeficit`           | 15      | Flat points lost while running a points deficit                 |
| `collapseAt`         | 1       | Stability at/below this counts as collapse (starts the timer)   |
| `civilWarSec`        | 60      | Sustained game-seconds at collapse before the nation fractures  |
| `resetStability`     | 50      | Both halves' Stability immediately after a civil-war split      |
| `minCitiesToFracture`| 2       | Minimum living cities required for a nation to split            |

## 8. Acceptance Criteria

1. Every nation starts at 100% Stability; the player's Stability shows in the HUD
   as a colored percentage with a status word.
2. A nation with no losses, one-or-fewer wars, leaders home, and a surplus holds a
   target of 100% (baseline invariant — Stability does not drift for a healthy
   nation). (unit-tested)
3. Each listed strain lowers the target by its documented amount: population loss,
   wars beyond the first, leadership lost, leadership bunkered (smaller), and a
   deficit — verified independently and in combination. (unit-tested)
4. Stability eases toward the target rather than snapping, and recovers when
   strains are removed (make peace / regrow / release leaders / clear deficit).
   (unit-tested)
5. A nation held at ≤ `collapseAt` for `civilWarSec` fractures: a new "Free \<Name\>"
   AI appears on a geographic half, that half's cities change ownership, local units
   defect, both sides get fresh leadership and reset Stability, and the two are at
   war. A nation with < `minCitiesToFracture` cities does not fracture. (unit-tested)
6. An AI shelters its leadership when at war with exposed leaders and releases it
   when at peace with sheltered leaders. (unit-tested)
7. `npm run lint` is clean (0 errors) and `npm run build` succeeds; the Stability
   readout and a fracture are observed in the Electron build.
