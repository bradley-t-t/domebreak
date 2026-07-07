# DomeBreak — Tailwind CSS v4 Migration Spec

**Date:** 2026-07-06
**Author:** Sunday (agent) with Trenton Taylor
**ADR:** `docs/architecture/adr-005-tailwind-styling-migration.md`
**Status:** Approved for phased execution

---

## 1. Goal

Move DomeBreak's presentation layer **entirely** to Tailwind CSS v4. Delete
`src/styles.css` (5,695 lines) and all seven component `.css` files. End state: exactly one
stylesheet, `src/index.css`, holding the Tailwind import, an `@theme` token block, and one
scoped `@layer` for irreducible keyframe VFX. Adopt a curated library set (Recharts, Radix,
Motion, cva, clsx, tailwind-merge, tailwindcss-animate, lucide-react).

## 2. Current state (measured)

| Fact | Value |
|---|---|
| Total CSS | 6,023 lines across 8 files |
| `src/styles.css` | 5,695 lines |
| Component CSS files | 7 (`ProductionScreen.css` 57, `TechTree.css` 167, `DiplomacyScreen.css` 11, `common/a11y.css` 14, `live/SelectionPanel.css` 38, `hud/LiveHud.css` 17, `hud/ProductionBar.css` 24) |
| Design tokens (`--x:` vars) | 55 |
| `@keyframes` | 26 |
| `@media` queries | 18 |
| MapLibre global overrides | 1 |
| Components using `className` | 34 |
| Components using inline `style={}` | 18 (many dynamic — keep) |
| CSS entry point | `src/main.jsx:5` (`import "./styles.css"`) |
| Tailwind present today | None |

### CSS partitions (how `styles.css` decomposes)

- **Tokens (~60 lines):** the 55 `:root` custom properties → `@theme`.
- **Structure (~4,100 lines):** layout / type / color rules on components → utilities.
- **Irreducible VFX (~1,500 lines):** 26 keyframes + procedural art (fireball detonation,
  fallout cloud, missile/THAAD sprites, targeting brackets, tactical scrollbars, tech-tree
  era gradients) → moved verbatim into `@layer` in `index.css`.

## 3. Constraints & invariants

- **Behavior/visual parity is the invariant.** This is a mechanism swap, not a redesign.
  Every screen must render identically (verified in Electron) before its old CSS is deleted.
- **Dynamic inline styles stay inline.** Runtime values (heading rotation, progress width,
  live `--i` fallout intensity) cannot be utilities. Only static inline styles convert.
- **JIT literal-class rule.** No runtime string concatenation of class fragments; conditional
  classes go through `cn()`/`cva` with full literal strings (matches Sunday `frontend` card).
- **Map faction colors in `constants.js` are data — untouched.** `flag-icons` and SVG unit
  icons untouched.
- **Framework:** this is an architecture change → ADR-0005. Land phase-by-phase via
  `cd-prepare`/`cd-land` on `develop`. Never one monster diff. Never commit to `develop` directly.
- **Verification gate every phase:** `npm run build` green + `npm run lint` 0 errors
  (26-warning + chunk-size baseline preserved) + Electron smoke (`npm run build`, then
  `open -na node_modules/electron/dist/Electron.app --args <repo>`).

## 4. Target architecture

```
src/
  index.css            # THE stylesheet — @import "tailwindcss"; @theme {…55 tokens…}; @layer vfx {…26 keyframes + procedural art…}
  main.jsx             # imports ./index.css (was ./styles.css)
  ui/
    lib/cn.js          # cn() = twMerge(clsx(...))
    lib/variants.js    # cva definitions: button, panel, badge, chip, etc.
    common/…           # components: utilities + cva; Radix/lucide/Motion where they map
    charts/            # new: Recharts wrappers (ResultChart, CareerStats, EconomyGraph)
vite.config.js         # + @tailwindcss/vite plugin
```

## 5. Phased plan

Each phase is a separate worktree landing. Do not start a phase until the previous one is
green and smoke-tested.

### Phase 0 — Foundation (no visual change)
- Add deps: `tailwindcss`, `@tailwindcss/vite`, `recharts`, `clsx`, `tailwind-merge`,
  `class-variance-authority`, `tailwindcss-animate`, `@radix-ui/*` (react-dialog,
  react-dropdown-menu, react-context-menu, react-popover, react-tooltip), `lucide-react`,
  `motion`.
- Add `@tailwindcss/vite` to `vite.config.js`.
- Create `src/index.css` with `@import "tailwindcss"` and empty `@theme`/`@layer` scaffolds.
- Import `./index.css` in `main.jsx` **alongside** `./styles.css` (both live during migration).
- Add `src/ui/lib/cn.js`.
- **Gate:** build green, app visually unchanged (Tailwind base reset reconciled with existing reset).

### Phase 1 — Tokens + VFX extraction
- Port the 55 `:root` vars into `@theme` in `index.css` (color, type, elevation, easing;
  add custom breakpoints for the small-window fallbacks; register font families).
- Move the 26 `@keyframes` and all procedural-VFX sections into `@layer` in `index.css`,
  **verbatim**. Delete those sections from `styles.css`.
- **Gate:** build green; VFX (explosion, fallout, missiles, era banding, scrollbars) visually identical in Electron.

### Phase 2 — Component port (screen by screen, low-risk first)
Order (each = its own landing, delete that screen's `styles.css` section + component `.css` when done):
1. **Pilot:** `LoginScreen`, `SettingsPanel` (isolated, exercises modal + form patterns; introduces `cva` button/panel variants + Radix Dialog + lucide icons).
2. **Menus:** `StartMenu`, `NewGame`, `LobbyScreen`, `SearchingScreen`, `PauseMenu`, `SplashSequence`, `ControlsOverlay`.
3. **HUD:** `LiveHud`, `NationPanel`, `ProductionBar`, `AmmoBar`, `LayerBar`, `ContextMenu` (→ Radix ContextMenu), `NewsTicker`, `PinnedBar`.
4. **Live/selection:** `SelectionPanel`, `CountryLabels`, `MeBadge` (→ Radix Popover), `FriendsPanel`.
5. **Big screens:** `ProductionScreen`, `DiplomacyScreen`, `TechTree`.
- Swap hand-rolled transitions to Motion using easing curves ported from the old
  `--ease-*` tokens into JS constants.
- **Gate per screen:** build + lint green; Electron parity screenshot matches pre-migration.

### Phase 3 — Recharts surfaces (additive)
- **Result screen:** arsenal expended / win-loss / damage summary (bar or radar).
- **Career + match-history stats:** pull from `src/account/api.js` (Supabase match history) → line/bar over matches.
- **Live economy/production:** production throughput / resource balance over time from the sim readouts.
- New components under `src/ui/charts/`, themed off `@theme` tokens.
- **Gate:** charts render with real data; build + lint green.

### Phase 4 — Teardown
- Delete `src/styles.css` and all seven component `.css` files.
- Remove the `./styles.css` import from `main.jsx`.
- Grep for orphaned class names + stray `.css` imports (`grep -rn "\.css" src`; only
  `index.css` + `flag-icons` remain).
- Update `.claude/docs/technical-preferences.md`: Allowed Libraries (all new deps) +
  Forbidden Patterns (no hand-written component `.css`).
- Mark ADR-0005 Validation Criteria complete; set Status → Accepted.
- **Gate:** full build + lint + Electron smoke (fresh new game boots, HUD ticks, every screen parity).

## 6. Libraries adopted

| Library | Purpose | Replaces / touches |
|---|---|---|
| `tailwindcss` + `@tailwindcss/vite` | Utility CSS engine | `styles.css` structure |
| `recharts` | Data-viz | net-new (result, career, economy) |
| `clsx` + `tailwind-merge` | `cn()` conditional classes | ad-hoc className strings |
| `class-variance-authority` | Typed variants | repeated button/panel/badge rules |
| `tailwindcss-animate` | Animation utilities | small transition rules |
| `@radix-ui/*` | Accessible Dialog/Menu/Popover/Tooltip | hand-rolled overlays + `a11y.css` |
| `lucide-react` | UI chrome icons | inline chrome SVGs (not unit icons) |
| `motion` | Drawer/modal transitions | hand-rolled easing transitions |

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| VFX fidelity loss | Keyframes/procedural art moved **verbatim**, never rewritten |
| Large diff / regressions | One screen per landing; each builds/lints/smokes independently; revert in isolation |
| JIT drops dynamic classes | Literal-class rule via `cn`/`cva` |
| Tailwind reset vs existing reset | Reconciled once in Phase 0 before any port |
| Electron `file://` + build | Tailwind is build-time only; no runtime impact |
| Scope creep from new libs | Libraries introduced only where they map to existing patterns; faction data untouched |

## 8. Out of scope

- No gameplay, balance, engine, or networking changes.
- No redesign — visual parity is the bar (Recharts surfaces are the only net-new UI).
- No change to `constants.js` faction colors, `flag-icons`, or SVG unit icons.

## 9. Definition of done

All ADR-0005 Validation Criteria checked: `styles.css` + 7 component CSS files gone; one
stylesheet remains; build + lint green (baseline preserved); Electron parity across all
screens; Recharts live on three surfaces; `technical-preferences.md` updated; ADR Accepted.
