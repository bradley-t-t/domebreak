<h1 align="center">Sensors & Fog of War</h1>

<p align="center">
  <b>A nation sees only what its sensors cover, and a launch warning arrives only once a radar catches the missile.</b>
</p>

<br />

## Overview

Enemy forces and missiles in flight are no longer omnisciently visible. A nation only sees what its
sensor picture covers: dedicated radars, ship and aircraft radars, and — new with this system — the
Over-the-Horizon (OTH) Radar, a skywave array that detects launches thousands of km away but is too
coarse to guide interceptors. Missile-launch warnings are gated on detection: if nothing covered the
launch site, the victim learns of the attack only when the missile enters some radar's coverage.

## Player Fantasy

Commanding a real strategic warning enterprise. Building the OTH fence feels like buying national
peace of mind — the klaxon sounds the moment an enemy silo lights up half a world away. Skipping it
feels like flying blind: the first warning is a track already inside your early-warning net, minutes
from impact. Enemy deployments are hidden until your sensors reach them, so scouting coverage
matters.

## Detailed Rules

- **Sensor sources** (per nation): every live unit with a radar (`radarKm`, or `range` on `detect`
  units — radar, OTH, carrier, AWACS, ships, airborne jets). Parked aircraft radiate nothing.
  Defense units (battery, dome, cruiser, destroyer, air-superiority fighter) additionally sense within their own base
  engagement `range` — organic fire-control radar. All dedicated-sensor radii scale with the
  nation's `radarMult` research multiplier.
- **Unit visibility (fog of war)**: an enemy unit renders on your map only if a sensor of yours
  covers its position. Your own units always render. Cities and country state are public knowledge.
  Radar/defense coverage overlay rings draw only for visible units.
- **Missile tracks**: each projectile carries `seenBy` — the nations tracking it. At launch it seeds
  with the shooter plus every nation whose sensors cover the launch point (this is what OTH buys —
  seeing the boost phase). In flight, a ~4 Hz sweep adds any nation whose sensors now cover the
  missile. A track once held is never dropped. MIRV subs inherit the bus's track list.
- **Launch warning**: the launch sound/notification plays only for nations in the launch `seen`
  set. When the *targeted* nation first gains the track — at launch or mid-flight — it gets a
  "Launch detected — missile inbound" alert (toast + warning chirp). No coverage, no warning until
  a radar picks the missile up.
- **OTH is warning-only** (`warnOnly`): it never satisfies `radarLinked`, so it does not grant the
  ×2.5 defense-range boost. Interceptor cueing still requires an Early Warning Radar (or other
  track-quality sensor) near the defense.
- **Interception unchanged**: defenses engage inbound ordnance inside their engagement bubble as
  before (their organic radar sees what enters it) — sensors buy warning time and map truth, not
  new kill mechanics.
- **AI**: builds one OTH array once it has a dome and an Early Warning Radar and can afford it.

## Formulas

- Sensor radius of unit `r` owned by nation `n`:
  `S(r) = radarRangeOf(r.type) × n.radarMult`, else `UNITS[r.type].range` if `r` is a defense unit.
- Point `(lng, lat)` is sensed by nation `n` iff `∃ r ∈ units(n), hp > 0, airborne-or-grounded-sensor:
  haversine(r, p) ≤ S(r)`.
- Detection sweep cadence: every `0.25` game-seconds (missile moves ≤ `speed × 0.25` ≈ 35 km per
  sweep at ICBM speed — well under any sensor radius).

## Edge Cases

- **Legacy saves**: projectiles without `seenBy` get an empty list on the first sweep and are
  re-detected naturally; old launch events without `seen` are treated as visible (back-compat).
- **Cluster split**: subs inherit `seenBy`, so an already-tracked bus doesn't spawn eight invisible
  MIRVs; the MIRV split flash/sound is gated on the bus's track list.
- **Hovered unit lost to fog**: the hover probe reads from the visible-unit list, so it clears when
  coverage lapses.
- **Sensor destroyed mid-flight**: tracks are never dropped — handoff is assumed once acquired.
- **Third parties**: a nation that senses a missile not aimed at it tracks it (sees it on the map)
  but gets no inbound alert.

## Dependencies

- Tick engine (`src/game/sim/tick.js`): projectile loop, events; `radarLinked` in `src/game/sim/queries.js`; AI build
  order in `aiTick`.
- Map/UI (`src/ui/live/LiveGame.jsx`, `src/ui/live/SkyLayer.jsx`): unit markers, sky sprites, overlays, toasts.
- Audio (`src/game/platform/audio.js`): `detected` warning cue.
- Research: `det` path `radarMult` techs scale all sensor radii, OTH included.

## Tuning Knobs

All in `UNITS` (`src/game/data/constants.js`): OTH `cost 500`, `buildTime 24`, `range 5000`, `hp 35`,
`upkeep 2.5`, `warnOnly`. Early Warning Radar `range 1500` stays the track-quality tier. Sweep
cadence `0.25 s` (engine `step`). Defense organic-sensing = base `range` (no multipliers).

## Acceptance Criteria

- Enemy units outside all friendly sensor radii do not render; they appear when a sensor (built,
  sailed, or flown) covers them, and disappear if it is lost.
- With an OTH array covering an enemy silo: launch sound + "missile inbound" toast fire the moment
  the enemy launches at you.
- Without OTH coverage: no sound/toast at launch; both fire when the missile enters Early Warning
  Radar (or ship/AWACS) coverage.
- OTH never grants the ×2.5 `radarLinked` defense-range multiplier; Early Warning Radar still does.
- Missiles you have no track on draw no trail/sprite; ones aimed at third parties you *do* cover
  draw normally.
- AI nations acquire one OTH array in long games. `npm run lint` and `npm run build` pass.

<br />

<p align="center">
  <sub>Build the fence and the klaxon sounds half a world away; skip it and the first warning is already inbound.</sub>
</p>
