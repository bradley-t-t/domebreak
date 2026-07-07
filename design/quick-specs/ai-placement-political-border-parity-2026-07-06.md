<h1 align="center">AI Placement Political-Border Parity</h1>

<p align="center">
  <b>Bind AI unit placement to the same real political-border test the human player already obeys, replacing the Voronoi nearest-city approximation that let AI units spill across frontiers.</b>
</p>

<br />

**Type**: Tweak
**System**: AI Strategic Placement / Territory
**GDD Reference**: `design/gdd/full-world-nations-and-diplomacy.md`; supersedes the territory rule reused in `design/quick-specs/ai-strategic-placement-2026-07-06.md`
**Date**: 2026-07-06

## Change Summary

Bind AI unit placement to the AI nation's real political border — the same
constraint the human player is bound to — instead of the Voronoi nearest-city
approximation that spills across borders.

## Motivation

The human and AI use two different definitions of "territory." The human is
gated by the political country polygon (`GID_0 === myGid`, via MapLibre in
`LiveGame`, then `buyPlace(..., territoryOk=true)` which bypasses `inTerritory`),
while the AI is gated by `inTerritory` — a Voronoi nearest-city-within-550km
approximation that ignores political borders. Near frontiers these disagree, and
the AI legally (by its own rule) places units inside the player's political
country — reported as "AI placing units in my territory." Prior Voronoi patches
only de-conflicted the approximation between nations; they never tied the AI to
the political borders the player is actually bound by, so it kept leaking.

## Design Delta

**Current** (`inTerritory`, `queries.js`): a point belongs to a nation iff the
globally-nearest living city is one of that nation's and lies within
`TERRITORY_RADIUS` (550 km).

**This spec adds** a political-border test as the AI's placement gate: a
candidate point is valid for AI nation *N* only if the point lies inside a
polygon whose country code equals `toGid3(N.iso)`. Ground truth comes from a
bundled country-ownership raster generated from `public/assets/regions-seed.geojson`
(keyed by `gid0`), queried in the pure sim via `countryGidAt(lng, lat)`.

The human path is unchanged (already political-border-bound); this brings the AI
to parity. `inTerritory` remains for the naval/coastal-water fallback where no
land polygon applies.

## New Rules / Values

- New generated artifact `src/game/geo/countryGrid.js` (seaGrid-style):
  `COUNTRY_W`, `COUNTRY_H`, a run-length-encoded payload, and
  `countryGidAt(lng, lat) → GID_0 string | null`.
- New generator `scripts/gen-countrygrid.mjs` (mirrors `gen-seagrid.mjs`
  scanline fill), rasterizing `regions-seed.geojson` polygons by `gid0`.
- New query `inOwnCountry(w, slot, lng, lat)` in `queries.js`:
  `countryGidAt(lng,lat) === toGid3(nationOf(w,slot).iso)`.
- AI land placement (`spotAround` rings + fallback) and `aiPlace` gate on
  `inOwnCountry`. Sea placement (`aiSeaSpot`) keeps `inTerritory` (offshore has
  no land polygon) and remains anchored to the nation's own coastal city.
- Grid resolution 0.25° (matches seaGrid); run-length encoded per row to keep
  the artifact small.

## Affected Systems

| System | Impact | Action Required |
|--------|--------|-----------------|
| AI placement (`tick.js`) | placement gate swapped to political border | update code |
| Territory queries (`queries.js`) | add `inOwnCountry` | update code |
| Geo (`src/game/geo/`) | new `countryGrid.js` + generator | add files |
| Human placement (`LiveGame.jsx`) | none — already political-border-bound | no action |

## Acceptance Criteria

- [ ] `countryGidAt(lng,lat)` returns the correct `GID_0` for interior points of
  several nations (US→USA, RUS→RUS, open ocean → null); verified against known
  coordinates.
- [ ] AI never queues a land unit whose coordinate resolves to a `GID_0` other
  than its own nation's (headless sim assertion across a multi-nation match).
- [ ] The leak is gone: no AI-owned unit lands inside the human player's country
  polygon.
- [ ] No regression: AI still fields a full doctrine (defenses, radar, industry,
  bunker, offense) — the tighter gate doesn't starve placement; `spotAround`
  fallback still finds valid in-country spots.
- [ ] Sea/coastal placement unaffected; naval units still deploy in the nation's
  coastal waters.
- [ ] `npm run build` + `npm run lint` clean.

## GDD Update Required?

No. `full-world-nations-and-diplomacy.md` doesn't define the territory contract
as Voronoi; this refines an implementation detail. The superseded territory note
in `ai-strategic-placement-2026-07-06.md` is cross-referenced here.
