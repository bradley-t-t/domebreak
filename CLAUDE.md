# DomeBreak — Game Studio Agent Architecture

DomeBreak is a real-time strategy game of missile defense and offense on a live
world map, developed through the Claude Code Game Studios framework: 49
coordinated subagents, 73 workflow skills, path-scoped rules, and validation
hooks. **Using this framework is mandatory for all game work in this repo** —
design changes go through design skills, implementation through dev-story flow
and specialist agents, reviews through the review skills.

## Technology Stack

- **Engine**: Custom real-time strategy engine in JavaScript (`src/game/` — tick
  engine, geo math, sea routing, economy, combat)
- **Rendering**: React 19 + MapLibre GL world map (`src/map/`), SVG unit icons
  (`public/icons/`), React UI panels (`src/ui/`)
- **Language**: JavaScript (ES modules), JSX for components
- **Build System**: Vite 7 (`npm run dev`, `npm run build`), ESLint (`npm run lint`)
- **Desktop**: Electron (`npm run electron`, `electron:build:mac|win|all`)
- **Backend**: Supabase — dedicated "DomeBreak" project (`bhzxnorbhylfsrdjzodv`):
  Auth accounts, match history + stats under RLS, `db-account` edge function
  (all writes server-side; see `docs/architecture/adr-001-supabase-accounts.md`)
- **Version Control**: Git — work lands on `develop`; `/release` promotes to `main`

> **Note**: There is no Godot/Unity/Unreal here. Ignore the engine-specialist
> agent sets and engine-reference docs; the engine is this repo's own code.
> Read `src/game/engine.js`, `src/game/data/constants.js`, and `docs/spec.md`
> before changing gameplay systems.

## Project Structure

@.claude/docs/directory-structure.md

Framework directories map onto the existing project: game code stays in `src/`,
design docs live in `design/`, ADRs in `docs/architecture/`, production
artifacts (sprints, milestones, session state) in `production/`.

## Technical Preferences

@.claude/docs/technical-preferences.md

## Coordination Rules

@.claude/docs/coordination-rules.md

## Collaboration Protocol

This is a solo-developer studio operated by Sunday (Trenton's agent), so the
framework's ask-before-every-write protocol is adapted: agents act autonomously
on work Trenton has requested, and the quality gates live in the workflow
itself — GDDs before systems, design review after GDDs, code review and
balance checks before stories close. Pause for explicit approval only on
destructive, irreversible, or outward-facing actions (deletes, force pushes,
deploys, publishing). Landing requested work on `develop` is the routine
completion path, not a gated action — commit it through the sanctioned worktree
flow (`cd-prepare` → edit → `cd-land`) without waiting for separate sign-off.
Never run raw `git` by hand, and invoke `/release` (which promotes `develop` →
`main`) only when Trenton explicitly asks.

## Coding Standards

@.claude/docs/coding-standards.md

## Context Management

@.claude/docs/context-management.md

## Game Design Source of Truth

- `docs/spec.md` — the existing design spec; treat it as the seed for `design/gdd/`.
- Gameplay values are data-driven through `src/game/data/constants.js` and
  `src/game/platform/settings.js` — never hardcode tuning numbers in systems code.

> **First framework session?** Run `/adopt` to onboard this existing codebase
> into the studio workflow (stage detection, GDD backfill, systems index).
