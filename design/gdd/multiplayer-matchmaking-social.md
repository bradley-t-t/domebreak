<h1 align="center">Multiplayer, Matchmaking & Friends</h1>

<p align="center">
  <b>Press Play. The authoritative server fills your war room with real commanders when they're queueing and convincing bot ones when they're not, then launches the match the moment everyone's ready.</b>
</p>

<br />

## Overview

DomeBreak's online mode has exactly one entry point: a **Play** button that enrolls the commander
in a matchmaking queue and stays connected to other players as friends across sessions. There is no
lobby browser, no hosting, and no manual AI-count configuration — the authoritative server groups
players who queue within a short window into the same match, backfills any remaining seats with
**bot lobby members** (real `lobby_members` rows that visibly join, pick nations, and ready up), and
auto-launches the moment every member — human or bot — is ready. A thin Supabase control plane
(`friendships`, `matchmaking_queue`, `lobbies`, `lobby_members`) handles identity, friend requests,
and match formation with realtime updates; the same authoritative Node game server introduced for
ticking the match (`docs/architecture/adr-003-authoritative-server.md`) now also owns the
matchmaker and the bot lobby simulation (`docs/architecture/adr-004-matchmaking-bot-lobby.md`),
claiming lobbies the moment they are ready, assembling the match (human slots plus AI-filled
nations), and ticking the real game. Clients never simulate combat against each other directly:
they connect to the authoritative server, send whitelisted commands scoped to their own slot, and
reconcile against periodic world snapshots. The same `[world, api]` contract that drives local
single-player drives online play, so the entire UI layer is unaware which mode it is in.

## Player Fantasy

Press one button and the war room fills. No browsing empty lobbies, no configuring an AI-count
slider, no waiting on a host who wandered off — Play puts the commander straight into a "Searching
for commanders…" beat that resolves in seconds, then drops them into a room where seats fill one by
one, each new arrival claiming a nation and readying up, until the countdown to war is unanimous.
Whether those seats are filled by real rivals who queued at the same moment or by bots standing in
for absent humans, the moment reads the same: a room of commanders assembling for a fight, not a
menu of settings to configure. This primarily serves **low-friction Challenge** — the "one more
match" pull of single-player, now pointed at a live opponent — and **Fellowship**, both in the
immediate sense (watching a room of commanders come together) and in the persistent sense (a
Friends panel with live presence for finding, challenging, and rejoining specific people, which
remains available alongside quick-match as a secondary path). Command real rivals, not just the
AI, whenever any are available — and don't let the absence of one ever be the reason a match feels
empty or administrative.

## Detailed Rules

### Identity and friends

- Every authenticated commander (per `accounts-and-stats.md`) can search other commanders by
  `username`. `profiles` is globally readable (`select`) by any authenticated user specifically to
  support this search — a narrower read policy than `accounts-and-stats.md`'s own-row-only stance,
  and specific to this system.
- Friendship is modeled as a single `friendships` row per pair: `requester`, `addressee`, `status`
  (`pending` | `accepted`). All friend actions — `request`, `accept`, `remove` — are edge-function
  calls (`db-social`) keyed by the target's `username`, never a raw `user_id` supplied by the
  client. The function resolves `username → user_id` server-side before writing.
- `remove` deletes the `friendships` row regardless of status — it is the single action that both
  cancels a pending request (either direction) and unfriends an accepted one.
- The Friends panel shows three lists: accepted friends, incoming pending requests (requests where
  the viewer is `addressee`), and outgoing pending requests (where the viewer is `requester`).

### Matchmaking queue and lobbies (control plane)

- **Queue.** Clicking **Play** enrolls the caller in `matchmaking_queue`: `user_id` (JWT-derived),
  `iso` (optional nation preference, nullable), `enqueued_at`, `status` (`'waiting'` | `'matched'`),
  `lobby_id` (nullable, set once the matchmaker places the caller). A caller may read/subscribe to
  their own row only; all writes go through `db-lobby` under the service-role path — the client
  never inserts or updates this table directly.
- A lobby is a `lobbies` row: `status` (`starting` | `active` | `closed` — note there is no
  human-visible `open` state in the quick-match flow; a lobby only comes into existence
  server-formed and already populated), `max_players` (2–16, mirroring `TARGET_NATIONS`),
  `match_id` (set once the game server assigns one), `server_url` (set once the game server assigns
  one), `updated_at`. There is no `host` column — quick-match lobbies have no host; assembly and
  launch are entirely server-driven.
- Each seat is a `lobby_members` row: `lobby_id`, `user_id` (**nullable** — null for bot seats),
  `slot`, `iso` (chosen nation, nullable until picked), `ready`, `is_bot` (boolean, new), and
  `display_name` (the human's username, or a plausible commander callsign for a bot). `slot` is
  unique per `lobby_id`. Bot rows are structurally identical to human rows in every field the
  client reads — this is exactly what lets the Lobby room render a bot member with the same row
  treatment as a human, with no visible "BOT" label anywhere in the UI.
- All lobby/queue mutations go through the `db-lobby` edge function; the client never writes
  `matchmaking_queue`, `lobbies`, or `lobby_members` directly. The player-facing action set is now
  **`quick_match`, `cancel`, `set_iso`, `ready`, `leave`** — `create`, `find`, and the host-only
  `set_ai` are removed entirely from the player-facing flow; `start` still exists as an internal
  status transition, but it is no longer a client-callable action — it is written by the server's
  auto-launch logic (see Game Server below), never by a host clicking a button.
    - `quick_match`: enrolls the caller as a `'waiting'` row in `matchmaking_queue` with an optional
      nation preference. **Idempotent** — calling it again while the caller already has a
      `'waiting'` row is a no-op success, not a duplicate row.
    - `cancel`: deletes the caller's `'waiting'` row. **Safe to call with no effect** if the caller
      has no `'waiting'` row (already matched, or never queued) — a no-op success either way. A
      caller whose row has already flipped to `'matched'` cannot be cancelled out of a formed lobby
      via `cancel`; they use `leave` on the lobby instead, exactly as before.
    - `set_iso`: sets the caller's own `iso` on their `lobby_members` row. Any player may change
      their own pick until the lobby leaves its pre-launch state (i.e., until `status` becomes
      `starting`).
    - `ready`: toggles the caller's own `ready` flag. Only meaningful while the lobby has not yet
      launched.
    - `leave`: removes the caller's `lobby_members` row. Since quick-match lobbies have no host,
      there is no host-inheritance step. If the departing member was the lobby's last remaining
      human, the server immediately sets `lobbies.status = 'closed'` regardless of bot readiness —
      a human-less lobby never reaches `starting` (see Edge Cases — "last human leaves a pre-launch
      lobby" — for the exact rule this overrides the otherwise-satisfiable all-bots-ready
      condition).
- Every write derives the acting identity from the verified JWT, exactly as `db-account` does in
  `accounts-and-stats.md` — no action ever trusts a client-supplied `user_id`.
- Realtime is enabled on `matchmaking_queue`, `lobbies`, and `lobby_members`. The client's Searching
  state subscribes to the caller's own `matchmaking_queue` row (watching for `status = 'matched'`);
  the Lobby room subscribes to its `lobbies`/`lobby_members` rows (Postgres Changes over Supabase
  Realtime), exactly mirroring how it already observed seat fills and readiness before this
  revision — there is no lobby browser to subscribe a list of rows to anymore.
- `matches` (from `accounts-and-stats.md`) gains a `mode` column: `'solo' | 'online'`. Online match
  reports are written by the game server (service-role key) at game-over, one row per human
  participant — not by the client, and not through `db-account`'s client-facing `report_match`
  path (see Game Server below).

### Game server (authoritative) — matchmaker + bot lobby simulation + claim

- A single long-running Node process (systemd service on the Sunday host, a Raspberry Pi 5) imports
  `src/game/engine.js` — the same pure, deterministic engine module the browser client uses. No
  simulation code is duplicated or reimplemented for the server. This process now carries **two**
  responsibilities: the matchmaker described here, and the lobby-claim/tick/broadcast pipeline
  carried over unchanged from before (see `docs/architecture/adr-003-authoritative-server.md`,
  extended by `docs/architecture/adr-004-matchmaking-bot-lobby.md`).
- Supabase edge functions cannot reach this host (no public ingress), so all control flow is
  **server-pulls, not backend-pushes**. The matchmaker is a *second* outbound Realtime subscription
  (service-role key) — on `matchmaking_queue` filtered to `status = 'waiting'` — living alongside
  the existing subscription on `lobbies` filtered to `status = 'starting'`. A periodic sweep runs
  alongside the subscription so that window expiry fires even when no new queue row arrives to
  trigger a Realtime event.
- **Matchmaker loop — grouping.** The server opens a forming group anchored on the oldest `waiting`
  row's `enqueued_at`. It admits further waiting humans into that group until either
  `TARGET_NATIONS` (default 6) humans have gathered or `matchWindowS` (default 6s, measured from
  the anchor) elapses — whichever comes first. If no other humans are waiting, the anchor's own
  window elapse immediately forms a group of one; there is no minimum human count and no artificial
  delay imposed on a lone waiter beyond the (skippable) window itself — see Formulas for the exact
  skip condition.
- **Matchmaker loop — lobby formation.** Once a group closes (by fill or by window expiry), the
  server: (1) creates one `lobbies` row (server-owned, no host); (2) inserts one `lobby_members` row
  per grouped human (`is_bot = false`, a reserved `slot`, a default `iso`, `display_name` = their
  username); (3) inserts `TARGET_NATIONS − humansGathered` bot `lobby_members` rows (`is_bot =
  true`, reserved `slot`s, `display_name` drawn from a commander-callsign pool, `iso` left unset and
  `ready = false` initially); (4) sets each grouped human's `matchmaking_queue.status = 'matched'`
  with the new `lobby_id`. This is the write that flips a searching client into the Lobby room.
- **Bot lobby simulation.** Over the next few seconds, the server writes each bot's `iso` (a
  distinct nation, chosen to avoid collision with any human's pick or another bot's pick) after a
  per-bot staggered join delay (`botJoinStaggerS`, default range 0.4–1.6s), then — after a further
  per-bot delay (`botReadyDelayS`, default range 1–4s) — sets that bot's `ready = true`. Every bot
  write is a plain, timed database update; bots never open a WebSocket, never authenticate, and
  never enter the command path — they exist purely as `lobby_members` rows until match assembly
  converts them into `isAi` nations. Humans, meanwhile, pick their own `iso` via `set_iso` and
  toggle their own `ready` in the Lobby room UI; every human is auto-assigned a changeable default
  nation on entry so a human who never interacts with the nation picker still has a valid seat.
- **Auto-launch.** The server performs the all-ready check itself (it owns the authoritative member
  set — never inferred from a client). The moment every `lobby_members` row for a lobby has
  `ready = true`, the server sets `lobbies.status = 'starting'`. If instead `lobbyReadyTimeoutS`
  (default 45s, measured from lobby formation) elapses first, the server force-launches anyway: any
  human seat still `ready = false` at that moment is flagged for AI conversion at assembly, reusing
  the exact same disconnect→AI-takeover mechanism `adr-003-authoritative-server.md` already defines
  for an expired reconnect grace window — no second AI-takeover mechanism is introduced. Either path
  ends in the same `status = 'starting'` write that the claim step below already knows how to
  consume.
- **Claim (unchanged from the prior version).** The server holds its existing outbound Realtime
  subscription (service-role key) on `lobbies` filtered to `status = 'starting'`. When a row appears
  or changes to `starting` — whether from an all-ready launch or a timeout force-launch — the server
  **claims** it with a compare-and-swap-style update (only proceeds if it can transition that
  specific row from `starting` to a server-owned in-progress marker without another server instance
  having already claimed it).
- On claiming a lobby, the server reads the lobby's `lobby_members` rows to get slot/`iso`
  assignments for every member: non-bot, ready-at-launch humans map directly to their reserved
  `slot`/`iso`; bot rows (`is_bot = true`) and any human seat flagged unready-at-timeout are drafted
  as AI-controlled nations the same way the attract-mode/single-player AI draft works, carrying
  forward whichever `iso` each bot had already picked (a timeout-flagged human keeps their own
  chosen or default `iso`, just AI-piloted). The server then writes `status = 'active'`, `match_id`
  (a new id it mints for this run), and `server_url` (its own WebSocket endpoint) back onto the
  `lobbies` row in one update.
- Clients discover the server purely from the lobby row: once `status` flips to `active`, the
  client reads `server_url` + `match_id` from the (already-subscribed) lobby row and opens a
  WebSocket directly to the server. LAN/Tailscale reachability is the deployment target now; a
  public tunnel (e.g. reverse proxy / relay) is a noted follow-up, not in scope for this document.
- Every inbound WebSocket connection presents its Supabase JWT. The server verifies it (same
  verification pattern as `db-account`/`db-lobby` — a Supabase client call against the token, never
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
  to the match (see Formulas/Edge Cases for the 60s grace window and AI-takeover behavior). This
  in-match mechanism is the same one the lobby-ready timeout reuses: a human seat still unready at
  `lobbyReadyTimeoutS` is converted to AI at match assembly exactly as a disconnect that outlives
  the 60s grace window is — there is one AI-takeover mechanism, entered from two triggers.
- **Searching state**: clicking Play calls `quick_match` and immediately transitions the client into
  a Searching state ("Searching for commanders…") with a cancel affordance. The client subscribes
  (Realtime) to its own `matchmaking_queue` row and does nothing else while `status = 'waiting'`.
  The moment that row's `status` flips to `'matched'`, the client reads the accompanying `lobby_id`,
  drops the Searching state, and subscribes to that lobby's `lobbies`/`lobby_members` rows exactly
  as the Lobby room already does — there is no separate "you've been matched" screen between
  Searching and the Lobby room. Cancelling while Searching calls `cancel` and returns to the main
  menu with no lobby ever having formed for that caller.

### UI surfaces

- **Play button** (main menu / StartMenu): the **only** multiplayer entry point. Calls `quick_match`
  and transitions into the Searching state described above. Single-player's "New Game" (local AI)
  is a separate, untouched entry and remains the offline path — Play is exclusively the online
  quick-match flow.
- **Searching state**: "Searching for commanders…" with a cancel affordance (calls `cancel`).
  Resolves into the Lobby room the instant the caller's `matchmaking_queue` row reports
  `status = 'matched'` — see Client, above.
- **Me badge** (top-right, present on menu screens and in-game): shows `username`; clicking/tapping
  opens a stats popover reusing the same `player_stats`-derived values from
  `accounts-and-stats.md` (win rate, playtime, etc. — this document adds no new stat fields).
- **Friends panel**: search-by-username, send/accept/remove actions, and the three lists (friends,
  incoming pending, outgoing pending) described above. This remains a secondary, persistent-identity
  surface alongside Play — it is not itself a match entry point (there is no "invite to lobby"
  action in this document's scope).
- **Lobby room**: member list (each row: `display_name`, chosen `iso`, ready flag) rendered
  identically whether the row is a human or a bot (`is_bot` is never surfaced in the UI), a
  per-player nation picker bound to `set_iso` (usable on the caller's own row only), and an
  individual Ready toggle bound to `ready`. There is **no host, no AI-fill control, and no Start
  button** — every seat, human or bot, appears and readies on its own, and the match auto-launches
  per the Game Server rules above the moment every member is ready (or the lobby-ready timeout
  fires). The human's own seat is pre-populated with a changeable default nation on entry.
- Single-player is untouched by any of the above — no existing local-mode screen, hook, or command
  path is modified by this system.

## Formulas

This system is primarily a state machine and protocol, not a numeric model — the formulas below
are the few derived/timing values that need an unambiguous definition.

**Matchmaking grouping window**

```
group(anchor) =
    close(group)   when  |group.humans| = TARGET_NATIONS
                   or    now − anchor.enqueued_at ≥ matchWindowS
    (whichever condition is met first)
```

- `anchor` = the `waiting` queue row with the minimum `enqueued_at` among rows not yet assigned to a
  forming group. Every subsequent `waiting` row is admitted into the anchor's forming group (FIFO
  admission by `enqueued_at`) until the group closes.
- `TARGET_NATIONS` = 6 (default; range 2–16 — see Tuning Knobs).
- `matchWindowS` = 6 (default, seconds — see Tuning Knobs), measured from `anchor.enqueued_at`, not
  from each individual admitted waiter's own `enqueued_at`.
- **Skip condition**: if no other `waiting` row exists when the anchor's own window would otherwise
  be checked, the group closes immediately with 1 human — the window is not artificially waited out
  once it's clear no one else is coming within it. In practice this means a lone waiter is placed
  the moment the matchmaker's sweep or Realtime handler next runs, not after a full 6s delay.
- Example A (grouped): players X and Y call `quick_match` at `10:00:00.0` and `10:00:03.5`
  respectively. X is the anchor. At `10:00:06.0` (`matchWindowS` elapsed from X's `enqueued_at`), the
  group closes with `{X, Y}` — 2 humans, `6 − 2 = 4` bot seats.
- Example B (lone waiter, skipped window): player Z calls `quick_match` at `10:00:00.0` with no one
  else queueing. The matchmaker's next sweep (sub-second) finds no other `waiting` row eligible to
  join Z's group and closes it immediately with `{Z}` — 1 human, `6 − 1 = 5` bot seats. Z perceives
  no meaningful wait.

**Bot backfill count**

```
botsNeeded(humansGathered) = TARGET_NATIONS − humansGathered
```

- `humansGathered` = the size of the closed group (1 ≤ `humansGathered` ≤ `TARGET_NATIONS`).
- Example: `TARGET_NATIONS = 6`, `humansGathered = 3` → `botsNeeded = 3`. If `humansGathered = 6`
  (the group filled entirely with humans), `botsNeeded = 0` and no bot rows are inserted.

**Bot join and ready stagger**

```
botJoinAtS(i)  = uniform(botJoinStaggerS.min, botJoinStaggerS.max)   for each bot i, independently
botReadyAtS(i) = botJoinAtS(i) + uniform(botReadyDelayS.min, botReadyDelayS.max)
```

- `botJoinStaggerS` = `[0.4, 1.6]` seconds (default range — see Tuning Knobs): the delay, from lobby
  formation, before bot `i`'s `iso` write lands (its visible "join").
- `botReadyDelayS` = `[1, 4]` seconds (default range — see Tuning Knobs): the additional delay,
  measured from that same bot's own join time, before its `ready` write lands.
- Each bot draws its own independent samples — bots do not ready in lockstep, which is what
  produces the staggered, human-like appearance in the Lobby room.
- Example: a lobby forms at `t = 0` with 3 bot seats. Bot 1 draws `botJoinAtS = 0.7`,
  `botReadyDelayS = 2.1` → joins at `t = 0.7s`, readies at `t = 2.8s`. Bot 2 draws `botJoinAtS = 1.3`,
  `botReadyDelayS = 1.2` → joins at `t = 1.3s`, readies at `t = 2.5s`. Bot 3 draws `botJoinAtS = 0.5`,
  `botReadyDelayS = 3.6` → joins at `t = 0.5s`, readies at `t = 4.1s`. The three bots visibly
  populate and ready across roughly a 4-second window rather than all at once.

**Auto-launch condition**

```
autoLaunch(lobby) =
    "starting"   if  ∀ m ∈ lobby_members(lobby): m.ready = true
    "starting"   if  secondsSinceFormed(lobby) ≥ lobbyReadyTimeoutS   (force-launch)
    "waiting"     otherwise
```

- `lobbyReadyTimeoutS` = 45 (default, seconds — see Tuning Knobs), measured from the moment the
  lobby's `lobbies` row was created by the matchmaker.
- On a force-launch (the second branch fires before the first), every `m` with `m.ready = false` at
  that instant is flagged for AI conversion at match assembly — this applies to bots that
  (abnormally) never finished readying and to humans who never toggled `ready`, identically.
- Example: a lobby forms at `t = 0` with 1 human and 5 bots. All 5 bots ready by `t = 4.1s` (per the
  stagger example above), but the human never toggles Ready. At `t = 45s`, `autoLaunch` fires via the
  timeout branch; the human's seat is flagged unready-at-timeout and is drafted as an AI nation
  (carrying their default `iso`) when the claim step assembles the match.

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

- **No humans in queue when Play is pressed**: per the Formulas skip condition, the anchor's group
  closes with 1 human as soon as the matchmaker's sweep confirms no other `waiting` row exists — the
  `matchWindowS` window is not waited out. The lobby forms immediately with `TARGET_NATIONS − 1`
  bot seats, and the player perceives no meaningful delay between pressing Play and landing in the
  Lobby room with bots already beginning to join.
- **A second human enters the queue right as a group is about to close (window boundary)**: group
  membership is decided at the instant the anchor's window elapses (or `TARGET_NATIONS` is reached),
  whichever the matchmaker's sweep observes first. A `waiting` row that lands after that instant —
  even by a fraction of a second — is not retroactively added to the closing group; it becomes the
  anchor of a new forming group instead. Outcome: two humans who queue within milliseconds of a
  window boundary can land in two separate, both bot-backfilled, lobbies rather than together. This
  is accepted as a tunable simplicity trade (see `matchWindowS` in Tuning Knobs) rather than treated
  as a bug — there is no re-grouping or lobby-merging step once a group has closed.
- **Human cancels while Searching**: `cancel` deletes the caller's `matchmaking_queue` row. If the
  matchmaker had not yet closed a group containing that row, no lobby is ever formed referencing the
  cancelling caller — the row simply ceases to exist and no `lobby_members` insert follows. If
  `cancel` arrives after the caller's row already flipped to `'matched'` (a race against the
  matchmaker), the deletion is rejected as a no-op on a row that no longer has `status = 'waiting'`;
  the caller's client has already observed the `'matched'` transition via Realtime and moved to the
  Lobby room, where `leave` (not `cancel`) is the correct exit action from that point forward.
- **Human never readies in the lobby**: per the auto-launch formula's timeout branch, if
  `lobbyReadyTimeoutS` (default 45s) elapses from lobby formation with that human's `ready` still
  `false`, the lobby force-launches anyway. That human's seat is flagged unready-at-timeout and is
  drafted as an AI-controlled nation at match assembly (carrying forward their default or
  last-chosen `iso`), using the identical disconnect→AI-takeover mechanism `adr-003` defines for an
  expired reconnect grace — not a second mechanism. The human, if they later open the client, finds
  themselves either spectating an AI-piloted nation or back at the main menu, depending on how the
  client's post-timeout UX is implemented (not specified further here — see Dependencies).
- **Bot nation collision avoidance**: bots select `iso` from the roster of playable nations
  excluding every `iso` already claimed — by a human's default/chosen pick at the moment the bot's
  join-delay write lands, and by any earlier bot in the same lobby. Because bot joins are staggered
  (see Formulas) and humans can change `set_iso` at any point before launch, a bot's `iso` choice is
  computed fresh at write time, not reserved in advance; this guarantees no two `lobby_members` rows
  in the same lobby share an `iso` at the moment each bot writes its own. If a human changes nation
  *after* a bot has already picked that same nation, uniqueness is resolved the same way single-
  player setup already resolves it — at `createWorld(setup)` assembly time, not by this document
  introducing a second uniqueness authority (mirrors the prior version's stance on this question).
- **Last human leaves a pre-launch lobby**: if a human calls `leave` on a lobby that has not yet
  reached `starting`, and no other human `lobby_members` row remains in that lobby, the server sets
  `lobbies.status = 'closed'` immediately — this rule takes priority over the auto-launch condition
  even if every bot in that lobby is already `ready = true` (an all-bot lobby is never launched into
  a match; the auto-launch all-ready check is only ever evaluated for lobbies with at least one
  remaining human). Any bot lobby-simulation timers still pending for that lobby (unfired join/ready
  writes) are cancelled and never write to a `closed` lobby's rows.
- **All humans quit mid-match**: unchanged from the prior version. If every human participant
  either explicitly quits or exceeds the 60s reconnect grace (converting to AI) such that zero
  humans remain connected, the match is not kept running indefinitely for AI-vs-AI spectacle — it
  ends immediately, and the server writes the `matches` rows for all humans who were ever part of
  the match using whatever `result` each had earned or been assigned at the moment the last human
  left (win/loss for anyone already decided by the engine's win condition, `quit` for anyone who
  disconnected/quit without the match having resolved in their favor first). Note this can now
  include humans whose seat was never manually readied — they were force-launched as AI at
  `lobbyReadyTimeoutS` and are scored identically to a mid-match disconnect-without-return.
- **Matchmaker/server offline**: if the game server process is down, `matchmaking_queue` rows can
  still be written by `db-lobby` (it is a stateless edge function, independent of the server), but
  nothing ever forms them into a lobby — the caller's row stays `'waiting'` indefinitely. The client
  applies a searching-timeout (mirroring the existing 30s `starting`-watchdog pattern — see Tuning
  Knobs) measured from the moment `quick_match` was called: if no `'matched'` transition is observed
  within that window, the client shows an error ("couldn't find a match — try again") with retry and
  cancel affordances, and calls `cancel` to clear the stale `waiting` row before any retry.
  Single-player's "New Game" remains available with no dependency on the game server, exactly as
  before.
- **Lobby-`starting`-stuck watchdog (unchanged)**: whether `status = 'starting'` was written by an
  all-ready auto-launch or by the `lobbyReadyTimeoutS` force-launch, the same 30s client-observed
  watchdog applies — if no corresponding `status = 'active'` update (with `server_url`/`match_id`
  populated) arrives within 30s, the client treats the lobby as failed-to-start and shows an error.
  Because there is no host in the quick-match flow, the revert-to-`open` behavior the prior version
  described no longer applies (there is no `open` status to revert to); the client instead surfaces
  the error and offers to return to the main menu and press Play again, which starts an entirely new
  quick-match attempt from a clean queue enrollment.
- **Duplicate friend request (unchanged)**: a `request` call where a `pending` or `accepted`
  `friendships` row already exists between the two users (in either direction) is **idempotent** —
  it does not create a second row or error the caller; `db-social` treats it as a no-op success (or,
  for the specific case of an incoming pending request the caller already sent to *them*, it may
  auto-accept rather than silently no-op — either behavior is acceptable so long as the result is
  never a duplicate row or a client-visible error for re-sending a request that already exists).
- **Ready flag stale after a mid-lobby nation change**: no automatic un-readying is specified — a
  player who is `ready = true` and then calls `set_iso` remains `ready` unless they explicitly
  toggle it. This is a deliberate minimalism choice (fewer implicit state transitions), unchanged
  from the prior version's stance; if playtesting shows this causes launches with unintended nation
  picks, revisit as a follow-up, not a blocking gap in this version.

## Dependencies

- **`design/gdd/accounts-and-stats.md`** (Accounts & Player Stats) — this system extends that
  system's identity and `matches` schema rather than replacing it. Provides to this system:
  authenticated `user_id`/`username`, the `profiles` table (widened here to globally-readable for
  search — a change this document owns, not a silent edit to that GDD), and the existing `matches`
  table (this document adds the `mode` column and is the source of `mode: 'online'` rows, written
  by the game server rather than the `db-account` edge function). Requires from this system: the
  `mode` column addition and the online write path be documented here rather than in
  `accounts-and-stats.md`, since that document's `report_match` contract (client-triggered,
  fire-and-forget, one retry) is specific to single-player/local reporting and does not describe
  server-authored rows — a future revision of `accounts-and-stats.md` should cross-reference this
  document for the `mode: 'online'` case rather than this document silently diverging from it.
- **Supabase project "DomeBreak"** (same project as `accounts-and-stats.md`) — provides the
  `friendships`, `matchmaking_queue` (new), `lobbies`, `lobby_members` (gains `is_bot` and
  `display_name`) tables, Realtime, and the `db-social`/`db-lobby` edge functions. Requires from
  this system: standard Supabase client configuration (already present from the accounts system)
  plus a Realtime subscription client for the Searching state (own `matchmaking_queue` row), the
  Lobby room, and (service-role side) for the game server's two subscriptions (`matchmaking_queue`
  filtered to `waiting`, `lobbies` filtered to `starting`).
- **Authoritative game server (component introduced by ADR-0003, extended by ADR-0004)** — provides
  matchmaking (grouping, lobby formation, bot backfill), bot lobby simulation (staggered join/ready),
  auto-launch, match assembly, tick simulation, snapshot broadcast, command validation, and online
  `matches` row authorship. Requires from this system: `matchmaking_queue` rows to carry a correctly
  JWT-derived `user_id` and a valid `enqueued_at`; `lobbies`/`lobby_members` rows (once formed by the
  matchmaker) to be structurally correct and stable by the time `status = 'starting'` is observed
  (every member's `iso`/`ready` finalized or explicitly flagged unready-at-timeout before the claim
  step runs). See `docs/architecture/adr-003-authoritative-server.md` for the claim/tick/broadcast
  decision and `docs/architecture/adr-004-matchmaking-bot-lobby.md` for the matchmaker and bot lobby
  simulation this document's Play-button flow depends on.
- **Engine (`src/game/engine.js`, `src/game/sim/`)** — provides `createWorld`, `step`, and every
  slot-scoped command (`queueUnit`, `commandAttack`, `moveUnit`, `setSail`, `enqueueResearch`,
  `declareWar`, etc.) that both single-player and this system's game server consume identically, plus
  the existing AI draft (`src/game/sim/newGame.js`) and `aiTick` (`src/game/sim/tick.js`) that bot
  `lobby_members` rows and timeout-flagged human seats are converted into at match assembly. Requires
  from this system: nothing — the engine gains no network awareness, no matchmaking awareness, and no
  online-specific branch. Bot lobby-phase behavior (join/pick/ready) lives entirely in the game
  server's control-plane writes, never inside the engine or `aiTick` itself.
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
- **UI: `LiveGame`, the Play button on the main menu / StartMenu, a Searching state, a Lobby room
  component (no host controls), a Friends panel, and a Me badge** — provide the player-facing
  surfaces described in Detailed Rules. Require from this system: the `db-lobby` action set
  (`quick_match`, `cancel`, `set_iso`, `ready`, `leave`), Realtime subscriptions on the caller's own
  `matchmaking_queue` row (Searching state) and on `lobbies`/`lobby_members` (Lobby room), and (for
  the Me badge) the same `player_stats` values `accounts-and-stats.md` already exposes — no new stat
  fields are introduced by this document. The prior Multiplayer screen (lobby browser, Create Lobby)
  and the Lobby room's host-only AI-fill control and Start button are retired surfaces; no UI
  component in this system should reference `create`, `find`, or `set_ai` going forward.
- **Single-player mode** — explicitly untouched. "New Game" against local AI remains the fully
  offline path with no dependency on the game server, the matchmaker, or any table this document
  introduces. No dependency runs from single-player to this system in either direction; this is
  stated to make the boundary unambiguous, not because a real data dependency exists.

## Tuning Knobs

| Knob                             | Category | Range / Values                                                                     | Rationale                                                                                                                                                                                                                     |
| :--- | :--- | :--- | :--- |
| Target nations per quick-match   | Gate     | Default `6`, range 2–16                                                           | Sets both the lobby's seat count and the bot-backfill ceiling (`TARGET_NATIONS − humansGathered`); 6 was chosen as a lively-feeling war room that doesn't demand 16 concurrent humans to feel full. Mirrors `max_players`.  |
| Matchmaking human-match window   | Curve    | Default `6s`                                                                       | Long enough that two humans pressing Play moments apart land together; short enough that a lone player's wait (when skipped, effectively 0s) never feels like the common case is "waiting." Tune against real queue depth. |
| Bot join stagger (`botJoinStaggerS`) | Feel | Default range `[0.4s, 1.6s]`                                                       | Produces a visibly staggered, human-like sequence of seats filling rather than all bots appearing in one frame; tuned by playtest feel, not by a formula.                                                                    |
| Bot ready delay (`botReadyDelayS`)   | Feel | Default range `[1s, 4s]`                                                           | Keeps bots from readying suspiciously instantly after joining; wide enough that the Lobby room's ready countdown feels organic rather than mechanical.                                                                       |
| Lobby-ready max timeout (`lobbyReadyTimeoutS`) | Gate | Default `45s`                                                              | Bounds how long a human can leave the lobby hanging before their seat is force-converted to AI; long enough to pick a nation and hit Ready without feeling rushed, short enough that other members (human or watching bots) aren't stuck indefinitely.                     |
| Server tick rate                | Feel     | Fixed at `10 Hz` for this version                                                  | Matches the responsiveness the deterministic engine already assumes locally (`useEngine`'s per-frame `step` calls); raising it trades server CPU for lower input-to-effect latency, not currently needed at this scale. |
| Snapshot broadcast rate         | Curve    | Fixed at `2 Hz` for this version                                                   | Full-snapshot bandwidth scales with world size and player count; 2 Hz was chosen as "clearly enough to correct drift" without profiling bandwidth at max seats. Revisit once delta encoding (ADR follow-up) lands.      |
| Reconnect grace window          | Gate     | Fixed at `60s`                                                                     | Long enough to survive a phone call, a wifi blip, or an app crash-and-relaunch; short enough that an abandoned match doesn't stall the other players' pacing waiting on a slot that may never return.                   |
| Lobby-`starting`-stuck watchdog | Gate     | Fixed at `30s` (client-observed)                                                   | Balances "give the game server a moment to notice and claim the row" against "don't leave the player staring at a spinner indefinitely if the server is actually down." Reused as-is for the searching-timeout pattern (see Edge Cases). |
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
- Pressing **Play** enrolls the caller in `matchmaking_queue` and immediately shows the Searching
  state ("Searching for commanders…") with a working cancel affordance — verified by inspecting the
  `matchmaking_queue` row created and by confirming `cancel` deletes it and returns to the main menu
  with no lobby ever formed.
- Two accounts pressing Play within `matchWindowS` (default 6s) of each other land in the **same**
  `lobbies` row together — verified by constructing this scenario with two real test accounts and
  inspecting `lobby_members` for both `user_id`s under one `lobby_id`.
- A lone account pressing Play with no other account queued is matched immediately (the human-match
  window is observably skipped, not waited out) against an all-bot roster — verified by timing from
  `quick_match` call to `matchmaking_queue.status = 'matched'` and confirming it is not gated behind
  the full `matchWindowS`.
- Bot `lobby_members` rows appear in the Lobby room over a staggered, non-instantaneous cadence
  (per `botJoinStaggerS`/`botReadyDelayS`), each selecting a **distinct** `iso` (no two members,
  human or bot, share a nation at assembly) and setting their own `ready = true` without any client
  action — verified by observing a real client's Realtime feed across a full bot-fill lobby and
  confirming no `iso` collision and no simultaneous mass-ready.
- The match auto-launches (`lobbies.status` reaches `'starting'`, then `'active'`) the instant every
  member (human and bot) is ready, with **no host role, no AI-count control, and no Start button**
  present anywhere in the client — verified by code inspection (no such component/action exists) and
  by playing a full lobby-to-match transition with zero manual launch interaction.
- A human who never toggles Ready triggers the `lobbyReadyTimeoutS` (default 45s) force-launch, and
  their seat is confirmed AI-controlled in the resulting match (via the same conversion mechanism
  ADR-0003 defines for an expired reconnect) — verified by leaving one seat unready for the full
  timeout and observing that nation is AI-piloted once `status` reaches `'active'`.
- The retired surfaces — the lobby browser, Create Lobby, the host-only AI-count stepper, and the
  Start button — are absent from the client, and `db-lobby` no longer accepts `create`, `find`, or
  `set_ai` on the player-facing path (calls to those actions are rejected or simply do not exist in
  the deployed function) — verified by code inspection and by attempting each retired action.
- A running match enforces the command whitelist and slot-forcing: a scripted/forged WebSocket
  message attempting to act on another player's slot, or to call a non-whitelisted action, is
  rejected by the server and produces no state change for the targeted slot.
- Disconnecting a client mid-match and reconnecting within 60s resumes the same nation under the
  same player with no AI takeover having occurred (confirmed by no `matches` `quit` row being
  written for that participant when the match later concludes with them as winner/loser normally).
- Disconnecting a client mid-match and not reconnecting within 60s results in that nation
  continuing under AI control, and a `matches` row with `result: 'quit'` and `mode: 'online'` for
  that human once the match ends.
- If every human participant quits or times out (mid-lobby via `lobbyReadyTimeoutS`, or mid-match
  via the 60s reconnect grace) with no reconnect, the match does not run indefinitely as AI-vs-AI —
  it ends immediately, and every human who was ever part of the match has exactly one `matches` row
  written reflecting their state at the moment the last human departed.
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
- Bot `lobby_members` render with the same row treatment as human members in the Lobby room (no
  visible "BOT" label or distinct styling) — confirmed by screenshot/visual comparison of a human
  row and a bot row in the same lobby.
- The Me badge, Friends panel, Play button/Searching state, and Lobby room are each reachable from
  the relevant menu/in-game context and reflect live state (seat fills, ready toggles, friend
  request changes) without a manual page refresh, verified with two simultaneous test clients.

<br />

<p align="center">
  <sub>The stakes turn real when the pressure comes from another commander's decisions, not a script.</sub>
</p>
