<h1 align="center">ADR-0005: Leadership Continuity — Ferry Mission Mode &amp; Persistent Alert Layer</h1>

<p align="center">
  <b>Leadership is tracked as leader tokens on capitals; a new point-to-point transport ferry mode evacuates them to the bunker, and a new non-dismissing UI alert prompts the player to start the airlift.</b>
</p>

<br />

## Status

Accepted

## Date

2026-07-06

## Last Verified

2026-07-06

## Decision Makers

Trenton Taylor (creative/technical director), Sunday (agent)

## Summary

The Leadership system (see `design/gdd/leadership.md`) introduces a national
survival stat embodied as leader tokens that live on capital cities and must be
airlifted to the hardened Leadership Bunker during war. Delivering it requires two
capabilities the engine did not have: (1) a **point-to-point aircraft ferry
mission** — today's aircraft only fly a patrol pattern (takeoff → orbit ring →
recover) around their own base, with no way to fly to a remote point, set down,
wait, and continue; and (2) a **persistent, non-dismissing alert** in the UI —
today the only event surface is the scrolling NewsTicker, which cannot prompt an
action. This ADR records how both are built with minimal blast radius on the
existing deterministic tick and the state-owned UI contract.

## Engine Compatibility

| Field              | Value                                                                                                          |
| :--- | :--- |
| **Engine**         | GoldenDome custom tick engine (`src/game/engine.js`, `src/game/sim/`) — JavaScript, no third-party game engine |
| **Domain**         | Simulation (aircraft, economy, diplomacy hooks) + UI (alert layer)                                             |
| **Knowledge Risk** | LOW — reuses existing geodesic flight primitives (`advance`, `bearingTo`, `haversine`) and event/HUD patterns  |

## Context

- Leadership must be physically evacuable and physically killable, so it is modeled
  as integer **tokens** with a location (capital city, transport cargo, bunker), not
  a floating stat. This keeps loss events grounded in the same city/unit-death that
  already drives the sim, and keeps everything deterministic (no RNG).
- The existing `flyAircraft` state machine is tightly coupled to the airbase
  (runway localizer, orbit ring, hangar rotation). Bolting remote landings onto it
  would entangle unrelated code and risk the patrol logic. Cities and the bunker
  are **not airbases** (no runway), so the full pattern does not even apply.
- The UI must not own or mutate game state (`.claude/rules/ui-code.md`). The alert
  therefore *derives* from world state each frame and dispatches a normal engine
  order; it never writes tokens or flags directly.

## Decision

1. **New `src/game/sim/leadership.js` module** owns all leadership orchestration:
   token seeding (`distributeLeadership`), derived queries (`leadershipPct`,
   `leadershipStatus`, `commandFactor`), the `shelterLeadership` order, the per-tick
   evac controller (`evacTick`), and loss reconciliation (`reconcileLeadership`).
   Combat resolution is **not** modified — reconciliation reads the `alive`/`hp`
   flags combat already sets.

2. **Ferry mission mode lives on the aircraft as a `mission` object** and is handled
   by a dedicated `flyFerry` branch at the top of `flyAircraft`, bypassing the
   runway/orbit/landing machine entirely. A ferry flies a simplified profile —
   straight-line `advance` toward the current waypoint, a timed ground-hold on
   arrival, then the next leg — which is what lets it set down at a city and at the
   bunker. Transports launch from existing airstrip hangar stock; no new buildable
   unit is introduced (the `transport` type stays `hidden`).

3. **Command-factor penalty** is applied as a stored per-nation multiplier
   (`nation.commandMult`), refreshed once per tick, and folded into `incomeOf`
   (and, gated by `LEADERSHIP.penalizeResearch`, the research-progress step). This
   matches how every other economic modifier (`incomeMult`, `researchSpeedMult`) is
   already threaded, so no call sites change shape.

4. **Persistent alert** is a new presentation-only component mounted in `LiveGame`.
   It derives visibility from `leadershipStatus(world, mySlot)` and calls a new
   `api.shelterLeadership()` order (added to `useEngine`, auto-forwarded online by
   `useGameSession`). It is non-dismissing by construction: it renders while the
   nation is at war with exposed leaders and clears only when exposure ends.

5. **All tuning lives in a `LEADERSHIP` block in `constants.js`** — no hardcoded
   gameplay numbers in systems code, per the coding standard.

## Alternatives Considered

- **Extend `flyAircraft`'s existing state machine with remote-landing states.**
  Rejected: high coupling risk to patrol/recovery logic, and cities/bunkers have no
  runway for the localizer model to target. A separate branch is cleaner and
  isolable.
- **Model Leadership as a plain float that just ticks down when a capital dies.**
  Rejected: it could not represent in-transit risk, partial evacuation, or the
  bunker single-point-of-failure — all core to the fantasy. Tokens give physical
  truth for free.
- **Event-driven alert (fire on the `war` event).** Rejected: events are trimmed to
  a rolling ~60-entry window and can be missed; deriving from state is robust and
  self-clearing.
- **Player-only scope.** Rejected during design — all-nations scope enables the
  offensive decapitation play, and the loss model is naturally symmetric.

## Consequences

- **Positive:** deterministic, save-safe (integer tokens, no RNG); combat code
  untouched; flight reuses proven primitives; UI honors the state-ownership rule; a
  reusable persistent-alert pattern now exists for future prompts.
- **Negative / follow-ups:** AI nations only self-evacuate if they happen to own a
  bunker + airstrip; active AI construction-under-threat is a future enhancement.
  The ferry uses a simplified (non-runway) flight profile, so ferries and patrol
  jets model landings differently — acceptable, but a known inconsistency.
- **Testing:** logic (token split, command factor, loss reconciliation) is
  unit-testable pure math; the ferry loop and alert are validated by in-app
  playtest per the GDD acceptance criteria.
