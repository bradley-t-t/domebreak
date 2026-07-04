# GoldenDome

An online multiplayer missile game. Each match runs a timed **build phase** —
players spend a budget on offensive systems (silos, warheads by range and
yield) and defensive systems (interceptor batteries, radar, and the Golden
Dome shield) around their cities on a live world map. When the timer expires,
the **combat phase** resolves the exchange: launches fly, defenses roll
intercepts, and survivors do damage. Most infrastructure standing wins.

Created by **Trenton Taylor**.

## Status

Early development. Current milestone: greenfield foundation + reused world map.

## Stack

- **Client:** React 19 + Vite, MapLibre GL + PMTiles world map.
- **Backend:** Supabase (auth, match data, realtime lobby, combat-resolution
  edge function). No always-on game server for the MVP.
- **Desktop:** Electron wrapper for macOS and Windows (planned).

## Develop

```
npm install
npm run dev      # http://localhost:5173
npm run build    # production build (the release gate)
```

## Attribution

The world map and tile assets are reused from
[Open Historia](https://github.com/Open-Historia/open-historia) under the MIT
License. See LICENSE and NOTICE.
