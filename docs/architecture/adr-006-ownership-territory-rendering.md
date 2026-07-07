<h1 align="center">ADR-0006: Ownership-Driven Territory Rendering</h1>

<p align="center">
  <b>The political map recolors provinces by who controls them — driven by city ownership over real GADM level-1 geometry — so conquest and, above all, a civil-war splinter show as distinct territory with real borders, instead of the static per-ISO flag map that could never distinguish a breakaway state.</b>
</p>

<br />

## Status

Accepted

## Date

2026-07-07

## Last Verified

2026-07-07

## Decision Makers

Trenton (studio owner); Sunday (implementation).

## Summary

Territory control is now shown on the map. A province is recolored only when its
controller is not its native nation: land captured in war takes the conqueror's flag
color, and a civil-war breakaway takes its own per-slot color, each with a border
along the real province edges. Peacetime territory is untouched, so the existing
per-ISO flag map (colors.json) is unchanged until a border actually moves.

## Engine Compatibility

No engine/renderer version change. Uses MapLibre GL data-driven paint expressions
(`match` on `GID_1`) already available in the pinned `maplibre-gl`, over the existing
`regions.pmtiles` vector source (GADM level-1, fields `GID_0` / `GID_1` / `NAME_1`).
No new runtime dependency.

## Context

Ownership in the sim is per-city (`city.slot`); territory is a Voronoi partition of
living cities, and conquest/secession simply flip `city.slot`. The **map**, however,
colored political territory by the static `GID_0` (ISO3) baked into the country tiles
via a `["match", GID_0, …]` lookup into `colors.json`. Slot ownership never reached
the map.

This broke the civil-war feature specifically: `fractureNation` spawns the breakaway
with `iso: parent.iso`, so it shares the parent's `GID_0` and flag color. On the map
the seceded half was indistinguishable from the loyal half — no new country, no new
border. Conquest was likewise invisible.

To draw a splinter as its own entity we need (a) sub-national geometry to color, and
(b) a color source keyed to control rather than ISO. The `regions` tiles already carry
per-province geometry (`GID_1`); the missing piece is a robust province → owner join.
City province names (`city.state`) match GADM `NAME_1` only ~80% globally and 0% for
several countries (Poland, Greece, Taiwan…), so name-joining is not acceptable for a
feature that must work for a civil war anywhere.

## Decision

1. **Precompute city → province by geometry, not names.** A build script
   (`scripts/gen-city-region.mjs`) runs point-in-polygon of every seed city against
   `regions-seed.geojson` and emits `public/assets/city-region.json`
   (`"${iso}-${index}" → GID_1`), keyed to the engine's runtime city ids. Coverage is
   99.6% (2472 contained + 82 nearest-fallback; 11 micro-states without region geometry).

2. **Compute province ownership at runtime, recolor only overrides.**
   `ui/live/useOwnershipLayer.js` groups living cities by `GID_1`, takes the
   population-majority slot as the province owner, and emits a color **only** when the
   owner is non-native: a rebel gets `colorForSlot(slot)`, any other controller gets
   its flag color (`colors.json[GID_0]`). Native-held provinces emit nothing and keep
   the base flag map. The heavy recompute is gated behind a cheap per-tick ownership
   checksum, so it runs only when a border moves.

3. **Render as a `match` overlay under the national borders.** Two layers on the
   existing `db-regions` source in `LiveGame`: a fill whose `fill-color` is a
   `["match", ["get","GID_1"], …overrides, transparent]` expression, and a line
   filtered to the overridden `GID_1`s for the territory edge. Both sit `beforeId:
   "country-line"` so national borders still read on top.

## Alternatives Considered

- **Feature-state + `setFeatureState` per province** (promoteId `GID_1`). Equivalent
  visually; rejected as heavier plumbing than a rebuilt `match` expression, given
  overrides are sparse and change rarely.
- **Voronoi territory overlay from cities** (generated GeoJSON per slot). Handles any
  number of owners but renders as rounded blobs, not real borders — fails the "looks
  like two countries" bar.
- **Name-join `city.state` ↔ `NAME_1`.** Simple but only ~80% global / 0% for whole
  countries; unacceptable for an anywhere-civil-war feature. Rejected in favor of the
  geometric precompute.
- **Recolor every province by owner (drop the flag map).** Would erase the tuned flag
  identity in peacetime. Rejected: recolor only non-native control.

## Consequences

- Civil-war splinters and war conquests are now visible on the political map with real
  province borders; the flag map is unchanged in peacetime.
- A new build artifact (`public/assets/city-region.json`, ~45 KB) is committed and must
  be regenerated (`node scripts/gen-city-region.mjs`) if `cities.json` or the region
  geometry changes.
- Province ownership is population-majority, so a province split mid-fracture snaps to
  one owner along real borders — a slight approximation of the sim's exact
  city-Voronoi, chosen for a cleaner, real-border look.
- The overlay is presentation-only: it reads engine state and never mutates it, keeping
  the tick deterministic.
