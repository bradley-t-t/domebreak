<h1 align="center">ADR-0003: Authoritative Game Server</h1>

<p align="center">
  <b>A single authoritative Node server reuses the deterministic engine, claims lobbies over outbound Realtime, and streams full-world snapshots that always win.</b>
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

GoldenDome's online mode needs a shared, cheat-resistant simulation that every connected client
agrees on. We stood up a single authoritative Node game server that imports the same deterministic
engine module the browser uses (`src/game/engine.js`), claims lobbies out of Supabase once they are
marked `starting` (via an outbound Realtime subscription, since edge functions cannot reach the
server's private host), and streams full-world snapshots to clients at a fixed cadence while each
client runs local prediction against the identical engine `step` for smoothness between snapshots.

## Engine Compatibility

| Field                     | Value                                                                                                                                                                                                                                                                                                                       |
| :--- | :--- |
| **Engine**                | GoldenDome custom tick engine (`src/game/engine.js`, `src/game/sim/`) — JavaScript, no third-party game engine                                                                                                                                                                                                              |
| **Domain**                | Networking / Core simulation (authoritative server, snapshot sync) — reuses the simulation, does not modify it                                                                                                                                                                                                              |
| **Knowledge Risk**        | LOW — Node WebSocket servers, Supabase Realtime subscriptions with the service-role key, and JSON snapshot broadcast are all stable, well-documented patterns                                                                                                                                                               |
| **References Consulted**  | `docs/spec.md` (existing `gd-match` edge-function-authoritative pattern), `docs/architecture/adr-001-supabase-accounts.md`, `src/game/engine.js`, `src/game/sim/tick.js`, `src/game/sim/production.js`, `src/ui/hooks/useEngine.js`, `design/gdd/multiplayer-matchmaking-social.md`, `design/gdd/sensors-and-fog-of-war.md` |
| **Post-Cutoff APIs Used** | None                                                                                                                                                                                                                                                                                                                        |
| **Verification Required** | None beyond the Validation Criteria below — no engine-version dependency; the server consumes engine exports that already exist                                                                                                                                                                                             |

## ADR Dependencies

| Field             | Value                                                                                                                                                                                                                                                                                 |
| :--- | :--- |
| **Depends On**    | ADR-0001 (Supabase Accounts) — reuses its JWT-verification pattern and its Supabase project; this ADR adds tables/functions to the same project rather than a new one                                                                                                                 |
| **Enables**       | `design/gdd/multiplayer-matchmaking-social.md` (this ADR is its technical backing); a future delta-encoding ADR; a future server-side fog-of-war filtering ADR                                                                                                                        |
| **Blocks**        | Any story implementing lobby `start`/game-server claim/snapshot broadcast — none of that can be built until this ADR is Accepted                                                                                                                                                      |
| **Ordering Note** | This ADR assumes the control-plane schema (`friendships`, `lobbies`, `lobby_members`, `gd-social`, `gd-lobby`) described in `multiplayer-matchmaking-social.md` exists first; the game server is the consumer of `lobbies.status = 'starting'`, not the producer of the schema itself |

## Context

### Problem Statement

Online play needs one agreed-upon outcome for every connected player, and it needs to resist a
modified client lying about its own state. GoldenDome's engine (`src/game/engine.js`) is already
"pure and deterministic given its seed" (`docs/spec.md`), which makes it tempting to run the exact
same simulation independently on every client and only exchange the small set of player commands —
a **lockstep** model. That temptation has to be weighed against what actually matters for this
game: a real-time missile exchange with continuous, fine-grained movement (missiles, aircraft,
ships all interpolating smoothly at up to 10× speed in single-player), many command types
(`queueUnit`, `commandAttack`, `moveUnit`, `setSail`, research, diplomacy), and a solo-developer
team with no budget for chasing lockstep desync bugs across browser JS floating-point quirks,
timer drift, and client patch skew. We need a design that is cheat-resistant, tractable for one
developer to build and debug, and reuses the engine exactly as it already exists.

A second, GoldenDome-specific problem: the existing control plane (Supabase edge functions) has
**no way to reach the machine we intend to run the game server on**. The Sunday host is a
Raspberry Pi 5 living behind a home network / Tailscale, not a public HTTPS endpoint edge functions
can call into. Any design that assumes "the backend calls the server to start a match" is not
buildable as stated; the control flow has to invert.

### Current State

Today (per `docs/spec.md` and ADR-0001) GoldenDome has two established server-authoritative
patterns, neither of which is a game server in the sense this ADR introduces:

- `gd-match`, a Supabase edge function, resolves an entire combat exchange **in one shot** — a
  seeded, non-real-time simulation triggered once at a deadline or once all players ready up. It
  is authoritative, but it is not a live, ticking process; there is nothing to "connect to" during
  play.
- `gd-account` (ADR-0001) is a stateless write-gate for accounts/stats — it verifies a JWT and
  performs a single database write per call. It has no concept of an ongoing session.

Neither pattern supports a continuously-ticking, real-time match with many humans and AI nations
sharing a live world, which is what `design/gdd/multiplayer-matchmaking-social.md` specifies.
There is no prior live-game-server component in this codebase; this ADR introduces one.

### Constraints

- **No public ingress to the private host.** The game server runs on hardware Supabase cannot
  reach directly. Any interaction between the Supabase control plane and the game server must be
  initiated **from** the server (outbound), never **to** it.
- **Reuse, don't reimplement, the engine.** `src/game/engine.js` and `src/game/sim/*` already
  encode every rule that matters (combat, production, research, sensors). Re-deriving any of that
  logic in a second, server-side implementation would create two sources of truth that could drift
  — an unacceptable risk for a solo developer to maintain.
- **Solo-dev operational simplicity.** One long-running Node process (systemd service) is the
  ceiling of acceptable operational complexity — no orchestration platform, no multi-region
  matchmaking, no distributed consensus protocol.
- **Existing client shell must not fork.** `LiveGame` and its panels are built against the local
  `useEngine` hook's `[world, api]` contract; online mode must not require a parallel UI or
  duplicated component tree.
- **Compatibility with `design/gdd/sensors-and-fog-of-war.md`.** That system computes per-nation
  visibility client-side today; any snapshot-broadcast design interacts with (but per this ADR
  does not yet solve) the fact that broadcasting full world state to every client hands each
  client data its own fog-of-war rules say it should not be able to see.

### Requirements

- Every connected client must observe the same outcome for the same match — no client-side
  simulation divergence a human could exploit to see or do something the server does not agree to.
- A client cannot forge another player's action; every command must be attributable to a
  server-verified identity and forced to that identity's own slot.
- The control-plane (Supabase) and the game server must be able to hand off a match to each other
  using only outbound connections from the private host — no inbound webhook/HTTP call is
  available to Supabase.
- Reconnecting after a network drop must be possible without restarting or corrupting the match.
- The implementation must reuse the existing engine's public exports unmodified — no simulation
  logic is forked or duplicated for server-side use.

## Decision

Run a single long-lived **authoritative Node game server** (systemd service on the Sunday
Raspberry Pi 5 host) that imports `src/game/engine.js` directly — the same module the browser
bundles — and treats it as the sole simulation authority for every online match. The server does
not poll or get called by Supabase; instead it holds its own **outbound** Supabase Realtime
subscription (service-role key) on the `lobbies` table filtered to `status = 'starting'`, and
**claims** matching rows itself the moment they appear. This inverts the naive "backend calls the
game server" shape specifically because the backend has no path to call it.

Once claimed, the server builds the match with the engine's own `createWorld(setup)`, assigning
human `lobby_members` to their reserved slots and drafting AI nations into the remaining
`ai_slots`. It then writes `status = 'active'` plus `match_id` and `server_url` back onto the
lobby row — this is the **only** way a client learns where to connect; there is no separate
"lobby ready" push notification. Clients, already subscribed to that same lobby row, react to the
`active` transition and open a WebSocket directly to `server_url`.

Every WebSocket connection presents a Supabase JWT at handshake. The server verifies it the same
way `gd-account` does (`auth.getUser()` against the anon-key-scoped client, never trusting a
client-supplied identity), resolves the verified `user_id` to the `slot` recorded for it in
`lobby_members`, and from then on forces every whitelisted command from that connection to act as
that slot — never a slot named in the message body.

The server runs the world forward with the engine's own `step(world, dt)` at a fixed 10 Hz and
broadcasts a **full, compressed JSON snapshot of the world** to every connected client at 2 Hz.
Clients do not wait passively for snapshots: between them, each client calls the same `step` on
its own local copy for smooth animation, then **discards its local prediction and adopts the
server's snapshot wholesale** the moment one arrives — the server's state always wins; there is no
client-side reconciliation logic beyond "replace and resume predicting from here." This is a
deliberate simplicity-first choice over delta-encoded, reconciled netcode (see Alternatives).

Fog-of-war (`design/gdd/sensors-and-fog-of-war.md`) is **not** filtered per-recipient in this
version — every connected client receives the same unfiltered snapshot, and each client's own UI
continues to apply the existing `sensorsOf`/`sensedBy` rules to decide what it renders, exactly as
single-player already does. A client that chose to bypass its own UI could read fog-hidden data
directly off the snapshot; this is an accepted **trusted-client compromise** for this version (see
Consequences and Risks), not an oversight — closing it requires server-side per-recipient
filtering, which is out of scope here and tracked as future work.

On game over, the server — not the client, and not `gd-account`'s `report_match` path — writes one
`matches` row per human participant directly with the service-role key, using the engine's own
win/loss determination, `mode: 'online'`.

### Architecture

```
┌───────────────────────────┐        ┌───────────────────────────┐
│  Client A (browser/Electron)│        │  Client B (browser/Electron)│
│  useNetGame([world, api])   │        │  useNetGame([world, api])   │
│  - local step() prediction  │        │  - local step() prediction  │
│  - subscribes to lobby row   │        │  - subscribes to lobby row   │
└──────────┬──────────────────┘        └──────────┬──────────────────┘
           │  reads lobbies row (Realtime)          │
           │  WebSocket to server_url after 'active' │
           ▼                                         ▼
┌───────────────────────────────────────────────────────────────────┐
│                     Authoritative Game Server (Node)               │
│                  systemd service — Sunday host (RPi5)               │
│                                                                       │
│  imports src/game/engine.js (createWorld, step, queueUnit,          │
│  commandAttack, moveUnit, setSail, enqueueResearch, declareWar, …)  │
│                                                                       │
│  - verifies JWT per WebSocket, maps user -> slot                    │
│  - whitelists + slot-forces every inbound command                   │
│  - ticks world: step(world, dt) at 10 Hz                            │
│  - broadcasts full snapshot at 2 Hz to all connected clients        │
│  - on game over: writes `matches` rows (service-role key)           │
└───────────┬──────────────────────────────────────────────────────────┘
            │  OUTBOUND ONLY: Realtime subscription (service-role key)
            │  on lobbies where status = 'starting'; claims + writes
            │  status='active' + match_id + server_url back
            ▼
┌───────────────────────────────────────────────────────────────────┐
│  Supabase "Golden Dome" project                                     │
│  lobbies, lobby_members, friendships (control plane — no inbound    │
│  path to the game server; edge functions cannot call it)           │
└───────────────────────────────────────────────────────────────────┘
```

### Key Interfaces

```ts
// Game-server-side: consumes the engine's existing public facade exactly as
// the browser does. No new engine exports are introduced by this ADR.
import {createWorld, step, queueUnit, commandAttack, moveUnit, setSail,
        enqueueResearch, unqueueResearch, declareWar, makePeace, queueAircraft,
        queueAmmo, cancelProd, setWarhead, scrapUnit, setPatrolSize,
        setAwacsPatrol, stopSail} from "../src/game/engine.js";

// Whitelisted inbound command shape over the match WebSocket.
// `type` must be one of the whitelisted engine action names above.
// The server ALWAYS substitutes `slot` with the value resolved from the
// connection's verified JWT -> lobby_members mapping; a `slot` field in the
// payload, if present, is ignored.
type ClientCommand = {
  type: "queueUnit" | "commandAttack" | "moveUnit" | "setSail" | "research"
      | "declareWar" | /* …rest of the whitelist */ string;
  args: unknown[]; // forwarded positionally to the matching engine export,
                    // with the resolved slot injected in the engine's own
                    // slot-argument position
};

// Outbound: full world snapshot, broadcast identically to every connection
// in the match (no per-recipient filtering in this version).
type WorldSnapshot = {
  t: number;          // engine world.time at snapshot capture
  world: object;       // the engine's own plain-JSON world object, as-is
};

// Realtime claim: the server's own subscription filter and claim condition.
// Illustrative — the exact claim mechanism (a guarded UPDATE ... WHERE
// status = 'starting' AND match_id IS NULL) is an implementation detail of
// the game server, not a new client-facing contract.
subscribe(table: "lobbies", filter: "status=eq.starting")
  -> on each row: attemptClaim(row) // succeeds only if still unclaimed
```

### Implementation Guidelines

- The game server must import `src/game/engine.js` as a plain Node module (or via a small build
  step if ESM/bundler differences require it) — never fork, copy, or reimplement any function it
  exports. If the engine needs an export it does not yet have for server use, that is an engine
  change proposed through the normal engine-owning process, not a server-side workaround.
- The Realtime subscription must use the **service-role key**, scoped to the game server process
  only; it must never be embedded in any client bundle, exactly as ADR-0001 already establishes for
  `gd-account`'s service-role usage.
- The lobby claim must be a guarded, conditional write (e.g. an `UPDATE ... WHERE id = :id AND
  match_id IS NULL`) — even though only one game server instance exists today, the claim step
  must not be skipped or treated as unnecessary, since it is the only thing standing between this
  design and a future multi-server deployment silently double-claiming a lobby.
- WebSocket JWT verification must reuse the same verification call shape as `gd-account`
  (`auth.getUser()` against a client scoped to the caller's bearer token) — do not introduce a
  second, divergent JWT-verification implementation.
- The command whitelist must be an explicit allowlist (not a denylist) enumerated in one place in
  the server code; adding a new client-invokable engine action requires a deliberate addition to
  that list, never an implicit "anything exported by engine.js is callable."
- Full-snapshot broadcast is the only sync strategy in this version — do not begin delta encoding,
  interest management, or per-recipient filtering as part of this ADR's implementation; those are
  explicitly deferred (see Alternatives, Consequences).
- The 60-second reconnect grace window (per `design/gdd/multiplayer-matchmaking-social.md`) must
  be implemented as server-side state per slot (a disconnect timestamp, cleared on successful
  reconnect), not inferred from WebSocket-library defaults or client-side timers.

## Alternatives Considered

### Alternative 1: Lockstep — every client simulates independently from shared inputs

- **Description**: Clients exchange only commands (with a fixed input delay), and each client runs
  its own copy of `engine.js` locally to arrive at the same world state, the same way many RTS
  games (classic Age of Empires/StarCraft netcode) work.
- **Pros**: Minimal bandwidth (only commands travel the wire); no server-side simulation cost; a
  natural fit for "the engine is already deterministic."
- **Cons**: Determinism across independently-running browser JS engines is fragile in practice
  (floating-point rounding differences, timer/frame-pacing drift, any future engine change that
  introduces a subtle non-determinism silently desyncs matches with no server to catch it).
  Reconnecting mid-match is hard — a rejoining client has no way to catch up except replaying every
  command from the start or receiving a full state dump from a peer, which reintroduces exactly
  the "send the whole world" idea this alternative was meant to avoid, but from an untrusted peer.
  Cheat resistance is weak: a modified client can simply lie about its own state to itself (it has
  no external authority to contradict it) and, more importantly, nothing stops a modified client
  from acting on information a legitimate client's fog-of-war would hide, since there is no
  authority filtering what each client's engine instance is fed.
- **Estimated Effort**: Lower network/server cost, but materially higher debugging effort long-term
  — desync bugs are notoriously difficult to reproduce and fix, and this is a solo-developer team.
- **Rejection Reason**: Cheat resistance and reconnect simplicity were explicit requirements. An
  authoritative server trivially satisfies both (the server is the single source of truth to
  reconnect against, and a client can only ever request actions, never assert outcomes) at a
  bandwidth/server-CPU cost this project's scale can easily absorb.

### Alternative 2: Edge function calls the game server directly to start a match

- **Description**: `gd-lobby`'s `start` action makes an outbound HTTP call from the edge function
  to the game server's own HTTP endpoint to hand off the match synchronously.
- **Pros**: Simpler mental model — a direct call instead of a subscribe-and-claim pattern; no
  polling/subscription infrastructure needed on the server side.
- **Cons**: Requires the game server to have a publicly reachable inbound endpoint. The Sunday
  host does not have one today (home network / Tailscale only) and standing one up (public tunnel,
  reverse proxy, dynamic DNS + port-forwarding) is itself a piece of infrastructure this decision
  should not silently assume into existence. It also couples the edge function's request lifecycle
  to the game server's availability — a slow or unreachable game server would make `start` itself
  hang or fail, rather than degrading to the client-observed "stuck in `starting`" timeout this
  design already handles gracefully.
- **Estimated Effort**: Comparable once a public tunnel exists, but that tunnel is an unbuilt
  prerequisite, not a wash.
- **Rejection Reason**: No public ingress to the private host, by explicit constraint. The
  Realtime-subscribe-and-claim pattern requires only outbound connections from the server, which
  is achievable today with zero additional networking infrastructure. A public tunnel remains a
  noted follow-up (see Consequences/Risks) for if/when public-internet play (not LAN/Tailscale) is
  needed, but is not required for this decision to be implementable now.

### Alternative 3: Delta-encoded snapshots with client-side reconciliation

- **Description**: The server sends only the fields of the world that changed since the last
  acknowledged snapshot (or since a client's last-acked sequence number), and the client
  reconciles its local prediction against the delta using a rollback/replay scheme, closer to
  modern shooter netcode (e.g. Source engine-style snapshot interpolation + delta compression).
- **Pros**: Substantially lower bandwidth at scale, especially with many units/projectiles; smoother
  reconciliation with proper misprediction correction rather than a hard snap.
- **Cons**: Meaningfully more implementation complexity — delta computation, sequence
  acknowledgment, and misprediction-correction logic all have to be built and debugged from
  scratch, none of which exists in the engine today. At GoldenDome's current expected scale (small
  private lobbies, 2–16 seats, LAN/Tailscale reachability), full-snapshot bandwidth is not
  demonstrated to be a real problem yet.
- **Estimated Effort**: Significantly higher upfront effort for a benefit that is not yet needed.
- **Rejection Reason**: Simplicity first. Full-snapshot-plus-local-prediction is easy to build
  correctly and easy to reason about ("server always wins, no partial-reconciliation bugs
  possible"). Delta encoding is explicitly retained as **future work** once real bandwidth data
  from actual matches justifies the added complexity.

## Consequences

### Positive

- No client, however modified, can alter a match outcome the server disagrees with — every state
  change flows through the server's own `step`/command execution, never a client's assertion.
- Reconnection is simple and robust: a rejoining client just needs the next snapshot, not a replay
  of every command since match start.
- The engine gains zero network-awareness or online-specific branches — `src/game/engine.js` is
  consumed identically by the browser and by the game server, preserving the single-source-of-truth
  simulation this codebase already values (per ADR-0001's engine-decoupling precedent).
- The claim-via-Realtime-subscription pattern requires no new networking infrastructure (no public
  tunnel, no port-forwarding) to work today over LAN/Tailscale.
- Full-snapshot broadcast is trivial to reason about and debug — there is no partial-reconciliation
  state machine that can itself become a source of bugs.

### Negative

- Full-snapshot broadcast costs more bandwidth than a delta-encoded approach would, scaling with
  world size (units, projectiles, cities) and player count; acceptable at the current small-lobby,
  LAN/Tailscale target, but a real constraint if GoldenDome later targets larger lobbies over the
  public internet.
- Fog-of-war is not enforced server-side in this version — a client that chooses to inspect its own
  network traffic (rather than relying on the UI's normal rendering path) can see data
  `sensors-and-fog-of-war.md` says it should not have. This is an accepted trusted-client
  compromise for the current stage (private lobbies among people who know each other), not
  appropriate for a future competitive/ranked mode without revisiting this decision.
- The game server is a new single point of failure and a new piece of infrastructure to operate
  (systemd service on a home Raspberry Pi) that did not exist before — unlike the fully-managed
  Supabase edge functions, this requires the solo developer to keep a physical machine online and
  patched.
- No public-internet reachability yet — matches require the participants to share a LAN or a
  Tailscale network. Public play requires a follow-up (tunnel/relay) not covered by this ADR.

### Neutral

- The claim-and-write-back pattern (server observes `starting`, writes `active` + connection info)
  is a new interaction shape in this codebase, distinct from both the `gd-match` and `gd-account`
  patterns; it is a deliberate, documented departure, not an inconsistency, driven entirely by the
  private-host constraint.
- Delta encoding and server-side fog-of-war filtering are both explicitly deferred rather than
  rejected — this ADR does not foreclose either; a future ADR can supersede or extend the relevant
  parts of this one when the need is demonstrated.

## Risks

| Risk                                                                                       | Probability               | Impact                                                                                                                    | Mitigation                                                                                                                                                                                                                                                                |
| :--- | :--- | :--- | :--- |
| Trusted-client fog-of-war compromise is exploited (a modified client reads hidden data)    | Medium                    | Low at current stage (private lobbies among known players); Medium if this mode is later exposed to strangers/ranked play | Documented explicitly as accepted for this version; server-side per-recipient snapshot filtering is tracked as required future work before any public/ranked/leaderboard-relevant mode ships                                                                              |
| Sunday host (Raspberry Pi 5) goes offline or loses power                                   | Low–Medium                | High for any in-progress match — no failover server exists today                                                          | The 30s "stuck in `starting`" client-side watchdog (per the GDD) surfaces this gracefully for matches that haven't started; in-progress matches have no current failover — accepted at solo-dev scale, flagged as a future high-availability concern if online play grows |
| Full-snapshot bandwidth becomes a real bottleneck at higher seat counts (approaching 16)   | Low now, rises with scale | Medium — degraded snapshot rate or connection drops under load                                                            | Snapshot rate (2 Hz) and tick rate (10 Hz) are both tuning knobs (per the GDD); delta encoding is the documented escape hatch once real data justifies the added complexity                                                                                               |
| Service-role key used by the game server's Realtime subscription leaks                     | Low                       | Critical — same blast radius as any service-role leak (arbitrary DB access)                                               | Key lives only in the game server process's environment, never in any client bundle; same operational discipline already established for `gd-account` per ADR-0001                                                                                                        |
| No public ingress means online play is limited to LAN/Tailscale for the foreseeable future | Certain (by design)       | Medium — limits the addressable set of matches to players who can reach the host                                          | Explicitly scoped as a known limitation, not a defect; a public tunnel/relay is noted as follow-up work, not blocking this ADR's acceptance                                                                                                                               |

## Performance Implications

| Metric                  | Before                           | Expected After                                                                                                           | Budget                                                                                                                                         |
| :--- | :--- | :--- | :--- |
| CPU (frame time)        | n/a (no live game server exists) | Server: one `step(world, dt)` call per tick at 10 Hz per active match, same cost profile as a client's own tick          | Must stay well under the 100ms tick budget per active match on the Pi 5; exact multi-match headroom to be measured, not assumed                |
| Memory                  | n/a                              | One `world` object per active match held server-side (same shape/size as a client's in-memory world)                     | Negligible per match at current expected match counts (solo-dev scale, not many concurrent matches)                                            |
| Load Time               | n/a                              | Match assembly (`createWorld` + AI draft) on lobby claim should complete well under the 30s client-side "stuck" watchdog | Comfortably < 30s; typical `createWorld` cost is already sub-second in single-player                                                           |
| Network (if applicable) | n/a                              | Full JSON world snapshot broadcast per match at 2 Hz to every connected client; size scales with unit/projectile count   | Not yet budgeted numerically — first real target for delta-encoding follow-up work if it proves too high over the intended LAN/Tailscale links |

## Migration Plan

This is new, additive infrastructure — there is no existing live game server to migrate away from.
The rollout is:

1. **Control plane schema** (per `design/gdd/multiplayer-matchmaking-social.md`): `friendships`,
   `lobbies`, `lobby_members` tables, RLS, Realtime enablement, and the `gd-social`/`gd-lobby` edge
   functions. Verify: lobby create/join/leave/ready/set_ai/find all behave per that GDD with two
   real test accounts, entirely without a game server running yet (the lobby can sit at
   `starting` and simply time out per the 30s watchdog until step 2 exists).
2. **Game server skeleton**: the Node process, its Realtime subscription (service-role key) on
   `lobbies` filtered to `status = 'starting'`, and the claim write. Verify: setting a test lobby's
   `status` to `starting` directly in the database causes the running server to claim it and write
   back `status = 'active'` with a `match_id` and reachable `server_url` within a few seconds.
3. **Match assembly + WebSocket handshake**: `createWorld(setup)` invocation from claimed lobby
   data, JWT verification, slot mapping. Verify: a test client can connect with a valid JWT and is
   correctly bound to its reserved slot; an invalid/forged JWT or an unrecognized `user_id` is
   rejected.
4. **Command whitelist + tick/broadcast loop**: inbound command handling (whitelisted, slot-forced)
   and the 10 Hz `step`/2 Hz snapshot broadcast loop. Verify: a forged command targeting another
   slot has no effect; snapshots visibly update all connected clients' world state.
5. **Client — `useNetGame`**: implement the hook against the same `[world, api]` shape as
   `useEngine`, including local prediction via `step` and snapshot reconciliation. Verify:
   `LiveGame` renders an online match with no mode-specific branching, and motion between snapshots
   reads as continuous rather than stepped.
6. **Reconnect + match-end reporting**: the 60s grace/AI-takeover state machine and the
   service-role `matches` row writes (`mode: 'online'`) at game over. Verify: disconnect/reconnect
   scenarios and all-humans-quit scenarios produce exactly the `matches` rows
   `design/gdd/multiplayer-matchmaking-social.md`'s Acceptance Criteria specify.

**Rollback plan**: Because no existing system is being replaced, rollback is "do not enable the
Multiplayer screen / do not run the game server systemd service" — single-player and the existing
`gd-match`/accounts systems are entirely unaffected, since neither reads from nor writes to the
lobby/game-server schema this ADR introduces.

## Validation Criteria

- [ ] A client cannot cause a state change in an active match except through a whitelisted command
  executed under its own server-verified slot, verified by attempting a forged command (wrong slot,
  non-whitelisted action type) and confirming no effect.
- [ ] The game server claims a `starting` lobby using only an outbound Realtime subscription — no
  inbound call from any Supabase edge function to the game server exists anywhere in the codebase.
- [ ] A dropped WebSocket reconnects within 60s and resumes the same slot with no AI takeover;
  beyond 60s, the slot converts to AI and the eventual `matches` row for that human reads `quit`.
- [ ] `src/game/engine.js` has zero new exports, branches, or awareness introduced specifically for
  server/network use — confirmed by diff review showing the engine module is unchanged by this
  implementation.
- [ ] A lobby whose `starting` status is never claimed (game server down) is observed by the client
  to time out at 30s and revert to `open`, per `design/gdd/multiplayer-matchmaking-social.md`.
- [ ] `LiveGame` and its panels render an online match using `useNetGame` with no mode-conditional
  code path distinguishing it from `useEngine`-driven single-player, confirmed by code inspection.

## GDD Requirements Addressed

| GDD Document                                   | System                             | Requirement                                                                                                                            | How This ADR Satisfies It                                                                                                                                                                                                       |
| :--- | :--- | :--- | :--- |
| `design/gdd/multiplayer-matchmaking-social.md` | Multiplayer, Matchmaking & Friends | "An authoritative Node game server... imports the same engine code the client uses... spins up a match instance from the lobby config" | The game server imports `src/game/engine.js` unmodified and calls `createWorld(setup)` from claimed `lobbies`/`lobby_members` data, per the Decision/Architecture sections above.                                               |
| `design/gdd/multiplayer-matchmaking-social.md` | Multiplayer, Matchmaking & Friends | "gd-lobby 'start' only sets lobby status='starting'; the game server holds a Realtime subscription... claims 'starting' rows"          | Directly implemented as the claim mechanism described in Decision/Key Interfaces — an outbound-only subscription, never an inbound call from an edge function.                                                                  |
| `design/gdd/multiplayer-matchmaking-social.md` | Multiplayer, Matchmaking & Friends | "whitelists commands... forcing the sender's own slot"                                                                                 | The command whitelist and slot-forcing rule are specified as a mandatory Implementation Guideline and a Key Interface (`ClientCommand`) above.                                                                                  |
| `design/gdd/multiplayer-matchmaking-social.md` | Multiplayer, Matchmaking & Friends | "ticks the world at 10Hz, broadcasts compressed full-world snapshots at 2Hz"                                                           | Directly implemented as the tick/broadcast loop described in the Decision section; rates are documented as tuning knobs in the GDD, held fixed at these values in this ADR's initial implementation.                            |
| `design/gdd/multiplayer-matchmaking-social.md` | Multiplayer, Matchmaking & Friends | "useNetGame hook exposes the exact same [world, api] contract as the local useEngine"                                                  | Explicitly required as an Implementation Guideline/Validation Criterion; the ADR's Engine Compatibility section states the engine itself gains no network code, which is what makes an identical facade possible on both sides. |
| `design/gdd/multiplayer-matchmaking-social.md` | Multiplayer, Matchmaking & Friends | "the server keeps a disconnected human's slot alive for 60s (nation goes AI after that)"                                               | Implemented as required server-side per-slot state per the Implementation Guidelines; the GDD's Formulas section defines the exact 60s threshold this ADR's implementation must honor.                                          |

## Related

- `docs/architecture/adr-001-supabase-accounts.md` — the JWT-verification and service-role-key
  patterns this ADR reuses for WebSocket authentication and the online `matches` write path.
- `docs/spec.md` — the prior `gd-match` edge-function-authoritative pattern this ADR's Context
  section contrasts against for a live, continuously-ticking match.
- `design/gdd/multiplayer-matchmaking-social.md` — the gameplay-facing design document this ADR
  backs; the source of the lobby schema, edge-function action set, and player-facing rules this
  ADR's game server consumes.
- `design/gdd/sensors-and-fog-of-war.md` — the system whose visibility rules are not yet enforced
  server-side under this ADR's full-snapshot broadcast; a candidate for a future ADR extending or
  partially superseding this one.
