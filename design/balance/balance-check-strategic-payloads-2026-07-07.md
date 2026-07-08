<h1 align="center">Balance Check — Strategic Payloads &amp; Launch Platforms</h1>

<p align="center">
  <b>Loadout differentiation lands as subsets of existing capability plus a targeted SSBN nerf and an AI-competence buff — no firepower ceiling raised, no platform strictly dominant. Verdict: HEALTHY.</b>
</p>

<br />

**Date**: 2026-07-07

## Data Sources Analyzed
- `src/game/data/constants.js` — WARHEADS, UNITS[*].ammo/signature, AI_TUNING, AMMO_START
- `src/game/sim/tick.js` — AI stock/arm/fire, empty-magazine fallback, spawn load
- `design/gdd/strategic-payloads.md`

## Health Summary: HEALTHY

The loadout differentiation is a set of subsets of pre-existing capability plus a
strict nerf to one strong unit (SSBN) and an AI competence buff. No firepower
ceiling increased; no platform became strictly dominant.

## Outliers Detected
None.

| Item/Value | Expected Range | Actual | Issue |
|-----------|---------------|--------|-------|
| (none) | — | — | — |

## Degenerate Strategies Found
None introduced. Per-platform specialization reduces flexibility rather than
creating a do-everything option. Battery [STD·HGV] is a subset of Launcher
[STD·CLU·HGV] but is tech-gated (off8), higher cost (340 vs 200) and higher stat,
so it is a deliberate specialist upgrade, not a redundant duplicate.

## Progression Analysis
- **SSBN (700 pts, cmd2):** loses the cheap Standard round; must be armed with
  Cluster/Thermo. Strategic ceiling (Thermo ×2.4 @ base dmg 55) unchanged. Arming
  ammo is already in production by the time SSBNs are fielded, so the change is a
  legibility/identity step and a mild nerf, not a dead-unit trap.
- **AI HGV economy:** `hgvReserve 200 / hgvStockTarget 2 / hgvChance 0.3`,
  proportionate to HGV `prodCost 90` (cf. Thermo 130 / reserve 300 / target 1).
  One ammo queue per think plus `queueMax` bound total spend. AI hypersonic
  platforms now fire HGV (×1.6) instead of Standard (×1.0) or idling — a
  competence improvement.

## Recommendations
| Priority | Issue | Suggested Fix | Impact |
|----------|-------|--------------|--------|
| Low | Nation with only SSBNs still stocks a little unusable Standard (tick.js:546) | Optionally gate Standard stocking on a Standard-capable offense unit | Negligible — Standard is cheap and near-universally used |

## Values That Need Attention
None require change. Monitor in playtest: whether AI over- or under-stocks HGV
(tune `hgvChance`/`hgvStockTarget`), and whether the SSBN arming delay feels
punishing (if so, restore Standard to its `ammo` list — a one-line data revert).
