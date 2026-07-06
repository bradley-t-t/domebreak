# ADR-0001: Supabase Accounts & Player Stats

## Status

Accepted

## Date

2026-07-05

## Last Verified

2026-07-05

## Decision Makers

Trenton Taylor (creative/technical director), Sunday (agent)

## Summary

GoldenDome needs a persistent player identity and lifetime match history, without letting a client
forge its own stats. We stood up a dedicated Supabase project for accounts (isolated from any
other project sharing the developer's organization) and route every write — login timestamp,
match result — through a single edge function that derives identity from the verified JWT and
writes with the service-role key. Clients read their own rows directly under RLS with the anon
key; they never write directly to `profiles` or `matches`.

## Engine Compatibility

| Field                     | Value                                                                                                                                                                                                                                            |
|---------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Engine**                | GoldenDome custom tick engine (`src/game/engine.js`, `src/game/sim/`) — JavaScript, no third-party game engine                                                                                                                                   |
| **Domain**                | Networking / Persistence (accounts, stats) — pure client+cloud addition, not a simulation change                                                                                                                                                 |
| **Knowledge Risk**        | LOW — Supabase Auth, Postgres RLS, and Deno edge functions are all stable, well-documented patterns                                                                                                                                              |
| **References Consulted**  | `docs/spec.md` (existing multiplayer backend pattern), `supabase/functions/gd-match/index.ts` (prior art for edge-function-as-write-gate), `supabase/migrations/20260705190000_accounts_and_stats.sql`, `supabase/functions/gd-account/index.ts` |
| **Post-Cutoff APIs Used** | None                                                                                                                                                                                                                                             |
| **Verification Required** | None — this is additive infrastructure with no engine-version dependency                                                                                                                                                                         |

This is a pure client+cloud addition. The deterministic engine tick (`src/game/sim/`) is
completely untouched by this decision: no simulation code reads from or writes to Supabase, no
game-affecting value (damage, timing, AI behavior, RNG) is sourced from account data, and nothing
in this system runs on the tick loop. The accounts/stats system reads world state **only at
terminal events** — game-over (win/loss) and quit-to-menu — to extract a snapshot (`startedAt`,
`result`, `nationIso`, `opponents`, `durationS`, free-form `stats`) for reporting. It never
influences a match in progress. This preserves the existing single-player guarantee that the
engine is "pure and deterministic given its seed" (`docs/spec.md`): accounts are an
observer of outcomes, not a participant in the simulation.

## ADR Dependencies

| Field             | Value                                                                                                                                                                                                                                                                                   |
|-------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Depends On**    | None — this is a foundational infrastructure decision                                                                                                                                                                                                                                   |
| **Enables**       | `design/gdd/accounts-and-stats.md` (this ADR is its technical backing); future leaderboard/social features that need a stable player identity                                                                                                                                           |
| **Blocks**        | Nothing open — all dependent implementation shipped with this ADR                                                                                                                                                                                                                       |
| **Ordering Note** | All layers are implemented and verified: SQL migration + `gd-account` edge function deployed; LoginScreen gate, start-menu stats, match-reporting call sites, and the Electron preload bridge (`electron/preload.cjs`, `src/game/platform/localData.js`) landed in the same change set. |

## Context

### Problem Statement

GoldenDome's existing multiplayer backend (`gd-match`, per `docs/spec.md`) already establishes the
pattern of a Supabase edge function as the sole server-authoritative write path for a shared
resource. Accounts introduce a second, orthogonal need: a durable player identity and match
history that exists independent of any single match, session, or device. Without this, there is no
way to answer "how has this player done over time" — every session would be a fresh start, which
undermines any future leaderboard, social, or matchmaking feature, and forecloses the simple
retention hook of "see your record improve."

The core risk to solve for is trust: stats are only meaningful if a player cannot inflate their own
win count or erase a loss by crafting a request. A naive design (client writes directly to a
`matches` table with its own `user_id`) is trivially forgeable by anyone who opens dev tools.

### Current State

Today there is no account system. `docs/spec.md` describes single-player as fully local (no
account, autosave to local storage) and multiplayer as an unauthenticated, per-player-secret model
(`gd_players.secret`) scoped to a single match's lifecycle in the shared `gd-match` function — that
model has no concept of a durable identity across matches, and predates this decision.

### Constraints

- **Isolation**: the developer's Supabase organization hosts other, unrelated projects (e.g.
  TaylorURL). Accounts data must not share a project with unrelated apps — a schema mistake,
  RLS misconfiguration, or credential leak in one project must not expose or corrupt the other.
- **No client-trusted writes**: the client must never be the source of truth for its own `user_id`
  on a write. Anything the client can set on a request, the client can forge.
- **Solo-dev operational simplicity**: no separate long-running server process to operate; must
  run entirely on Supabase's managed Postgres + edge functions, consistent with the existing
  `gd-match` pattern already proven in this codebase.
- **Cross-platform session persistence**: must work identically in the Electron desktop build and
  the browser build, using each platform's natural persistence primitive.

### Requirements

- A player can create an account (email + password + username) and log in on any device/build.
- Every account has a unique, human-readable username with a resolvable collision path — signup
  must never simply fail because a name is taken.
- Match outcomes (win, loss, quit) accumulate into lifetime stats that only the account owner can
  read.
- No request, however crafted, can cause a write under a `user_id` other than the caller's own
  verified identity.
- Login is required before the game's start menu is reachable, with no offline bypass — Performance
  requirement: auth check and session restore must not introduce a perceptible delay before the
  start menu appears when a valid session already exists (i.e., restore is a local read, not a
  network round-trip, before rendering the menu shell).

## Decision

Stand up a **dedicated Supabase project** ("Golden Dome", ref `bhzxnorbhylfsrdjzodv`) — separate
from any other project in the developer's organization — holding only GoldenDome's accounts and
match-history schema. Use **Supabase Auth** (email + password, autoconfirm enabled) as the identity
provider. Collect the username at signup as auth user metadata; a Postgres trigger
(`handle_new_user`) mints the corresponding `profiles` row on every `auth.users` insert, with an
in-trigger fallback username on collision so signup itself cannot fail on a taken name.

All **reads** happen client-side, directly against Postgres, using the anon key under Row Level
Security — `profiles` and `matches` each carry a `select` policy scoped to `auth.uid()`. This
keeps stats display cheap (no function round-trip to view your own record) while making
cross-account reads structurally impossible regardless of client code.

All **writes** happen through one edge function, `gd-account`, which accepts two actions:
`touch` (stamp `last_login`) and `report_match` (insert one `matches` row). The function verifies
the caller's JWT via the Supabase client configured with the anon key and the caller's bearer
token, extracts `user.id` from that verified token, and then performs the actual write using a
second client configured with the **service-role key** — bypassing RLS deliberately, but only
after the identity has already been fixed by the verified token, not by anything in the request
body. The client can put whatever it wants in the request payload; `user_id` is never read from it.

### Architecture

```
┌─────────────────────────┐
│  Client (React/Electron) │
│  - LoginScreen            │
│  - StartMenu (stats read)│
│  - Game-over / Pause menu │
│    (match report trigger) │
└───────────┬───────────────┘
            │
            │  reads: anon key + user JWT, RLS-scoped SELECT
            ▼
┌─────────────────────────────────────┐
│  Supabase Postgres (project: Golden  │
│  Dome, bhzxnorbhylfsrdjzodv)         │
│                                       │
│  auth.users ──trigger──▶ profiles    │
│                          matches      │
│                          player_stats │
│                          (view, sec.  │
│                           invoker)    │
└───────────┬───────────────────────────┘
            ▲
            │  writes: service-role key, user_id from verified JWT only
            │
┌───────────┴───────────────┐
│  Edge function: gd-account │
│  actions: touch,           │
│           report_match     │
│  - verifies JWT (anon key) │
│  - writes (service key)    │
└─────────────────────────────┘
```

### Key Interfaces

```ts
// Client -> gd-account edge function request shapes.
// The client NEVER sends user_id; it is derived server-side from the bearer JWT.

type TouchRequest = { action: "touch" };

type ReportMatchRequest = {
  action: "report_match";
  match: {
    startedAt?: string;       // ISO timestamp; omitted/invalid -> stored as null
    result: "win" | "loss" | "quit";  // required; any other value -> 400
    nationIso?: string;       // truncated to 3 chars, upper-cased; else null
    opponents?: number;       // finite number; else null
    durationS?: number;       // finite, clamped to >= 0; else null
    stats?: Record<string, unknown>; // stored as-is if a plain object; else {}
  };
};

// Response shapes
type OkResponse = { ok: true };
type ErrResponse = { error: string }; // 400 (bad input) | 401 (unauthorized) | 500 (write failed)
```

```sql
-- player_stats: the only read surface a client needs for lifetime display.
-- security_invoker = true means RLS on the underlying `matches` table still
-- applies to whoever queries the view -- it cannot be used to bypass RLS.
select user_id, total_matches, wins, losses, quits, total_playtime_s, last_match_at
from public.player_stats;  -- implicitly filtered to auth.uid() via underlying RLS
```

### Implementation Guidelines

- The client's Supabase client instance should be configured once with the project URL and anon
  key; never embed the service-role key in any client bundle (web or Electron) under any
  circumstance.
- The `gd-account` function must continue to construct two separate Supabase clients per request:
  one scoped to the caller's bearer token (for `auth.getUser()` verification only) and one scoped
  to the service role (for the actual write). Do not collapse these into one client — that would
  reintroduce the ability for a forged body field to influence the write identity.
- Session persistence must be implemented behind a single interface (e.g. `getSession` /
  `setSession` / `clearSession`) with two backends selected at build time: the Electron IPC
  bridge (backed by a file under the OS `userData` directory, exposed to the renderer only via a
  `contextBridge`-exposed API in the preload script — never direct `fs` access from the renderer)
  and `localStorage` for the browser build. The rest of the app must not branch on platform to
  read or write the session.
- Match reporting must be fire-and-forget with exactly one retry, per
  `design/gdd/accounts-and-stats.md`. Do not await the report before transitioning to the
  game-over screen or the main menu.
- Match reporting must be gated on the match having actually started (a recorded `startedAt`); do
  not report matches abandoned from pre-game setup.

## Alternatives Considered

### Alternative 1: Client writes directly to `matches` with RLS `insert` policy scoped to `auth.uid() = user_id`

- **Description**: Grant the client an `insert` policy on `matches` that only allows a row where
  `user_id` equals the caller's own `auth.uid()`, letting the client write directly with the anon
  key and no edge function.
- **Pros**: Simpler — no edge function to write or deploy; one fewer network hop per report.
- **Cons**: Postgres RLS can constrain *which* `user_id` a row may carry, but it cannot validate
  the semantic correctness of the rest of the row (e.g. a client could still insert a `win` result
  for a match that was actually a loss, or fabricate `duration_s`). It only solves the identity-
  spoofing half of the trust problem, not result-forgery. It also diverges from the `gd-match`
  precedent already established in this codebase, adding a second, inconsistent write pattern.
- **Estimated Effort**: Lower short-term effort, but leaves a durable trust gap.
- **Rejection Reason**: Does not fully close the "client cannot forge its own stats" requirement —
  a player could still self-report fabricated wins. The edge-function pattern additionally
  centralizes validation (e.g. the `result in (win, loss, quit)` check) in one auditable place
  rather than relying solely on declarative RLS.

### Alternative 2: Reuse the existing shared Supabase project (the one hosting TaylorURL) with a schema prefix

- **Description**: Add `profiles`/`matches`/`player_stats` to the developer's existing shared
  Supabase project, namespaced by table prefix or schema, rather than provisioning a new project.
- **Pros**: One fewer project to manage credentials and billing for; no new project setup step.
- **Cons**: Couples GoldenDome's auth and data lifecycle to an unrelated app's project. A schema
  migration mistake, an RLS policy bug, or an auth configuration change made for one app risks
  affecting the other. Blast radius of any incident (leaked service key, bad migration) is shared
  across unrelated products.
- **Estimated Effort**: Marginally lower setup effort.
- **Rejection Reason**: Isolation was an explicit constraint. A dedicated project for GoldenDome
  accounts costs one extra Supabase project (free tier is sufficient at this scale) in exchange for
  a clean blast-radius boundary — accepted as clearly worth it for a small, fixed cost.

## Consequences

### Positive

- Stats cannot be forged by any client-side manipulation — the only write path validates identity
  server-side from a cryptographically verified token, and the only write path that exists at all
  is the edge function.
- Reads remain cheap and simple (direct RLS-scoped `select`, no function call) because RLS alone is
  sufficient to protect read-side confidentiality, even though it was judged insufficient alone for
  write-side integrity.
- Isolation from the developer's other Supabase projects means an incident in one project (leaked
  key, bad migration, quota exhaustion) cannot cascade into the other.
- The pattern mirrors the already-proven `gd-match` edge-function-as-write-gate approach in this
  codebase, so there is one consistent mental model for "how does GoldenDome talk to Supabase"
  across both multiplayer matches and accounts.
- The engine remains fully decoupled — no simulation code has any awareness that accounts exist.

### Negative

- Every match report costs one extra network hop (edge function) compared to a direct client
  insert; mitigated by making the report fire-and-forget so it never blocks gameplay-facing UI.
- No email verification (autoconfirm) means a malicious or careless signup could use an email the
  submitter doesn't own; acceptable at current scale (solo-dev, pre-launch) but must be revisited
  before any public multiplayer launch where account takeover or abuse becomes a real concern.
- A dropped match report (both attempts fail) permanently undercounts that match in the player's
  lifetime stats with no reconciliation path — there is no queue or later retry. Accepted per the
  GDD as a deliberate reliability/UX trade-off.
- Two Supabase projects now exist in the developer's organization instead of one, adding a small
  amount of operational surface (two sets of credentials, two dashboards to check).

### Neutral

- The `stats` jsonb column on `matches` is intentionally schema-less at the database level; its
  internal shape is owned by whichever gameplay systems populate it, not by this ADR. Future
  systems adding fields to that blob do not require a migration or a revision to this ADR.

## Risks

| Risk                                                                                     | Probability          | Impact                                                      | Mitigation                                                                                                                                                                                                                     |
|------------------------------------------------------------------------------------------|----------------------|-------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Service-role key leaked into a client bundle by mistake                                  | Low                  | Critical — would allow arbitrary writes/reads bypassing RLS | Service key only ever used inside the `gd-account` Deno edge function runtime; never referenced by any file under `src/` or bundled by Vite. Code review should grep for the service key env var name in any client-side diff. |
| Autoconfirm signup abused for account-farming or email-not-owned signups                 | Low at current scale | Low now, Medium if public multiplayer ships                 | Revisit before public launch — add email verification or rate-limit signups at that point; tracked as a follow-up decision, not blocking today.                                                                                |
| Edge function cold-start latency makes `report_match` visibly slow                       | Low                  | Low — reporting is fire-and-forget, not user-facing         | Fire-and-forget design already absorbs this; no UI waits on the call.                                                                                                                                                          |
| Two Supabase projects drift in schema conventions over time (accounts vs. match backend) | Low                  | Low                                                         | Both follow the same edge-function-as-write-gate pattern by convention; no shared code, so drift is cosmetic, not a bug risk.                                                                                                  |

## Performance Implications

| Metric                  | Before                                 | Expected After                                                                                                                                      | Budget                                                                                          |
|-------------------------|----------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------|
| CPU (frame time)        | n/a                                    | n/a — no engine-tick involvement                                                                                                                    | n/a                                                                                             |
| Memory                  | n/a                                    | Negligible — one Supabase client instance, one session object                                                                                       | n/a                                                                                             |
| Load Time               | Instant start menu (no account system) | Session restore from local storage/`userData` file must complete before the start menu renders; must not add a network round-trip on the happy path | < 100ms to attempt local restore; network calls (login, `touch`) do not block menu-shell render |
| Network (if applicable) | n/a                                    | One `touch` call per login; one `report_match` call per terminal match event (fire-and-forget, ≤2 attempts)                                         | Negligible — sub-KB payloads, no polling                                                        |

## Migration Plan

This is new, additive infrastructure — there is no existing account or stats system to migrate
away from. The rollout is:

1. **Backend (done)**: `supabase/migrations/20260705190000_accounts_and_stats.sql` and
   `supabase/functions/gd-account/index.ts` are deployed to the dedicated project. Verify: query
   `player_stats` as an authenticated test user and confirm it returns zero rows with no error for
   a fresh account, and correct aggregates after inserting test match rows via the function.
2. **Client — LoginScreen**: implement the login/signup screen gating the app shell. Verify: an
   unauthenticated launch cannot reach the start menu by any navigation path.
3. **Client — session persistence bridge**: implement the Electron preload `contextBridge` API and
   its `localStorage` browser-build equivalent behind one shared interface. Verify: a session
   persists across a full app restart on both build targets.
4. **Client — start-menu stats display**: wire `player_stats` read plus the `winRate`/
   `totalPlaytimeS` formulas from `design/gdd/accounts-and-stats.md` into the start menu. Verify:
   values match a manually-computed expectation from seeded test match rows.
5. **Client — match reporting call sites**: wire `report_match` into the game-over (win/loss) and
   pause-menu (quit) flows, fire-and-forget with one retry. Verify: each of the three terminal
   paths produces exactly one correctly-shaped row.

**Rollback plan**: Because no existing system is being replaced, rollback is simply "do not ship
the client-side LoginScreen gate" — the backend can remain deployed and unused with no impact on
existing single-player or `gd-match` multiplayer flows, since neither reads from or writes to the
accounts schema.

## Validation Criteria

- [ ] A client cannot successfully insert or update a row in `profiles` or `matches` using the
  anon key under any request shape (verified by attempting direct writes and confirming RLS
  rejection).
- [ ] `gd-account`'s `report_match` action always stores the caller's own verified `user_id`,
  even when the request body includes a different `user_id` or `userId` field.
- [ ] Session restore (Electron and browser) does not perform a network call before the start-menu
  shell can render when a session is already cached locally.
- [ ] Signup with a colliding username succeeds and yields a distinct, loginable account.
- [ ] All three terminal match events (win, loss, quit) produce exactly one `matches` row each,
  verified against a live test account.

## GDD Requirements Addressed

| GDD Document                       | System                  | Requirement                                                                                                                                        | How This ADR Satisfies It                                                                                                                                                                                                    |
|------------------------------------|-------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `design/gdd/accounts-and-stats.md` | Accounts & Player Stats | "The client never writes stats directly — every mutation flows through a server-side edge function that trusts only the caller's verified session" | `gd-account` derives `user_id` exclusively from the verified JWT via `auth.getUser()`, then writes with the service-role key; the request body's contents never influence write identity.                                    |
| `design/gdd/accounts-and-stats.md` | Accounts & Player Stats | "Duplicate username at signup... account creation never fails on a taken name"                                                                     | `handle_new_user` trigger catches `unique_violation` and retries with the `<truncated>_<id8>` fallback shape inside the same transaction.                                                                                    |
| `design/gdd/accounts-and-stats.md` | Accounts & Player Stats | "A player can only ever see their own profile and match rows"                                                                                      | RLS policies `read_own_profile` and `read_own_matches` scope `select` to `auth.uid()`; the `player_stats` view is declared `security_invoker` so it cannot be used to bypass those policies.                                 |
| `design/gdd/accounts-and-stats.md` | Accounts & Player Stats | "Reporting is fire-and-forget... one retry... a lost report is acceptable"                                                                         | Addressed at the client implementation layer per the Implementation Guidelines above; the edge function itself is stateless per-call and imposes no server-side retry logic, keeping the retry policy entirely client-owned. |
| `design/gdd/accounts-and-stats.md` | Accounts & Player Stats | "Session persists across launches" on both Electron and browser builds                                                                             | Addressed via the platform-specific persistence backends (Electron `contextBridge` + `userData` file; browser `localStorage`) behind one shared interface, per Implementation Guidelines.                                    |

## Related

- `supabase/functions/gd-match/index.ts` — the prior-art edge-function-as-write-gate pattern this
  ADR follows for a different resource (live match state rather than accounts).
- `supabase/migrations/20260705190000_accounts_and_stats.sql` — the schema this decision describes.
- `supabase/functions/gd-account/index.ts` — the edge function this decision describes.
- `design/gdd/accounts-and-stats.md` — the gameplay-facing design document this ADR backs.
