# Leadership

## 1. Overview

Every nation carries a **Leadership** score (0–100%) representing the survival of
its national command. Leadership is embodied as a fixed pool of *leader tokens*
that begin the game in the nation's capital city(ies). When war breaks out, those
leaders are exposed: an enemy strike on a capital that still holds leaders kills
them and permanently lowers that nation's Leadership. Players are prompted (via a
persistent, non-dismissing alert) to press **Shelter Leadership**, which
automatically airlifts leaders from their capitals to the hardened Leadership
Bunker using transport aircraft flown from friendly airstrips. Low Leadership
softly throttles national output (production income and research). Leadership is a
survival stat and a strategic target — decapitating an enemy's command is a valid
offensive play, and protecting your own is a race against the first warheads.

This system activates the previously inert **Leadership Bunker** unit
(`src/game/data/constants.js`, `bunker`), which shipped with `maxCount: 1` and a
comment reserving it for "a later design pass." This is that pass.

## 2. Player Fantasy

You are the last line of national continuity. The sirens sound, the declaration
scrolls across the wire, and you have minutes before the first warheads arc over
the pole. Do you scramble every transport to pull your cabinet into the mountain
bunker before the capital is glassed — or do you gamble that your interceptors
hold, and keep those planes for the war? When you strike back, you don't just
level cities: you hunt the enemy's leadership, trying to behead their command
before their own airlift finishes. Every evacuation is a visible convoy of slow,
unarmed planes threading contested, irradiated sky — and if one goes down, those
leaders are gone for good.

## 3. Detailed Rules

### 3.1 Leader tokens
- Each nation starts with `LEADERSHIP.startTokens` leader tokens (default 12) and
  100% Leadership.
- Tokens are seeded across the nation's **top `LEADERSHIP.leaderCities` cities**
  (default 5), ordered capital-first then by population. The **capital holds the
  largest single share** (`LEADERSHIP.capitalShare`, default 40%); the remainder
  spreads across the other selected cities weighted by population (largest-remainder
  rounding, so tokens always sum to `startTokens`). A nation with only one city
  holds all its leaders there.
- A token is always in exactly one state:
  - `at_city` — sitting in one of the nation's cities (exposed).
  - `in_transit` — aboard a transport aircraft (still killable).
  - `sheltered` — delivered to the Leadership Bunker (safe unless the bunker
    itself is destroyed).
  - `lost` — killed. Permanent.
- **Leadership% = (total − lost) / total × 100.** Sheltering does not raise the
  score; it prevents it from falling.

### 3.2 What kills leaders
- **A city destroyed** (by direct strike or fallout) while it holds `at_city`
  tokens → those tokens become `lost`. Fires a `leadership` event. (Capitals hold
  the most, so decapitation strikes still hit hardest there.)
- **Transport destroyed** (fallout, blast) while carrying `in_transit` tokens →
  cargo `lost`. Fires a `leadership` event.
- **Bunker destroyed** while it holds `sheltered` tokens → all sheltered tokens
  `lost`. Fires a `leadership` event. (The bunker is hp 220 — hardened — precisely
  because concentrating leadership there is a single point of failure.)

### 3.3 The war alert (persistent prompt)
- Whenever the player's nation is at war and still has `at_city` leaders and has
  not yet started sheltering, a **non-dismissing** alert appears with a primary
  **Shelter Leadership** action. It does not auto-dismiss on a timer.
- The alert clears when the player starts the evacuation, or when no `at_city`
  leaders remain (all sheltered or lost). It re-arms if a *new* war begins while
  leaders are again exposed.
- If the player has no Leadership Bunker, the action is disabled with the hint
  "Build a Leadership Bunker." If the player has a bunker but no airstrip, the hint
  is "Build an Airstrip."

### 3.4 Evacuation (auto-dispatch, whole-fleet)
- Pressing **Shelter Leadership** sets the nation's `_evac` flag. The player does
  not micromanage individual planes.
- Each tick the evac controller flies **every** friendly airstrip, up to
  `LEADERSHIP.transportsPerAirstrip` transports each (default 3), drawing from its
  transport hangar stock. Each free plane is dispatched to the **highest-priority
  city that still has leaders not already covered by an inbound ferry** — capital
  first, then by population — so the fleet fans out across all cities rather than
  piling on one, and multiple airfields work in parallel.
- A ferry transport flies the loop: **airstrip → city → (load delay) → bunker →
  (unload delay) → home airstrip**, carrying up to `LEADERSHIP.perPlane` tokens
  (default 3) per trip. On landing home it stows; the controller relaunches it to
  whichever city still needs lift. Evacuation ends when every city is empty.
- Ferry transports are unarmed and fly a simplified point-to-point profile (no
  runway pattern) so they can set down at cities and the bunker, which are not
  airbases.

### 3.5 All nations
- Every nation has Leadership and can lose it. AI nations set `_evac`
  automatically upon entering a war; if an AI has a bunker and airstrip it will
  evacuate the same way. An AI without that infrastructure simply cannot shelter —
  its leaders are decapitable. (Active AI bunker/airstrip construction under threat
  is a future tuning enhancement; the loss model is already symmetric.)

### 3.6 Soft penalty
- National output scales with Leadership through a **command factor** applied to
  income (and, when `LEADERSHIP.penalizeResearch` is true, to research speed):
  low Leadership means a less effective state, never a dead one.

### 3.7 Releasing leadership (reverse airlift)
- The Leadership Bunker's selection panel (bottom-right) shows the leadership stats
  plus **Shelter Leadership** and **Release Leadership** actions.
- **Release Leadership** runs the airlift in reverse: transports fly
  **airstrip → bunker → city → home**, pulling sheltered leaders out of the bunker
  and redistributing them across the nation's living cities (capital-first, spread
  toward the emptiest so cities repopulate evenly). It uses the same whole-fleet,
  multi-airstrip controller and tuning as sheltering.
- Release is only available while leaders are actually sheltered. Sheltering and
  releasing are mutually exclusive modes; starting one supersedes the other.
- Cargo that can't be delivered (its destination city died mid-flight) is kept safe
  back in the bunker rather than lost — releasing never costs Leadership by itself.

## 4. Formulas

Let `total = LEADERSHIP.startTokens`, `lost = nation.lead.lost`.

- **Leadership fraction:** `f = (total − lost) / total` ∈ [0, 1]
- **Leadership percent (display):** `round(f × 100)`
- **Command factor (output multiplier):**
  `command = LEADERSHIP.commandFloor + (1 − LEADERSHIP.commandFloor) × f`
  With `commandFloor = 0.5`: full Leadership → ×1.0 output; zero Leadership → ×0.5.
- **Income with penalty:** existing `incomeOf` result × `command`.
- **Research with penalty (if enabled):** per-tick research progress × `command`.
- **Token seeding:** select the top `leaderCities` cities (capital first, then by
  population). The capital gets `capTokens = clamp(round(total × capitalShare), 1,
  total − (k−1))` where `k` is the number of selected cities. The remaining
  `total − capTokens` split across the others by population weight with
  largest-remainder rounding, so the integer tokens always sum to `total`.
- **Evac dispatch:** a city still needs a plane when
  `city.leaders − (inboundFerries × perPlane) > 0`; each airstrip launches until it
  hits `transportsPerAirstrip` or its transport stock runs out.
- **Tokens loaded per stop:** `min(LEADERSHIP.perPlane − cargo, city.leaders)`.
- **Arrival test:** a ferry has "arrived" at a waypoint when great-circle distance
  ≤ `LEADERSHIP.arriveKm` (default 12 km).

## 5. Edge Cases

- **No bunker / no airstrip:** evacuation cannot run; the alert stays up with a
  build hint. Leaders remain exposed.
- **Bunker destroyed after sheltering:** all sheltered tokens are lost on the next
  tick; Leadership drops accordingly.
- **Bunker destroyed mid-flight:** in-bound ferries divert home and redeposit their
  cargo into the origin capital (if still alive) or lose it (if the capital is
  gone).
- **Home airstrip destroyed mid-flight:** the ferry is lost with its cargo (its
  cargo is counted as `lost`).
- **Capital destroyed mid-load / mid-flight:** tokens already aboard remain
  `in_transit` and can still be delivered; tokens still `at_capital` are lost with
  the city.
- **Multiple capitals:** each is worked independently; the controller balances
  transports per capital by `transportsPerCapital`.
- **All leaders lost:** Leadership hits 0%, command factor floors at
  `commandFloor`. Not an instant loss — the nation fights on, weakened.
- **Peace then new war:** the alert re-arms only while leaders are exposed; already
  sheltered leaders are not re-exposed.
- **Determinism:** all leadership logic is pure integer/threshold math with no
  RNG, preserving replay/save determinism.

## 6. Dependencies

- **Cities / capitals** (`cap` flag) — token home. (`engine.js`, `newGame.js`)
- **Combat & fallout** (`combat.js`, `tick.js`) — city/unit death sets `alive`/hp,
  which leadership reconciliation reads. No changes to combat resolution itself.
- **Aircraft** (`aircraft.js`) — new ferry flight mode; transports from airstrip
  hangar stock.
- **Airstrip / Bunker units** (`constants.js`) — evacuation infrastructure.
- **Economy** (`queries.js incomeOf`, `tick.js` research) — command-factor penalty.
- **Diplomacy / war** (`production.js declareWar`, `tick.js diploTick`) — war onset
  drives exposure and AI auto-evac.
- **UI** (`LiveGame`, `LiveHud`, `NewsTicker`, `useEngine`) — alert, readout,
  headline, and the Shelter order.

## 7. Tuning Knobs (`LEADERSHIP` block in `constants.js`)

| Knob                    | Default | Meaning                                              |
|-------------------------|---------|------------------------------------------------------|
| `startTokens`           | 12      | Leader tokens per nation (also the % denominator)    |
| `leaderCities`          | 5       | How many cities hold leadership (capital + top others)|
| `capitalShare`          | 0.4     | Fraction of the pool seeded on the capital           |
| `perPlane`              | 3       | Tokens a transport carries per trip                  |
| `loadSec`               | 4       | Ground delay loading at a city                       |
| `unloadSec`             | 4       | Ground delay unloading at the bunker                 |
| `transportsPerAirstrip` | 3       | Concurrent transports each airstrip flies            |
| `arriveKm`              | 12      | Distance to count a ferry "arrived" at a waypoint    |
| `commandFloor`          | 0.5     | Output multiplier at 0% Leadership                   |
| `penalizeResearch`      | true    | Whether research speed also scales with Leadership   |

## 8. Acceptance Criteria

1. Every nation starts at 100% Leadership with `startTokens` tokens seeded across
   its top `leaderCities` cities (capital holding the largest share); the player's
   Leadership % shows in the HUD.
2. When the player enters a war with exposed leaders, a persistent alert appears
   and does not auto-dismiss.
3. Pressing **Shelter Leadership** launches transports from **every** airstrip
   (multiple per strip) that ferry leaders city → bunker → home on a repeating
   loop, working all leader-holding cities capital-first until empty; the alert
   transitions to an evacuation-progress state and clears when done.
4. With no bunker or no airstrip, the Shelter action is disabled and shows the
   correct build hint.
5. Nuking a capital that still holds leaders reduces that nation's Leadership by
   the correct amount and fires a `leadership` news headline — verified for both
   the player decapitating an AI and an AI decapitating the player.
6. A transport destroyed in transit loses exactly its cargo tokens (Leadership
   drops by that amount); a destroyed bunker loses all sheltered tokens.
7. Income (and research if enabled) scales by the command factor: at 50%
   Leadership with `commandFloor 0.5`, output multiplier is 0.75.
8. The bunker's selection panel offers **Release Leadership**; pressing it flies
   sheltered leaders back out to living cities (capital-first, spread), empties the
   bunker, loses nothing, and clears when done. Release is disabled with no
   sheltered leaders.
9. `npm run lint` is clean (0 errors) and `npm run build` succeeds; behavior is
   verified in the Electron build.
