<h1 align="center">AI Behavior &amp; Placement Overhaul</h1>

<p align="center">
  <b>Opponents that use the whole game — air, sea, ground, and nuclear — place forces with intent, and come in distinct flavors and difficulties.</b>
</p>

<br />

## 1. Overview

Rebuilds the opponent AI now that a match is bounded to ≤8 active nations (see the
Match-Model GDD), which removes the performance ceiling that made the current AI
shallow. Today the AI builds a defensive homeland, runs probabilistic diplomacy, and
points idle offensive units at a random populous city (`aiTick.js`), ignoring air
power, naval maneuver, the ground/capture war, submarines, amphibious assault, smart
targeting, reactive defense, alliance leverage, and objectives — and it places units
naively (every radar rings the same frontier city, `aiPlace.js:150`). This overhaul
gives every active AI a **full-capability brain** organized as prioritized doctrines,
layered with **personality archetypes** and **difficulty tiers**, and a **strategic
placement** system that distributes forces by coverage and frontier. It also deletes
the vestigial tech-tree/research logic (the tech tree was removed) and retires the
LOD throttle + global unit cap that only existed for the 222-nation world.

## 2. Player Fantasy

Your rivals feel like real generals. One turtles behind a layered shield and dares
you to break it; another floods your coast with carriers and cruise missiles; a third
grinds across neutral territory with armor and boots, capturing cities toward you.
They react when hit — surging interceptors, sheltering their leadership, counter-
striking your silos — and they exploit alliances. On higher difficulties they
concentrate fire to actually knock you out; on lower ones they make believable
mistakes. No two opponents in a match play the same.

## 3. Detailed Rules

### 3.1 Doctrines (the full-capability brain)

Each active AI, on its think tick, evaluates prioritized **doctrines**. Every
doctrine's aggressiveness/quality is scaled by the nation's **difficulty tier** and
**personality** (§3.2–3.3). Doctrines, in default priority:

1. **Economy** — build industry to a target scaled by holdings; never idle in
   surplus. Expand economy onto captured cities.
2. **Homeland defense (layered)** — cover capital and high-value cities with **point**
   defense (dome/battery), extend **area** defense outward, and fill coverage *gaps*
   rather than stacking. Add modern interceptors (Patriot/THAAD/Aegis) by threat.
3. **Sensors** — distribute early-warning radar for **coverage** across the frontier
   and interior gaps; one OTH array; satellites for strategic warning. (Placement per
   §3.4 — no clustering.)
4. **Air power** — build airbases/carriers and **actually fly the wings**: set fighter
   **patrols** and **AWACS orbits** over threatened sectors; launch **attack/strike
   sorties** against enemy targets in range; scramble **interceptors** reactively when
   inbound tracks appear.
5. **Strategic offense** — build silos/TELs/subs; **stock and match warheads to
   targets** (thermo/MIRV for clustered high-value cities, HGV for defended targets,
   SICBM for mobile strikes); position **SSBNs** for standoff launch; time strikes.
6. **Ground war &amp; expansion** — build infantry/armor/artillery from an army base;
   **march** on and **capture** neutral cities (expansion) and enemy cities
   (conquest); use **amphibious** transports to land on coasts and islands.
7. **Naval** — sail fleets to contest sea lanes and screen invasions; **hunt subs**
   with ASW destroyers; bombard coastal targets with battleships.
8. **Leadership survival** — when threatened, **shelter/evacuate** leadership to the
   bunker via the airstrip ferry (the AI builds these today but never uses them).
9. **Diplomacy &amp; alliances** — declare winnable wars, sue for peace when losing,
   form alliances, and **coordinate** with allies (focus a shared enemy; don't attack
   allies' targets redundantly).
10. **Objectives** — pursue the game's own strategic objectives (`objectives.js`) as
    tie-breakers among otherwise-equal builds.

### 3.2 Smart targeting (replaces random-populous)

Offensive assignment uses a value function per candidate target, not a population
lottery:
- **Counter-value**: enemy population/economy (weighted by warhead fit).
- **Counter-force**: enemy silos/launchers/subs/airbases (blunt their offense).
- **Counter-defense / leakage**: prefer targets *not* already inside an enemy dome
  envelope, or saturate a defended high-value target with concentration.
- **Decapitation**: enemy leadership/command (bunker, capital) when reachable.
- **Concentration &amp; no-overkill**: allocate just enough warheads to kill a target,
  then move on — the same allocation spirit as the player's Battle Planning solver
  (`sim/battlePlan.js`), reused where practical so AI and player logic converge.

### 3.3 Personality archetypes

Each AI gets an archetype that re-weights doctrine priorities and targeting (data-
driven weights, not new code paths):
- **Turtle** — defense/sensors first, slow methodical expansion, counter-force
  targeting.
- **Aggressor** — offense/ground first, early wars, counter-value + decapitation.
- **Nuclear** — silos/subs/MIRV, strategic strikes, minimal ground.
- **Naval** — carriers/fleets/amphibious, coastal dominance, island grabs.
- **Air** — air wings and interceptors, sortie-heavy, contests the sky.
- **Expansionist** — maximizes neutral capture and economy before confronting rivals.
- **Balanced** — no strong lean (default / "Varied" pool member).

### 3.4 Strategic placement overhaul

Replaces the naive anchor logic (`aiPlace.js`). Placement is **role- and
coverage-aware**:
- **Distribute, don't cluster** — sensors and defenses are sited to maximize *new
  coverage* (place where the fewest existing friendly envelopes overlap), across
  *different* anchor cities and frontier segments — fixing the "3 radars on one city"
  bug (`aiPlace.js:150` anchors every sensor to `nearestCity(cities, front)`).
- **Layered defense** — point defense on the highest-value uncovered asset; area
  defense to extend the umbrella toward the front; interceptors to plug the biggest
  current leak.
- **Frontier vs interior** — offense/sensors forward toward the active front (nearest
  hostile active or the expansion edge into neutrals); industry/command/bunker deep in
  the interior; naval to owned coastal water; ground staged toward the march target.
- **Spread** — keep same-role units apart (existing `spreadKm`) *and* spread anchors,
  so forces cover the nation rather than piling on the capital.

### 3.5 Difficulty tiers

A tier scales competence (data-driven multipliers): think cadence, economy
efficiency, targeting quality (from random → full value function), concentration
discipline, reaction speed (reactive defense/evac), warhead sophistication, and how
often it makes a deliberate suboptimal choice. Suggested tiers: **Recruit / Regular /
Veteran / Elite**.

## 4. Formulas

- **Doctrine score**: `score(d) = basePriority(d) × personalityWeight(archetype, d) ×
  tierCompetence(tier)`; the AI acts on the highest-scoring *affordable, valid*
  doctrine each think.
- **Target value**: `V(t) = wCV·counterValue(t) + wCF·counterForce(t) +
  wLeak·leakage(t) + wDecap·decap(t)`, weights from archetype × tier; leakage(t) = 0
  if `t` is inside an enemy defense envelope (unless concentrating). Reuses the
  in-range + engagement checks from `sim/battlePlan.js`.
- **Coverage placement**: choose the candidate spot maximizing
  `newCoverageArea = area(range) − overlap(existing friendly envelopes)`, subject to
  in-territory + spread constraints.
- **Concentration**: assign attackers to a target until `Σ shotDamage ≥ remainingHp`
  (no-overkill), identical to the Battle-Planning solver, unless the archetype/tier
  flags overkill on a decapitation target.
- **Reaction trigger**: when inbound tracks toward an asset exceed a tier threshold,
  raise defense priority and, for leadership, invoke shelter/evac.
- All coefficients are data-driven in an expanded `AI_TUNING` + new `AI_PERSONALITY`
  and `AI_DIFFICULTY` tables; nothing hardcoded in the loops.

## 5. Edge Cases

- **Landlocked nation** — naval/amphibious doctrines score zero (no coastal water);
  the brain leans ground/air without special-casing.
- **No neutral neighbors left** — expansion doctrine falls through to conquest of
  active rivals.
- **Warhead stock empty** — offense holds (as today) or the AI prioritizes building
  the matched warhead rather than firing a mismatched one.
- **Ally becomes the last rival** — alliance drops (existing `breakAlliance`) before
  the AI can win; it won't deadlock allied to its only opponent.
- **Leadership already sheltered** — evac doctrine is a no-op; the AI doesn't thrash.
- **Tier = Recruit** — deliberately omits the hardest doctrines (reactive defense,
  concentration, decapitation) and uses degraded targeting, so it is beatable.
- **Amphibious with no valid landing** — sortie is skipped, transport re-tasked; no
  stranded units.
- **Concentration vs a target that dies mid-volley** — re-solve next think reassigns
  surplus attackers (same behavior as the player's reconciler).

## 6. Dependencies

- **Match model** (`design/gdd/match-model-and-neutral-world.md`) — the active set the
  AI operates within; neutral capture is the expansion target. Required first.
- **Lobby &amp; AI-fill** (`design/gdd/lobby-and-ai-fill.md`) — selects tier/archetype
  per AI slot.
- **Existing systems the brain must drive**: `production.js` (build/queue/commandAttack/
  setWarhead/patrol), `aircraft.js` (wings/patrols), naval sail (`setSail`),
  `occupation.js` (capture), amphibious embark/disembark, `leadership.js`
  (shelter/release), `warResolution.js` (peace/surrender), `objectives.js`.
- **Battle Planning solver** (`sim/battlePlan.js`) — reuse its in-range + no-overkill
  allocation for AI concentration/targeting so player and AI logic converge.
- **Placement** (`aiPlace.js`) — rewritten; `queries.js` (`defenseRange`,
  `inOwnCountry`, sensor coverage) for coverage math.
- **Cleanup**: remove vestigial research/tech logic (`aiTick.js` research knobs,
  `AI_UNLOCK_BUILD_ORDER` gating on `requiresTech`) and the LOD/unit-cap machinery
  (`aiUnitCap`, `activeRangeKm`, `idleThink*`) now that the roster is ≤8.

## 7. Tuning Knobs

- `AI_DIFFICULTY[tier]` — competence multipliers: `thinkScale`, `econScale`,
  `targetingQuality` (0..1), `concentration` (0..1), `reactionSpeed`, `warheadSkill`,
  `mistakeRate`.
- `AI_PERSONALITY[archetype]` — per-doctrine priority weights + targeting weights
  (`wCV/wCF/wLeak/wDecap`).
- Expanded `AI_TUNING` — per-doctrine targets/reserves (defense, air, naval, ground,
  offense), coverage-placement thresholds, expansion aggressiveness into neutrals.
- All safe ranges documented inline; balance validated via `/balance-check` per slice.

## 8. Acceptance Criteria

1. An active AI demonstrably uses each system in a match: builds and flies air wings
   (patrol + sortie), sails and fights with naval units, builds ground units and
   **captures neutral and enemy cities**, positions subs, launches amphibious assaults,
   fires matched warheads (incl. MIRV), and shelters its leadership under threat.
2. Targeting is value-driven, not random: given a defended high-value city and an
   undefended lesser one, the AI's choice reflects its archetype/tier weights
   (unit-tested on the target value function).
3. Placement distributes: starting fresh, the AI does **not** cluster 3 radars on one
   city; sensors/defenses spread across anchors to maximize coverage (unit-tested on
   the coverage-placement function; visually verified in-app).
4. Personality is legible: a Turtle vs an Aggressor vs a Naval AI produce visibly
   different build orders and behavior in the same start.
5. Difficulty scales: Recruit is beatable and makes visible mistakes; Elite
   concentrates fire, reacts to strikes, and pursues decapitation.
6. Vestigial research/tech logic and the LOD/unit-cap machinery are removed; no dead
   knobs remain.
7. `npm run build` green, `npm run lint` 0 errors, AI unit tests pass, and each
   behavior slice passes `/balance-check` + a playtest that it reads as intended.
