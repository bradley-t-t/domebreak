<h1 align="center">Accounts & Player Stats</h1>

<p align="center">
  <b>Persistent, server-verified commander identities carrying a lifetime match record no cleared cache can erase.</b>
</p>

<br />

## Overview

Every commander has a persistent identity. DomeBreak authenticates players against a dedicated
Supabase project via email + password, collects a username at signup, and tracks lifetime match
history (wins, losses, quits, playtime) against that identity. The client never writes stats
directly — every mutation (login timestamp, match result) flows through a server-side edge
function that trusts only the caller's verified session, never a client-supplied ID. Login gates
the start menu; once in, the commander's name and career record are always one glance away.

## Player Fantasy

A commander with a service record, not an anonymous browser tab. Logging in should feel like
badging into a command post — your name is on the door, and the wins and losses on your record are
yours, not something a save file or a cleared cache can erase. Seeing lifetime win rate and total
hours-in-theater on the start menu reinforces that every match counts toward something durable.
This primarily serves the MDA aesthetics of **Fellowship** (a persistent, named identity ties the
player to their own history and, eventually, to other commanders) and **Submission** in the
positive sense — a light, low-friction ritual (log in, see your record, launch a match) that
frames each session as a continuation rather than a cold start.

## Detailed Rules

### Authentication

- Auth runs against a Supabase project dedicated to DomeBreak (project "DomeBreak", ref
  `bhzxnorbhylfsrdjzodv`) — isolated from any other project sharing the developer's Supabase
  organization.
- Sign-up requires: email, password, username. Username is submitted as auth user metadata at
  signup time (`raw_user_meta_data.username`).
- Signup autoconfirm is enabled — there is no email verification step. An account is usable
  immediately after signup completes.
- A database trigger (`handle_new_user`) fires on every `auth.users` insert and creates the
  matching `profiles` row, copying the metadata username. If the requested username is already
  taken, the trigger retries once with a collision-safe fallback (`commander_<id8>`, where `id8`
  is the first 8 characters of the auth user's UUID) so account creation itself never fails on a
  taken name — see Edge Cases for the exact fallback shape actually used.
- Login requires only email + password. There is no "forgot password" flow specified here; if one
  is added later it is a separate ADR/GDD, not an extension of this document.

### Session and gating

- The game **forces login before the start menu**. A `LoginScreen` (login/signup toggle) is the
  first interactive screen whenever no valid session exists; nothing past it is reachable without
  authenticating.
- Once authenticated, the session persists across launches:
    - **Electron**: the app creates a per-user data folder under the OS `userData` directory and
      persists the Supabase auth session there (alongside mirrored saves/settings), written and
      read via an IPC bridge exposed through `contextBridge` in the Electron preload script. The
      renderer never touches the filesystem directly.
    - **Browser**: the same session data is persisted to `localStorage` instead.
- On launch, the client attempts to restore the persisted session. If restoration succeeds and the
  session is valid, the player lands directly on the start menu (no re-entry of credentials). If
  there is no session, or the stored session is invalid/expired, the `LoginScreen` is shown.
- A successful login/signup immediately triggers a `touch` call (see Dependencies) to stamp
  `last_login`, then proceeds to the start menu.

### Profile and stats display

- The start menu displays the commander's `username` and their lifetime stats, sourced from the
  `player_stats` view: total matches, wins, losses, quits, total playtime, and last-match date.
  Derived values (win rate) are computed client-side per the Formulas section — the view exposes
  only raw counts and sums.
- Stats are read directly by the client under Row Level Security using the anon key — no edge
  function round-trip is required for reads. A player can only ever see their own profile and
  match rows; RLS policies restrict `profiles` and `matches` `select` to `auth.uid() = id` /
  `auth.uid() = user_id` respectively.

### Match reporting

- Exactly one `matches` row is written per completed or abandoned game, via the `db-account` edge
  function's `report_match` action. The function derives `user_id` from the verified JWT — the
  client cannot supply or spoof a `user_id`.
- A report is sent at each of these terminal events, and only these:
    - **Game over — win**: the local player's nation is the last standing / meets the engine's win
      condition. `result: "win"`.
    - **Game over — loss**: the local player's nation is eliminated. `result: "loss"`.
    - **Quit to menu**: the player backs out of an in-progress match via the pause menu.
      `result: "quit"`.
- Fields sent with every report: `startedAt` (ISO timestamp of match start, if known),
  `result`, `nationIso` (the player's chosen nation), `opponents` (AI/human opponent count),
  `durationS` (elapsed match seconds), `stats` (a free-form JSON object for match-specific detail —
  e.g. launches fired, intercepts made — not enumerated further by this document since its schema
  is owned by the systems that populate it, not by the accounts system).
- Reporting is **fire-and-forget**: the client does not block gameplay or the return-to-menu
  transition on the report completing. Exactly one retry is attempted if the first attempt fails
  (network error or non-2xx response); if the retry also fails, the report is dropped silently
  (see Edge Cases).
- There is no reporting for matches that never leave the pre-game/setup screen — reporting begins
  only once a match has actually started (see Edge Cases, "quit before any game action").

## Formulas

**Win rate**

```
winRate(stats) =
    stats.wins / stats.total_matches   if stats.total_matches > 0
    0                                   if stats.total_matches == 0
```

- `wins`, `total_matches` are non-negative integers from `player_stats`.
- Output range: `[0, 1]`. Display layer formats as a percentage (e.g. `0.667` → `"67%"`).
- Example: `wins = 8`, `total_matches = 12` → `winRate = 0.667` → displayed `"67%"`.
- Example: `total_matches = 0` → `winRate = 0` → displayed `"—"` or `"0%"` (UI's choice; both read
  as "no data," not "always loses" — the UI must not phrase a 0-match player as having a 0% win
  rate without qualification, since that misrepresents "no data" as "always loses").

**Total playtime**

```
totalPlaytimeS(matches) = sum(match.duration_s for match in matches where duration_s is not null)
```

- Computed server-side by the `player_stats` view as `coalesce(sum(duration_s), 0)` — never
  negative, defaults to `0` for a player with no matches or with only null-duration matches.
- Display layer converts seconds to a human unit (e.g. `HH:MM` or `"14.2 hrs"`); the conversion is
  a UI concern, not part of this formula.
- Example: three matches with `duration_s` = `1800`, `2400`, `900` → `totalPlaytimeS = 5100` →
  displayed as `"1h 25m"`.

**Loss/quit rate** (same shape as win rate, for completeness)

```
lossRate(stats) = stats.losses / stats.total_matches   if total_matches > 0, else 0
quitRate(stats)  = stats.quits  / stats.total_matches   if total_matches > 0, else 0
```

## Edge Cases

- **Offline / Supabase unreachable at boot**: the client cannot reach the auth service (DNS
  failure, network down, Supabase outage). The `LoginScreen` shows a clear error state
  ("Can't reach the server — check your connection") with a retry action. There is **no offline
  bypass** — the player cannot proceed past login without a successful auth exchange, even if a
  previously-valid local session exists but cannot be verified. This trades a hard requirement
  (always-online to start a session) for a simple, unambiguous security model; it does not affect
  a session that is already active and valid on launch.
- **Duplicate username at signup**: the user submits a username already taken by another account.
  The `handle_new_user` trigger's insert fails with a unique violation; the trigger catches it and
  retries once with a fallback shape — the requested username truncated to 15 characters plus an
  underscore and the first 8 characters of the new user's UUID (e.g. `CmdrPhoenix_a1b2c3d4`) — so
  account creation always succeeds. The player is not shown their fallback username as an error;
  they are logged in successfully and may notice their username differs from what they typed. (A
  future revision could surface "your requested name was taken — you are now `X`" as a toast; not
  in scope for this document.)
- **Match report fails mid-flight**: the `report_match` call to the edge function errors (network
  drop, 5xx, timeout). The client retries exactly once. If the retry also fails, the report is
  **dropped** — the player's local session continues uninterrupted (menu transition, game-over
  screen, etc. are never blocked or delayed waiting on the report). A lost report is an accepted
  cost: the player's lifetime stats undercount by one match rather than the game stalling or
  erroring visibly over a stats write. This is a deliberate reliability/UX trade-off, not a defect.
- **Quit before any game action**: the player opens a match and immediately quits from a setup or
  pre-start state before the engine tick has begun. No match report is sent — reporting is gated
  on the match having actually started (a `startedAt` having been recorded by the engine). This
  prevents the match history from filling with zero-duration noise from players who backed out of
  nation/settings selection.
- **Session expires mid-game**: the player's auth session (JWT) expires while a match is in
  progress (long match, or a session nearing its natural expiry). At the terminal event (game
  over or quit), the client attempts to refresh the token and send the report with the refreshed
  credential. If the refresh itself fails (e.g. the underlying Supabase session was revoked or the
  refresh token is also invalid), the report is dropped — same accepted-loss behavior as any other
  failed report. The player is not blocked from returning to the menu, and is not force-logged-out
  mid-match on account of an expired token; re-authentication (if needed) happens naturally the
  next time the app boots without a valid session.
- **Client attempts to forge a match result or another player's stats**: not possible by
  construction — the edge function derives `user_id` from the verified JWT server-side and never
  reads it from the request body; RLS on `profiles`/`matches` restricts reads to the caller's own
  `auth.uid()`. There is no code path, valid or malformed request, that lets a client write to or
  read another account's rows.
- **Zero-division on win rate for a brand-new account**: `total_matches = 0` is the explicit `0`
  branch in the Formulas section — never a NaN or divide-by-zero in the UI layer. The UI must
  check `total_matches === 0` before formatting a percentage, not merely check for a falsy
  `winRate`.
- **Rapid double-submit on login/signup**: out of scope for this document's edge-function-only
  writes since Supabase Auth itself deduplicates concurrent sign-in attempts against the same
  credentials; specific UI-level double-submit guarding (e.g. disabling the submit button while
  a request is in flight) is a UX concern for the LoginScreen implementation, not a stats-system
  edge case.

## Dependencies

- **Supabase project "DomeBreak"** (auth, Postgres, edge functions) — this system's entire
  backend. Provides: authenticated sessions, `profiles`/`matches` tables, `player_stats` view,
  `db-account` edge function. Requires from DomeBreak: nothing beyond standard Supabase client
  configuration (URL + anon key).
- **`db-account` edge function** — the sole write path for `touch` (login timestamp) and
  `report_match`. Provides: server-verified, spoof-proof writes. Requires: a valid bearer JWT on
  every call, and (for `report_match`) a `result` in `win | loss | quit`.
- **Engine / match lifecycle** (`src/game/engine.js`, `src/game/sim/`) — provides the terminal
  events this system reports on (win/loss determination, `startedAt`/duration, chosen nation,
  opponent count). This system reads engine state at those terminal events only; it never
  influences engine ticks, combat resolution, or AI behavior. The engine does not need to know
  this system exists beyond exposing the values above at game-over and quit-to-menu.
- **Start menu UI** (`src/ui/StartMenu.jsx`) — displays username and `player_stats`-derived values;
  is the first screen shown after a successful login/session restore. Requires from this system:
  username string, raw stats counts, `winRate`/`totalPlaytimeS` computed per Formulas.
- **Pause menu UI** (`src/ui/PauseMenu.jsx`) — triggers the `quit` report path when the player
  quits to the main menu. Requires from this system: a `reportMatch({result: "quit", ...})` call
  it can fire without waiting on the result.
- **Electron shell** (`electron/main.cjs` + preload) — provides the `userData`-backed persistence
  bridge via `contextBridge` for the auth session, saves, and settings on desktop builds. This
  system requires the bridge to expose read/write of a single opaque session blob; it does not
  require Electron to understand Supabase's session format.
- **Local storage fallback (browser build)** — provides the same session persistence contract as
  the Electron bridge when no Electron IPC is available. This system must use the same
  read/write/clear interface against either backing store so the rest of the app is agnostic to
  which one is active.

## Tuning Knobs

| Knob                          | Category | Range / Values                                                                           | Rationale                                                                                                                                                                                                                                             |
| :--- | :--- | :--- | :--- |
| Username length               | Curve    | 3–24 characters (DB `check` constraint)                                                  | Long enough for expressive handles, short enough to fit UI chrome (start menu header, leaderboards if added later).                                                                                                                                   |
| Match-report retry count      | Gate     | Fixed at `1` retry (2 attempts total)                                                    | Balances "give a transient network blip a second chance" against "never let stats reporting add perceptible delay to returning to the menu." Raising this trades a marginally lower drop rate for longer worst-case time before the fallback give-up. |
| Signup email verification     | Gate     | Off (autoconfirm) for now; togglable in Supabase project settings                        | Removes signup friction during early access / solo-dev testing. Revisit before any public multiplayer launch — this is a security posture decision, not just a UX one.                                                                                |
| Session storage backend       | Gate     | Electron: `userData` dir via IPC; Browser: `localStorage`                                | Not intended as a runtime-configurable knob — it is selected automatically by build target. Documented here because it is still a value an implementer must get right per-platform.                                                                   |
| Stats displayed on start menu | Feel     | `total_matches`, `wins`, `losses`, `quits`, `winRate`, `totalPlaytimeS`, `last_match_at` | The full `player_stats` view is available; which subset renders on the start menu is a UX layout decision, not a backend constraint.                                                                                                                  |

## Acceptance Criteria

- A brand-new account can sign up with email + password + username, is logged in immediately (no
  email verification step blocks access), and reaches the start menu without further action.
- Signing up with a username already taken by another account succeeds (does not error to the
  user) and results in a distinct, usable account with a fallback username of the documented shape.
- Logging out and back in with the same credentials restores the same `profiles` row (same
  username, same accumulated stats) — no duplicate profile is created.
- On both Electron and browser builds, closing and relaunching the app with a previously
  successful login restores the session without showing the `LoginScreen`, provided the session is
  still valid.
- With Supabase unreachable, the `LoginScreen` shows an error state and a retry control; the
  start menu is never reached while unreachable, regardless of any previously cached session data.
- Completing a match as a win, as a loss, and quitting mid-match each produce exactly one row in
  `matches` with the correct `result` value, and the start menu's stats update to reflect it on
  next view (immediately if refetched, or on next login) after the write succeeds.
- Quitting from a pre-start/setup screen (before the match's `startedAt` is recorded) produces no
  `matches` row.
- Simulating a `report_match` failure on both attempts (e.g. by forcing the edge function call to
  error twice) results in the client returning to the menu/game-over screen with no user-facing
  error and no additional retry beyond the documented one.
- A player cannot read another account's `profiles` or `matches` rows via the anon key, verified by
  attempting a direct `select` against another known `user_id` and confirming RLS returns zero rows.
- A player cannot cause a `matches` row to be written under another account's `user_id`, verified
  by attempting to call `db-account` with a forged `user_id` in the request body and confirming the
  inserted row's `user_id` matches only the JWT's subject.
- `winRate` for a zero-match account renders as a "no data" state (not `0%` presented as a real
  loss record, not `NaN`, not a thrown error).
- `totalPlaytimeS` for an account with matches lacking `duration_s` on some rows still sums
  correctly, ignoring nulls, and never returns negative or `NaN`.
- Forcing a token expiry mid-match and then triggering a game-over or quit either (a) successfully
  refreshes and reports, or (b) fails the refresh and drops the report silently — in both cases the
  player reaches the menu without an error dialog or a hang.

<br />

<p align="center">
  <sub>Your name is on the door, and the record behind it is yours — not something a cleared cache can take.</sub>
</p>
