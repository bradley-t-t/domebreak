<h1 align="center">Strategic Payloads &amp; Launch Platforms</h1>

<p align="center">
  <b>The earlier flat, one-round-per-platform offense model — launch platforms and the shared national warhead arsenal they draw from. Superseded; kept for history.</b>
</p>

<br />

> **⚠ SUPERSEDED by `design/gdd/strategic-arsenal.md`.** This document describes
> the earlier flat, one-round-per-platform model. The arsenal has since moved to a
> two-axis model (delivery vehicle × warhead). Kept for history; do not implement
> against it.

## 1. Overview

DomeBreak's offense is a two-part system: **launch platforms** (the units that
fire) and **warheads** (the rounds they fire, drawn from a shared national
arsenal). A platform can only load the warheads on its `ammo` allow-list, and
each platform has one **signature** round it is built to deliver. This gives
every launch platform a distinct identity and a clear reason to exist, and gives
the player a legible, honest picker for choosing what a given launcher fires.

## 2. Player Fantasy

Fielding an arsenal that feels like a real strategic triad-plus: cheap
road-mobile hypersonics for regional pressure, hardened silos and survivable
boomers for assured strategic retaliation, and an exotic orbital platform that
can hit anywhere. The player should look at any launcher and immediately
understand *what it's for* — not see five platforms that all fire the same
generic missile.

## 3. Detailed Rules

- **Warheads** are produced onto the same line as units and held in a per-nation
  arsenal (`nation.ammo[key]`). Four types: Standard, Cluster, HGV,
  Thermonuclear.
- **Platforms** with `warheads: true` load from their `ammo` allow-list only.
  The strike picker, the fire logic, and the `setWarhead` command all gate on
  `allowedAmmo(type)`, so a platform can never load — or be shown — a round it
  cannot carry.
- **Signature round** (`UNITS[type].signature`): the round a platform is built to
  deliver. Surfaced in the picker with a ★ badge, used as the platform's initial
  load when it cannot carry Standard, and used by the AI to arm itself.
- **Initial load** (`initialWarhead(type)`): a freshly built platform loads
  Standard if it is cleared for it (ready to fire immediately, since every nation
  starts with Standard in stock); a strategic-only platform not cleared for
  Standard (the SSBN) loads its signature round instead.
- **Firing** spends one round of the loaded warhead from the arsenal. A platform
  with an empty magazine for its loaded round **does not fire** and holds until
  stock arrives; it never fires a round it isn't carrying.
- **Empty-magazine fallback:** a platform falls back to Standard only if it is
  cleared to carry Standard. The SSBN therefore holds its strategic round and
  waits for strategic stock rather than reverting to a conventional round.

### Platform loadout matrix

| Platform                    | Loadout        | Signature | Identity                        |
|-----------------------------|----------------|-----------|---------------------------------|
| Hypersonic Launcher         | STD · CLU · HGV | HGV       | cheap, road-mobile, regional    |
| Hypersonic Missile Battery  | STD · HGV      | HGV       | dedicated glide specialist      |
| Missile Silo                | STD · CLU · THR | THR       | hardened, versatile global ICBM |
| Orbital Strike Platform     | STD · THR      | THR       | global kinetic, strike anywhere |
| Ballistic Missile Sub (SSBN)| CLU · THR      | THR       | survivable strategic-only leg   |

No two platforms share the same loadout. The two hypersonic platforms are the
only carriers of HGV; the three strategic platforms are the only carriers of
Thermonuclear; the SSBN is the only platform with no conventional Standard round.

### Warhead roles (picker chip)

| Warhead        | Role     | dmgMult | Notes                                   |
|----------------|----------|---------|-----------------------------------------|
| Standard (STD) | Balanced | 1.0     | cheap, always stocked, universal        |
| Cluster (CLU)  | Area     | 0.75    | MIRV bus, splits on reentry             |
| HGV            | Fast     | 1.6     | maneuvering, hard to intercept, regional|
| Thermonuclear  | Heavy    | 2.4     | city-killer, leaves radioactive fallout |

## 4. Formulas

- `allowedAmmo(type)` = `UNITS[type].ammo` (fallback `WARHEAD_ORDER`).
- `initialWarhead(type)` = `"standard"` if not a warhead platform **or** Standard
  is allowed; else `signature` if allowed; else `allowedAmmo(type)[0]`.
- Fire gate: a warhead platform fires iff `nation.ammo[loaded] > 0`; on fire,
  `nation.ammo[loaded] -= 1`.
- Impact damage scales by `WARHEADS[loaded].dmgMult` (see combat.js / blast GDD).
- AI arming: on target assignment, with probability `hgvChance` (HGV signature)
  or `thermoChance` (Thermo signature), load the signature round if stocked.
- AI stocking: stock HGV toward `hgvStockTarget` only if the nation fields an
  HGV-capable platform and `points ≥ WARHEADS.hgv.prodCost + hgvReserve`
  (Thermo analogous with its own knobs).

## 5. Edge Cases

- **Fresh SSBN, empty arsenal:** loads Thermo (signature) but cannot fire until
  Cluster or Thermo is produced. The picker greys empty rounds and shows the
  count in red, so the "arm your boomer" step is legible, not a silent failure.
- **Loaded round runs dry mid-war:** platform holds fire (no blanks); AI
  re-arms to Standard if cleared, otherwise waits for strategic stock.
- **Enemy platform selected:** no interactive picker (you cannot load an enemy's
  tubes); the stat grid shows the signature/flavor armament for identification.
- **Conventional offense units** (tank, infantry, aircraft, ships) have
  `warheads: false`; they fire their own munitions, never draw the arsenal, and
  get no picker. `initialWarhead` returns `"standard"` nominally for them.

## 6. Dependencies

- `src/game/data/constants.js` — `WARHEADS`, `UNITS[*].ammo/signature`,
  `allowedAmmo`, `initialWarhead`, `launchersForAmmo`, `AI_TUNING`, `AMMO_START`.
- `src/game/sim/tick.js` — spawn load, empty-magazine fallback, AI arm/stock, fire.
- `src/game/sim/production.js` — `setWarhead` (allow-list gate), `queueAmmo`.
- `src/game/sim/combat.js` — projectile warhead, blast, MIRV split, fallout.
- `src/ui/live/SelectionPanel.jsx` — the PAYLOAD picker.
- `src/ui/screens/ProductionScreen.jsx` — arsenal munition cards
  (`launchersForAmmo` "fires from" rows — data-driven, updates automatically).
- Related GDD: `design/gdd/radioactive-fallout.md` (Thermo fallout).

## 7. Tuning Knobs

- `WARHEADS[*]` — `dmgMult`, `prodCost`, `prodTime`, `blastKm`, `evasion`,
  `role` (picker chip), `flame`/`trail` (VFX).
- `UNITS[*].ammo` — per-platform loadout allow-list.
- `UNITS[*].signature` — per-platform defining round.
- `AMMO_START` — starting arsenal (Standard 6, rest 0).
- `AI_TUNING` — `thermoChance/thermoStockTarget/thermoReserve`,
  `hgvChance/hgvStockTarget/hgvReserve`, `stdStockTarget/stdReserve`.

## 8. Acceptance Criteria

- [ ] Each of the five warhead platforms shows a distinct set of rounds in the
      PAYLOAD picker; no two platforms share the same set.
- [ ] Each round renders its real warhead icon, its role chip, and current stock;
      out-of-stock rounds are greyed with the count in red.
- [ ] The platform's signature round is marked with a ★ and named in the header.
- [ ] A platform can never load or fire a round outside its `ammo` allow-list
      (verified for `setWarhead`, initial load, empty-magazine fallback, and fire).
- [ ] A fresh SSBN loads Thermo and only fires once Cluster/Thermo is stocked;
      it never reverts to Standard.
- [ ] The AI stocks and fires HGV from hypersonic platforms and Thermo from
      strategic platforms when it can afford them.
- [ ] No stale one-round "Armament" line contradicts the picker on owned units.
