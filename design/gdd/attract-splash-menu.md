# Attract Mode, Boot Splash & Menu Identity

## Overview

The boot experience: a two-card publisher splash (TaylorURL logo, then the
solo-developer credit), followed by the login/menu screens rendered over a
live attract-mode war — a real engine simulation where every nation is AI and
missiles, intercepts, and strikes play out silently on the globe.

## Player Fantasy

The game is alive before you touch it. The menu is a war-room window onto a
world already at war; signing in feels like taking command mid-crisis.

## Detailed Rules

- Splash shows once per app boot, before any screen. Card 1: TaylorURL logo on
  white, "A TAYLORURL GAME" (2.6s). Card 2: "MADE SOLO BY TRENTON TAYLOR" on
  black (2.3s). Any key or click skips the remainder immediately.
- The attract sim mounts behind the login screen and the start menu only —
  never during gameplay, never on the nation-select screen.
- The sim is a real `createWorld` with 8 nations drafted from GREAT_POWERS,
  every nation `isAi`, speed 4×. A director opens 3 wars at mount and ignites
  a new front every ~12s. When the war resolves, a fresh cast redrafts after
  4s.
- The layer is pure scenery: `pointer-events: none`, `aria-hidden`, no sound,
  omniscient event view (no per-slot visibility filtering).
- A SITREP ticker (fronts / strikes / intercepts) runs along the bottom edge.
- Reduced motion (OS preference or in-game toggle): the attract sim does not
  mount (static vignette backdrop stands in) and splash cards hold ~1.3s with
  no fades. Splash remains skippable.

## Formulas

- Fronts = unique war pairs across nation relations.
- Camera drift: +0.0045° longitude per frame (~16 min per revolution).

## Edge Cases

- Game data still loading → attract layer renders nothing until data arrives.
- Attract world ends (one nation standing) → 4s hold, then remount with a new
  cast and seed.
- Explosion event backlog capped: the seen-set resets past 500 entries,
  mirroring LiveGame.

## Dependencies

Engine facade (`createWorld`, `declareWar`, `atWar`), `buildSetup`,
`useEngine`, `WorldMap`, `SkyLayer`, `Explosion`, settings (`reduceMotion`).
The engine itself is untouched — attract mode is presentation-layer
orchestration of a throwaway world.

## Tuning Knobs

`CAST_SIZE`, `SIM_SPEED`, `OPENING_FRONTS`, `ESCALATE_MS`,
`DRIFT_LNG_PER_FRAME` (src/ui/live/AttractSim.jsx); splash hold times
(src/ui/screens/SplashSequence.jsx).

## Acceptance Criteria

- Boot shows logo card then credit card; any key skips straight to login/menu.
- Menu and login render over a visibly active war (missile trails, intercept
  flashes) within ~20s of mount; SITREP counters increase over time.
- No pointer interaction reaches the background map from menu or login.
- With reduced motion enabled, no sim mounts and no splash fades play.
- `npm run lint` 0 errors; `npm run build` passes; real gameplay unaffected.
