<h1 align="center">Animated Fog of War</h1>

<p align="center">
  <b>A dark, animated veil that peels back around your live sensor coverage and closes in wherever contact is lost.</b>
</p>

<br />

## 1. Overview

Fog of war becomes a visible, animated veil instead of the current invisible,
binary hide (enemies simply don't render outside sensor coverage). A dark,
semi-opaque overlay covers the board with soft-edged reveal holes cut by the local
commander's live sensor coverage. Reveal bubbles ease in/out as coverage moves, so
a clear bubble travels with each troop or ship — fog opening ahead and closing
behind. This GDD is the design of record; the render layer (`FogLayer.jsx`) is a
Phase-2 deliverable. The data layer contributes only the space sensor ring color
(`RADAR_RING_COLORS.space`) and the sensor types that feed the veil.

## 2. Player Fantasy

The map feels alive and uncertain. You push a scout forward and watch the dark peel
back around it; you lose contact and the unknown closes back in. A submarine surfaces
from the murk for a heartbeat when your destroyer pings it, then vanishes again.

## 3. Detailed Rules

- **Veil**: a dark, semi-opaque layer over the whole board, with feathered reveal
  holes cut by `sensorsOf(mySlot)` — the same Mercator coverage circles as the radar
  overlay, soft-edged.
- **Animation**: each reveal bubble eases its radius/opacity in when coverage appears
  and out when it leaves, driven off the render loop already in `LiveGame`/`SkyLayer`.
  Target: a handful of animated circles, not a per-pixel simulation.
- **Accessibility**: honors reduced-motion — static reveal, no easing (mandatory per
  `ui-code` rules). A settings toggle turns fog off for players who want the clean
  tactical look; default on.
- **Sensor tiers & ring colors** (data, this pass): three warning tiers read apart by
  ring color — `radar` (cyan `#4fc3e8`, fire control), `oth` (amber `#e8a33d`,
  warn-only), and the new `space` (violet `#b98cff`) for satellites. Recon Satellite
  is fire-control grade (cues interceptors like a ground radar); Missile-Warning
  Satellite is `warnOnly`. Both satellite unit types map to the `space` ring color in
  `RADAR_RING_COLORS`.
- **Submarine interaction** (with naval GDD): submarines and uncovered enemies stay
  under the veil; an ASW contact briefly parts the fog around the detected sub, then it
  re-closes.

## 4. Formulas

- **Reveal radius** per emitter follows the existing `radarRangeOf`/`sensorsOf` path
  (unchanged): `coverageKm = radarKm * nation.radarMult` for radiating sensors.
- **Ease** (Phase 2): bubble radius/opacity interpolate toward target with a fixed
  time constant; reduced-motion sets the interpolation to instantaneous.
- No new tuning numbers enter the data layer for fog beyond the ring color; fog
  opacity/feather/ease constants live with the Phase-2 `FogLayer` and settings.

## 5. Edge Cases

- **Reduced-motion**: no easing — reveal holes are static per frame.
- **Fog disabled**: the veil is not drawn; visibility rules are unchanged (fog is a
  render concern, not a gameplay-truth concern).
- **Overlapping coverage**: reveal holes union (max coverage), never darken where two
  bubbles overlap.
- **Space sensors**: very large `radarKm` (recon 9000, warn 14000) produce huge
  reveal holes; the veil must clamp/feather them without visual artifacts.

## 6. Dependencies

- **Detection queries** (`sim/queries.js`) — `sensorsOf`/`radarRangeOf` supply the
  circles.
- **Naval/ASW GDD** — submarine visibility split; ASW fog-parting.
- **`RADAR_RING_COLORS`** (`constants.js`) — `space` ring color (this pass).
- **Settings** (`platform/settings.js`, Phase 2) — fog on/off toggle.
- **Render loop** (`LiveGame`/`SkyLayer`) — per-frame animation host.

## 7. Tuning Knobs

- `RADAR_RING_COLORS.space` (data, this pass).
- (Phase 2) fog base opacity, feather width, ease time constant, default toggle state.

## 8. Acceptance Criteria

- `RADAR_RING_COLORS.space === "#b98cff"`; `reconsat` and `warnsat` resolve to that
  color via `RADAR_RING_COLORS[unit.type]`.
- (Phase 2) Fog animates in/out with coverage and honors reduced-motion.
- (Phase 2) Space and OTH/radar rings are visually distinct on the map.

<br />

<p align="center">
  <sub>Push a scout forward and the dark peels back; lose contact and the unknown closes in behind it.</sub>
</p>
