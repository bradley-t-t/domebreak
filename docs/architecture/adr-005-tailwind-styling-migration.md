<h1 align="center">ADR-0005: Tailwind CSS v4 Styling Migration</h1>

<p align="center">
  <b>Retire the 5,695-line hand-authored <code>styles.css</code> design system in favor of Tailwind CSS v4 utilities, keeping the existing token layer as <code>@theme</code> and the irreducible keyframe VFX as one scoped <code>@layer</code>, and adopt a curated set of UI libraries (Recharts, Radix, Motion, cva).</b>
</p>

<br />

## Status

Proposed

## Date

2026-07-06

## Last Verified

2026-07-06

## Decision Makers

Trenton Taylor (creative/technical director), Sunday (agent)

## Summary

GoldenDome's UI is styled by a single 5,695-line `src/styles.css` (plus seven small
component stylesheets, 6,023 lines total) — a bespoke, token-driven "command HUD" design
system. We are migrating the project **entirely** to Tailwind CSS v4: the 55 CSS custom
properties become a Tailwind `@theme` block, the ~4,100 lines of layout/type/color rules
become utility classes across the 34 UI components, and the ~1,500 lines of irreducible
procedural VFX (26 `@keyframes` — fireball detonation, fallout clouds, missile/THAAD
sprites, targeting brackets, era gradients, tactical scrollbars) move **verbatim** into a
single scoped `@layer` inside a new `src/index.css`. The end state is exactly one
stylesheet (`src/index.css`); `styles.css` and all seven component `.css` files are
deleted. Alongside the migration we adopt a curated library set: Recharts (data-viz on the
result/stats/economy surfaces), Radix primitives (accessible modal/menu/popover/tooltip),
Motion (drawer/modal transitions), class-variance-authority + clsx + tailwind-merge
(variant and conditional-class ergonomics), tailwindcss-animate, and lucide-react (UI
chrome icons).

## Engine Compatibility

| Field                     | Value                                                                                                                                                                                                                    |
|:--------------------------|:-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Engine**                | GoldenDome custom tick engine (`src/game/engine.js`, `src/game/sim/`) — JavaScript, no third-party game engine. This ADR touches **presentation only** (`src/ui/`, `src/main.jsx`); the simulation is not modified.      |
| **Domain**                | UI / Rendering (styling architecture, component chrome, data-viz). No gameplay, balance, or engine logic changes.                                                                                                        |
| **Knowledge Risk**        | LOW — Tailwind v4 (`@tailwindcss/vite`, `@theme`, `@layer`), Recharts, Radix, and Motion are stable, well-documented libraries. The only bespoke risk is VFX fidelity, mitigated by moving keyframes verbatim.           |
| **References Consulted**  | `src/styles.css`, `src/main.jsx`, `.claude/docs/technical-preferences.md`, `.claude/docs/coding-standards.md`, all 34 `src/ui/**/*.jsx`, the seven component `.css` files, Sunday `frontend` context card               |
| **Post-Cutoff APIs Used** | None — Tailwind v4 stable, Recharts 2.x, Radix, Motion all predate the knowledge cutoff                                                                                                                                  |
| **Verification Required** | Per-phase `npm run build` + `npm run lint` (0 errors; 26-warning baseline) + Electron visual-parity smoke. No engine-version dependency.                                                                                 |

## ADR Dependencies

| Field          | Value                                                                                                                                                          |
|:---------------|:-------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Depends On** | None — presentation-layer decision, independent of the engine/networking ADRs.                                                                                |
| **Enables**    | Faster UI iteration on utility-first components; consistent theming via `@theme` tokens; data-viz surfaces (Recharts) for post-match, career, and economy UI. |

## Context

`styles.css` is a coherent, hand-tuned "Anduril-school" tactical design system: stark
neutral blacks, hairline borders, mono data type, one retained chroma (red alert). It is
driven by a single token layer (55 CSS custom properties for color, type, elevation,
easing) and contains a large body of procedural CSS art (fireball detonations, radioactive
fallout clouds, kinetic-kill interceptor sprites, tech-tree era banding). At 6,023 total
CSS lines across eight files it is unwieldy to iterate on, has no design-token tooling, and
diverges from the Tailwind baseline used across the rest of Trenton's React apps.

The directive is to move **entirely** to Tailwind and delete `styles.css`. A Tailwind
project always retains one CSS entry (`@import "tailwindcss"`), and ~1,500 lines of
keyframe-driven VFX cannot be expressed as utility classes without degrading the game's
signature look. The decision therefore centers on **how** to partition the existing CSS,
not whether to keep a stylesheet at all.

## Decision

1. **Tailwind v4, CSS-first.** Install `tailwindcss` + `@tailwindcss/vite`. No
   `tailwind.config.js`; configuration lives in `src/index.css`.
2. **Single stylesheet.** `src/index.css` contains only: `@import "tailwindcss"`, an
   `@theme` block (the 55 tokens, plus custom breakpoints for the existing small-window
   fallbacks and the font families), and one `@layer` holding the 26 keyframes and
   procedural-VFX rules moved verbatim. `src/main.jsx:5` imports `./index.css` instead of
   `./styles.css`.
3. **Utilities everywhere else.** All layout/type/color rules across the 34 components
   become Tailwind utilities. Repeated button/panel/badge patterns become
   `class-variance-authority` variants. Conditional classes use a `cn()` helper
   (`clsx` + `tailwind-merge`) with **literal class strings only** (JIT-safe — no runtime
   string concatenation of class fragments).
4. **Dynamic inline styles stay inline.** The 18 components that set runtime values via
   `style={}` (unit heading rotation, production progress width, live `--i` fallout
   intensity) keep those inline; Tailwind cannot express runtime numbers. Only *static*
   inline styles are converted.
5. **Curated libraries.** Recharts, Radix primitives (Dialog, DropdownMenu/ContextMenu,
   Popover, Tooltip), Motion, tailwindcss-animate, and lucide-react are added. Map faction
   colors in `src/game/data/constants.js` stay — they are data, not chrome. `flag-icons`
   and the SVG unit icons are untouched.
6. **Deletion is the exit gate.** `styles.css` and all seven component `.css` files
   (`ProductionScreen.css`, `TechTree.css`, `DiplomacyScreen.css`, `a11y.css`,
   `SelectionPanel.css`, `LiveHud.css`, `ProductionBar.css`) are deleted only after their
   rules are fully ported and Electron parity is confirmed.

Execution follows the phased plan in
`docs/superpowers/specs/2026-07-06-tailwind-migration-design.md`, landed phase-by-phase
through the `cd-prepare`/`cd-land` worktree flow on `develop`.

## Alternatives Considered

| Alternative                                   | Why not                                                                                                                                                              |
|:----------------------------------------------|:--------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Tailwind v3 (JS config)**                   | More boilerplate; the 55 existing CSS variables map almost 1:1 onto v4's `@theme`. No upside on a greenfield adoption in 2026.                                        |
| **Hardline zero-CSS** (keyframes → JS/config) | Would force procedural VFX (fireball, fallout) into JS-driven styles at high effort and real fidelity risk to the game's signature look. Rejected.                    |
| **CSS Modules for VFX components**            | Cleaner isolation but leaves several `.css` files around, contradicting the single-stylesheet goal. The `@layer` approach achieves the same isolation in one file.   |
| **Keep `styles.css`, add Tailwind on top**    | Two parallel styling systems; defeats the directive and doubles the maintenance surface. Rejected.                                                                   |
| **Minimal library set** (Recharts + cn only)  | Trenton chose the maximal set; Radix improves a11y on already-hand-rolled overlays and Motion consolidates the bespoke easing/transition code.                        |

## Consequences

**Positive**

- One stylesheet, token-driven, consistent with the rest of Trenton's React stack.
- Utility-first components iterate faster; variants are typed via `cva`.
- Radix brings real accessibility to modals/menus/popovers/tooltips (retires ad-hoc `a11y.css`).
- Recharts unlocks post-match, career-stats, and economy data-viz that did not exist before.

**Negative / Risks**

- Large diff (34 components). Mitigated by phasing per-screen; each phase builds, lints, and
  smoke-tests independently and is reverted in isolation if parity breaks.
- VFX fidelity risk. Mitigated by moving keyframes/procedural art **verbatim** — no rewrite.
- JIT purge could drop dynamically built class strings. Mitigated by the literal-class-string
  rule (`cn`/`cva` with static strings).
- New dependency footprint (Recharts, Radix, Motion). Accepted per the maximal-set decision;
  recorded in `technical-preferences.md` Allowed Libraries.

## Validation Criteria

- [ ] `src/styles.css` and all seven component `.css` files deleted; only `src/index.css` remains (plus `flag-icons` vendor CSS).
- [ ] No `.css` import in `src/**` except `src/index.css` and the `flag-icons` import.
- [ ] `npm run build` green; `npm run lint` 0 errors (26-warning baseline preserved).
- [ ] Electron smoke passes: fresh new game boots, HUD ticks, all screens render at visual parity with pre-migration screenshots.
- [ ] Recharts renders on the result, career-stats, and economy surfaces.
- [ ] `technical-preferences.md` updated: Allowed Libraries lists the new deps; Forbidden Patterns bans hand-written component `.css`.
