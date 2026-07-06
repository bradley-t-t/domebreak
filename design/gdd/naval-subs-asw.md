# GDD: Naval — Submarines, ASW & Logistics

## 1. Overview

Four tech-gated naval hulls extend the sea game: two submarines (SSN attack boat,
SSBN boomer) and two logistics ships (Amphibious Transport, Replenishment Ship).
Submarines are stealthy — not revealed by ordinary radar or satellites, only by
anti-submarine-warfare (ASW) sensors within sonar range. This turns detection into
a cat-and-mouse subsystem and makes the SSBN a survivable second-strike leg of the
nuclear triad. The data layer for these units, their flags, and the `sonarMult`
scaling live in this pass; visibility logic is Phase 2.

## 2. Player Fantasy

Slip a hunter-killer through a rival's radar net and surface his fleet on your map
only when a destroyer closes to sonar range. Hide your boomer in deep water as an
unkillable retaliatory threat. Bridge your ground army across the ocean with
amphibs, and keep a battle group on-station indefinitely with an oiler.

## 3. Detailed Rules

- **Attack Submarine (SSN)** — `sub-ssn`, `requiresTech: "eco4"` (Nuclear Power).
  `kind: offense`, `domain: sea`, `submarine: true`, `asw: true`, `sonarKm: 300`.
  Stealth hull; anti-ship + land-attack cruise (`range 2500`, `damage 30`). Also an
  ASW platform (it can detect other subs within its sonar).
- **Ballistic Missile Sub (SSBN)** — `sub-ssbn`, `requiresTech: "cmd2"` (Nuclear
  Triad). `ballistic: true`, `submarine: true`, deep-stealth (no `asw`). Global-reach
  SLBM (`range 20000`, `damage 55`, slow reload). The sea leg of the triad.
- **Amphibious Transport** — `amphib`, `requiresTech: "eco5"` (JIT Logistics).
  `capacity: 4` — embarks up to four ground units (`infantry/tank/artillery`) and
  lands them on a coastline. `navalSpeed 60`. Non-combatant.
- **Replenishment Ship** — `replenish`, `requiresTech: "eco5"`. `resupplyKm: 250` —
  applies a nearby-fleet buff (reduced reload / waived `fireCost`) to friendly hulls
  within range. Non-combatant.
- **Submarine visibility (Phase 2, specified here)**: a `submarine` enemy is visible
  only if covered by one of my `asw` sensors within its `sonarKm`; all other enemies
  keep the current radar rule. Subs sneak through a radar net and pop onto the map
  only when a destroyer / ASW platform / friendly sub gets close, then fade back
  into the fog.
- **ASW sensors**: destroyers, subs, and future ASW helos carry `asw: true` +
  `sonarKm`. `sonarMult` (a new nation multiplier, default 1) scales `sonarKm` so
  Early-Warning tracking/fusion techs make hulls better sub-hunters.

## 4. Formulas

- **Effective sonar range**: `sonarKm_eff = unit.sonarKm * nation.sonarMult`.
- **Sub detected** iff `∃ my asw sensor s : dist(sub, s) ≤ sonarKm_eff(s)`.
- **Replenish buff** applies to friendly hulls with `dist ≤ resupplyKm`.
- `sonarMult` scaled by det7 (×1.25), det8 (×1.30), det11 (×1.35), det12 (×1.25) —
  stacking multiplicatively from the base 1.0.

## 5. Edge Cases

- **eco5 gates two units** — both `amphib` and `replenish` require it (see tech GDD).
- **SSN is both stealthy and an ASW sensor** — it can hunt other subs while hidden
  itself; its own `submarine` flag hides it from enemy radar, its `asw`/`sonarKm`
  reveals nearby enemy subs to its owner.
- **Amphib with no cargo** — still a valid hull; `capacity` is a ceiling, not a
  requirement.
- **Replenish overlap** — multiple oilers covering the same hull do not stack
  beyond the buff's cap (Phase-2 query concern; flagged here).
- **Global-reach subs** — SSBN `range 20000` is effectively global like the silo.

## 6. Dependencies

- **Tech tree** (`tech-tree-eras.md`) — `requiresTech` gates; `sonarMult` scaling.
- **ADR-001 Tech-Gated Units** — the `requiresTech` mechanism.
- **Detection queries** (`sim/queries.js`, Phase 2) — `subSensorsOf`, visibility split.
- **Fog of war** (`fog-of-war.md`) — subs stay under the veil; ASW briefly parts it.
- **Nation multipliers** (`engine.js`) — `sonarMult` default.

## 7. Tuning Knobs

- Per-unit: `sonarKm`, `capacity`, `resupplyKm`, `range`, `damage`, `navalSpeed`,
  `cost`, `buildTime`, `hp`, `upkeep`.
- `sonarMult` scaling magnitudes on det7/8/11/12.
- `AI_TUNING.subReserve` — AI cushion before committing to a sub.

## 8. Acceptance Criteria

- All four hulls exist in `UNITS` with the exact `requiresTech` above and a
  `UNIT_ICON` basename (`sub-ssn`, `sub-ssbn`, `amphib`, `replenish`).
- `submarine`/`asw`/`sonarKm`/`capacity`/`resupplyKm` flags present as specified.
- `sonarMult` defaults to 1 in `createWorld` and is scaled only by det techs.
- (Phase 2) A submarine stays out of an enemy's `visUnits` under radar-only
  coverage and appears only under ASW coverage.
