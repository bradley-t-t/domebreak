<h1 align="center">Alliances — Mutual-Defense Pacts</h1>

<p align="center">
  <b>A third relation state beside war and peace: allies never fight each other, and an attack on one drags the other in — so the living world knots itself into blocs.</b>
</p>

<br />

## Overview

Alliances add a third relation state alongside war and peace: `ally`. Two powers
in a pact never make war on each other, and an attack on one drags the other into
the war on the defender's side (a defensive call-to-arms). Both the player and the
AI form, honor, and break alliances, so the living world grows blocs rather than a
flat field of independent belligerents. Alliances are proposed and answered the
same way white peace is — instantly resolved between AIs, routed to a popup when
the player is asked.

## Player Fantasy

You are not alone on the board. You can court a wary neighbor into a pact, lean on
that pact when a stronger power comes for you, and watch rival AIs knot themselves
into blocs you must navigate around. Declaring war on one member of a bloc means
declaring war on all of it — alliances make the map political, not just a list of
distances.

## Detailed Rules

- **Relation states**: a nation's `relations[other]` is `"war"`, `"ally"`, or
  absent/`"peace"`. War and alliance are mutually exclusive; forming one requires
  not being in the other.
- **Mutual**: alliance is symmetric — both sides carry `relations[other] = "ally"`.
- **Proposing** (`proposeAlliance(from, to)`):
  - Refused if the two are at war, already allied, or `from` is at its ally cap.
  - To an AI: resolved immediately by `aiAcceptsAlliance`.
  - To a human: a pending offer is recorded and (for the local player) an
    Accept/Decline popup is raised — mirrors the white-peace offer flow.
- **AI acceptance** (`aiAcceptsAlliance`): accept if under the ally cap AND
  (they share a common enemy OR the proposer is at least as strong by surviving-
  city fraction). Otherwise decline.
- **Call-to-arms (defensive pact)**: when A declares war on B, every current ally
  C of B that is not itself allied to (or already at war with) A is brought into
  the war against A. One hop only — C's own allies are not pulled in, which bounds
  cascades. The aggressor's allies are NOT obligated (a defensive pact does not
  cover a war of aggression).
- **Declaring war on an ally**: refused. The alliance must be broken first
  (`breakAlliance`), which returns both sides to peace.
- **AI diplomacy cadence**: on each nation's staggered diplo tick it may, in order,
  sue for peace, propose an alliance (reachable peers, weighted toward a shared
  enemy then strength), then declare a war (allies excluded from rival scan).
- **Ending allied wars**: each war a call-to-arms creates is an independent war
  that resolves on its own (white peace, surrender, or victory). Peace between A
  and B does not automatically end C's war with A.

## Formulas

- **Ally count**: `allyCount(n) = |{ s : n.relations[s] === "ally" }|`.
- **AI accepts alliance from `f`**: `allyCount(ai) < maxAllies AND (sharedEnemy(ai,f)
  OR survivingFrac(f) >= survivingFrac(ai))`, where `sharedEnemy(a,b)` is true iff
  some slot `s` has `a.relations[s] === "war" AND b.relations[s] === "war"`.
- **AI proposal target weight** for candidate m (peace, reachable within
  `allyRangeKm`): `weight = (1 + allySharedEnemyW·sharedEnemy(n,m)) · clamp(gdp_m,
  0.2, ∞)`; pick one candidate proportional to weight via the seeded RNG.
- **Reachability**: capital-to-capital `haversine ≤ allyRangeKm`.

## Edge Cases

- **Ally of both belligerents**: C allied to both A and B when A declares war on B
  is left out (cannot fight its own ally).
- **Already at war / already allied with the aggressor**: skipped by the call-to-
  arms scan — no duplicate war, no self-war.
- **Ally cap reached**: further proposals refused (AI) or return an error (player).
- **Stale player offer**: if relations change (a war starts) before the player
  answers an alliance offer, `respondAlliance` no-ops on accept.
- **Attract mode**: attract-sim nations hold no alliances, so call-to-arms is a
  no-op there — existing behavior preserved.
- **Legacy saves**: `pendingAlliance` is lazily initialized (`ensureWar`); missing
  `relations` entries read as peace, so old saves load with no alliances.

## Dependencies

- `sim/production.js` — relation primitives (`declareWar`, `makePeace`,
  `formAlliance`, `breakAlliance`) and the call-to-arms.
- `sim/warResolution.js` — proposal/answer flow, AI acceptance, popups
  (`pendingAlliance`, `warPopups` kinds `ally-offer`/`ally-formed`/`ally-refused`).
- `sim/aiTick.js` — `diploProposeAlliance`, ally exclusion in `diploDeclareWar`.
- `sim/queries.js` — `atWar` (unchanged; combat only ever targets `atWar` foes, so
  allies are never fired on).
- `sim/stability.js` — unaffected; `warCount` still counts only `"war"` relations.
- UI: `DiplomacyScreen`, `WarOutcomeModal`, `NewsTicker`, `useEventEffects`,
  `useContextMenus`, `LiveGame` (relation/team color), `useEngine` (api).

## Tuning Knobs

Data-driven in `DIPLOMACY` (`src/game/data/constants.js`):

- `maxAllies` — simultaneous alliances a nation will hold (default 2).
- `allyRangeKm` — max capital distance to propose (default 4200).
- `allyProposeChance` — odds per diplo tick an eligible AI proposes (default 0.05).
- `allySharedEnemyW` — extra proposal weight when a candidate shares an enemy
  (default 2).

## Acceptance Criteria

1. `proposeAlliance` between two AIs at peace with a shared enemy forms a mutual
   `ally` relation and emits an `alliance` event.
2. An AI at its `maxAllies` cap declines/does not initiate further proposals.
3. Declaring war on a nation that has allies brings each eligible ally into the war
   against the aggressor (a `callToArms` event per joiner); an ally of both
   belligerents stays out.
4. `declareWar` on an ally is refused; `breakAlliance` returns both to peace and a
   subsequent `declareWar` succeeds.
5. Combat never targets an ally (targeting reads `atWar` only).
6. The Diplomacy screen sorts you, human players, at-war powers, then allies ahead
   of the rest, and offers Propose Alliance / Break Alliance controls (solo only
   while online, matching white peace).
7. Determinism preserved: given `(seed, playerIso)` the full alliance history
   replays identically (every roll uses the seeded `rand(w)`).
</content>
