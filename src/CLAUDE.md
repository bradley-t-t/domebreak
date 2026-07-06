# Source Directory

When writing or editing game code in this directory, follow these standards.

## Engine

The engine is this repo's own code. There is no external engine API to look up;
read the existing modules before extending them, and match their patterns.

Layout:

- `game/engine.js` — stable facade; UI imports engine symbols from here
- `game/sim/` — simulation logic (tick, combat, aircraft, production, queries,
  world state, new-game setup)
- `game/data/` — tuning data (constants.js: UNITS/WARHEADS/TECHS/econ numbers)
  and static lookups (iso3.js)
- `game/geo/` — geodesic math, sea routing, sea grid
- `game/platform/` — browser adapters (audio, saves, settings persistence)
- `map/` — MapLibre GL world map rendering
- `ui/screens/` — menu/overlay screens · `ui/hud/` — in-game HUD chrome ·
  `ui/live/` — the live-game surface and its map overlays · `ui/panels/` —
  console tab panels · `ui/common/` — shared widgets/formatters ·
  `ui/hooks/` — React hooks bridging engine and UI (useEngine)

## Coding Standards

- Gameplay values must be **data-driven** — tuning numbers live in
  `src/game/data/constants.js` / `src/game/platform/settings.js`, never
  hardcoded in systems
- New gameplay systems get a GDD in `design/gdd/` before implementation and an
  ADR in `docs/architecture/` when they introduce architecture
- Prefer pure functions in `src/game/` — the engine tick should stay
  deterministic and testable
- React components stay presentation-only; game state changes go through the
  engine, not component handlers

## Verification

- `npm run lint` must pass before any story is done
- `npm run build` must succeed
- For UI or map changes, verify in the running app (vite dev server) and
  compare expected to actual behavior before marking work complete
