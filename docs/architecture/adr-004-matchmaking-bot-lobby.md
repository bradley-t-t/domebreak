<h1 align="center">ADR-0004: Server-Owned Matchmaking & Bot Lobby Simulation</h1>

<p align="center">
  <b>One Play button enrolls a commander in a queue; the authoritative server groups waiting humans within a short window, backfills the rest with bot lobby members that visibly pick nations and ready up, and auto-launches the match — no host, no lobby browser.</b>
</p>

<br />

## Status

**Amended (2026-07-06) — real players only, bots removed.** The server-owned
matchmaking, queue-grouping, no-host/no-browser, and auto-launch decisions below
stand. The **bot-lobby backfill is removed**: a match now forms only once at
least `MIN_PLAYERS` (default 2) real players are queued — admitting up to
`MAX_PLAYERS` (default 6) — and a lone waiter simply keeps waiting. Each player
claims their own nation inside the **full living world** (every other country is
world AI, exactly as in single player), rather than the world being limited to
the lobby roster. `TARGET_NATIONS` and all `BOT_*` tuning are gone; see
`server/config.js` (`MIN_PLAYERS`/`MAX_PLAYERS`), `server/matchmaker.js`, and
`server/match.js`. The "Bot Lobby Simulation" sections below are retained as
historical record of the superseded approach.

## Date

2026-07-06

## Last Verified

2026-07-06

## Decision Makers

Trenton Taylor (creative/technical director), Sunday (agent)

## Summary

DomeBreak's online entry was a three-door Multiplayer screen (Find Game / Create
Lobby / live lobby browser) with a human host who set an AI-fill count and clicked
Start. We are replacing all of it with a single **Play** button that enrolls the
commander in a matchmaking queue. The **authoritative game server** (the same
process introduced in ADR-0003) gains a second responsibility beyond claiming
`starting` lobbies: it runs the matchmaker. It groups waiting humans within a short
window, forms the lobby, backfills empty seats with **bot lobby members** — real
`lobby_members` rows (`is_bot = true`) that stagger their join, pick distinct
nations, and ready up like players — and **auto-launches** the moment every member
is ready (or a timeout fires). When no other humans are queueing, the lone player
is matched immediately against an all-bot roster. Match formation, bot simulation,
and launch are all server-owned and driven over the same outbound-only Realtime
pattern ADR-0003 established; the edge function only enrolls and cancels queue
entries.

## Engine Compatibility

| Field                     | Value                                                                                                                                                                                                                                                    |
| :--- | :--- |
| **Engine**                | DomeBreak custom tick engine (`src/game/engine.js`, `src/game/sim/`) — JavaScript, no third-party game engine                                                                                                                                          |
| **Domain**                | Networking / Matchmaking (control-plane orchestration + lobby simulation) — reuses the simulation and the AI draft, does not modify the engine                                                                                                          |
| **Knowledge Risk**        | LOW — a queue table, an outbound Realtime subscription with the service-role key, and timed writes to `lobby_members` are all stable, well-understood patterns already proven by ADR-0003's claim path                                                   |
| **References Consulted**  | `docs/architecture/adr-003-authoritative-server.md`, `docs/architecture/adr-001-supabase-accounts.md`, `design/gdd/multiplayer-matchmaking-social.md`, `src/game/sim/newGame.js` (AI draft), `src/game/sim/tick.js` (`aiTick`), `server/match.js`, `server/index.js`, `src/account/lobby.js` |
| **Post-Cutoff APIs Used** | None                                                                                                                                                                                                                                                    |
| **Verification Required** | None beyond the Validation Criteria below — no engine-version dependency; the matchmaker consumes the same engine draft/AI already used by single-player and attract mode                                                                                |

## ADR Dependencies

| Field             | Value                                                                                                                                                                                                                                                                                    |
| :--- | :--- |
| **Depends On**    | ADR-0003 (Authoritative Game Server) — reuses its long-lived Node process, its outbound service-role Realtime subscription pattern, its lobby-claim CAS discipline, and its JWT verification; the matchmaker is a second subscription/loop inside that same process. Also ADR-0001 (Supabase Accounts) for JWT-derived identity in the `db-lobby` enroll/cancel actions. |
| **Enables**       | The one-click quick-match flow in `design/gdd/multiplayer-matchmaking-social.md`; a future skill-based / rating-aware matchmaker; a future public-internet queue once ADR-0003's tunnel follow-up lands                                                                                    |
| **Blocks**        | Any story implementing the Play button, the Searching state, the `quick_match`/`cancel` edge-function actions, the `matchmaking_queue` table, bot lobby members, or auto-launch — none of that can be built until this ADR is Accepted                                                     |
| **Ordering Note** | This ADR assumes ADR-0003's server, `lobbies`/`lobby_members` schema, and `db-lobby` edge function already exist; it adds the `matchmaking_queue` table, the `lobby_members.is_bot` column, two edge-function actions, and a matchmaker loop to that existing infrastructure               |

## Context

### Problem Statement

The existing online entry asks the player to make choices before they can play:
browse a list of open lobbies, or create one and become a host, then manually set
how many AI opponents to add, wait for other humans to ready, and click Start. For
a game whose single-player loop sells "one more match" with zero friction, this is
a wall. Worse, when nobody else is online the browser is empty and Create-then-set-
AI-count is the only path — the player is doing lobby administration to fight bots
they could already fight offline. We want a single Play button that always drops the
commander into a live match quickly: with real humans when any are available, and
with convincing bot opponents when they are not — and we want those bots to inhabit
the same lobby the humans see, filling seats and readying up, so a match against
fill-in bots still feels like a war room of commanders rather than a difficulty
slider.

A DomeBreak-specific constraint carries over unchanged from ADR-0003: **the game
server has no public inbound path.** It lives on the Sunday host (Raspberry Pi 5)
behind a home network / Tailscale. Any coordination between the Supabase control
plane and the server must be initiated *from* the server (outbound). So the
matchmaker cannot be "the edge function calls the server to form a match"; the
server has to pull queue state itself, exactly as it already pulls `starting`
lobbies.

### Current State

Per ADR-0003 and `design/gdd/multiplayer-matchmaking-social.md` as originally
written:

- `db-lobby` exposes `create`, `join`, `leave`, `set_iso`, `ready`, `set_ai`,
  `start`, `find`. `find` is a one-shot "join the oldest open lobby or create one";
  there is no persistent queue and no attempt to gather multiple humans arriving
  within a time window.
- `ai_slots` on a `lobbies` row is a plain integer the host sets via `set_ai`. AI
  nations do not exist as `lobby_members`; they are drafted only at match assembly,
  invisible in the lobby. The lobby shows only human seats.
- Launch is a host action: `start` (host-only, requires all humans ready) sets
  `status = 'starting'`, which the server claims.
- The client drives all of this through a Multiplayer screen (browser + Create +
  Find) and a Lobby room with host-only AI-count and Start controls.

Nothing in the current design gathers concurrently-queueing humans, represents
bots as lobby participants, or launches without a human pressing a button.

### Constraints

- **Outbound-only from the private host.** Same as ADR-0003 — the matchmaker must
  be a subscription/loop the server initiates, never an inbound call into it.
- **Reuse ADR-0003's server, not a new service.** The matchmaker is additional
  logic inside the single existing Node process (a second Realtime subscription and
  a timer-driven loop), not a separate matchmaking microservice — solo-dev
  operational simplicity is a hard ceiling.
- **Reuse the existing AI, not a new bot brain.** In-match, bot nations must be the
  same `isAi` nations `aiTick` already drives (`src/game/sim/tick.js`) drafted the
  same way single-player and attract mode draft them (`src/game/sim/newGame.js`).
  This ADR adds *lobby-phase* bot behavior (join/pick/ready), not a new in-game AI.
- **Identity stays JWT-derived.** The `quick_match`/`cancel` actions must derive the
  acting `user_id` from the verified JWT, never a client-supplied id — identical
  discipline to `db-account`/`db-lobby` today.
- **Bots are indistinguishable-by-default in the lobby.** `is_bot` is an internal
  flag for the server and match assembly; the lobby renders bot members with the
  same row treatment as humans (a plausible callsign, a nation, a ready flag). The
  design goal is a populated war room, not a labeled AI list.

### Requirements

- One Play action enrolls the caller in a queue and yields a "searching" state with
  a cancel path; no lobby browser, no create, no host role, no manual AI count, no
  Start button anywhere in the quick-match flow.
- Multiple humans who press Play within a short window are grouped into the **same**
  match; a lone human is matched immediately with bots and no perceptible wait.
- Empty seats are filled with bot `lobby_members` that visibly join, pick distinct
  nations, and ready up on a human-like cadence.
- The match auto-launches when every member (human and bot) is ready, or when a
  bounded lobby timeout elapses; an unready human at timeout does not deadlock the
  match.
- All formation, bot simulation, and launch are server-owned over outbound-only
  connections; the edge function only enrolls/cancels queue entries.

## Decision

Add a **matchmaker** to the ADR-0003 game server: a second outbound Realtime
subscription (service-role key) on a new `matchmaking_queue` table, plus a
timer-driven sweep, both living in the same Node process that already claims
`starting` lobbies. The `db-lobby` edge function gains exactly two player-facing
actions — `quick_match` (enroll the JWT-derived caller as a `waiting` queue row)
and `cancel` (delete the caller's `waiting` row) — and the old `create`, `find`,
and host-only `set_ai` actions are removed from the quick-match flow. `start`
survives only as the internal `status = 'starting'` transition, now written by the
server's auto-launch rather than a host button.

The matchmaker forms matches as follows:

1. **Group.** Among `waiting` queue rows, open a forming group anchored on the
   oldest waiter. Admit further waiters into that group until it reaches
   `TARGET_NATIONS` humans or the human-match window (`matchWindowS`, default 6s
   measured from the anchor's `enqueued_at`) elapses — whichever comes first. A lone
   waiter whose window elapses with no company forms a group of one. There is no
   minimum human count: the window is the only wait, and it is skipped entirely for
   a group that fills.
2. **Form the lobby.** Create one `lobbies` row (server as owner; no human host
   role), insert a `lobby_members` row per grouped human (`is_bot = false`, each
   given a reserved `slot` and a default `iso`), and insert
   `TARGET_NATIONS − humansGathered` **bot** `lobby_members` rows (`is_bot = true`,
   each a plausible commander callsign, a reserved `slot`, `ready = false`, `iso`
   unset for now). Set each grouped human's `matchmaking_queue.status = 'matched'`
   with the new `lobby_id`.
3. **Hand the clients to the lobby.** Matched clients — already subscribed to their
   own `matchmaking_queue` row via Realtime — observe `status = 'matched'` + the
   `lobby_id`, drop the Searching state, and subscribe to that `lobbies` /
   `lobby_members` set exactly as the lobby room already does. They see every seat,
   human and bot.
4. **Simulate the bots.** Over the next few seconds the server writes each bot's
   `iso` (a distinct nation, avoiding collisions with human picks and other bots)
   and then, after a per-bot human-like delay (`botReadyDelayS`, staggered), sets
   the bot's `ready = true`. Humans pick their own nation (`set_iso`) and toggle
   `ready` in the lobby UI; they enter with a changeable default nation so a
   zero-interaction human still has a valid seat.
5. **Auto-launch.** When **every** member row has `ready = true`, the server sets
   `lobbies.status = 'starting'`. If instead `lobbyReadyTimeoutS` (default 45s)
   elapses first, the server force-launches anyway: any still-unready human seat is
   flagged so that match assembly converts it to an `isAi` nation (the same
   conversion ADR-0003 already performs for a disconnect that outlives the 60s
   grace). Either way, the resulting `status = 'starting'` is claimed by ADR-0003's
   existing claim path, and `createWorld(setup)` maps every `lobby_members` row —
   human and bot alike — to a slot/`iso`, with `is_bot = true` rows (and force-
   launched unready humans) drafted as `isAi` nations that `aiTick` drives.

Nothing about ADR-0003's tick loop, snapshot broadcast, JWT-per-WebSocket, command
whitelist, reconnect grace, or `matches` authorship changes. This ADR is purely a
front-of-match orchestration layer that produces the same well-formed `starting`
lobby ADR-0003 already knows how to consume — it simply produces it from a queue and
bot fill instead of from a human host clicking Start.

### Architecture

```
                          ┌──────────────────────────┐
  Play ─────────────────► │  db-lobby edge function  │
  (quick_match / cancel)  │  JWT ➜ user_id           │
                          │  writes matchmaking_queue │
                          └───────────┬──────────────┘
                                      │ (client also SUBSCRIBES to its own
                                      │  matchmaking_queue row via Realtime)
                                      ▼
                          ┌───────────────────────────────────────────────┐
                          │  Supabase "DomeBreak" project                │
                          │  matchmaking_queue {user_id,iso?,enqueued_at,  │
                          │                     status,lobby_id?}           │
                          │  lobbies / lobby_members (+ is_bot column)      │
                          └───────────┬───────────────────────────────────┘
                                      ▲   OUTBOUND ONLY (service-role):
                                      │   (a) subscribe matchmaking_queue.status='waiting'
                                      │   (b) subscribe lobbies.status='starting'  (ADR-0003)
                                      │
      ┌───────────────────────────────┴───────────────────────────────────┐
      │            Authoritative Game Server (Node, ADR-0003)              │
      │                                                                     │
      │  MATCHMAKER (this ADR):                                            │
      │   - group waiting humans within matchWindowS                       │
      │   - create lobby; insert human + BOT lobby_members (is_bot=true)   │
      │   - set queue rows status='matched' + lobby_id                     │
      │   - simulate bots: staggered iso pick + ready writes               │
      │   - auto-launch: all ready ∨ lobbyReadyTimeoutS ➜ status='starting'│
      │                                                                     │
      │  CLAIM + MATCH (ADR-0003, unchanged):                              │
      │   - claim starting lobby ➜ createWorld(setup)                      │
      │   - bot members + unready humans ➜ isAi nations (aiTick)           │
      │   - tick 10Hz / broadcast 2Hz / matches rows on game over          │
      └─────────────────────────────────────────────────────────────────────┘
```

### Key Interfaces

```ts
// db-lobby gains two player-facing actions (identity from verified JWT only).
// quick_match: enroll caller as a 'waiting' queue row (no-op if already waiting).
// cancel:      delete caller's 'waiting' row (no-op if none / already matched).
type LobbyAction =
  | { action: "quick_match"; iso?: string }   // optional nation preference
  | { action: "cancel" }
  | { action: "set_iso"; lobbyId: string; iso: string }  // unchanged
  | { action: "ready";   lobbyId: string; ready: boolean } // unchanged
  | { action: "leave";   lobbyId: string };                // unchanged
// REMOVED from the quick-match flow: create, find, set_ai. `start` is no longer
// a client action — it is the server's auto-launch status write.

// New control-plane table.
type MatchmakingQueueRow = {
  user_id: string;              // JWT-derived, never client-supplied
  iso: string | null;          // optional nation preference
  enqueued_at: string;          // timestamptz; anchor + window are computed from this
  status: "waiting" | "matched";
  lobby_id: string | null;      // set by the server when the caller is placed
};

// lobby_members gains one column; bot rows are otherwise structurally identical
// to human rows, which is what lets the lobby render them the same.
type LobbyMemberRow = {
  lobby_id: string; user_id: string | null; // null user_id allowed for bots
  slot: number; iso: string | null; ready: boolean;
  is_bot: boolean;             // NEW — internal; drives isAi mapping at assembly
  display_name: string;        // human username or bot callsign
};

// Server-side matchmaker tuning (env / config.js), all with GDD-defined defaults.
type MatchmakerConfig = {
  targetNations: number;       // default 6   (2..16)
  matchWindowS: number;        // default 6   human-gather window from the anchor
  botJoinStaggerS: [number, number];  // default [0.4, 1.6] per-bot appear delay
  botReadyDelayS:  [number, number];  // default [1, 4]     per-bot ready delay
  lobbyReadyTimeoutS: number;  // default 45  force-launch ceiling
};
```

### Implementation Guidelines

- The matchmaker is a second outbound subscription **inside ADR-0003's existing
  process** (service-role key, `matchmaking_queue` filtered to `status='waiting'`),
  paired with a periodic sweep so window expiry fires even with no new queue events.
  Do not stand up a separate service.
- Group formation and every `lobbies`/`lobby_members`/`matchmaking_queue` write the
  matchmaker performs use the **service-role key** and never trust a client-supplied
  identity — the same key-handling discipline ADR-0001/ADR-0003 already require. The
  key stays in the server process env, never in any client bundle.
- Bot `iso` selection must guarantee **distinct nations** across the assembled
  lobby: pick from the great-power roster excluding isos already taken by humans or
  earlier bots. If humans change nations after bots have picked, collision handling
  is resolved at assembly by the same nation-uniqueness rule single-player setup
  already applies — the matchmaker is not the sole uniqueness authority.
- Bot lobby behavior is **timed writes only** (set `iso`, later set `ready`). Bots
  do not connect WebSockets, do not authenticate, and never enter the command path;
  they exist as data rows until match assembly turns them into `isAi` nations. The
  in-match bot brain remains `aiTick` — unchanged and not touched by this ADR.
- Auto-launch must fire on an **all-ready check performed server-side** (the server
  owns the authoritative member set), not inferred from a client. The
  `lobbyReadyTimeoutS` force-launch must reuse ADR-0003's disconnect→AI conversion
  for unready human seats rather than introducing a second AI-takeover mechanism.
- `quick_match` must be **idempotent** (re-enrolling an already-`waiting` caller is a
  no-op success, not a duplicate row) and `cancel` must be safe to call when the
  caller has no `waiting` row (no-op success). A caller already `matched` cannot be
  cancelled out of a formed lobby via `cancel` — they use `leave` on the lobby,
  exactly as today.
- The `matchmaking_queue` table needs RLS consistent with the rest of the control
  plane: a caller may read/subscribe to **their own** row (to observe the `matched`
  transition); all writes go through `db-lobby` under the service-role path, never a
  direct client insert/update.

## Alternatives Considered

### Alternative 1: Edge-function matchmaker (form the match in `db-lobby`)

- **Description**: Put the grouping/bot-fill/auto-launch logic in the `db-lobby`
  edge function itself — e.g. a `quick_match` call that, on the server side of
  Supabase, gathers waiters and writes the lobby.
- **Pros**: No new server responsibility; keeps matchmaking in the already-managed,
  publicly-reachable edge runtime; nothing new to keep alive on the Pi.
- **Cons**: Edge functions are **stateless and short-lived** — they cannot hold a
  forming group open for a 6s window or emit staggered bot ready-ups over several
  seconds without an external scheduler/cron, which is more moving parts than the
  server already provides. Timed, multi-second, stateful orchestration is exactly
  what a long-lived process is for, and ADR-0003 already runs one. Splitting
  matchmaking (edge) from claim/tick (server) would also fragment the lobby
  lifecycle across two runtimes with different failure modes.
- **Rejection Reason**: The behavior is inherently stateful and time-extended; the
  authoritative server already exists, already subscribes outbound, and already owns
  the downstream half of the lobby lifecycle. Consolidating matchmaking there is
  simpler than bolting a scheduler onto stateless functions.

### Alternative 2: Client-side bot games (quick-match runs locally against local AI)

- **Description**: When no humans are available, skip the server entirely and start
  a local single-player-style match against the existing local AI, only using the
  server when real humans match.
- **Pros**: Zero server load and instant start for the common solo case; naturally
  offline-capable per ADR-0002.
- **Cons**: Two code paths for "a quick match" (local vs server) that must stay
  behaviorally identical, and the bot-fill case would not exercise the online path
  at all — so a human joining a "bot game" already in progress is impossible, and
  the lobby-simulation fantasy (watching a war room fill) has to be faked twice.
  Trenton explicitly chose a single server-owned path so every quick-match, bots or
  not, is the same match type and remains joinable/consistent.
- **Rejection Reason**: Director decision — one unified server path over a
  local/online fork, accepting the server dependency for the solo-vs-bots case in
  exchange for a single code path and future joinability. (Offline play remains
  served by the untouched single-player "New Game" entry, not by quick-match.)

### Alternative 3: Keep the lobby browser; only add a "Quick Play" shortcut

- **Description**: Leave Find/Create/browse in place and add a Play button beside
  them as a convenience.
- **Pros**: Least disruptive; preserves named lobbies and inviting specific people.
- **Cons**: Keeps the exact friction the change exists to remove, doubles the
  surfaces to maintain, and still leaves the empty-browser / manual-AI-count problem
  as the fallback the shortcut lands in. Bots-as-lobby-members and auto-launch would
  have to coexist with host-driven manual launch, complicating both.
- **Rejection Reason**: Director chose to replace the browse/create/find surfaces
  outright — one entry, always quick-matched. A friends/custom-lobby path can return
  later as its own scoped feature rather than as retained legacy UI.

## Consequences

### Positive

- One-click entry: pressing Play always yields a live match promptly — real humans
  when queueing overlaps, bots when it does not — with no lobby administration.
- Bots inhabit the same lobby humans see, so a fill-in match reads as a populated
  war room rather than an AI-count slider; the online path is exercised even for
  solo-vs-bots.
- The matchmaker produces exactly the well-formed `starting` lobby ADR-0003 already
  consumes, so the entire claim/tick/broadcast/reconnect/reporting half is reused
  unchanged — this ADR adds a front-end orchestration layer, not a second match
  engine.
- In-match AI is the existing `aiTick`; the only new "AI" is a handful of timed
  lobby writes, which are trivial to reason about and cheap to run.
- Auto-launch removes the "host forgot to press Start" and "waiting on a host who
  left" failure modes entirely.

### Negative

- The game server gains a second always-on responsibility (the matchmaker loop);
  if the Sunday host is down, quick-match cannot form matches at all — a strictly
  larger dependency surface than the old edge-function `find`, which could at least
  create an (unstartable) lobby. Mitigated by the same offline escape as ever:
  single-player "New Game" needs no server.
- Bots that fill unmatched seats can be perceived as "not real players." The design
  keeps them indistinguishable by default, but a determined human inspecting timing
  or network traffic can tell; this is accepted at the current stage (the same
  trusted-client posture ADR-0003 already documents) and is not appropriate for a
  ranked mode without revisiting.
- A short but real matchmaking window (default 6s) is added for the multi-human
  case; a lone player skips it, but two humans who *just* miss each other's window
  can end up in separate bot-filled matches rather than together. Tunable, and an
  acceptable simplicity trade at current population.

### Neutral

- `find`/`create`/`set_ai` leave the player-facing surface. They are removed from
  the quick-match flow rather than kept as dead actions; a future custom-lobby /
  friends-invite feature may reintroduce a subset deliberately, as its own decision.
- Skill/rating-aware grouping is explicitly out of scope — grouping is time-window
  FIFO on the queue. A rated matchmaker can supersede the grouping step later
  without touching bot simulation or auto-launch.

## Risks

| Risk                                                                                   | Probability            | Impact                                                                                             | Mitigation                                                                                                                                                                                             |
| :--- | :--- | :--- | :--- |
| Matchmaker forms a lobby but a bot never readies (bug/exception), so it never launches | Low                    | Medium — the match hangs at the lobby with no host to intervene                                    | The `lobbyReadyTimeoutS` (default 45s) force-launch is an unconditional ceiling: it fires on wall-clock regardless of member ready state, converting any unready seat (human or bot) to AI at assembly |
| Two humans queueing within the window still land in different matches (window edge)    | Medium                 | Low — both still get a prompt match, just with more bots than intended                             | `matchWindowS` is a tuning knob; grouping anchors on the oldest waiter so overlap widens as population grows; acceptable at current small population                                                    |
| Bots feel obviously fake (identical timing, robotic names, colliding nations)          | Medium                 | Low–Medium — undercuts the "war room of commanders" fantasy                                        | Staggered join/ready delays are randomized ranges, callsigns come from a plausible pool, and nation selection is guaranteed-distinct; all are knobs tunable from playtest feedback                     |
| Server (matchmaker) offline — Play produces a queue row nobody ever forms into a match  | Low–Medium             | Medium — the player waits in Searching indefinitely                                                | A client-side searching timeout surfaces "couldn't find a match — try again" and offers to cancel/retry, mirroring ADR-0003's 30s `starting` watchdog; single-player remains available offline         |
| `matchmaking_queue` RLS misconfigured, leaking others' queue rows                       | Low                    | Low — queue membership is not sensitive, but still should be own-row-only                          | RLS mirrors the rest of the control plane: read/subscribe own row only, all writes via `db-lobby` service-role path; verified with a second test account                                               |

## Performance Implications

| Metric                  | Before (ADR-0003 only)                          | Expected After                                                                                                                        | Budget                                                                                                                     |
| :--- | :--- | :--- | :--- |
| CPU (server)            | One `step` per tick per active match            | Adds a lightweight matchmaker loop: a Realtime handler + a periodic sweep doing set arithmetic and a handful of row writes per formed match — negligible next to the tick loop | Must stay well under the tick budget; matchmaking work is I/O-bound row writes, not simulation                            |
| Memory (server)         | One `world` per active match                    | Adds small in-memory forming-group and per-lobby bot-timer state; bytes per pending lobby                                             | Negligible at solo-dev match volume                                                                                       |
| Load Time (to match)    | Host-paced (could be minutes waiting on humans) | Lone player: immediate (window skipped). Grouped: ≤ `matchWindowS` (6s) then bot-fill + bot ready cadence, all comfortably < the 45s ceiling | Perceived "time to war" must be seconds for the solo case; bounded by `lobbyReadyTimeoutS` in the worst case              |
| Network (control plane) | Realtime on `lobbies`/`lobby_members`           | Adds Realtime on `matchmaking_queue` (own-row per client; `waiting`-filtered for the server) plus the bot-simulation `lobby_members` writes | Small: a few row writes per match formation and per bot; well within Realtime/edge limits at current scale                |

## Migration Plan

Additive to ADR-0003's rollout — the authoritative server, `lobbies`/
`lobby_members`, and `db-lobby` already exist. Steps:

1. **Schema**: add the `matchmaking_queue` table (+ RLS: own-row read/subscribe,
   writes via `db-lobby` service-role) and the `lobby_members.is_bot` column
   (default `false`) in the DomeBreak project. Verify: a `quick_match` call from a
   real account creates exactly one `waiting` row keyed to the JWT identity, and a
   second account cannot read it.
2. **Edge function**: add `quick_match` + `cancel` to `db-lobby`; remove `create`,
   `find`, `set_ai` from the player path. Verify: enroll/cancel idempotency and
   JWT-derived identity on a second account.
3. **Matchmaker loop (server)**: outbound `waiting` subscription + sweep, group
   formation, lobby creation, human + bot `lobby_members` insertion, queue rows →
   `matched`. Verify: one human queueing alone forms a bot-filled lobby immediately;
   two humans within the window land in the same lobby; the window elapses correctly
   for a lone waiter.
4. **Bot lobby simulation**: staggered `iso` pick (distinct) + staggered `ready`
   writes per bot. Verify: bots appear, take distinct nations, and ready up over a
   few seconds, visible to a real client via Realtime.
5. **Auto-launch**: all-ready check + `lobbyReadyTimeoutS` force-launch with unready-
   human→AI flagging into `createWorld(setup)`. Verify: a lobby with all members
   ready flips to `starting` and is claimed; a human who never readies triggers the
   timeout and starts with their seat AI-controlled.
6. **Client**: Play button + Searching state (own queue-row subscription + cancel)
   + Lobby room refactor (no host controls, bots rendered as members) + removal of
   the Multiplayer browse/create screen. Verify: the full one-click flow end to end
   with two real clients and with one client + bots.

**Rollback plan**: Because quick-match is additive and single-player is untouched,
rollback is "do not ship the Play button / do not run the matchmaker loop." Reverting
the edge-function actions and hiding the Play entry restores the prior behavior; the
`matchmaking_queue` table and `is_bot` column are inert if unused.

## Validation Criteria

- [ ] Pressing Play with no other humans queueing yields a live match against bots
  with no perceptible wait (the human-match window is skipped for a lone waiter).
- [ ] Two accounts pressing Play within `matchWindowS` are placed in the **same**
  lobby together, with the remaining seats filled by bots.
- [ ] Bot `lobby_members` appear as members, select **distinct** nations (no two
  members share an `iso` at assembly), and set their own `ready` flags on a
  staggered, non-instantaneous cadence, all observable on a real client via Realtime.
- [ ] The match auto-launches (`status = 'starting'` → claimed → `active`) the moment
  every member is ready, with **no** host action and no Start button present anywhere.
- [ ] A human who never readies causes the lobby to force-launch at
  `lobbyReadyTimeoutS`, and their seat is AI-controlled in the resulting match (via
  the same conversion ADR-0003 uses for an expired disconnect), not a deadlock.
- [ ] `quick_match` is idempotent (no duplicate `waiting` rows) and `cancel` removes
  the caller from the queue; a caller may read/subscribe only to their own
  `matchmaking_queue` row.
- [ ] The former surfaces — lobby browser, Create Lobby, host AI-count stepper, and
  Start button — are absent from the client; `db-lobby` no longer exposes
  `create`/`find`/`set_ai` on the player path.
- [ ] The matchmaker uses only outbound connections from the private host (a Realtime
  subscription + row writes with the service-role key); no inbound call into the game
  server exists for match formation.
- [ ] `src/game/engine.js` and `aiTick` are unchanged by this ADR — bots in-match are
  the existing `isAi` nations; confirmed by diff review showing no engine/AI edits.

## GDD Requirements Addressed

| GDD Document                                   | System                             | Requirement                                                                                                              | How This ADR Satisfies It                                                                                                                                                                              |
| :--- | :--- | :--- | :--- |
| `design/gdd/multiplayer-matchmaking-social.md` | Multiplayer, Matchmaking & Friends | "One Play button enrolls the commander in a matchmaking queue; no lobby browser, no host, no manual AI count, no Start"  | The `quick_match`/`cancel` edge actions + Searching state replace the browse/create/find surfaces; `set_ai`/host `start` are removed, per the Decision and Migration Plan above.                        |
| `design/gdd/multiplayer-matchmaking-social.md` | Multiplayer, Matchmaking & Friends | "Group humans arriving within a short window; match a lone player immediately with bots"                                 | The matchmaker's window-based grouping (anchor + `matchWindowS`, skipped when a group fills or a lone waiter's window elapses) implements exactly this.                                                 |
| `design/gdd/multiplayer-matchmaking-social.md` | Multiplayer, Matchmaking & Friends | "Bots are lobby members that visibly join, pick distinct nations, and ready up like players"                            | Bot `lobby_members` rows (`is_bot=true`) with staggered `iso`/`ready` writes and guaranteed-distinct nations, rendered identically to humans, per Decision step 4 and the Implementation Guidelines.   |
| `design/gdd/multiplayer-matchmaking-social.md` | Multiplayer, Matchmaking & Friends | "The match auto-launches when all members are ready, with a bounded timeout fallback"                                    | Server-side all-ready check → `status='starting'`, with `lobbyReadyTimeoutS` force-launch converting unready human seats to AI at assembly, per Decision step 5.                                        |
| `design/gdd/multiplayer-matchmaking-social.md` | Multiplayer, Matchmaking & Friends | "In-match bots are the existing AI; formation is server-owned and outbound-only"                                        | Bot members map to `isAi` nations driven by the unchanged `aiTick`; all formation is a second outbound Realtime subscription in ADR-0003's process, per Engine Compatibility and Implementation Guidelines. |

## Related

- `docs/architecture/adr-003-authoritative-server.md` — the authoritative game
  server this ADR extends; the matchmaker is a second outbound subscription inside
  that same process, and it produces the `starting` lobby ADR-0003's claim path
  consumes unchanged.
- `docs/architecture/adr-001-supabase-accounts.md` — the JWT-verification and
  service-role-key discipline the `quick_match`/`cancel` actions and the matchmaker's
  writes reuse.
- `design/gdd/multiplayer-matchmaking-social.md` — the gameplay-facing design this
  ADR backs; the source of the one-click flow, bot-lobby-member behavior, auto-launch
  rules, and the tuning knobs this ADR implements.
- `src/game/sim/newGame.js` / `src/game/sim/tick.js` — the existing AI draft and
  `aiTick` that in-match bots reuse without modification.
