# GoldenDome - MVP Design Spec

## Concept
Online multiplayer missile game. Build offense + defense against a timer, then
the server resolves a missile exchange. Most infrastructure surviving wins.

## MVP scope (thin vertical slice)
- Accounts via Supabase Auth.
- Lobby: create / join a 1v1 match.
- Build phase: countdown timer; each player has a budget and places offensive
  and defensive systems around their cities on the world map.
- Combat: resolved server-side (Supabase edge function) at the deadline. Not
  real-time twitch; deterministic simulation of launches vs. intercepts.
- Result: score by surviving cities/infrastructure; winner declared; animated
  replay on the map; stats persisted.

## Architecture
- Client: React 19 + Vite. Map = MapLibre GL + PMTiles (reused from Open
  Historia), rendered as the board.
- Backend: Supabase.
  - Auth: players.
  - Postgres: players, matches, match_players, placements, results.
  - Realtime: lobby + match phase/state broadcast.
  - Edge function `resolve-combat`: server-authoritative resolution at the
    deadline; validates placements and budgets; writes results.
- Map tiles: static PMTiles read client-side via HTTP range requests (CDN for
  web, bundled for Electron). No custom tile server.
- Desktop: Electron wraps the web client; macOS build on the Mac, Windows build
  on the Windows box.

## Data model (first pass)
- players(id, handle, created_at)
- matches(id, status[lobby|build|combat|done], build_ends_at, created_by, created_at)
- match_players(match_id, player_id, budget, ready)
- placements(id, match_id, player_id, kind[silo|warhead|interceptor|radar|dome],
  lng, lat, params jsonb)
- results(match_id, winner_player_id, summary jsonb, replay jsonb)

## Combat model (deterministic, server-side)
- Each offensive placement launches at a target; each defensive placement has a
  coverage radius + intercept probability.
- Resolution seeded per match so both clients replay identically.
- Damage aggregates per city; survivors scored.

## Phases of work
1. Foundation: repo + scaffold + reused world map rendering. (this milestone)
2. Auth + lobby + match lifecycle (Supabase schema + realtime).
3. Build phase UI: budget + placement of systems on the map.
4. Combat resolution edge function + replay.
5. Design pass (tokens, full UI polish).
6. Electron packaging for macOS + Windows.

## Attribution / licensing
GoldenDome is (c) Trenton Taylor. Reused map engine + tiles are from Open
Historia under MIT; original notices retained in LICENSE + NOTICE.
