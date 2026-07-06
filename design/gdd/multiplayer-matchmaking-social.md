<h1 align="center">Multiplayer, Matchmaking & Friends</h1>

<p align="center">
  <b>Find or host live matches against real commanders on an authoritative server running the same deterministic engine as single-player.</b>
</p>

<br />

## Overview

GoldenDome's online mode lets a commander find or host a live match against other humans (and AI
fill-ins) instead of only local AI, and stay connected to other players as friends across sessions.
A thin Supabase control plane (`friendships`, `lobbies`, `lobby_members`) handles identity, friend
requests, and lobby formation with realtime updates; an authoritative Node game server — running
the exact same deterministic engine as the client — claims lobbies the moment they are ready,
assembles the match (human slots plus AI-filled nations), and ticks the real game. Clients never
simulate combat against each other directly: they connect to the authoritative server, send
whitelisted commands scoped to their own slot, and reconcile against periodic world snapshots. The
same `[world, api]` contract that drives local single-player drives online play, so the entire UI
layer is unaware which mode it is in.

## Player Fantasy

Command real rivals, not just the AI. Finding a friend online and dropping into their lobby should
feel like calling up an ally to co-run a war room — a Friends panel with live presence, a lobby
room where you watch each seat fill and claim your nation, and a Ready flag that turns the match
into a shared countdown. This primarily serves **Fellowship** (a persistent roster of named
commanders you can find, challenge, and rejoin) and **Competition-flavored Challenge** — the
stakes of a match feel real when the pressure is coming from another person's decisions, not a
script. Quick Match (Find Game) serves the player who just wants a fight now, no social overhead —
dropping them straight into the oldest open seat with the same low-friction "one more match" pull
as the single-player loop, just against a human counterpart.

## Detailed Rules

### Identity and friends

- Every authenticated commander (per `accounts-and-stats.md`) can search other commanders by
  `username`. `profiles` is globally readable (`select`) by any authenticated user specifically to
  support this search — a narrower read policy than `accounts-and-stats.md`'s own-row-only stance,
  and specific to this system.
- Friendship is modeled as a single `friendships` row per pair: `requester`, `addressee`, `status`
  (`pending` | `accepted`). All friend actions — `request`, `accept`, `remove` — are edge-function
  calls (`gd-social`) keyed by the target's `username`, never a raw `user_id` supplied by the
  client. The function resolves `username → user_id` server-side before writing.
- `remove` deletes the `friendships` row regardless of status — it is the single action that both
  cancels a pending request (either direction) and unfriends an accepted one.
- The Friends panel shows three lists: accepted friends, incoming pending requests (requests where
  the viewer is `addressee`), and outgoing pending requests (where the viewer is `requester`).

### Lobbies (control plane)

- A lobby is a `lobbies` row: `host` (user id), `name`, `status` (`open` | `starting` | `active` |
  `closed`), `max_players` (2–16), `ai_slots`, `match_id` (set once the game server assigns one),
  `server_url` (set once the game server assigns one), `updated_at`.
- Each seat is a `lobby_members` row: `lobby_id`, `user_id`, `slot`, `iso` (chosen nation), `ready`.
  `slot` is unique per `lobby_id` — this is the mechanism that resolves join races (see Edge Cases).
- All lobby mutations go through the `gd-lobby` edge function; the client never writes `lobbies` or
  `lobby_members` directly. Actions: `create`, `join`, `leave`, `set_iso`, `ready`, `set_ai`,
  `start`, `find`.
    - `create`: makes a new `open` lobby with the caller as `host` and as the first `lobby_members`
      row (slot 0).
    - `join`: claims the lowest free slot in a target `open` lobby for the caller. Fails if the
      lobby is not `open`, is full, or the caller already holds a seat in it.
    - `leave`: removes the caller's `lobby_members` row. If the caller was the host, host inherits
      to the member with the lowest remaining `slot`; if no members remain, the lobby's `status`
      is set to `closed`.
    - `set_iso`: sets the caller's own `iso` (nation) on their `lobby_members` row. Any player may
      change their own pick until the lobby leaves `open`.
    - `ready`: toggles the caller's own `ready` flag. Only meaningful while `status = open`.
    - `set_ai`: host-only. Sets `ai_slots` (the count of nations the game server should fill with
      AI once it assembles the match). `ai_slots + count(lobby_members) ≤ max_players` is enforced
      server-side in the edge function.
    - `start`: host-only, requires `status = open` and every human member `ready = true`. Sets
      `status = 'starting'`. This is the **only** effect of `start` — the edge function does not
      spin up a match itself (see Game Server below for why).
    - `find`: quick-match. Joins the oldest `open` lobby with a free seat (`created_at` ascending
      among lobbies with `status = 'open'` and `count(lobby_members) < max_players`); if none
      exists, creates a new one with the caller as host, default `max_players`, and no AI slots
      configured yet.
- Every write derives the acting identity from the verified JWT, exactly as `gd-account` does in
  `accounts-and-stats.md` — no action ever trusts a client-supplied `user_id`.
- Realtime is enabled on `lobbies` and `lobby_members`. The Multiplayer screen's lobby browser and
  the Lobby room both subscribe directly (Postgres Changes over Supabase Realtime) so every
  client's view of seats, readiness, and status updates live without polling.
- `matches` (from `accounts-and-stats.md`) gains a `mode` column: `'solo' | 'online'`. Online match
  reports are written by the game server (service-role key) at game-over, one row per human
  participant — not by the client, and not through `gd-account`'s client-facing `report_match`
  path (see Game Server below).

### Game server (authoritative)

- A single long-running Node process (systemd service on the Sunday host, a Raspberry Pi 5) imports
  `src/game/engine.js` — the same pure, deterministic engine module the browser client uses. No
  simulation code is duplicated or reimplemented for the server.
- Supabase edge functions cannot reach this host (no public ingress), so the control flow is
  **server-pulls, not backend-pushes**: the game server holds its own Realtime subscription
  (service-role key) on the `lobbies` table, filtered to `status = 'starting'`. When a row appears
  or changes to `starting`, the server **claims** it with a compare-and-swap-style update (only
  proceeds if it can transition that specific row from `starting` to a server-owned in-progress
  marker without another server instance having already claimed it — in the current single-server
  deployment this is a formality, but the claim step is not skipped).
- On claiming a lobby, the server reads the lobby's `lobby_members` rows to get human `user_id` +
  `slot` + `iso` assignments, then builds a `createWorld(setup)` call: human members map directly
  to their reserved `slot`/`iso`; `ai_slots` are filled with AI-controlled nations drafted the same
  way the attract-mode/single-player AI draft works. The server then writes `status = 'active'`,
  `match_id` (a new id it mints for this run), and `server_url` (its own WebSocket endpoint) back
  onto the `lobbies` row in one update.
- Clients discover the server purely from the lobby row: once `status` flips to `active`, the
  client reads `server_url` + `match_id` from the (already-subscribed) lobby row and opens a
  WebSocket directly to the server. LAN/Tailscale reachability is the deployment target now; a
  public tunnel (e.g. reverse proxy / relay) is a noted follow-up, not in scope for this document.
- Every inbound WebSocket connection presents its Supabase JWT. The server verifies it (same
  verification pattern as `gd-account`/`gd-lobby` — a Supabase client call against the token, never
  trusting a client-claimed identity), maps the resulting `user_id` to the slot recorded in
  `lobby_members` for that `match_id`, and rejects the connection if no matching slot exists.
- The server **whitelists** which engine commands a connection may invoke:  `queueUnit`,
  `commandAttack`, `moveUnit`, `setSail`, `research` (`enqueueResearch`/`unqueueResearch`),
  `declareWar` (and its `makePeace` counterpart), plus the remaining slot-scoped production/aircraft
  commands the engine exposes (`queueAircraft`, `queueAmmo`, `cancelProd`, `setWarhead`, `scrapUnit`,
  `setPatrolSize`, `setAwacsPatrol`, `stopSail`). Every whitelisted call is invoked with the
  sender's own resolved `slot` forced as the acting nation — a connection can never pass a
  different slot than the one its JWT resolved to, regardless of what the message body claims.
- The server ticks the world at a fixed **10 Hz** using the same `step(world, dt)` the client's
  `useEngine` hook calls locally, and broadcasts a **compressed full-world snapshot at 2 Hz** to
  every connected client in the match. There is no per-recipient filtering of the snapshot in this
  version (see Dependencies/Edge Cases re: fog-of-war and the Related ADR's fairness note).
- On game over (the engine's own win/lose condition, exactly as single-player evaluates it), the
  server writes one `matches` row per **human** participant, using the service-role key, with
  `mode: 'online'` and `result` derived per participant: the winner's nation gets `win`, eliminated-
  but-still-connected participants get `loss`, and any participant whose slot went AI due to a
  disconnect that was never reclaimed (see Edge Cases) gets `quit`.

### Client

- `useNetGame` is a hook with the **exact same `[world, api]` output contract** as the local
  `useEngine` hook (`src/ui/hooks/useEngine.js`): a world snapshot to render and an `api` object
  with the same method names (`buyPlace`, `commandAttack`, `move`, `setSail`, `research`,
  `declareWar`, etc.). `LiveGame` and every panel underneath it render off this contract without
  branching on "am I local or online" — the mode is invisible above the hook boundary.
- Between server snapshots, the client advances its own local copy of the world by calling the
  same deterministic `step(world, dt)` the engine already exposes, exactly like single-player does,
  so projectile motion and animation stay smooth at full frame rate rather than looking like it
  updates only at 2 Hz. On each snapshot arrival, the client's local world state is replaced by
  (reconciled to) the server's snapshot — **the server's state always wins**, discarding any local
  prediction drift.
- Every player-initiated action in `api` is sent to the server as a command over the WebSocket
  instead of (or in addition to, for responsiveness) applying locally; the server is the sole
  source of truth for whether the action actually took effect.
- There is **no pause control and no speed control** in online mode — the match always runs at a
  fixed 1× dictated by the server's tick rate. Any speed/pause UI that exists for single-player is
  hidden or disabled when `useNetGame` is active.
- **Reconnect**: on a dropped WebSocket, the client retries the connection using its JWT and the
  known `match_id`. The server recognizes the returning `user_id` against the same slot it was
  assigned and resumes streaming snapshots to it — a reconnect within the grace window is invisible
  to the match (see Formulas/Edge Cases for the 60s grace window and AI-takeover behavior).

### UI surfaces

- **Me badge** (top-right, present on menu screens and in-game): shows `username`; clicking/tapping
  opens a stats popover reusing the same `player_stats`-derived values from
  `accounts-and-stats.md` (win rate, playtime, etc. — this document adds no new stat fields).
- **Friends panel**: search-by-username, send/accept/remove actions, and the three lists (friends,
  incoming pending, outgoing pending) described above.
- **Multiplayer screen**: three entry points — **Find Game** (calls `find`), **Create Lobby**
  (calls `create`), and a **live lobby browser** listing `open` lobbies (name, host, seat count,
  `max_players`) updating via the same Realtime subscription the Lobby room uses.
- **Lobby room**: member list (each row: username, chosen `iso`, ready flag), a per-player nation
  picker bound to `set_iso`, individual Ready toggles bound to `ready`, and — host-only — an AI-fill
  control bound to `set_ai` and a Start button bound to `start` (disabled until every human member
  is ready).
- Single-player is untouched by any of the above — no existing local-mode screen, hook, or command
  path is modified by this system.

## Formulas

This system is primarily a state machine and protocol, not a numeric model — the formulas below
are the few derived/timing values that need an unambiguous definition.

**Quick-match lobby selection**

```
find(user) =
    join(oldest(L))   if L = { l ∈ lobbies : l.status = 'open' ∧ members(l) < l.max_players } ≠ ∅
    create(user)       if L = ∅
```

- `oldest(L)` = the member of `L` with the minimum `created_at` (FIFO — first lobby opened gets
  filled first, rather than e.g. best-fit on seat count).
- `members(l)` = `count(lobby_members where lobby_id = l.id)`.
- Example: two open lobbies exist, one created at `10:00:00` with 3/8 seats and one created at
  `10:00:05` with 1/2 seats. `find` joins the `10:00:00` lobby (older), even though the `10:00:05`
  lobby is closer to full — simplicity over optimal packing; see Tuning Knobs.

**Tick and snapshot cadence**

```
tickIntervalMs   = 1000 / 10   = 100ms   (server steps the world at 10 Hz)
snapshotIntervalMs = 1000 / 2  = 500ms   (server broadcasts a full snapshot at 2 Hz)
```

- The client's local prediction step calls the same `step(world, dt)` every animation frame
  (`dt` = real elapsed seconds, capped, exactly as `useEngine` already caps it at `0.1s` locally),
  independent of the server's 100ms tick — prediction smoothness is a client-side concern, not
  bound to the server's tick rate.
- Ratio `snapshotIntervalMs / tickIntervalMs = 5`: the server ticks 5 times between each broadcast
  snapshot. This ratio is a knob (see Tuning Knobs), not a hard constraint of the architecture.

**Reconnect grace window**

```
slotState(disconnectedForS) =
    "human, reconnectable"   if disconnectedForS ≤ 60
    "AI takeover"             if disconnectedForS > 60
```

- `disconnectedForS` = seconds since the server observed the WebSocket close for that slot's
  connection, reset to 0 immediately on a successful reconnect (matched by `user_id` + `match_id`).
- Example: a player's connection drops at match time `t`. If they reconnect by `t + 55s`, their
  slot resumes as their own nation with no AI interruption recorded. If they have not reconnected
  by `t + 61s`, the slot converts to AI control for the remainder of the match and their eventual
  `matches` row (if any — see Edge Cases) is written as `quit`.

**Lobby-stuck timeout ("starting" watchdog)**

```
lobbyStuck(secondsInStarting) = secondsInStarting > 30
```

- Measured client-side from the moment the client observes (via Realtime) that `status` became
  `'starting'`. If no corresponding `status = 'active'` update (with `server_url`/`match_id`
  populated) arrives within 30s, the client treats the lobby as failed-to-start (see Edge Cases —
  "server offline").

## Edge Cases

- **Host leaves the lobby**: on `leave`, if the departing member was `host`, host status inherits
  to the remaining member with the lowest `slot`. If the departing member was the lobby's only
  member, the lobby's `status` is set to `closed` instead of reassigning a nonexistent host —
  a `closed` lobby never appears in the lobby browser or in `find`'s candidate set. A closed lobby
  is not deleted (its row persists for audit/debug) but is functionally dead.
- **Lobby full**: `join` (direct or via `find`) against a lobby where
  `members(l) = l.max_players` fails with an error from `gd-lobby`; the client shows a "lobby is
  full" message and (for `find`) does not fall back to creating a new lobby on this specific
  failure mode — a full lobby is simply excluded from `find`'s candidate set `L` per the Formulas
  definition, so this case should only surface from a direct `join` (e.g. the browser listing was
  briefly stale) rather than from quick-match itself.
- **Join race — two players claim the last seat**: both clients call `join` (or `find` resolves to
  the same lobby) at effectively the same time against a lobby with exactly one free slot. The
  `lobby_members` unique constraint on `(lobby_id, slot)` — combined with the edge function
  computing "lowest free slot" and attempting the insert — means only one insert succeeds; the
  losing request's insert fails the constraint and `gd-lobby` returns an error to that caller. The
  losing client's UI shows "that seat was just taken" and, if it arrived via `find`, may retry
  `find` once to land in a different open lobby (client-side retry policy, not a server guarantee).
- **Server offline / never claims the lobby**: `start` sets `status = 'starting'`, but no running
  game server instance is alive to claim it (service down, host unreachable). Per the Formulas
  "lobby-stuck watchdog," if the client observes `status` still `'starting'` (never reaching
  `'active'`) more than 30s after the transition, it shows an error ("couldn't start the match —
  try again") and calls a revert action that sets the lobby back to `status = 'open'` so the host
  can retry `start` or the lobby can be abandoned normally. This revert is a client-triggered
  `gd-lobby` action guarded server-side to only succeed if the lobby is still `starting` and has
  not since been claimed (`match_id`/`server_url` still unset) — this prevents a slow client from
  reverting a lobby the game server *did* just claim a moment later.
- **Player disconnect mid-match**: the server does not immediately hand a disconnected human's
  slot to AI. Per the Formulas reconnect-grace formula, the slot stays reconnectable for 60s; a
  successful reconnect (same `user_id` + `match_id`, fresh JWT) resumes it with no interruption
  recorded anywhere. If 60s elapses with no reconnect, the slot converts to AI control for the
  rest of the match, and that participant's eventual `matches` row is written with `result: 'quit'`
  (disconnect-without-return is treated identically to an explicit quit for scoring purposes — see
  the Game Server rules).
- **Duplicate friend request**: a `request` call where a `pending` or `accepted` `friendships` row
  already exists between the two users (in either direction) is **idempotent** — it does not create
  a second row or error the caller; `gd-social` treats it as a no-op success (or, for the specific
  case of an incoming pending request the caller already sent to *them*, it may auto-accept rather
  than silently no-op — either behavior is acceptable so long as the result is never a duplicate
  row or a client-visible error for re-sending a request that already exists).
- **All humans quit mid-match**: if every human participant either explicitly quits or exceeds the
  60s reconnect grace (converting to AI) such that zero humans remain connected, the match is not
  kept running indefinitely for AI-vs-AI spectacle — it ends immediately, and the server writes
  the `matches` rows for all humans who were ever part of the match using whatever `result` each
  had earned or been assigned at the moment the last human left (win/loss for anyone already
  decided by the engine's win condition, `quit` for anyone who disconnected/quit without the match
  having resolved in their favor first).
- **Lobby member changes nation after another member already picked it**: `set_iso` does not
  enforce nation uniqueness at the lobby-control-plane layer in this document's scope — if
  uniqueness of chosen nations is required, that validation belongs to the same layer that already
  validates nation choice for single-player setup, applied identically when the game server
  assembles `createWorld(setup)`. This document does not introduce a new uniqueness rule beyond
  whatever the existing nation-select flow enforces.
- **Ready flag stale after a mid-lobby nation change**: no automatic un-readying is specified — a
  player who is `ready = true` and then calls `set_iso` remains `ready` unless they explicitly
  toggle it. This is a deliberate minimalism choice (fewer implicit state transitions); if
  playtesting shows this causes starts with unintended nation picks, revisit as a follow-up, not a
  blocking gap in this version.
- **`ai_slots` exceeds remaining capacity**: `set_ai` is rejected server-side by `gd-lobby` if
  `ai_slots + members(l) > l.max_players`; the host sees an error rather than the value silently
  clamping, so the host always knows their actual configured seat math.

## Dependencies

- **`design/gdd/accounts-and-stats.md`** (Accounts & Player Stats) — this system extends that
  system's identity and `matches` schema rather than replacing it. Provides to this system:
  authenticated `user_id`/`username`, the `profiles` table (widened here to globally-readable for
  search — a change this document owns, not a silent edit to that GDD), and the existing `matches`
  table (this document adds the `mode` column and is the source of `mode: 'online'` rows, written
  by the game server rather than the `gd-account` edge function). Requires from this system: the
  `mode` column addition and the online write path be documented here rather than in
  `accounts-and-stats.md`, since that document's `report_match` contract (client-triggered,
  fire-and-forget, one retry) is specific to single-player/local reporting and does not describe
  server-authored rows — a future revision of `accounts-and-stats.md` should cross-reference this
  document for the `mode: 'online'` case rather than this document silently diverging from it.
- **Supabase project "Golden Dome"** (same project as `accounts-and-stats.md`) — provides the
  `friendships`, `lobbies`, `lobby_members` tables, Realtime, and the `gd-social`/`gd-lobby` edge
  functions. Requires from this system: standard Supabase client configuration (already present
  from the accounts system) plus a Realtime subscription client for the lobby browser/room and
  (service-role side) for the game server.
- **Authoritative game server (new component)** — provides match assembly, tick simulation,
  snapshot broadcast, command validation, and online `matches` row authorship. Requires from this
  system: `lobbies`/`lobby_members` rows to be structurally correct and stable by the time
  `status = 'starting'` is observed (host + members + `iso` picks + `ai_slots` finalized before
  `start` is callable). See `docs/architecture/adr-003-authoritative-server.md` for the full
  technical decision this component is built on.
- **Engine (`src/game/engine.js`, `src/game/sim/`)** — provides `createWorld`, `step`, and every
  slot-scoped command (`queueUnit`, `commandAttack`, `moveUnit`, `setSail`, `enqueueResearch`,
  `declareWar`, etc.) that both single-player and this system's game server consume identically.
  Requires from this system: nothing — the engine gains no network awareness, no online-specific
  branch, and no knowledge that a game server (rather than a browser tab) may be driving it. This
  mirrors the engine-decoupling stance already established by `accounts-and-stats.md`.
- **`sensors-and-fog-of-war.md`** — this system's snapshot broadcast currently sends the full,
  unfiltered world to every connected client (see Formulas — no per-recipient filtering). That
  GDD's fog-of-war rules (`sensorsOf`/`sensedBy`) still execute and still gate what each client's
  own UI *renders*, but a modified/instrumented client could read fog-hidden data directly off an
  online snapshot in a way it cannot in single-player (where there is nothing to intercept). This
  document does not change `sensors-and-fog-of-war.md`'s rules; it flags that online mode is a
  trusted-client environment for fog purposes today (see `adr-003`'s fairness note) and that
  GDD should link back here once server-side per-recipient filtering becomes a follow-up.
- **`useEngine` hook (`src/ui/hooks/useEngine.js`)** — this system's `useNetGame` hook must expose
  the identical `[world, api]` shape (same method names on `api`) so `LiveGame` and its panels
  require no branching. Requires from this system: `useNetGame` to fully implement every method
  `useEngine`'s `api` exposes, even where the online implementation forwards to the server instead
  of mutating local state directly.
- **UI: `LiveGame`, a new Multiplayer screen, a new Lobby room component, a Friends panel, and a
  Me badge** — provide the player-facing surfaces described in Detailed Rules. Require from this
  system: the `gd-social`/`gd-lobby` action set, Realtime subscriptions on `lobbies`/
  `lobby_members`, and (for the Me badge) the same `player_stats` values `accounts-and-stats.md`
  already exposes — no new stat fields are introduced by this document.
- **Single-player mode** — explicitly untouched. No dependency runs from single-player to this
  system in either direction; this is stated to make the boundary unambiguous, not because a real
  data dependency exists.

## Tuning Knobs

| Knob                            | Category | Range / Values                                                                     | Rationale                                                                                                                                                                                                               |
| :--- | :--- | :--- | :--- |
| `max_players` per lobby         | Gate     | 2–16 (DB `check` constraint)                                                       | Mirrors the existing free-for-all seat range established by the local/`gd-match` multiplayer backend in `docs/spec.md`; not intended to be widened without re-validating server tick cost at high seat counts.          |
| Server tick rate                | Feel     | Fixed at `10 Hz` for this version                                                  | Matches the responsiveness the deterministic engine already assumes locally (`useEngine`'s per-frame `step` calls); raising it trades server CPU for lower input-to-effect latency, not currently needed at this scale. |
| Snapshot broadcast rate         | Curve    | Fixed at `2 Hz` for this version                                                   | Full-snapshot bandwidth scales with world size and player count; 2 Hz was chosen as "clearly enough to correct drift" without profiling bandwidth at max seats. Revisit once delta encoding (ADR follow-up) lands.      |
| Reconnect grace window          | Gate     | Fixed at `60s`                                                                     | Long enough to survive a phone call, a wifi blip, or an app crash-and-relaunch; short enough that an abandoned match doesn't stall the other players' pacing waiting on a slot that may never return.                   |
| Lobby-`starting`-stuck watchdog | Gate     | Fixed at `30s` (client-observed)                                                   | Balances "give the game server a moment to notice and claim the row" against "don't leave the host staring at a spinner indefinitely if the server is actually down."                                                   |
| Quick-match candidate ordering  | Curve    | Fixed at oldest-`open`-lobby-first (FIFO)                                          | Simplicity over optimal seat-packing; an alternative (best-fit on remaining seats, or bias toward near-full lobbies to minimize AI fill) is a plausible future revision, not implemented in this version.               |
| `ai_slots` upper bound          | Gate     | `ai_slots + humans ≤ max_players`, enforced by `gd-lobby`                          | Prevents a host from configuring a lobby that can never validly assemble; rejecting invalid configuration server-side (rather than clamping) keeps the host's displayed seat math always truthful.                      |
| Friend search result set        | Feel     | Unbounded username substring/exact match (implementer's choice) against `profiles` | Not specified further here — this is a UX-layer decision (result limit, debounce) rather than a backend constraint; `profiles` is readable to any authenticated user for exactly this purpose (see Detailed Rules).     |

## Acceptance Criteria

- A commander can search for another commander by exact or partial username and see them in
  results, provided both are authenticated — confirmed against a second real test account.
- Sending a friend request, accepting it from the other account, and seeing both accounts list
  each other under "friends" (not pending) completes the full loop with no manual refresh needed
  on either client (Realtime or equivalent live update).
- Re-sending a friend request that already exists (either `pending` or `accepted`) does not create
  a duplicate `friendships` row and does not surface an error to the sender.
- Removing a friend removes the relationship symmetrically — neither account lists the other
  afterward, and a fresh `request` after a `remove` behaves as a brand-new request, not a stale one.
- Creating a lobby produces exactly one `lobbies` row (host as slot 0) and is visible in another
  account's live lobby browser without that account refreshing the page/screen.
- `find` (quick match) joins the oldest eligible open lobby when one exists, and creates a new one
  when none does — verified by constructing both scenarios with seeded test lobbies.
- Two clients racing to claim the last open seat in a lobby result in exactly one success and one
  clean, user-visible failure — never two members occupying the same `slot`, and never a silent
  failure with no client-visible feedback.
- A host leaving a multi-member lobby transfers host to the lowest-`slot` remaining member; a host
  leaving a single-member lobby closes it — both verified by inspecting `lobbies.status` and
  `lobbies.host` after each scenario.
- Starting a lobby (`start`) with a live game server running results in the lobby reaching
  `status = 'active'` with a populated `match_id` and `server_url` within a few seconds, and every
  human member's client auto-connects using those values without manual entry.
- With no game server process running, a lobby stuck at `status = 'starting'` for more than 30s is
  visibly reported as an error to the host, and the lobby is confirmed to revert to `status = 'open'`
  (re-startable) rather than remaining permanently stuck.
- A running match enforces the command whitelist and slot-forcing: a scripted/forged WebSocket
  message attempting to act on another player's slot, or to call a non-whitelisted action, is
  rejected by the server and produces no state change for the targeted slot.
- Disconnecting a client mid-match and reconnecting within 60s resumes the same nation under the
  same player with no AI takeover having occurred (confirmed by no `matches` `quit` row being
  written for that participant when the match later concludes with them as winner/loser normally).
- Disconnecting a client mid-match and not reconnecting within 60s results in that nation
  continuing under AI control, and a `matches` row with `result: 'quit'` and `mode: 'online'` for
  that human once the match ends.
- If every human participant quits or times out with no reconnect, the match ends immediately
  (does not continue running AI-vs-AI), and every human who was ever part of the match has exactly
  one `matches` row written reflecting their state at the moment the last human departed.
- Online matches never expose pause or speed controls in the UI, and the observed tick pacing is
  consistent with the fixed 1× server rate across a full test match.
- The client's projectile/unit motion between snapshots visibly interpolates/predicts smoothly
  (no visible 2 Hz "stutter") and snapshot arrival never produces a jarring position snap under
  normal network conditions — this is a playtest-validated experiential criterion, not purely
  automatable; a playtest session on the LAN/Tailscale target should confirm motion reads as
  continuous, not stepped.
- `LiveGame` and its panels render identically (same components, same layout) whether driven by
  `useEngine` (single-player) or `useNetGame` (online) — confirmed by code inspection showing no
  mode-conditional branching above the hook boundary, and by playing one full match in each mode.
- The Me badge, Friends panel, Multiplayer screen, and Lobby room are each reachable from the
  relevant menu/in-game context and reflect live state (seat fills, ready toggles, friend
  request changes) without a manual page refresh, verified with two simultaneous test clients.

<br />

<p align="center">
  <sub>The stakes turn real when the pressure comes from another commander's decisions, not a script.</sub>
</p>
