<h1 align="center">AI Economy Fairness + BMD Engagement Rules</h1>

<p align="center">
  <b>The AI buys its warheads on the player's own production line, and fighters can no longer intercept ballistic missiles.</b>
</p>

<br />

Two rule changes, engine-side (`src/game/sim/tick.js`).

## AI plays by the player's economy

The AI previously cheated: `aiTick` topped its standard warhead stock up to 4 for
free every tick, and conjured a free thermonuclear warhead 25% of the time it
assigned a target. That let a broke nation (no industry, negative net) nuke
indefinitely. Now:

- **No free ammo.** Both freebie paths removed. The AI buys warheads with
  `queueAmmo` on the same production line as the player — same points cost, same
  build time, FIFO with its units.
- **Stocking doctrine**: with any offense unit built or on the line, the AI keeps
  ~4 standard rounds stocked/ordered (buys when it can afford cost + 60 buffer),
  and at war occasionally (25%/tick when eligible) orders one thermo if it has
  `prodCost + 300` on hand.
- **Thermo only from stock**: target assignment loads a thermo only when
  `ammo.thermo > 0`. A launcher stuck on an empty magazine falls back to
  standard so it never dead-locks.
- **Deficit discipline**: at negative net income the AI queues only industry
  (mirroring the player's deficit gate, which `queueUnit` enforces engine-side
  for everyone) — no domes, sensors, silos, ammo, or research until solvent.

Existing fairness confirmed, unchanged: AI pays points for units via `queueUnit`,
income/upkeep/production ticks are nation-agnostic, research is paid.

## Ballistic missile defense rules

- `UNITS.silo.ballistic: true` — ICBMs (and their MIRV subs, which inherit the
  firing unit type) are ballistic reentry vehicles.
- **Fighters cannot engage ballistic projectiles**: the defense engagement loop
  skips any defender with `airSpeed` (the air-superiority fighter) against `ballistic` shots. Fighters
  still engage hypersonic glide vehicles (launcher), battleship strikes, and
  carrier-wing ordnance — things that fly in the air column.
- **Missile silos never intercept** (already true): interception is restricted to
  `kind: "defense"` units; silos are `kind: "offense"`.
- BMD remains with ground/sea defenses: SAM Battery, DomeBreak, Cruiser,
  Destroyer.

## Tuning knobs

AI stock target (4 standard), thermo buffer (+300), standard buffer (+60), thermo
order chance (0.25) — all in `AI_TUNING` (`src/game/data/constants.js`), consumed
by `aiTick` in `src/game/sim/tick.js`. `ballistic` is per-unit-type data.

## Acceptance

- A broke, at-war AI (0 points, 0 ammo) fires nothing.
- An AI in deficit queues only industry.
- A solvent at-war AI orders standard warheads through its production line
  (points drop by `prodCost`, item appears in `prod.queue`).
- An air-superiority fighter on station never fires at an inbound ICBM; a Golden
  Dome in the same spot does. The fighter still engages a hypersonic launcher shot.
