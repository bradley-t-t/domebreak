<h1 align="center">GoldenDome — Design & Architecture</h1>

<p align="center">
  <b>A real-time strategy missile game on the world map — and the server-authoritative backend behind it.</b>
</p>

<br />

## Concept

Command a nation on a live world map. Build offensive and defensive systems around your cities, research your way ahead, manage a war economy, and out-fight your rivals in a continuous exchange of launches and intercepts. Most infrastructure standing wins.

Two modes share one design:

- **Single-player** — a pure, deterministic client engine plays you against AI nations in real time. No account, no server; progress autosaves to local storage.
- **Multiplayer** — a Supabase edge function resolves a shared, seeded combat exchange server-side, so every client agrees on the outcome. Present in the repo; not yet wired into the client shell.

## Client architecture

- **React 19 + Vite 7.** The map is MapLibre GL + PMTiles (reused from Open Historia) rendered as the board, with `react-map-gl` bindings and `polygon-clipping` for territory geometry.
- **Simulation engine** (`src/game/engine.js`) — pure and deterministic given its seed. `useEngine` steps the world in an animation-frame loop at a selectable speed (0.5× to 10×) and re-renders on a throttled tick.
- **Persistence** — settings, saves, and a rolling autosave live in local storage (`src/game/saves.js`, `settings.js`); no backend is required to play.

## Multiplayer backend (Supabase)

- **Edge function `gd-match`** — the single server-authoritative entry point. Every mutation runs there with the service-role key after validating the caller against a per-player secret.
- **Free-for-all for 2–16 seats**, each held by a human or a server-played AI. The host manages seats with a short join code; combat is a deterministic, seeded simulation.
- **Lifecycle** — `lobby` → `build` (a countdown during which players place systems against a budget) → `combat` (resolved once, under a compare-and-swap lock) → `done`, with results and a replay persisted.

### Actions

| Action              | Who   | Purpose                                                         |
| :------------------ | :---- | :-------------------------------------------------------------- |
| `create` / `join`   | any   | Open a match (returns a join code) or take an empty seat.       |
| `setMaxSlots` / `addAi` / `removeParticipant` / `replaceWithAi` | host | Shape the lobby and swap seats for AI. |
| `start`             | host  | Begin the build phase and set the deadline.                     |
| `place` / `ready`   | player | Spend budget on systems; mark ready.                           |
| `resolve`           | any   | Trigger server resolution at the deadline or once all are ready. |
| `state`             | any   | Read match, players, cities, and (for the caller) placements.   |

### Data model

| Table               | Holds                                                              |
| :------------------ | :---------------------------------------------------------------- |
| `gd_players`        | Player identity and per-player secret.                            |
| `gd_matches`        | Match code, status, host, seat count, build deadline, seed.       |
| `gd_match_players`  | Seat, handle, budget/spent, ready flag, AI flag, home coordinates. |
| `gd_cities`         | Each participant's cities with HP and alive state.                |
| `gd_placements`     | Placed systems (kind, position, target, cost).                    |
| `gd_results`        | Winner, score summary, and the replay timeline.                   |

## Combat model

- Offensive placements launch at target cities; defensive placements intercept by range and probability, with radar in range boosting nearby interceptors.
- Resolution is **seeded per match**, so both the server and every client replay it identically.
- Damage aggregates per city; survivors and damage dealt are scored, and a winner (or tie) is declared.

## Attribution & licensing

GoldenDome is © 2026 Trenton Taylor, released under the MIT License. The reused map engine and tiles come from [Open Historia](https://github.com/Open-Historia/open-historia) under MIT; original notices are retained in [`LICENSE`](../LICENSE) and [`NOTICE`](../NOTICE).

<br />

<p align="center">
  <sub>One engine, two modes — the same exchange, whether the server or your machine rolls the dice.</sub>
</p>
