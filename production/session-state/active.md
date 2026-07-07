# Active Session — Codebase Organization Sweep

Date: 2026-07-05
Task: /organize whole-codebase refactor (behavior-preserving)

<!-- STATUS -->
Epic: Accounts & Player Stats
Feature: Supabase login + match history
Task: Complete — awaiting /release
<!-- /STATUS -->

## Accounts & Stats (second work block, same session)

- Supabase project "DomeBreak" (bhzxnorbhylfsrdjzodv): schema applied
  (profiles, matches, player_stats view, signup trigger, RLS read-own),
  autoconfirm on, db-account edge function deployed (touch / report_match,
  JWT-derived identity, service-role writes, CORS fixed for browser callers)
- Client: src/account/{client,api}.js (publishable key via .env.local,
  reads-only under RLS, writes via edge function only)
- UI: LoginScreen gate (no session -> no menu), StartMenu commander strip +
  lifetime stats, match reporting on win/loss (LiveGame onGameEnd) and quit
  (App.quitToMenu) with double-report guard + post-report stats refresh
- Local machine folder: Electron userData/GameData via preload contextBridge;
  localStorage hydrated from disk at boot, saves/settings/auth mirrored back
- Docs: design/gdd/accounts-and-stats.md, docs/architecture/adr-001 (Accepted)
- Verified live: forced login gate, signup trigger, RLS blocks direct inserts,
  no-JWT 401, quit/win reporting lands in matches, stats refresh on menu;
  lint 0 errors / 26-warning baseline; build green
- Note: anon/publishable key in .env.local (gitignored); CryptoFort add
  pending (MCP not connected this session)

## Attract Mode + Splash + Menu Identity (third work block)

- SplashSequence.jsx: TaylorURL logo card (white) -> "MADE SOLO BY TRENTON
  TAYLOR" (dark); skippable any key/click; reduced-motion = short holds, no
  fades; logo asset at public/brand/taylorurl-logo.png
- AttractSim.jsx: all-AI engine world (8 great powers, speed 4) behind login +
  menu; war director (3 opening fronts + escalation every 12s, recast on
  game over); omniscient explosions; SITREP ticker; camera drift; pointer
  events off; unmounts in gameplay and under reduced motion
- Menu identity: glass panel (blur 10px), vignette-over-sim backdrop,
  targeting-bracket button hovers, title glow pulse, TaylorURL credit footer
- Design doc: design/gdd/attract-splash-menu.md
- Verified live: both splash cards (screenshot), skip-by-key, forced timing,
  war reaches 12 fronts / strikes+intercepts ticking, missiles render over
  menu; lint 0 errors; build green

## Progress

- [x] Audit (3 parallel agents): dead code, conventions, duplication
- [x] Deleted 12 dead files (multiplayer prototype + superseded renderers);
  pruned orphaned deps @supabase/supabase-js, polygon-clipping
- [x] ESLint installed + flat config; gate restored (0 errors / 26-warning
  baseline of pre-existing react-hooks compiler findings, downgraded to
  warn — fix in a dedicated session)
- [x] styles.css: 4,136 → 3,200 lines (dead lobby/shop/roster CSS + 10 orphaned
  keyframes removed)
- [x] LiveGame.jsx split: 1,122 → 886 lines; new src/ui/live/useLiveLayers.js,
  src/ui/live/SelectionPanel.jsx (verbatim moves, dep arrays untouched)
- [x] Shared src/ui/format.js (fmtPop, fmtNet) replacing 3 inline copies
- [x] engine.js split: 1,917 → 140-line facade + constants.js (655),
  tick.js (402), aircraft.js (341), production.js (257), combat.js (156),
  queries.js (151), worldState.js (19); export surface verified 61/61
- [x] WARHEAD_ICON consolidated into constants.js
- [x] Final verify: lint 0 errors / 26-warning baseline; build green;
  dev-server smoke test — new game, engine tick, production catalog,
  research queue→promotion→progress, zero console errors
- [x] Cleanup report delivered
- [x] Directory reorg: src/ into packages — game/{sim,data,geo,platform} with
  engine.js facade at game/ root; ui/{screens,hud,live,panels,common,hooks};
  34 files moved, 75 imports rewritten; gen-seagrid.mjs output path updated;
  CLAUDE.md path references updated; lint 0 errors, build green, in-app
  smoke test passed (fresh new game boots, HUD ticks)

## Key decisions

- Trenton approved: delete all dead files, full engine split, LiveGame split
  now, ESLint install (AskUserQuestion gate, this session).
- Facade rule: engine.js re-exports its entire previous export surface — no
  importer changes required outside src/game/.
- react-hooks v6 compiler rules kept as warnings, not fixed — behavior
  preservation is the invariant of this sweep.

## Verification baseline

- npm run build: passing throughout (checked after every batch)
- npm run lint: 0 errors / 26 warnings baseline
