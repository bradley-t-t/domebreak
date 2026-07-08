<h1 align="center">Strategic Arsenal — Two-Axis Warheads &amp; Delivery (Phase 1)</h1>

<p align="center">
  <b>Every strike is a delivery vehicle crossed with a warhead — the platform fixes the missile, the player picks the payload, and each launcher earns a distinct identity.</b>
</p>

<br />

> **Supersedes** `design/gdd/strategic-payloads.md` (the earlier flat, one-round
> model). This document is the source of truth for the offense arsenal going
> forward. Phase 2 (aircraft Cruise/AAM munitions + air-to-air combat) is a
> separate GDD.

## 1. Overview

The offense arsenal is modelled on **two axes**: the **delivery vehicle** (the
missile, fixed by the platform that fires it) and the **warhead** (the payload,
selected by the player on platforms that support a choice). A launch platform can
only mount warheads on its delivery vehicle's compatibility list. This replaces
the previous model where `ammo` was a flat list of complete rounds. It gives each
platform a distinct identity through its missile's characteristics (range, speed,
survivability, interceptability) while letting strategic platforms choose how
hard a given strike lands.

## 2. Player Fantasy

Commanding a credible strategic arsenal: road-mobile launchers that shoot and
scoot to survive counter-battery, hardened silos and stealth boomers that can
range the globe, an exotic orbital platform that strikes anywhere, and a
hypersonic battery whose rounds are nearly impossible to stop. The player decides
not just *what to fire* but *what to put on the tip* — a conventional strike, a
MIRV that showers submunitions, a single city-killer, or a multi-warhead
thermonuclear bus.

## 3. Detailed Rules

### 3.1 Warhead axis (the payload)

Four warheads, structured as yield (Conventional / Thermonuclear) × dispersal
(single / MIRV):

| Warhead      | key           | Yield | Dispersal | Fallout |
|--------------|---------------|-------|-----------|---------|
| Conventional | `conventional`| single| single    | no      |
| Cluster      | `cluster`     | conv  | MIRV      | no      |
| Thermonuclear| `thermo`      | thermo| single    | yes     |
| Thermo-MIRV  | `thermomirv`  | thermo| MIRV      | yes     |

- **Cluster** is the conventional MIRV: a bus that splits at `MIRV_SPLIT_AT` into
  `subCount` submunitions (existing mechanic, unchanged).
- **Thermo-MIRV** is a thermonuclear MIRV: it splits into a *small* number of
  thermonuclear sub-warheads, each leaving fallout. Deliberately fewer subs than
  Cluster and expensive/late so it is a capstone weapon, not a default.

### 3.2 Delivery vehicles (the missile) & platform matrix

Each warhead platform fires one fixed delivery vehicle. Only platforms whose
missile supports more than one warhead show a picker.

| Platform            | Missile (delivery) | Warhead picker | Warheads allowed                       |
|---------------------|--------------------|----------------|----------------------------------------|
| Missile Silo        | ICBM               | yes            | Conventional · Cluster · Thermo · Thermo-MIRV |
| Ballistic Missile Sub (SSBN) | ICBM/SLBM | yes            | Conventional · Cluster · Thermo · Thermo-MIRV |
| Orbital Strike      | Orbital bus        | yes            | Cluster · Thermo · Thermo-MIRV (no Conventional) |
| TEL (replaces launcher) | SICBM          | no             | fixed SICBM round                      |
| Hypersonic Battery  | Hypersonic Missile | no             | fixed hypersonic round                 |

- Missiles differentiate the platforms: **SICBM** — mobile, short range
  (~8,000 km start), survivable; **ICBM** — global (~20,000 km), fast, fixed
  (silo) or stealth (SSBN); **Orbital** — strike anywhere; **Hypersonic** — fast,
  high evasion, regional, very hard to intercept.
- The Hypersonic round keeps its existing key `hgv` (relabelled "Hypersonic
  Missile") as the Battery's fixed round; the Battery is now the *sole* owner of
  hypersonic delivery. Keeping the key means the only warhead rename is
  `standard`→`conventional`, minimising save migration.

### 3.3 The TEL (Transporter-Erector-Launcher)

Replaces the Hypersonic Launcher (`launcher`). It is **land-mobile** and fires
the **SICBM** (a single heavy warhead, shorter range than the silo ICBM).

- **Shoot-and-scoot:** the TEL moves like a ground unit (waypoint + `landSpeed`).
  It may only launch while **stationary** — while it has an active destination it
  holds fire; on arrival it may fire again. This rewards repositioning to evade
  counter-battery.
- The TEL has no warhead picker (single SICBM round).

### 3.4 Firing & arsenal

- Warheads are produced onto the same line as units and held per nation
  (`nation.ammo[key]`). A platform fires one round of its loaded warhead and
  cannot fire on an empty magazine (existing rule).
- `allowedAmmo(type)` returns the platform's warhead compatibility list;
  `setWarhead` / initial load / empty-magazine fallback all gate on it.
- Interception, blast, MIRV split, evasion, and fallout use the existing
  projectile pipeline (`combat.js` / `tick.js`), extended for the new keys.

### 3.5 Implementation model (how "two axes" maps to the engine)

The engine already has exactly the two levers this design needs — it does **not**
require a new "delivery vehicle" data structure:

- **Delivery vehicle = the platform's own stats.** Range, missile speed, and
  evasion already live on the `UNITS` entry for each platform. "SICBM vs ICBM vs
  Orbital vs Hypersonic" is expressed entirely through those per-platform numbers
  plus display naming. There is no separate delivery object.
- **Warhead = the `ammo` key** the platform loads and the projectile carries
  (`WARHEADS[key]`), exactly as today.
- **Single-round platforms** (TEL, Battery) model their missile *as* their one
  ammo key — `ammo: ["sicbm"]`, `ammo: ["hgv"]`. With one entry the UI shows no
  picker (the existing `>1 warhead` gate). So a "delivery vehicle" and a
  "warhead" are the same field for these platforms; the distinction only matters
  visually for the multi-warhead platforms.
- **Multi-warhead platforms** (Silo, SSBN, Orbital) list the selectable warheads
  in `ammo`; their delivery vehicle is flavour derived from the platform.

Consequence: this is an extension of the current `ammo`/`warhead` system, not a
rewrite. New work is new keys (`conventional` rename, `sicbm`, `thermomirv`),
TEL mobility, the `thermomirv` split path, and migration — not a new selection
dimension.

## 4. Formulas

- Impact damage = `UNITS[platform].damage × platform.dmgMult × WARHEADS[wh].dmgMult`.
- Interceptor hit probability = `max(evadeFloor, baseProb − projectile.evasion)`,
  where `projectile.evasion = nation.hypersonicEvasion + UNITS[platform].evasion +
  WARHEADS[wh].evasion`. Hypersonic delivery contributes the largest evasion term.
- MIRV split: at `progress ≥ MIRV_SPLIT_AT`, a `cluster`/`thermomirv` bus spawns
  `subCount` sub-projectiles, each `damage = bus.damage × subDmgFrac`; a
  `primaryShare` fraction stay on the primary target, the rest fan to hostile
  targets within `splash`.
- TEL fire gate adds: `!unit.dest` (stationary) to the existing offense fire
  conditions.

### Concrete starting stats for the new keys (all tunable)

`WARHEADS` entries — proposed starting values, to be confirmed by `/balance-check`:

| key           | short | role     | dmgMult | blastKm | subCount | subDmgFrac | primaryShare | fallout | prodCost | prodTime | requiresTech |
|---------------|-------|----------|---------|---------|----------|------------|--------------|---------|----------|----------|--------------|
| `conventional`| CONV  | Balanced | 1.0     | 70      | —        | —          | —            | no      | 30       | 4        | —            |
| `cluster`     | CLU   | Area     | 0.75    | 0       | 8        | 0.25       | 0.5          | no      | 55       | 6        | —            |
| `sicbm`       | SICBM | Mobile   | 1.4     | 100     | —        | —          | —            | no      | 55       | 6        | —            |
| `hgv`         | HYP   | Fast     | 1.6     | 90      | —        | —          | —            | no      | 90       | 8        | (existing)   |
| `thermo`      | THR   | Heavy    | 2.4     | 170     | —        | —          | —            | yes     | 130      | 11       | —            |
| `thermomirv`  | TMRV  | Heavy MIRV| 2.4    | 120     | 3        | 0.6        | 0.34         | yes     | 210      | 17       | late off-tier|

Notes:
- `sicbm` dmgMult 1.4 gives the TEL its "bigger warhead" feel; blastKm 100 (wider
  than conventional 70). It is a single ballistic round, no evasion.
- `thermomirv`: 3 sub-warheads, one stays on the primary (`primaryShare` 0.34) and
  two fan out — a multi-city weapon, not single-target overkill. Each sub seeds
  fallout (`thermomirv` added to `FALLOUT.warheads`); per-sub `blastKm` 120.
  Expensive and tech-gated so it is a capstone, not a default.
- TEL platform `damage` starts at ~40 (up from the launcher's 34) to suit a
  heavier round; SICBM range ~8,000 km (down from silo 20,000).

## 5. Edge Cases

- **TEL ordered to move mid-engagement:** drops/holds its shot until it stops.
- **Orbital has no conventional round:** its picker never offers Conventional;
  `initialWarhead` returns its cheapest allowed strategic round.
- **Save migration:** in-progress games map forward with a single key rename —
  `standard → conventional` in `nation.ammo` and every unit's `warhead`. `hgv`,
  `cluster`, `thermo` keep their keys (no change); `sicbm`/`thermomirv` start at 0.
  Any unit whose loaded `warhead` is no longer in its `ammo` list (e.g. an old
  `launcher` becoming a TEL) is reset to its `initialWarhead`. A save-load shim
  performs the rename and the reset.
- **Thermo-MIRV vs thin defenses:** multiple city-killers from one launch can be
  decisive — mitigated by cost, tech gating, and low sub-count (balance-check).
- **AI on new keys:** AI stocking/arming references update from `standard`/`hgv`
  to the new keys; AI arms each platform's signature warhead when stocked.

## 6. Dependencies

- `src/game/data/constants.js` — `WARHEADS` (keys, stats, VFX tints, icons),
  `WARHEAD_ORDER`, `WARHEAD_ICON`, `AMMO_START`, `UNITS` (TEL/Battery/silo/SSBN/
  orbital `ammo`, TEL `landSpeed`), `allowedAmmo`/`initialWarhead`,
  `launchersForAmmo`, `AI_TUNING`.
- `src/game/sim/tick.js` — fire loop (TEL stationary gate), AI stock/arm, spawn load.
- `src/game/sim/combat.js` — projectile build, MIRV split (thermomirv), blast, fallout.
- `src/game/sim/production.js` — `setWarhead` allow-list, `queueAmmo`.
- `src/game/platform/` — save/load migration shim.
- `src/ui/live/SelectionPanel.jsx` — warhead picker (shown for >1-warhead platforms),
  TEL move order + shoot-and-scoot status; `src/ui/live/LiveGame.jsx` — stat readout.
- `src/ui/screens/ProductionScreen.jsx` — arsenal munition cards (data-driven).
- VFX: per-warhead / per-missile sprites (SICBM, Thermo-MIRV need art or reuse).
- Related: `design/gdd/radioactive-fallout.md`, `design/gdd/sensors-and-fog-of-war.md`.

## 7. Tuning Knobs

- Per warhead: `dmgMult`, `prodCost`, `prodTime`, `blastKm`, `evasion`, MIRV
  `subCount`/`spread`/`subDmgFrac`/`primaryShare`, `role`, VFX tints, `requiresTech`.
- Per delivery/platform: `range`, `speed`, `evasion`, `reload`, `fireCost`,
  `cost`, `buildTime`; TEL `landSpeed`.
- `AMMO_START`, `MIRV_SPLIT_AT`, `AI_TUNING` per-warhead stock/reserve/chance.

## 8. Acceptance Criteria

- [ ] Warheads are exactly Conventional / Cluster / Thermonuclear / Thermo-MIRV;
      `standard` is renamed `conventional`; `hgv` no longer exists as a warhead.
- [ ] Silo, SSBN, and Orbital show a warhead picker with their allowed set
      (Orbital excludes Conventional); TEL and Battery show no picker.
- [ ] No platform can load or fire a warhead outside its delivery's allow-list.
- [ ] Thermo-MIRV splits into multiple thermonuclear sub-warheads, each seeding
      fallout; Cluster behaviour is unchanged.
- [ ] The TEL replaces the launcher, is land-mobile, and only fires while
      stationary (holds fire while it has a destination).
- [ ] The Hypersonic Battery is the only platform firing the hypersonic missile.
- [ ] Loading an existing save migrates old ammo/warhead keys with no crash and
      no lost stockpile.
- [ ] AI stocks and fires appropriate warheads for its platforms using the new keys.
- [ ] `npm run build` and `npm run lint` pass; balance-check verdict recorded for
      Thermo-MIRV and SICBM.
