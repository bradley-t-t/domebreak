<p align="center">
  <img src="build/icon.png" width="180" alt="GoldenDome" />
</p>

<h1 align="center">GoldenDome</h1>

<p align="center">
  <b>A real-time strategy missile game played on the living world map.</b>
</p>
<p align="center">
  Pick a nation, build an arsenal of silos, interceptors, warships and jets,<br />
  and out-launch, out-tech, and out-defend the AI — one Golden Dome at a time.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-2563eb?style=for-the-badge&logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/Vite-7-3b82f6?style=for-the-badge&logo=vite&logoColor=white" alt="Vite 7" />
  <img src="https://img.shields.io/badge/MapLibre-GL-2563eb?style=for-the-badge&logo=maplibre&logoColor=white" alt="MapLibre GL" />
  <img src="https://img.shields.io/badge/Electron-33-1f56cf?style=for-the-badge&logo=electron&logoColor=white" alt="Electron 33" />
  <img src="https://img.shields.io/badge/Supabase-backend-3b82f6?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase" />
</p>

<br />

## Why GoldenDome

Most nuke-'em games flatten the planet to an abstract grid. GoldenDome keeps the real one — a MapLibre GL world map with
actual cities, coastlines, and borders — and turns it into the board. You command a single nation in a real-time
exchange against AI rivals: place defenses over your cities, mass offensive systems at the front, research your way
ahead, and manage a war economy while missiles are already in the air. When your Golden Dome holds and theirs doesn't,
you win.

<table width="100%">
  <tr>
    <td width="33%" valign="top">
      <h3 align="center">The whole planet is the board</h3>
      <p align="center">Choose any real nation and fight on a MapLibre GL + PMTiles world map — globe or flat, real cities, real borders, backed by a real-world tile map.</p>
    </td>
    <td width="33%" valign="top">
      <h3 align="center">A full arsenal</h3>
      <p align="center">Land, sea, air, ground, and space — SAM batteries, the Golden Dome, missile silos, hypersonics, warships, submarines, and an orbital tier — firing standard, cluster, and thermonuclear warheads.</p>
    </td>
    <td width="33%" valign="top">
      <h3 align="center">Out-tech, out-economy</h3>
      <p align="center">Five research tracks across three eras, a city-vitality war economy with upkeep, live diplomacy, and continuous autosave — all simulated in real time at up to 10× speed.</p>
    </td>
  </tr>
</table>

<br />

## Play

```bash
npm install
npm run dev      # http://localhost:5173
```

Open the dev server, start a **New Game**, pick your nation and the number of AI opponents, and command your arsenal on
the map. Progress autosaves to local storage; **Continue** picks up where you left off.

## Build

```bash
npm run build            # production web build (the release gate)
npm run preview          # preview the production build
npm run lint             # eslint
npm test                 # vitest suite

npm run electron         # run the desktop shell against the build
npm run electron:build:mac   # package a macOS .dmg
npm run electron:build:win   # package a Windows installer
npm run electron:build:all   # package macOS + Windows
```

## How it works

- The game runs a **pure, deterministic real-time simulation** (`src/game/engine.js`), driven by an animation-frame loop
  in `useEngine` and mutated in place — no server needed for single-player.
- **Defenses roll intercepts by range and probability.** A radar or AWACS in range links to nearby launchers to extend
  their reach (`RADAR_RANGE_MULT`), so early warning is worth as much as raw firepower.
- **Offense is munitions-limited.** Silos and launchers fire warheads you produce — cheap standard rounds, splash-damage
  cluster munitions, or slow, expensive city-killer thermonuclear yields.
- **Economy runs on city vitality.** Each city's income, population, and industrial capacity scale with its remaining
  health, so bombing a rival's cities strangles their war machine while unit upkeep drains your own points.
- A **server-authoritative multiplayer backend** ships in the repo — an authoritative Node game server imports the same
  engine, claims Supabase lobbies, and streams full-world snapshots over WebSockets so every client agrees on the match.

## Arsenal

| Domain              | Systems                                                                                                                                       |
|:--------------------|:----------------------------------------------------------------------------------------------------------------------------------------------|
| **Land — defense**  | SAM battery and the Golden Dome, plus the tech-gated Patriot, Aegis Ashore, and THAAD batteries                                                |
| **Land — strike**   | Hypersonic launcher, missile silo (ICBM), and the tech-gated hypersonic missile battery — each firing selectable warheads                      |
| **Sensors**         | Early-warning radar, over-the-horizon radar, airborne AEW&C, and orbital reconnaissance / missile-warning satellites                           |
| **Ground forces**   | Army base, infantry, artillery, tank battalions, and attack / transport helicopters                                                           |
| **Sea**             | Missile cruiser, destroyer (ASW), battleship, aircraft carrier, plus tech-gated SSN / SSBN submarines and amphibious / replenishment ships     |
| **Air**             | Multirole, strike, air-superiority, and carrier fighters, close air support, transport, and AEW&C — flown from airstrips and carriers as wings |
| **Space**           | Behind a Space Command HQ: space-based interceptors, an orbital laser, and an orbital strike platform                                          |
| **Warheads**        | Standard, cluster (MIRV splash), and thermonuclear — each produced against its own cost and build time                                         |

## Research tracks

Five doctrine tracks each run **twelve tiers** banded into three eras — Cold War, Modern, and Space Age (60 techs in
all). Advancing a track boosts national multipliers and, at key tiers, unlocks new hardware: Patriot and THAAD, hypersonic
glide vehicles, submarines, satellites, and eventually a Space Command HQ and its orbital arsenal. Cost and research time
escalate super-linearly with tier, so the future is slow and expensive to reach.

| Track                 | Focus                                                       |
|:----------------------|:------------------------------------------------------------|
| **Strategic Command** | Warhead damage, missile range, and reload speed.            |
| **Missile Shield**    | Interceptor rate, defense range, and interceptor speed.     |
| **War Economy**       | Income, build cost, and upkeep efficiency.                  |
| **Early Warning**     | Radar coverage, tracking, and intercept accuracy.           |
| **Command & Control** | Research speed, relocation cost, and cross-cutting bonuses. |

## Stack

- **Client** — React 19 + Vite 7, rendered over MapLibre GL and `react-map-gl`, with PMTiles tiles read client-side.
  Flags via `flag-icons`.
- **Desktop** — an Electron 33 shell (`electron/main.cjs`), packaged for macOS, Windows, and Linux with
  `electron-builder`.
- **Multiplayer backend** — Supabase (Auth, Postgres, and Deno edge functions `gd-account`, `gd-lobby`, and `gd-social`)
  plus an authoritative Node game server (`server/`) that imports the same engine and runs live matches over WebSockets.
  Configure the client with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see `.env.example`).

## Design

See [`docs/spec.md`](docs/spec.md) for the design and architecture notes, and [`docs/architecture/`](docs/architecture)
for the decision records behind accounts, local saves, and the authoritative server.

## Attribution

The interactive world map is a MapLibre + PMTiles renderer with region/country/city tile layers. Unit icons are
from [game-icons.net](https://game-icons.net) (Lorc, Delapouite) under CC BY 3.0.

## License

Authored by **Trenton Taylor**. Reused game-icons.net icons retain their upstream license noted above; the
repository does not yet ship its own license file.

<br />

<p align="center">
  <sub>Build the dome. Hold the line. When the clock runs out, the missiles fly.</sub>
</p>
