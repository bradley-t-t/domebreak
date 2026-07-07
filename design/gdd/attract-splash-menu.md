<h1 align="center">Attract Mode, Boot Splash & Menu Identity</h1>

<p align="center">
  <b>A two-card publisher splash giving way to login and menu screens staged over a live, self-playing AI war.</b>
</p>

<br />

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
- **Start-menu command rail:** on the menu the chrome is not a centered panel
  but a slim left-anchored console (title, primary actions, commander dossier,
  credits) on a glass backing that fades to transparent before the globe's
  center — nothing overlays the globe. To keep the sphere clear of the rail the
  attract map takes a left projection padding (`framed`) that recenters the
  globe into the open right area. The login screen keeps its centered card
  (no rail, no offset).
- Reduced motion (OS preference or in-game toggle): the attract sim does not
  mount (static vignette backdrop stands in) and splash cards hold ~1.3s with
  no fades. Splash remains skippable.

## Formulas

- Fronts = unique war pairs across nation relations.
- Camera drift: +0.0045° longitude per frame (~16 min per revolution).
- Menu globe offset: left projection padding of 340px (`RAIL_PAD`) shifts the
  globe center ~170px right of the viewport center, clear of the 384px rail.

## Edge Cases

- Game data still loading → attract layer renders nothing until data arrives.
- Attract world ends (one nation standing) → 4s hold, then remount with a new
  cast and seed.
- Explosion event backlog capped: the seen-set resets past 500 entries,
  mirroring LiveGame.
- Map initialized before its container has size (e.g. mounted while laying out)
  → the attract map calls `resize()` on load so the globe never sticks at the
  GL 400×300 fallback.

## Dependencies

Engine facade (`createWorld`, `declareWar`, `atWar`), `buildSetup`,
`useEngine`, `WorldMap`, `SkyLayer`, `Explosion`, settings (`reduceMotion`).
The engine itself is untouched — attract mode is presentation-layer
orchestration of a throwaway world.

## Tuning Knobs

`CAST_SIZE`, `SIM_SPEED`, `OPENING_FRONTS`, `ESCALATE_MS`,
`DRIFT_LNG_PER_FRAME`, `RAIL_PAD` (src/ui/live/AttractSim.jsx); rail width and
glass fade (`.db-menu-rail` in src/styles.css); splash hold times
(src/ui/screens/SplashSequence.jsx).

## Acceptance Criteria

- Boot shows logo card then credit card; any key skips straight to login/menu.
- Menu and login render over a visibly active war (missile trails, intercept
  flashes) within ~20s of mount; SITREP counters increase over time.
- No pointer interaction reaches the background map from menu or login.
- On the menu, the command rail is left-anchored and nothing covers the globe's
  center; the globe sits offset in the clear right area and keeps rotating.
- With reduced motion enabled, no sim mounts and no splash fades play (and the
  rail's status-dot blink and slide-in are disabled).
- `npm run lint` 0 errors; `npm run build` passes; real gameplay unaffected.

<br />

<p align="center">
  <sub>The world is already at war before you ever touch it — signing in is taking command mid-crisis.</sub>
</p>
