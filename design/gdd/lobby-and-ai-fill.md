<h1 align="center">Lobby &amp; AI-Fill Settings</h1>

<p align="center">
  <b>Configure the match before the whistle — count, difficulty, and whether the machine takes the empty chairs.</b>
</p>

<br />

## 1. Overview

Adds a **pre-game settings** surface so a match's composition is chosen before it
starts. Singleplayer gets an active-count (2–8) and difficulty picker in New Game.
Multiplayer gets a host-owned settings panel in the lobby, before players ready up:
player count, an **"AI fills empty slots" toggle**, and per-AI difficulty/personality.
Today there is no such surface — New Game only picks your nation and the lobby only
picks nation + ready (`NewGame.jsx`, `LobbyScreen.jsx`), the server caps humans at
`MAX_PLAYERS = 6` with **no bot support** (`config.js:43`). This GDD raises the cap to
8 and lets AI bots seat into the unfilled active slots using the per-slot `isAi` seam
that already exists in `server/match.js`.

## 2. Player Fantasy

You set the terms of the fight. Solo, you dial in how many rivals and how hard they
hit. Hosting friends, you decide the table size and whether empty seats are filled by
capable AI so a 3-human match still feels like a full war. Nobody waits on a full
lobby to get a complete game.

## 3. Detailed Rules

- **Singleplayer (New Game)**:
  - **Active count** selector, 2–8, default 8 (→ `activeCount` into `buildSetup`).
  - **Difficulty** selector (global, applies to all AI actives) — tier from the AI
    GDD (e.g. Recruit / Regular / Veteran / Elite).
  - Optional **personality mix**: "Varied" (default — each AI a random archetype) or a
    forced archetype for all. Detail owned by the AI GDD.
  - Your nation pick is unchanged (globe ISO select).
- **Multiplayer (Lobby, host-owned, pre-ready)**:
  - **Player count / table size**, 2–8 (bounds the active set; the rest of the world
    is neutral per the Match-Model GDD).
  - **AI-fill toggle** — when on, any active slot not claimed by a human at launch is
    seated by an AI bot; when off, the match launches with only human actives (the
    remaining active slots simply go unused / neutral).
  - **Per-empty-slot difficulty &amp; personality** — visible when AI-fill is on; host
    sets each bot's tier/archetype (or leaves "Varied").
  - Settings are **host-only** to edit; all members see them live. Changing settings
    un-readies everyone (prevents readying against stale settings).
  - Existing ready-up flow and nation-pick are unchanged; launch proceeds when all
    humans are ready (`checkAutoLaunch`) or on the start timer.
- **Seating order**: humans take active slots by their claimed nation (existing
  GDP-order mapping, `match.js:51`); AI-fill assigns the remaining active slots
  scattered ISOs per the Match-Model seeding rule.
- **Authority**: all AI (including fill bots) runs **server-side**; the client never
  simulates opponents (`tick.js:40` predict-skip). AI-fill is a server match option.

## 4. Formulas

- **Empty slots filled**: `botCount = aiFill ? max(0, activeCount − humansReady) : 0`.
- **Effective active set**: `active = humansReady + botCount`, clamped to
  `[MIN_PLAYERS, NEUTRAL.maxActive]` (2–8).
- **Bot ISO assignment**: the scattered-seeding function from the Match-Model GDD,
  drawing `botCount` ISOs from `seedPool` excluding all human picks and maximizing
  minimum capital separation.
- No balance math here beyond count clamping; difficulty/personality math lives in the
  AI GDD.

## 5. Edge Cases

- **AI-fill off and a human drops before launch** — that active slot goes unused
  (neutral); the match launches smaller, never blocking on it.
- **AI-fill on, all slots human** — `botCount = 0`; toggle is a no-op that match.
- **Host changes count below current human members** — disallow (can't set table
  smaller than seated humans); clamp the selector's floor to `humansJoined`.
- **Host leaves** — host role transfers to the next member (existing lobby ownership);
  settings persist.
- **Mid-match human disconnect** — handled by the existing AI-takeover
  (`attach`/`detach`); independent of the pre-game AI-fill toggle.
- **Singleplayer count = 1** — not allowed; floor is 2 (you + at least one rival).
- **Difficulty/personality unset** — default to Regular tier / Varied personality.

## 6. Dependencies

- **Match model** (`design/gdd/match-model-and-neutral-world.md`) — defines `active`,
  the cap, and scattered seeding; this GDD chooses the counts and who fills the slots.
- **AI behavior** (`design/gdd/ai-behavior-overhaul.md`) — provides the difficulty
  tiers and personality archetypes this UI selects.
- **Server**: `config.js` (`MAX_PLAYERS` 6 → 8), `matchmaker.js`
  (`buildGroup`/`formLobby` seat count), `match.js` (per-slot `isAi`, bot seating,
  `resolveIsos`), `matchStart.js` (opening freeze unchanged). ADR-004
  (`adr-004-matchmaking-bot-lobby`) is the relevant prior decision on bots.
- **Client UI**: `NewGame.jsx` (solo settings), `LobbyScreen.jsx` (host settings
  panel + live display), `SearchingScreen.jsx` (unchanged), `App.jsx` (`joinMatch`,
  passing settings through). Uses the existing control vocabulary (`variants.js`).
- **Persistence**: last-used solo settings mirror to machine-local settings
  (`settings.js`) for convenience.

## 7. Tuning Knobs

- `MIN_PLAYERS` (2) / `MAX_PLAYERS` (8) — server table bounds (`config.js`).
- `defaultActive` (8, from `NEUTRAL`) — solo default count.
- `defaultDifficulty` (Regular) / `defaultPersonality` ("Varied") — fallback bot
  settings.
- `aiFillDefault` (on/off) — the toggle's initial state when a lobby opens.
- `startTimerSec` (existing `MATCH_START_PAUSE_S`) — unchanged.

## 8. Acceptance Criteria

1. New Game shows an active-count (2–8, default 8) and difficulty selector; starting a
   solo match honors both (verified by the resulting active set + AI tier).
2. The multiplayer lobby shows host-editable settings (count, AI-fill, per-bot
   difficulty/personality) that all members see live; a settings change un-readies
   members.
3. With AI-fill on, launching a lobby with fewer humans than the table size seats AI
   bots into the empty active slots at the chosen tiers; with it off, the match
   launches with only human actives.
4. The server accepts up to 8 active nations; bot AI runs server-side and clients only
   predict their own actions.
5. Illegal configurations are prevented (count below seated humans; count of 1).
6. `npm run build` green, `npm run lint` 0 errors, matchmaker/seating unit tests pass.
