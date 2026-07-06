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
  <img src="https://img.shields.io/badge/license-MIT-2563eb?style=for-the-badge" alt="License MIT" />
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
      <p align="center">Choose any real nation and fight on a MapLibre GL + PMTiles world map — globe or flat, real cities, real borders, backed by reused Open Historia tiles.</p>
    </td>
    <td width="33%" valign="top">
      <h3 align="center">A full arsenal</h3>
      <p align="center">Land, sea, and air — SAM batteries, the Golden Dome, missile silos, hypersonics, missile cruisers, carriers, and interceptors — firing standard, cluster, and thermonuclear warheads.</p>
    </td>
    <td width="33%" valign="top">
      <h3 align="center">Out-tech, out-economy</h3>
      <p align="center">Five research tracks, a city-driven war economy with upkeep, live diplomacy, and continuous autosave — all simulated in real time at up to 10× speed.</p>
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
- **Economy is the clock.** Income scales with your surviving cities and is drained by unit upkeep; research and
  construction spend against it while the war continues around you.
- A **server-authoritative multiplayer backend** ships in the repo — a Supabase edge function resolves a shared, seeded
  combat exchange so every client replays it identically.

## Arsenal

| Domain       | Systems                                                                                                                            |
|:-------------|:-----------------------------------------------------------------------------------------------------------------------------------|
| **Land**     | SAM battery, Golden Dome, early-warning radar, over-the-horizon radar, hypersonic launcher, missile silo                           |
| **Sea**      | Missile cruiser, destroyer, battleship, aircraft carrier                                                                           |
| **Air**      | Airstrip, multirole fighter, strike fighter, air-superiority fighter, close air support, transport, AEW&C, and the carrier fighter |
| **Warheads** | Standard, cluster (splash), and thermonuclear — each with its own cost and build time                                              |

## Research tracks

| Track                 | Focus                                                       |
|:----------------------|:------------------------------------------------------------|
| **Strategic Command** | Warhead damage, missile range, and reload speed.            |
| **Missile Shield**    | Interceptor rate, defense range, and interceptor speed.     |
| **War Economy**       | Income, build cost, and upkeep efficiency.                  |
| **Early Warning**     | Radar coverage, tracking, and intercept accuracy.           |
| **Command & Control** | Research speed, relocation cost, and cross-cutting bonuses. |

Each track runs six tiers, unlocked in order.

## Stack

- **Client** — React 19 + Vite 7, rendered over MapLibre GL and `react-map-gl`, with PMTiles tiles read client-side and
  `polygon-clipping` for territory geometry. Flags via `flag-icons`.
- **Desktop** — an Electron 33 shell (`electron/main.cjs`), packaged for macOS, Windows, and Linux with
  `electron-builder`.
- **Multiplayer backend** — Supabase Postgres + a `gd-match` edge function (server-authoritative, free-for-all for 2–16
  seats held by humans or AI). Configure it with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see `.env.example`).

## Design

See [`docs/spec.md`](docs/spec.md) for the design and architecture notes.

## Attribution

The interactive world map — MapLibre + PMTiles rendering and the region/country/city tile layers — is reused
from [Open Historia](https://github.com/Open-Historia/open-historia) under the MIT License. Unit icons are
from [game-icons.net](https://game-icons.net) (Lorc, Delapouite) under CC BY 3.0. See [`LICENSE`](LICENSE) and [
`NOTICE`](NOTICE).

## License

Released under the MIT License. Created by **Trenton Taylor**.

<br />

<p align="center">
  <sub>Build the dome. Hold the line. When the clock runs out, the missiles fly.</sub>
</p>
