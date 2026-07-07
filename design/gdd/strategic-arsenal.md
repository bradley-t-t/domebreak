# GDD — Strategic Arsenal: Two-Axis Warheads & Delivery (Phase 1)

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
- The Hypersonic round is today's `hgv` warhead repurposed as the Battery's fixed
  delivery vehicle; the Battery is now the *sole* owner of hypersonic delivery.

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

## 4. Formulas

- Impact damage = `UNITS[platform].damage × platform.dmgMult × WARHEADS[wh].dmgMult`.
- Interceptor hit probability = `max(evadeFloor, baseProb − projectile.evasion)`,
  where `projectile.evasion = nation.hypersonicEvasion + UNITS[platform].evasion +
  WARHEADS[wh].evasion`. Hypersonic delivery contributes the largest evasion term.
- MIRV split: at `progress ≥ MIRV_SPLIT_AT`, a `cluster`/`thermomirv` bus spawns
  `subCount` sub-projectiles, each `damage = bus.damage × subDmgFrac`; a
  `primaryShare` fraction stay on the primary target, the rest fan to hostile
  targets within `splash`.
- Thermo-MIRV proposed start: `subCount ≈ 3`, `subDmgFrac` sized so total yield
  ≈ a single Thermo × a modest multiplier; each sub seeds fallout on impact.
- TEL fire gate adds: `!unit.dest` (stationary) to the existing offense fire
  conditions.

## 5. Edge Cases

- **TEL ordered to move mid-engagement:** drops/holds its shot until it stops.
- **Orbital has no conventional round:** its picker never offers Conventional;
  `initialWarhead` returns its cheapest allowed strategic round.
- **Save migration:** in-progress games with old ammo keys map forward —
  `standard → conventional`; existing `hgv` stock folds into the Battery's
  hypersonic round; `cluster`/`thermo` unchanged; `sicbm`/`thermomirv` start at 0.
  A save-load shim rewrites `nation.ammo` and each unit's `warhead`.
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
