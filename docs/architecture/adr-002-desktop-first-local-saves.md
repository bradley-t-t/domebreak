<h1 align="center">ADR-0002: Desktop-First Distribution &amp; File-Based Local Saves</h1>

<p align="center">
  <b>DomeBreak ships only as a packaged desktop app and stores every save as a local file that never leaves the machine.</b>
</p>

<br />

## Status

Accepted

## Date

2026-07-05

## Last Verified

2026-07-05

## Decision Makers

Trenton Taylor (creative/technical director), Sunday (agent)

## Summary

DomeBreak is a desktop game, not a browser game. It ships exclusively as a packaged desktop
app (Electron shell via electron-builder, macOS + Windows). The browser vite build exists only
as a development harness and is never a distribution target. Save games are real files on the
player's machine — one JSON file per key under the OS user-data directory — exactly like a
normal game. Save data never leaves the machine: the Supabase accounts backend (ADR-0001)
carries only profile, stats, and match reports, never world state.

## Engine Compatibility

| Field                     | Value                                                                                                                                                                               |
| :--- | :--- |
| **Engine**                | DomeBreak custom tick engine (`src/game/engine.js`, `src/game/sim/`) — JavaScript, no third-party game engine                                                                      |
| **Domain**                | Platform / Persistence (distribution shell, save storage) — no simulation change                                                                                                    |
| **Knowledge Risk**        | LOW — Electron IPC, `contextBridge`, and JSON-file persistence are stable, well-documented patterns                                                                                 |
| **References Consulted**  | `electron/main.cjs` (local store + static server), `src/game/platform/localData.js`, `src/game/platform/saves.js`, `docs/architecture/adr-001-supabase-accounts.md`, `package.json` |
| **Post-Cutoff APIs Used** | None                                                                                                                                                                                |
| **Verification Required** | None beyond the Validation Criteria below (already exercised on macOS)                                                                                                              |

## ADR Dependencies

| Field             | Value                                                                                            |
| :--- | :--- |
| **Depends On**    | None (complements ADR-0001, which scopes what the backend may store)                             |
| **Enables**       | A future cloud-save-sync ADR, which would have to explicitly supersede this ADR's no-sync stance |
| **Blocks**        | Any release/packaging story — releases must produce Electron packages, never a public web deploy |
| **Ordering Note** | The `/release` pipeline gates on `electron:build:*` targets, not `npm run build` alone           |

## Context

### Problem Statement

The game runs in two environments today: the vite dev server (browser) and the Electron shell.
Browser `localStorage` is volatile — evictable by the browser, wiped by a cache clear, capped in
size, and invisible to the player as files. That is not how a real game treats save data. The
product needs one authoritative answer to "where do saves live?" before more systems
(multiplayer, accounts, cloud features) grow around an ambiguous platform story.

### Constraints

- Development across multiple concurrent agent sessions relies on the vite dev server and
  browser preview for fast iteration — that workflow must keep working.
- The deterministic engine tick must stay platform-agnostic: no Electron or filesystem code in
  `src/game/sim/`.
- The existing save envelope (`{v: 2, world, meta}`) and all current call sites must keep
  working unchanged.
- The GameData folder also holds the Supabase auth session token, so it must not be
  world-readable.

### Requirements

- Playing the game (the shipped product) always produces durable save files on the local disk.
- Saves survive cache clears, app reinstalls that preserve user data, and localStorage loss.
- Save data never syncs to any backend.
- The browser dev harness keeps functioning without the file layer.

## Decision

**Distribution**: DomeBreak ships as a desktop app only — `electron:build:mac` /
`electron:build:win` packages. The vite browser build is a development harness; it is never
deployed as a public, player-facing target.

**Save storage**: one JSON file per localStorage key, written by the Electron main process
under `app.getPath("userData")/GameData/` (macOS: `~/Library/Application
Support/domebreak/GameData/`). The directory is created `0700` and files are written `0600` —
owner-only, because the auth session token lives alongside the saves.

**Layering** (existing implementation, hereby pinned):

```
saves.js / settings.js / auth        (versioned envelopes, sync localStorage API)
        │  persistKey / removeKey     (fire-and-forget mirror)
        ▼
localData.js bridge                   (isDesktop detection, boot hydration)
        │  window.gdLocal IPC         (contextBridge: list / set / del / dir)
        ▼
electron/main.cjs local store         (JSON file per key, 0700 dir / 0600 files)
```

- `localStorage` is the **hot cache**; the disk folder is the **durable copy**.
- At boot, `hydrateLocalData()` seeds localStorage from disk before first render.
- Every write mirrors to disk fire-and-forget; the render path never blocks on IO.
- In the browser (dev harness) the bridge is absent and localStorage alone carries state —
  acceptable for development, explicitly not a supported player path.

**Backend boundary**: world saves never sync to Supabase. The accounts backend stores only
profile, login timestamps, stats, and match reports (ADR-0001). Any future cloud-save feature
requires a superseding ADR.

### Key Interfaces

- `window.gdLocal` — `list(): Promise<Record<string,string>>`, `set(key, value)`, `del(key)`,
  `dir(): Promise<string>` (preload `contextBridge`, desktop only)
- `localData.js` — `isDesktop`, `hydrateLocalData()`, `persistKey(key)`, `removeKey(key)`
- `saves.js` — `saveGame(slot, world, meta)` / `loadGame(slot)` with the `{v, world, meta}`
  envelope; version mismatches read as "no save"

## Alternatives Considered

### Alternative 1: Browser PWA with IndexedDB persistence

- **Description**: Ship the game as an installable web app; persist saves in IndexedDB with a
  persistent-storage grant.
- **Pros**: No packaging pipeline; one deploy for all platforms; instant updates.
- **Cons**: Storage is still evictable at the browser's discretion; saves are not visible files;
  no real filesystem identity; "browser game" product perception.
- **Rejection Reason**: Directly contradicts the product decision — DomeBreak is a desktop
  game whose saves behave like a normal game's.

### Alternative 2: Cloud saves in Supabase

- **Description**: Upload the world snapshot to the accounts backend on save; restore anywhere.
- **Pros**: Cross-device roaming; survives machine loss.
- **Cons**: ~100 KB per snapshot on every autosave interval; requires being online to play
  safely; expands the backend's blast radius from stats to full game state; privacy surface.
- **Rejection Reason**: The game must be fully playable offline and self-contained. Roaming is
  a possible future feature via a superseding ADR, not the default.

### Alternative 3: Save-anywhere with native file dialogs

- **Description**: Let the player choose save file locations via OS dialogs, like classic PC
  titles.
- **Pros**: Maximum player control; trivially portable saves.
- **Cons**: Friction for autosave (dialogs can't fire unattended); nonstandard for modern games,
  which use a fixed user-data saves folder.
- **Rejection Reason**: The fixed userData folder *is* the modern normal-game convention.
  A manual export/import affordance can be added later without changing this architecture.

## Consequences

### Positive

- Saves are durable, owner-private files the player (and support) can find, back up, and copy.
- The game is offline-complete; no backend dependency for single-player.
- One unambiguous release artifact: Electron packages.

### Negative

- No cross-device save roaming (browser and desktop states are separate; two machines are
  separate).
- Two desktop platforms to package and test per release.

### Risks

- **Cache/disk divergence**: localStorage and disk could theoretically drift. Mitigated by
  boot-time hydration (disk wins for missing keys) and mirroring every write.
- **localStorage size cap** (~5–10 MB) with ~100 KB world snapshots: dozens of save slots are
  fine, but unbounded slot growth would hit the cap before disk limits. Monitor if save-slot UI
  ever grows unbounded.
- **Dev/prod divergence**: features that accidentally depend on `gdLocal` would break the dev
  harness. The bridge's null-object pattern (browser no-ops) keeps the harness working; keep it
  that way.

## GDD Requirements Addressed

| GDD System            | Requirement                                                                                | How This ADR Addresses It                                                           |
| :--- | :--- | :--- |
| accounts-and-stats.md | Lifetime stats live in the cloud, "not something a save file or a cleared cache can erase" | Draws the inverse boundary: world saves are local files, never mingled with backend |
| accounts-and-stats.md | Desktop persists the auth session in the machine-local data folder alongside saves         | Pins that folder's layout, location, and owner-only permissions                     |

*(A dedicated save-system GDD does not exist yet — flagged in
`production/qa/compliance-audit-2026-07-05.md` as part of the GDD backfill.)*

## Performance Implications

- **CPU**: Negligible — disk mirroring is fire-and-forget IPC off the render path.
- **Memory**: Unchanged — localStorage remains the working store.
- **Load Time**: One-time boot hydration reads the GameData folder before first render;
  at realistic save counts this is milliseconds.
- **Network**: None — saves never touch the network.

## Migration Plan

None required — this ADR pins an implementation that is already live (`localData.js`,
`electron/main.cjs` local store, save envelope v2). The permissions hardening (0700 directory,
0600 files, applied in code and retroactively to existing GameData folders) shipped alongside
this ADR on 2026-07-05.

## Validation Criteria

- Playing a match in the desktop app produces `GameData/domebreak.save.auto.json` (and slot
  files on manual save). **Verified 2026-07-05** — real 97 KB world snapshots observed.
- Clearing localStorage and relaunching the desktop app restores saves from disk via boot
  hydration.
- `ls -l` on GameData shows `drwx------` / `-rw-------` permissions. **Verified 2026-07-05.**
- No network request carries a world snapshot (audit the accounts client and edge functions —
  only profile/stats/match payloads).

## Related Decisions

- `docs/architecture/adr-001-supabase-accounts.md` — defines what the backend *does* store;
  this ADR defines what it must *not* store.
- `production/qa/compliance-audit-2026-07-05.md` — open backend findings and GDD backfill list.
