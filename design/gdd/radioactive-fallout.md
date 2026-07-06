# Radioactive Fallout & City Destruction Feedback

## Overview

Thermonuclear ground bursts scatter long-lived contamination at the point of
impact. The resulting fallout cloud drifts on the prevailing wind and irradiates
every city and unit inside its radius — friend or foe alike — dealing damage over
time until it decays. Separately, a destroyed city is rendered as an unmistakable
scorched ruin so the state of the map reads at a glance.

## Player Fantasy

A thermonuclear strike is not a clean kill — it poisons the ground around it. The
player feels the weight of using the city-killer warhead: it levels the target,
then the fallout keeps killing, chewing through neighboring cities and any forces
caught in the open, and it can drift back over the player's own territory if used
carelessly near the front line. Watching a rival capital erupt and then rot under a
glowing cloud is the payoff of the strategic arsenal; seeing your own ruined cities
scarred black on the map is the cost of losing the exchange.

## Detailed Rules

1. **Trigger.** When a projectile whose warhead is in `FALLOUT.warheads`
   (thermonuclear by default) detonates, a fallout cloud is created at the impact
   point. This happens whether or not a live target was struck — a nuke detonating
   on an already-dead city still contaminates the ground.
2. **Cloud lifecycle.** The cloud has an age (sim seconds). Its intensity ramps
   from 0 to 1 over `riseSec`, holds at peak until `lifeSec * fadeFrac`, then
   decays linearly to 0 at `lifeSec`, after which it is removed.
3. **Drift.** Each tick the cloud center moves `driftKmPerSec` along
   `driftHeadingDeg` (default due east, modeling prevailing westerlies).
4. **Damage.** Every living city and unit within `radiusKm` of the cloud center
   takes damage each tick equal to `dmgPerSec × intensity × proximity × dt`, where
   proximity is 1 at the center and falls to `edgeFalloff` at the radius edge.
   Fallout is **indiscriminate** — it ignores ownership and alliance.
5. **City death.** A city reduced to 0 hp by fallout is destroyed exactly as a
   direct hit destroys it (`alive = false`, `destroy` event emitted), feeding the
   loss toast, the death explosion, and the ruin marker.
6. **Destroyed-city rendering.** A city with `alive === false` renders as a dark
   scorched crater with a burnt-orange scar ring, drawn larger than a live city so
   destruction is obvious at map scale — distinct from a merely damaged city (which
   keeps its green→amber→red vitality halo).

## Formulas

Let `age` be the cloud age in sim seconds and `d` the great-circle distance (km)
from the cloud center to an entity.

```
intensity(age) =
    0                                             if age <= 0 or age >= lifeSec
    age / riseSec                                 if age <  riseSec
    1                                             if age <= lifeSec * fadeFrac
    1 - (age - fadeStart) / (lifeSec - fadeStart) otherwise
        where fadeStart = lifeSec * fadeFrac

proximity(d) =
    0                                             if d >= radiusKm
    1 - (1 - edgeFalloff) * (d / radiusKm)        otherwise

damageThisTick = dmgPerSec * intensity(age) * proximity(d) * dt
```

Drift per tick (km → degrees):

```
driftKm  = driftKmPerSec * dt
dLat     = driftKm * cos(driftHeadingDeg) / 111
dLng     = driftKm * sin(driftHeadingDeg) / (111 * cos(lat))
```

## Edge Cases

- **Fizzle (target already dead):** the cloud still spawns, sited at the missile's
  aim point rather than a target position.
- **Non-fallout warheads:** standard and cluster warheads spawn no cloud.
- **Overlapping clouds:** each cloud damages independently; stacked strikes stack
  damage. No special merge logic — this is intended (saturation bombing is worse).
- **Attacker's own assets:** damaged normally; no owner exemption. Nuking near your
  own cities is a real cost.
- **Old saves:** worlds created before this system lack `w.effects`; the tick and
  renderers guard with `w.effects || []`.
- **Determinism:** intensity, proximity, and drift are pure functions of age,
  position, and dt — no RNG — so the sim stays deterministic and testable.
- **Win condition:** a fallout kill of a nation's last city eliminates it through
  the existing end-of-tick check; no special-casing.

## Dependencies

- **City Vitality** (`design/gdd/city-vitality.md`) — fallout reduces the same
  `hp` that vitality reads; scaled economy/population follow automatically.
- **Combat / warheads** (`src/game/sim/combat.js`, `WARHEADS`) — the trigger is
  the warhead type on impact.
- **Tick engine** (`src/game/sim/tick.js`) — the per-tick damage pass.
- **Map rendering** (`src/ui/live/useLiveLayers.js`, `LiveGame.jsx`) — the haze
  layer, the animated epicenter marker, and the ruin layer.

## Tuning Knobs

All in `src/game/data/constants.js` under `FALLOUT` (data-driven per coding
standards — no fallout numbers live in systems code):

| Knob             | Default | Meaning                                            |
|------------------|---------|----------------------------------------------------|
| `warheads`       | `["thermo"]` | Warhead keys that leave fallout on impact     |
| `radiusKm`       | 480     | Contamination radius at ground zero                |
| `lifeSec`        | 80      | Sim seconds the cloud lingers before full decay    |
| `riseSec`        | 6       | Seconds to reach peak intensity after detonation   |
| `fadeFrac`       | 0.55    | Fraction of life at peak before decay begins       |
| `dmgPerSec`      | 2.2     | Core hp/sec at peak intensity                       |
| `edgeFalloff`    | 0.35    | Intensity retained at the cloud edge (0..1)        |
| `driftKmPerSec`  | 1.1     | Drift speed of the cloud center                    |
| `driftHeadingDeg`| 90      | Drift bearing (90 = due east)                       |

## Acceptance Criteria

1. A thermonuclear strike spawns exactly one fallout cloud at the impact point;
   standard and cluster strikes spawn none.
2. A city sitting near the core of a full-life cloud from full hp is destroyed by
   fallout alone; a city at the cloud edge is significantly damaged but not
   guaranteed killed.
3. Units caught inside the cloud lose hp over time and can be attritted to death.
4. The cloud footprint is visible on the map as a radioactive haze that grows in
   as intensity ramps and fades out as it decays, with an animated epicenter.
5. A fallout-killed city raises the standard loss/destroyed toast and renders as a
   scorched ruin.
6. A destroyed city is visually distinct from a living or merely damaged one at
   normal map zoom.
7. Fallout damages assets of all owners, including the attacker's.
8. `npm run lint` and `npm run build` pass; the engine remains deterministic.
</content>
</invoke>
