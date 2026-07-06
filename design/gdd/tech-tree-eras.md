<h1 align="center">Tech Tree — Cold War → Modern → Space Age</h1>

<p align="center">
  <b>Five doctrine tracks climb twelve tiers from Cold War arsenals to Space Age orbital weapons, each tech slower and costlier than the last.</b>
</p>

<br />

## 1. Overview

The research tree runs chronologically across three eras. Its 5 doctrine tracks
each grow from 6 to **12 tiers** (60 techs total). Tiers band into eras: 1–4 Cold
War, 5–8 Modern, 9–12 Space Age. Each tech either boosts an existing nation
multiplier, unlocks a new buildable unit, or both. Cost and research time escalate
super-linearly with tier, so the deeper (more futuristic) the tech, the slower and
costlier it is to reach.

## 2. Player Fantasy

Open the match with a 1960s arsenal — Nike SAMs, first-gen ICBMs, DEW-Line radar.
Out-research a rival and you field Patriot/THAAD, hypersonic glide vehicles, and a
satellite early-warning net; push to the endgame and you command space-based
lasers, orbital kinetic strike, and a global surveillance grid. Fall behind and you
fight a modern war with obsolete kit.

## 3. Detailed Rules

- **Structure**: 5 tracks (`off`, `def`, `eco`, `det`, `cmd`) × 12 tiers. Each
  track is a linear chain — tier N requires tier N−1 (`req` field). Track ids,
  names, and glyphs are unchanged from the shipped `TECH_PATHS`.
- **Eras**: `ERAS = [{id, name, tierRange, years, color}]` for Cold War (t1–4),
  Modern (t5–8), Space Age (t9–12). Each tech is tagged `era` from its tier via
  `eraForTier(tier)`. The tree UI bands lanes by era.
- **Boost techs**: `apply: (n) => ...` mutates nation multipliers, using existing
  fields (`dmgMult`, `interceptAdd`, `incomeMult`, `rangeMult`, `reloadMult`,
  `defRangeMult`, `radarMult`, `interceptorSpeedMult`, `buildCostMult`,
  `upkeepMult`, `researchSpeedMult`, `moveCostMult`) plus two new ones:
  `hypersonicEvasion` (additive) and `sonarMult` (multiplicative). Both default in
  `createWorld`.
- **Unlock techs**: `unlocks: "<unitType>"`. Completing the tech makes the unit
  buildable (see ADR-001; the unit carries the matching `requiresTech`).
- **Track content** follows spec §7 exactly (names and order). Unlock techs:
  off8 Hypersonic Glide Vehicles → `hypersonicbty`; off11 Kinetic Orbital Strike →
  `orbitalstrike`; def5 Patriot PAC-3 → `patriot`; def6 Aegis/SM → `aegis`; def7
  THAAD → `thaad`; def9 Brilliant Pebbles → `sbi`; def10 Directed-Energy Defense →
  `orbitallaser`; eco4 Nuclear Power → `sub-ssn`; eco5 JIT Logistics → `amphib`
  (and `replenish`); det4 Early-Warning Satellite → `warnsat`; det6 SBIRS →
  `reconsat`; cmd2 Nuclear Triad → `sub-ssbn`; cmd11 Space Command → `spacehq`.

## 4. Formulas

Let `T` be the 1-based tier. Cost (points) and time (seconds):

```
cost(T) = round(TECH_COST_BASE * TECH_COST_GROWTH^(T-1))
time(T) = round(TECH_TIME_BASE * TECH_TIME_GROWTH^(T-1))
```

With `TECH_COST_BASE=900`, `TECH_COST_GROWTH=1.40`, `TECH_TIME_BASE=80`,
`TECH_TIME_GROWTH=1.30`, sampled: T1 ≈ 900 pts / 80 s · T6 ≈ 4840 / 297 ·
T12 ≈ 36,440 / 1433. Helpers `techCostForTier(T)` / `techTimeForTier(T)` compute
these; `chain()` applies them as defaults. A per-tech `cost`/`time` override wins.

## 5. Edge Cases

- **Shared unlock (eco5)**: JIT Logistics unlocks *two* units (`amphib` +
  `replenish`); both carry `requiresTech: "eco5"`. One `unlocks` string legitimately
  gates the pair — the amphib is the canonical `unlocks` target.
- **Space prereq**: def9/def10/det4/det6/off11 unlock orbital units that *also*
  require a standing Space Command HQ (`requiresUnit: "spacehq"`, from cmd11).
- **Multiplicative vs additive**: `interceptAdd`/`hypersonicEvasion` are additive
  (start 0); all `*Mult` fields are multiplicative (start 1). Boost techs must use
  the correct operator so stacking behaves.
- **Per-tech override**: any tech may set explicit `cost`/`time` to break from the
  curve for balance without touching the knobs.

## 6. Dependencies

- **Production system** (`sim/production.js`) — enforces `requiresTech` (ADR-001).
- **Research system** — records completed techs in `nation.research.done`.
- **Nation multipliers** (`engine.js createWorld`) — defaults for every field an
  `apply` touches, including new `hypersonicEvasion`/`sonarMult`.
- **Naval/ASW GDD** — `sonarMult` scaling; **Fog GDD** — space sensor rings.

## 7. Tuning Knobs

- `TECH_COST_BASE`, `TECH_COST_GROWTH`, `TECH_TIME_BASE`, `TECH_TIME_GROWTH` — the
  scaling curve.
- Per-tech `cost`/`time` overrides.
- Per-tech `apply` multiplier magnitudes.
- `ERAS` tier bands / colors / flavor years.
- AI depth knobs in `AI_TUNING` (`researchDepthTarget`, `deepReserve`,
  `deepTierGate`, `unlockedBuildChance`).

## 8. Acceptance Criteria

- `Object.keys(TECHS).length === 60`; `ERAS.length === 3`.
- Every `unlocks` tech maps to a real `UNITS` entry whose `requiresTech` matches
  (eco5 pair excepted); no orphan techs or gated units.
- Cost/time strictly increase per tier and match the sampled values above.
- All `apply` functions reference only fields defaulted in `createWorld`.
- `npm run lint` clean for `constants.js` and `engine.js`.

<br />

<p align="center">
  <sub>Out-research a rival and command the orbit; fall behind and fight a modern war with obsolete kit.</sub>
</p>
