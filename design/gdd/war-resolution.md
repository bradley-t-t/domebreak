<h1 align="center">War Resolution — Victory, Defeat &amp; White Peace</h1>

<p align="center">
  <b>Every war now ends in one of three outcomes — Victory, Defeat, or White Peace — each reshaping territory and national stability instead of quietly fizzling into a ceasefire.</b>
</p>

<br />

## Overview

Wars in DomeBreak no longer just fizzle out into an ownership-freezing ceasefire.
Every war between two powers now ends in one of three outcomes — **Victory**,
**Defeat**, or **White Peace** — each with distinct consequences for territory and
national stability. When the player is a belligerent the outcome raises a modal that
(in single-player) pauses the game; White Peace is a mutual agreement the player can
offer or must accept. AI-vs-AI wars resolve the same way, silently in the background.

Beyond the surviving-city surrender threshold, a nation is also forced to surrender
by **decapitation**: if its Leadership pool is wiped out entirely (`lost >= total`),
`decapitationTick` capitulates it in every war (each foe scores a Victory) and
eliminates it from the match. This is the war-resolution hook for the Leadership
system — see `design/gdd/leadership.md` §3.2.1.

## Player Fantasy

A war should *end* meaningfully, not evaporate. Grinding an enemy down until they
capitulate and you keep the spoils should feel earned; being forced to sue for a
face-saving white peace when neither side can win should feel like a diplomatic
release valve; and losing should sting — you cede what they took and your nation
wobbles for a long while afterward. The pause-and-popup makes each resolution a
moment the player registers and reacts to, rather than a number quietly changing.

## Detailed Rules

Territory in DomeBreak is a Voronoi partition of living cities; occupation
(`sim/occupation.js`) already flips a city's `slot` to whoever holds it **the moment**
it is captured, mid-war. War resolution decides whether those flips **stick or
revert**. Each city carries `owner0` — the power that owned it at match start — as the
reference point ("occupied" ≡ `city.slot !== city.owner0`).

For a war between belligerents **A** and **B**, only cities contested *between this
pair* are affected — a city is affected iff it is alive, currently occupied, and its
`{owner0, current holder}` set equals `{A, B}`. Territory a belligerent occupies of a
**third** party, and un-occupied homeland, are never touched by that pair's resolution.

**Victory (winner W, loser L):**
- Every affected city → assigned to **W**. In practice: cities W already occupies of
  L stay W's (conquest becomes permanent); cities L occupied of W revert to W.
- L keeps only the homeland it still holds — "the loser walks away with their
  un-occupied homeland."
- L takes the **Defeat stability penalty** (below).

**Defeat:** the mirror of Victory from the loser's seat — same territory outcome,
same penalty; only the framing/popup differs.

**White Peace (mutual):**
- Every affected city reverts to its `owner0` — both sides give back everything they
  took *from each other* this war. Third-party holdings are untouched.
- No stability penalty for either side.
- Requires **both** parties to agree (offer → accept).

### Triggers

1. **Auto-surrender.** Each war tick, any belligerent (AI *or* the player) whose
   surviving-city fraction falls below `DIPLOMACY.surrenderThreshold` surrenders — the
   foe wins (Victory), the survivor-poor side loses (Defeat). Deterministic order;
   `atWar` is re-checked before each resolution so a single tick never double-resolves
   the same war.
2. **White-peace offers.** Once a war is older than `DIPLOMACY.minWarSec`, an AI may
   (per `DIPLOMACY.peaceOfferChance` on its diplomacy cadence) offer white peace to a
   foe:
   - foe is **AI** → resolved immediately as White Peace (AI-vs-AI needs no dialog);
   - foe is the **player** → a pending offer is recorded and a popup is raised.
   The **player** may offer white peace to any AI foe from the Diplomacy screen; the AI
   accepts if it is not clearly winning (its surviving fraction ≤ the player's) or the
   war is old, otherwise refuses (toast, war continues).

### Popups & pause (player belligerent only)

The engine enqueues a player-facing notice onto `world.warPopups` whenever a resolution
or offer involves the player's slot. AI-vs-AI resolutions enqueue nothing.
- `victory` / `defeat` / `whitepeace` — informational, single **Continue** button.
- `offer` — interactive **Accept** / **Decline** (white peace offered *to* the player).

In single-player the presence of a popup pauses the sim (`world.paused`); the modal
auto-paused it and resumes on dismiss unless the player had already paused manually.
Online matches never pause (they are speed-locked): the interactive offer flow is
solo-only, and online wars resolve via auto-surrender / AI-vs-AI white peace without a
blocking modal. All popup copy and controls route through the standard modal a11y
primitive (`useModal`: focus trap, Escape, focus restore).

## Formulas

Let `alive(s)` = living cities held by slot `s`, `start(s)` = cities `s` held at match
start.

- **Surrender:** `alive(s) / start(s) < DIPLOMACY.surrenderThreshold` → `s` surrenders.
- **Affected city (pair A,B):** `c.alive ∧ c.slot ≠ c.owner0 ∧ {c.owner0, c.slot} = {A, B}`.
- **Victory transfer:** affected `c.slot ← W`. **White-peace transfer:** affected `c.slot ← c.owner0`.
- **Defeat stability penalty** (added to `sim/stability.js` factors), decaying linearly
  to zero over one in-game year:
  - `p_active(t) = STABILITY.wDefeat · (1 − (t − t0) / STABILITY.defeatSec)` for
    `t0 ≤ t < t0 + STABILITY.defeatSec`, else 0.
  - A nation's total defeat penalty is `Σ p_active` over its recorded defeats
    (multiple lost wars stack, each decaying independently).
  - `STABILITY.defeatSec = 17520` game-seconds = one in-game year (the HUD clock runs
    1 game-second = 30 in-game minutes → 365 × 24 × 60 / 30 = 17520).
- **AI accepts a player's white-peace offer** iff `alive(ai)/start(ai) ≤
  alive(player)/start(player)` **or** war age `> DIPLOMACY.minWarSec`.

## Edge Cases

- **Both sides below threshold same tick:** deterministic iteration resolves one war
  once; the `atWar` re-check prevents a second resolution of the same pair.
- **Elimination vs surrender:** a nation reduced to zero cities is eliminated by the
  existing game-over path before it can surrender; endWar only moves *occupied* cities,
  so it never resurrects a dead power.
- **Legacy saves without `owner0`:** resolution reads `c.owner0 ?? c.slot`, so
  pre-feature saves simply treat current holders as origin (no phantom reverts).
- **Third-party occupations:** untouched by a given pair's resolution — a nation that
  loses to A still keeps cities it took from C.
- **Popup queue:** multiple resolutions in quick succession queue on `warPopups`;
  the modal shows them one at a time, FIFO.
- **Offer already pending / war already ended:** offering again is a no-op; responding
  to a stale offer whose war has ended is ignored.
- **Manual pause preserved:** if the player had paused before a popup appeared, dismiss
  leaves the game paused.

## Dependencies

- `sim/occupation.js` — produces the mid-war flips this system resolves; `owner0`
  reference set in `engine.js createWorld`.
- `sim/queries.js` — `atWar`; city/holding counts.
- `sim/stability.js` — consumes the Defeat penalty as a new stability factor.
- `sim/tick.js` — `diploTick` gains a `warTick` pass (auto-surrender + AI offers);
  `diploDeclareWar` unchanged.
- `sim/production.js` — `makePeace` becomes the internal relation-clearing primitive
  that `endWar` wraps.
- UI: `ui/hud/WarOutcomeModal.jsx` (new), `ui/screens/DiplomacyScreen.jsx` (offer
  instead of instant peace), `ui/hooks/useEngine.js` (api: `offerPeace`,
  `respondPeace`, `dismissWarPopup`), `ui/live/LiveGame.jsx` (mount modal + SP pause).

## Tuning Knobs

`DIPLOMACY` (in `data/constants.js`):
- `surrenderThreshold` — surviving-city fraction below which a belligerent surrenders.
- `minWarSec` — minimum war age before white-peace offers / ceasefires (existing).
- `peaceOfferChance` — per-diplo-tick odds an eligible AI offers white peace.

`STABILITY`:
- `wDefeat` — peak stability lost the instant a war is lost.
- `defeatSec` — how long the defeat penalty takes to decay to zero (one in-game year).

## Acceptance Criteria

1. A war where W occupies ≥1 of L's cities and then L surrenders resolves as W Victory:
   every W↔L occupied city ends up W's, L keeps its un-occupied homeland, and L gains a
   nonzero Defeat stability penalty. (Automated unit test.)
2. White peace between A and B reverts every A↔B occupied city to its `owner0`; cities
   either side occupied of a third party C are unchanged; neither A nor B gains a
   stability penalty. (Automated unit test.)
3. The Defeat penalty is `wDefeat` at the instant of defeat, decays monotonically to 0
   at `defeatSec`, and is 0 afterward. (Automated unit test.)
4. When the player's foe surrenders, a `victory` popup is enqueued and (solo) the sim
   pauses; dismissing resumes it. When the player crosses the surrender threshold a
   `defeat` popup is enqueued. AI-vs-AI resolutions enqueue no popup. (Manual walkthrough.)
5. An AI white-peace offer to the player shows Accept/Decline; Accept resolves White
   Peace (territory reverts, war ends), Decline leaves the war active. (Manual walkthrough.)
6. `npm run lint` (0 errors) and `npm run build` pass.
