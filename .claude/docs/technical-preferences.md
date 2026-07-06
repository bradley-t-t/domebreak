# Technical Preferences

<!-- Populated by /setup-engine. Updated as the user makes decisions throughout development. -->
<!-- All agents reference this file for project-specific standards and conventions. -->

## Engine & Language

- **Engine**: GoldenDome custom real-time tick engine (`src/game/engine.js` facade, `src/game/sim/`) — this repo's own
  code, no third-party game engine
- **Language**: JavaScript (ES modules), JSX for UI components
- **Rendering**: React 19 + MapLibre GL world map (`src/map/`), SVG unit icons, CSS-mask icon tinting
- **Physics**: None — geodesic kinematics in `src/game/geo/` (haversine, great-circle interpolation)

## Input & Platform

<!-- Written by /setup-engine. Read by /ux-design, /ux-review, /test-setup, /team-ui, and /dev-story -->
<!-- to scope interaction specs, test helpers, and implementation to the correct input methods. -->

- **Target Platforms**: PC desktop only — macOS + Windows via Electron (ADR-0002). The browser vite build is a
  development harness, never a distribution target.
- **Input Methods**: Keyboard/Mouse
- **Primary Input**: Mouse (map interaction), keyboard shortcuts for speed/pause
- **Gamepad Support**: None
- **Touch Support**: None
- **Platform Notes**: Saves are local JSON files under the OS userData dir (owner-only permissions) — see
  docs/architecture/adr-002-desktop-first-local-saves.md. Game must remain fully playable offline.

## Naming Conventions

- **Classes**: [TO BE CONFIGURED]
- **Variables**: [TO BE CONFIGURED]
- **Signals/Events**: [TO BE CONFIGURED]
- **Files**: [TO BE CONFIGURED]
- **Scenes/Prefabs**: [TO BE CONFIGURED]
- **Constants**: [TO BE CONFIGURED]

## Performance Budgets

- **Target Framerate**: [TO BE CONFIGURED]
- **Frame Budget**: [TO BE CONFIGURED]
- **Draw Calls**: [TO BE CONFIGURED]
- **Memory Ceiling**: [TO BE CONFIGURED]

## Testing

- **Framework**: [TO BE CONFIGURED]
- **Minimum Coverage**: [TO BE CONFIGURED]
- **Required Tests**: Balance formulas, gameplay systems, networking (if applicable)

## Forbidden Patterns

<!-- Add patterns that should never appear in this project's codebase -->

- [None configured yet — add as architectural decisions are made]

## Allowed Libraries / Addons

<!-- Add approved third-party dependencies here -->

- [None configured yet — add as dependencies are approved]

## Architecture Decisions Log

<!-- Quick reference linking to full ADRs in docs/architecture/ -->

- [No ADRs yet — use /architecture-decision to create one]

## Engine Specialists

<!-- Written by /setup-engine when engine is configured. -->
<!-- Read by /code-review, /architecture-decision, /architecture-review, and team skills -->
<!-- to know which specialist to spawn for engine-specific validation. -->

- **Primary**: [TO BE CONFIGURED — run /setup-engine]
- **Language/Code Specialist**: [TO BE CONFIGURED]
- **Shader Specialist**: [TO BE CONFIGURED]
- **UI Specialist**: [TO BE CONFIGURED]
- **Additional Specialists**: [TO BE CONFIGURED]
- **Routing Notes**: [TO BE CONFIGURED]

### File Extension Routing

<!-- Skills use this table to select the right specialist per file type. -->
<!-- If a row says [TO BE CONFIGURED], fall back to Primary for that file type. -->

| File Extension / Type           | Specialist to Spawn |
|---------------------------------|---------------------|
| Game code (primary language)    | [TO BE CONFIGURED]  |
| Shader / material files         | [TO BE CONFIGURED]  |
| UI / screen files               | [TO BE CONFIGURED]  |
| Scene / prefab / level files    | [TO BE CONFIGURED]  |
| Native extension / plugin files | [TO BE CONFIGURED]  |
| General architecture review     | Primary             |
