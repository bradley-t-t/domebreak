# Tech Tree Overhaul — Cold War → Modern → Space Age

Status: DRAFT (awaiting approval) · Date: 2026-07-05

## 1. Overview

Replace the flat 30-tech stat-boost tree with a deep, era-driven tree that runs
chronologically from the **Cold War** through the **Modern** era into the
**Space Age**. The tree does two jobs at once: it keeps boosting existing units
*and* it **unlocks new units** as the player advances — the arsenal literally
modernizes over the match. Costs and research times escalate super-linearly, so
progress gets harder and slower the deeper (and more futuristic) you push.

The 5 doctrine tracks stay; each grows from 6 tiers to **12 tiers** (60 techs).
Tiers map onto eras: tiers 1–4 Cold War, 5–8 Modern, 9–12 Space Age.

## 2. Player Fantasy

Start the match fielding a 1960s arsenal — Nike SAMs, first-generation ICBMs,
DEW-line radar. Out-research a rival and you field Patriot/THAAD, hypersonic
glide vehicles, and a satellite early-warning net; push to the endgame and you
command space-based lasers, orbital kinetic strike, and a global surveillance
grid. Falling behind on the tree means fighting a modern war with obsolete kit.

## 3. Eras

| Era | Tiers | Years (flavor) | Feel |
|-----|-------|----------------|------|
| Cold War | 1–4 | 1947–1991 | Cheap, fast. The starting arsenal. |
| Modern | 5–8 | 1991–2035 | Precision, networking, first orbital sensors. |
| Space Age | 9–12 | 2035+ | Directed energy, orbital strike, satellites. |

`ERAS` metadata (id, name, tierRange, years, color) lives in `constants.js` and
drives the tech-tree era banding UI.

## 4. Structure & Cost Scaling

- 5 tracks × 12 tiers = **60 techs**, each a linear chain (tier N requires N−1),
  exactly as today — so `canQueue`, the queue, and the lane UI are unchanged in
  shape, only longer.
- Data-driven scaling in `constants.js` (no hardcoded numbers in systems):
  - `cost(tier)  = round(TECH_COST_BASE  * TECH_COST_GROWTH ^ (tier−1))`
  - `time(tier)  = round(TECH_TIME_BASE  * TECH_TIME_GROWTH ^ (tier−1))`
  - Proposed knobs: `TECH_COST_BASE=180`, `TECH_COST_GROWTH=1.34`,
    `TECH_TIME_BASE=16`, `TECH_TIME_GROWTH=1.22`.
  - Result (approx): tier 1 ≈ ◆180/16s → tier 6 ≈ ◆735/43s → tier 12 ≈ ◆5,200/135s.
    Per-tech overrides allowed for balance.

## 5. Tech Effects — two kinds

Each tech does one or both:

1. **Boost** — the existing pattern: `apply: (n) => (n.dmgMult *= 1.2)`, using the
   nation multiplier fields already on the nation object (dmgMult, interceptAdd,
   incomeMult, rangeMult, reloadMult, defRangeMult, radarMult,
   interceptorSpeedMult, buildCostMult, upkeepMult, researchSpeedMult,
   moveCostMult). A few **new** multipliers are added where a new mechanic needs
   one (e.g. `hypersonicEvasion`, `satUplink`), each defaulted in `createWorld`.
2. **Unlock** — new field `unlocks: "<unitType>"` on the tech. Completing it lets
   the nation build that unit. Enforced in `queueUnit` via a new unit field
   `requiresTech`.

## 6. New mechanism: tech-gated units

- Add optional `requiresTech: "<techId>"` to any unit in `UNITS`.
- `queueUnit` (production.js) gains one guard:
  `if (def.requiresTech && !n.research.done.includes(def.requiresTech)) return {error: "Requires <TechName>."}`
- Production UI (`UnitsPanel`) shows tech-locked units greyed with a
  "Requires <Tech>" tooltip and a lock glyph; they become buildable the instant
  the tech completes. Existing (Cold War) units have no `requiresTech` and are
  available from the start.
- AI (`tick.js` aiTick): extend so the AI researches deeper and builds unlocked
  units when it owns the prerequisite tech.

## 7. Tech content (accurate, per track)

CW = Cold War (t1–4), MOD = Modern (t5–8), SPACE = Space Age (t9–12).
`→ unlocks X` marks a unit unlock; others are stat boosts.

### Strategic Command (off) — offense/strike
1 Fission Warheads · 2 Thermonuclear Warheads · 3 ICBM Program · 4 MIRV Technology
5 Precision Guidance (CEP) · 6 Cruise-Missile Doctrine · 7 Penetration Aids/Decoys ·
8 Hypersonic Glide Vehicles → **Hypersonic Missile Battery**
9 Maneuvering Reentry (MaRV) · 10 Fractional Orbital Bombardment (FOBS) ·
11 Kinetic Orbital Strike → **Orbital Strike Platform** · 12 Directed-Energy Strike (buff)

### Missile Shield (def) — defense
1 Nike SAM Line · 2 Anti-Ballistic Missile (Safeguard) · 3 Layered Interceptors · 4 Phased-Array Fire Control
5 Patriot PAC-3 → **Patriot Battery** · 6 Aegis / Standard Missile → **Aegis Ashore** ·
7 THAAD → **THAAD Battery** · 8 Ground-Based Midcourse Defense (buff)
9 Brilliant Pebbles → **Space-Based Interceptor** · 10 Directed-Energy Defense → **Orbital Laser** ·
11 Boost-Phase Intercept (buff) · 12 Golden Dome Doctrine (capstone buff)

### War Economy (eco)
1 War Bonds · 2 Military-Industrial Complex · 3 Central Planning · 4 Nuclear Power
5 Just-in-Time Logistics · 6 Globalized Supply Chains · 7 Industrial Automation · 8 Additive Manufacturing
9 Fusion Power · 10 Orbital Mining · 11 AI-Managed Economy · 12 Post-Scarcity War Machine

### Early Warning (det) — detection
1 DEW-Line Radar · 2 Over-the-Horizon Backscatter · 3 BMEWS ·
4 Early-Warning Satellite (DSP) → **Missile-Warning Satellite**
5 AWACS Datalink · 6 Space-Based Infrared (SBIRS) → **Reconnaissance Satellite** ·
7 Multi-Spectral Tracking · 8 Networked Sensor Fusion
9 Persistent Orbital Constellation · 10 Hypersonic Tracking Layer ·
11 Quantum Radar · 12 Global Surveillance Grid (capstone)

### Command & Control (cmd)
1 SAGE Network · 2 Nuclear Triad Doctrine · 3 Mobile Launchers · 4 NORAD Hardened Bunkers
5 GPS / PNT · 6 Network-Centric Warfare · 7 Real-Time C4ISR · 8 Drone Command
9 Autonomous Battle Management · 10 AI Decision Support ·
11 Space Command → **Space Command HQ** · 12 Grand Strategy (capstone)

## 8. New units (implementable in the current schema)

All modeled with existing unit fields (kind/range/damage/intercept/detect/
radarKm/domain/hp/upkeep/cost/buildTime) plus a few new flags (§8b–8c) — no
orbital-physics system. "Satellites"/"orbital" platforms are stationary national
assets with global/very-large range, deliberately abstracted (documented
tradeoff). `[gate]` = `requiresTech` (+ unit prereq where noted).

### 8a. Land / air / space

| Unit | Kind | Role | Key stats (draft) | Gate |
|------|------|------|-------------------|------|
| Hypersonic Missile Battery | offense | Fast, hard-to-intercept regional strike | range 7000, dmg 40, speed 90, evades intercept | off8 |
| Patriot Battery | defense | Modern terminal SAM | range 400, intercept 0.7 | def5 |
| Aegis Ashore | defense | Midcourse interceptor | range 900, intercept 0.78 | def6 |
| THAAD Battery | defense | High-altitude terminal ABM | range 700, intercept 0.85, anti-ballistic | def7 |
| Space-Based Interceptor | defense | Global kinetic-kill layer | range 6000, intercept 0.7 | def9 (+ Space Cmd HQ) |
| Orbital Laser | defense | Directed-energy shield | range 4000, intercept 0.92 | def10 (+ Space Cmd HQ) |
| Space Command HQ | support | maxCount 1; prereq for all space assets | hp 240, upkeep 1 | cmd11 |
| Reconnaissance Satellite | support | Global **fire-control** detection (space sensor) | radarKm ~9000 | det6 (+ Space Cmd HQ) |
| Missile-Warning Satellite | support | Global launch **warning** (warnOnly, space sensor) | radarKm ~14000 | det4 (+ Space Cmd HQ) |
| Orbital Strike Platform | offense | Global kinetic bombardment | range global, dmg 55, slow reload | off11 (+ Space Cmd HQ) |

### 8b. Naval (subs + logistics) — see §8c/§8d

| Unit | Kind | Role | Key stats (draft) | Gate |
|------|------|------|-------------------|------|
| Attack Submarine (SSN) | offense (sea) | Stealth hunter; anti-ship + land-attack cruise | range 2500, dmg 30, submarine, sonarKm 300 | eco4 Nuclear Power |
| Ballistic Missile Sub (SSBN) | offense (sea) | Survivable sea leg of the triad; global SLBM | range global, dmg 55, ballistic, deep stealth | cmd2 Nuclear Triad |
| Amphibious Transport | support (sea) | Ships ground units across ocean, lands them ashore | capacity 4 ground units, navalSpeed 60 | eco5 JIT Logistics |
| Replenishment Ship | support (sea) | Rearms/replenishes nearby friendly ships | resupplyKm 250, cuts fleet reload/ammo cost | eco5 JIT Logistics |

Space assets require the **Space Command HQ**; subs are their own hulls (no base
prereq). Exact stats finalized in the balance pass.

## 8b. New sensor tier: space radar

`RADAR_RING_COLORS` currently has `oth` (amber) and `radar` (cyan). Add **`space`
(violet, ~`#b98cff`)** for satellites so the three warning tiers read apart at a
glance. Recon Satellite = fire-control grade (feeds interceptor cueing like a
ground radar); Missile-Warning Satellite = `warnOnly` (launch warning, no fire
control), same as OTH. Their huge `radarKm` flows through the existing
`radarRangeOf`/`sensorsOf`/`radarMult` path unchanged — only the ring color and
the (already-shipped) Mercator coverage fill are new for them.

## 8c. Submarine stealth & anti-submarine warfare (new subsystem)

Subs are the reason detection gets interesting. New flags:

- Unit: `submarine: true` (hull is submerged/stealthy — **not** revealed by
  ordinary radar or satellites).
- Sensor: `asw: true` + `sonarKm` on ASW-capable platforms (destroyers, subs,
  and a new ASW patrol helo), meaning "can detect submerged hulls within
  `sonarKm`."

Detection changes (`queries.js`):

- `sensorsOf` tags each emitter with `asw`/`sonarKm`. A second helper
  `subSensorsOf(w, slot)` returns only ASW sensors.
- Enemy-unit visibility (`visUnits` in `useLiveLayers`) splits: a `submarine`
  enemy is visible only if covered by one of my **ASW** sensors; everything else
  keeps the current radar rule. So a sub sneaks through a radar net and only
  pops onto my map when a destroyer/ASW helo/friendly sub gets close — then
  fades back into the fog when it slips away.
- Ties to the tech tree: `det` techs (sensor fusion, tracking) scale `sonarKm`;
  this makes ASW a researchable counter to the SSBN second-strike.

## 8d. Naval integration with the tech tree

Naval is not a side branch — the tracks touch it directly:

- **Missile Shield (def):** Aegis/Standard-Missile and later interceptor techs
  raise **ship** intercept (`interceptAdd`) and defensive range, so your fleet's
  air-defense modernizes with the tree, and unlock the land Aegis Ashore/THAAD.
- **Early Warning (det):** sensor-fusion/tracking techs scale `sonarKm` (ASW) and
  ship `radarKm`, turning destroyers into better sub-hunters over time.
- **War Economy (eco):** Nuclear Power (eco4) is nuclear propulsion → unlocks the
  SSN; JIT Logistics (eco5) unlocks Amphibious Transport + Replenishment Ship.
- **Command & Control (cmd):** Nuclear Triad (cmd2) unlocks the SSBN (sea leg),
  completing air (silo/bomber) + land (mobile launcher) + sea (SSBN) triad.
- **Strategic Command (off):** hypersonic/HGV and orbital-strike techs also buff
  ship-launched strike range/damage where a hull carries those weapons.

Amphibious Transport carries ground units (`infantry/tank/artillery`) as embarked
cargo and lands them on a coastline — the sea bridge that lets the ground game
project overseas. Replenishment Ship applies a nearby-fleet buff (reduced reload
/ waived `fireCost`) within `resupplyKm`.

## 8e. Animated fog of war (new render subsystem)

Today fog is invisible-and-binary: enemy units simply don't render outside my
sensor coverage. Make it a **visible, animated veil**:

- New `FogLayer` (map overlay): a dark, semi-opaque layer over the whole board
  with **soft-edged reveal holes** cut by my live sensor coverage
  (`sensorsOf(mySlot)` → the same Mercator circles as the radar overlay, feathered).
- **Animation:** each reveal bubble eases its radius/opacity in when coverage
  appears and out when it leaves, so as a troop or ship moves the clear bubble
  travels with it — fog opening ahead and closing behind. Driven off the render
  loop already in `LiveGame`/`SkyLayer`; targets a light per-frame cost (a
  handful of animated circles, not a per-pixel simulation).
- **Accessibility:** honors reduced-motion — static reveal, no easing (mandatory
  per `ui-code` rules). Fog intensity is a settings toggle (some players want the
  clean tactical look); default on.
- Interaction with §8c: submarines and uncovered enemies stay under the veil;
  ASW contact briefly parts the fog around the detected sub, then it re-closes.

## 9. Files touched

Data / sim:
- `src/game/data/constants.js` — ERAS, rewritten TECHS (60, scaled, unlocks),
  new UNITS (+`requiresTech`, `submarine`, `asw`/`sonarKm`, `capacity`,
  `resupplyKm`), new nation multipliers, `RADAR_RING_COLORS.space`, UNIT_ICON,
  AI knobs.
- `src/game/sim/production.js` — `requiresTech` guard in `queueUnit`; embark/land
  orders for Amphibious Transport.
- `src/game/sim/queries.js` — `subSensorsOf` (ASW); submarine-visibility split;
  `sonarKm`/`radarMult` scaling; replenishment buff query.
- `src/game/sim/tick.js` — `unlocks` no-op (gate reads `done`); ASW reveal;
  replenishment application; AI research-depth + build-new-units (incl. subs).
- `src/game/sim/combat.js` — SSBN/orbital global strike; sub anti-ship targeting.
- `src/game/engine.js` — re-export ERAS / new query symbols.

UI / render:
- `src/ui/screens/TechTree.jsx` — era banding, 12-tier scroll, unlock badges.
- `src/ui/panels/UnitsPanel.jsx` (+ `ProductionScreen`) — tech-locked unit display,
  Naval/Space categories.
- `src/ui/live/useLiveLayers.js` — submarine fog split; space ring color; fog FC.
- `src/ui/live/FogLayer.jsx` (**new**) — animated fog veil + reduced-motion path.
- `src/ui/live/LiveGame.jsx` — mount FogLayer; embark/land interactions.
- `src/ui/screens/SettingsPanel.jsx` — fog toggle.
- `public/icons/*` — SVGs for the new units (space + naval, ~14 total) + glyphs.

Docs (framework):
- `design/gdd/tech-tree-eras.md`, `design/gdd/naval-subs-asw.md`,
  `design/gdd/fog-of-war.md` — GDDs.
- `docs/architecture/adr-00X-tech-gated-units.md`,
  `adr-00Y-submarine-stealth-asw.md` — ADRs.

## 10. Balance & acceptance

- Escalating cost/time verified by a headless progression sim (time-to-space-age
  is meaningfully long; no tier is trivially skippable).
- Every unlock tech maps to exactly one buildable unit; every new unit has a
  reachable gate; no orphan techs or units.
- Headless functional tests: (a) research a chain to an unlock tech → the gated
  unit builds; before the tech it's refused; (b) a submarine stays out of an
  enemy's `visUnits` under radar-only coverage and appears only under ASW
  coverage; (c) Amphibious Transport embarks a ground unit and lands it on a
  coast; (d) Replenishment buff applies within `resupplyKm`.
- `npm run lint` 0 errors, `npm run build` green, in-app smoke (era bands render,
  locked units greyed, unlocks flip on completion, fog animates and honors
  reduced-motion, space/sub rings show).

## 11. Out of scope (this pass)

- True orbital mechanics / moving satellites (abstracted as fixed global assets).
- New research-track additions (stay at 5 tracks).
- Per-pixel/volumetric fog — the veil is animated feathered circles, not a sim.
- Multiplayer balancing beyond parity with the single tree.

## 12. Execution (subagent pipeline, one go)

**Phase 1 — data contract (serial, blocking).** One design/data agent authors the
GDDs + ADRs and writes the full data layer everyone else builds against: 60-tech
`TECHS` (scaled, `unlocks`), `ERAS`, all new `UNITS` (land/space/naval + flags),
`RADAR_RING_COLORS.space`, new nation multipliers (defaulted in `createWorld`),
`UNIT_ICON` keys. This is the schema barrier — nothing downstream starts until it
lands.

**Phase 2 — fan-out (parallel).**
- **Engine agent** — `requiresTech` gate + AI depth/build logic (`production.js`,
  `tick.js`), global strike + sub targeting (`combat.js`).
- **Detection/naval agent** — `subSensorsOf` + submarine-visibility split + ASW/
  sonar scaling + replenishment buff (`queries.js`, `useLiveLayers.js`), embark/
  land orders.
- **Tech-tree UI agent** — era banding + 12-tier scroll + unlock badges + locked-
  unit display (`TechTree.jsx`, `UnitsPanel.jsx`).
- **Fog agent** — new `FogLayer.jsx` animated veil + reduced-motion + settings
  toggle, wired into `LiveGame`.
- **Art agent** — ~14 unit SVG icons (space + naval) + any new glyphs.

**Phase 3 — integrate + verify (serial).** QA/balance agent runs the headless
progression, unlock, submarine-stealth, amphibious, and replenishment tests +
`/balance-check` + lint/build/in-app smoke; fixes fallout or reports blockers.

Orchestrated as data → fan-out → verify so it completes in a single run. Because
the fan-out agents touch overlapping files (`constants.js`, `useLiveLayers.js`,
`LiveGame.jsx`), Phase 1 fully lands those files' new *data/exports* first and
Phase 2 agents are scoped to disjoint functions/regions (or run in worktrees and
merge) to avoid collisions. Nothing commits; `/release` remains the only git
entry point.
