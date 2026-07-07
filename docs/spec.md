<h1 align="center">DomeBreak — Design & Architecture</h1>

<p align="center">
  <b>A real-time strategy missile game on the world map — and the server-authoritative backend behind it.</b>
</p>

<br />

## Concept

Command a nation on a live world map. Build offensive and defensive systems around your cities, research your way ahead,
manage a war economy, and out-fight your rivals in a continuous exchange of launches and intercepts. Most infrastructure
standing wins.

Two modes share one engine:

- **Single-player** — a pure, deterministic client engine plays you against AI nations in real time. No account, no
  server; progress autosaves to local storage.
- **Multiplayer** — an authoritative Node game server runs the *same* engine and streams the shared world to every
  client over WebSockets, coordinated through Supabase lobbies. The client wires to this path today.

## Client architecture

- **React 19 + Vite 7.** The map is MapLibre GL + PMTiles rendered as the board, with
  `react-map-gl` bindings.
- **Simulation engine** (`src/game/engine.js`) — pure and deterministic given its seed. `useEngine` steps the world in
  an animation-frame loop at a selectable speed (0.5× to 10×) and re-renders on a throttled tick.
- **Persistence** — settings, saves, and a rolling autosave live in local storage (`src/game/platform/`); on the
  desktop build every write is mirrored to owner-only JSON files under the OS user-data directory (see
  [`adr-002-desktop-first-local-saves.md`](architecture/adr-002-desktop-first-local-saves.md)). No backend is required
  to play.

## Accounts & stats

- **Supabase Auth** (email + password) provides a durable player identity; a signup trigger mints a `profiles` row per
  user. Clients read their own `profiles`, `matches`, and the aggregated `player_stats` view directly under Row Level
  Security.
- **All writes go through the `db-account` edge function** — `touch` (stamp `last_login`) and `report_match` (insert one
  `matches` row) — which derives the caller's identity from a verified JWT and writes with the service-role key, so a
  client can never forge its own stats. Full rationale in
  [`adr-001-supabase-accounts.md`](architecture/adr-001-supabase-accounts.md).

## Multiplayer backend

Live play is a Supabase control plane plus one authoritative Node game server; see
[`adr-003-authoritative-server.md`](architecture/adr-003-authoritative-server.md).

- **Lobby control plane (`db-lobby`)** — every lobby mutation runs through this JWT-verified edge function: `create`,
  `join`, `leave`, `find` (quick match), `set_iso`, `ready`, `set_ai`, and `start`. `start` only flips a lobby's status
  to `starting`; it runs no simulation.
- **Authoritative game server (`server/`)** — a long-lived Node process that imports `src/game/engine.js` unmodified. It
  holds an outbound Supabase Realtime subscription on lobbies at `status = 'starting'`, **claims** each with a guarded
  update to `active`, builds the world with the shared engine, and advertises its WebSocket URL back on the row. It ticks
  the world at 10 Hz and broadcasts a full-world JSON snapshot at 2 Hz; clients present their Supabase JWT at handshake
  and may only send whitelisted commands forced to their own seat. On game over it writes one `matches` row per human
  (`mode: 'online'`).
- **Friends (`db-social`)** — a JWT-verified edge function for the friend graph: `request`, `accept`, and `remove`.

### Lobby lifecycle

`open` → `starting` (host presses start) → `active` (server claims and runs the match) → `closed`. A `starting` lobby
that no server claims is swept back to `open`; idle `open` lobbies eventually close.

### Data model

| Table           | Holds                                                                                  |
|:----------------|:----------------------------------------------------------------------------------------|
| `profiles`      | One row per auth user — username, `last_login`, bot flag.                               |
| `matches`       | One row per finished game — result, nation, opponents, duration, `mode` (solo/online).  |
| `player_stats`  | A `security_invoker` view aggregating `matches` into wins, losses, quits, and playtime. |
| `friendships`   | The friend graph — requester, addressee, and `pending`/`accepted` status.               |
| `lobbies`       | Host, name, status, seat count, AI slots, and the claimed `match_id` / `server_url`.     |
| `lobby_members` | Each seat in a lobby — slot, nation ISO, and ready flag.                                 |
| `bots`          | A seeded pool of AI callsigns.                                                           |

All game-affecting writes run server-side (edge functions or the game server, both with the service-role key); clients
read their own rows under RLS and never write them directly.

### Legacy one-shot resolver

An earlier multiplayer path also lives in the repo: the `db-match` edge function is a self-contained free-for-all that
runs a build phase and then resolves a single seeded combat exchange over its own `db_*` tables (`db_players`,
`db_matches`, `db_match_players`, `db_cities`, `db_placements`, `db_results`), authenticated by a per-player secret
rather than a Supabase account. It is retained for reference; the shipping client uses the authoritative server above.

## Combat model

- Offensive placements launch at target cities; defensive placements intercept by range and probability, with radar or
  AEW&C in range boosting nearby interceptors.
- The simulation is **seeded and deterministic**, so the authoritative server and every client resolve the same world
  from the same inputs.
- Damage aggregates per city and scales that city's economy and population through the city-vitality model; when a
  nation loses its cities, it loses the war.

## Attribution & licensing

DomeBreak is authored by Trenton Taylor. Unit icons are
from [game-icons.net](https://game-icons.net) (Lorc, Delapouite) under CC BY 3.0. The repository does not yet ship its
own license file.

<br />

<p align="center">
  <sub>One engine, two modes — the same exchange, whether the server or your machine runs the clock.</sub>
</p>
