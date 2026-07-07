<h1 align="center">National Stability</h1>

<p align="center">
  <b>An ambient survival readout: mounting strains — lost cities, too many wars, killed or bunkered leadership, a running deficit — erode a nation's Stability, and easing those strains lets it recover.</b>
</p>

<br />

## 1. Overview

Every nation carries a **Stability** score (0–100%) representing the cohesion of
its government and society. Stability is not set once — each tick it eases toward a
live **target** equal to `100 − Σ penalties`, where the penalties come from the
strains a nation is actually under right now: lost population, the cities and
territory lost to war, fighting too many wars at once, killed leadership, the
governance cost of keeping leaders bunkered, and running a points deficit. Relieve
those strains — make peace, regrow population, bring leaders home, balance the
books — and Stability climbs back. Let them pile up and it slides toward zero.

Stability is displayed in the top HUD alongside Leadership as an at-a-glance measure
of national strain. It has **no mechanical consequence of its own** — it is a
diagnostic/pressure readout, not a failure state. (The actual output penalty for a
hollowed-out government lives in the Leadership system's command factor.)

## 2. Player Fantasy

Holding a nation together is its own front to read. The bombs falling on your
cities, the third war you couldn't avoid, the cabinet you sealed in a mountain
bunker, the red DEFICIT badge on your treasury — each one shows up as a dip in the
Stability meter, a single number that tells you how much strain the state is
carrying. You watch it bleed and you triage: sue for peace on the quiet front,
release your leaders back to the capital now that the sky is clear, cut upkeep to
stop the deficit — and watch the meter climb back.

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

### 3.3 Display

- Stability shows in the HUD as a colored percentage with a one-word mood
  (Stable / Strained / Unrest), sharing Leadership's traffic-light palette.

### 3.4 AI leadership doctrine

The Stability penalties give the AI a reason to manage its leadership exposure:

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
  beyond do), so ordinary conflicts don't by themselves erode Stability.
- **Bottoms out at 0**: Stability simply floors at 0% with no further consequence —
  it is a readout, not a trigger. Relieving strains lets it climb straight back.
- **Determinism**: Stability is a pure function of stored state — no RNG, no
  history — so it is fully replay/save reproducible.

## 6. Dependencies

- **Population / city-vitality** (`queries.js populationOf`, `vitalityOf`; city
  `pop0`) — the population-loss penalty and `basePop` baseline.
  (See `design/gdd/city-vitality.md`, which owns population growth.)
- **Diplomacy / war** (`queries.js atWar`, `production.js declareWar/makePeace`,
  `tick.js diploTick`) — the war count.
- **Leadership** (`leadership.js`) — `lead.lost` and `lead.sheltered` feed the
  penalties; `evacTick` carries the AI shelter-at-war / release-at-peace doctrine.
  (See `design/gdd/leadership.md`.)
- **Economy** (`queries.js netIncomeOf`) — the deficit penalty.
- **Tick engine** (`tick.js step`) — `updateStability(w, dt)` runs each tick after
  population growth.
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
5. Stability floors at 0% with no further mechanical consequence — it is an ambient
   readout, not a failure trigger.
6. An AI shelters its leadership when at war with exposed leaders and releases it
   when at peace with sheltered leaders. (unit-tested)
7. `npm run lint` is clean (0 errors) and `npm run build` succeeds; the Stability
   readout is observed in the Electron build.
