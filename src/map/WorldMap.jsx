/*!
 * GoldenDome board. Reused Open Historia PMTiles tiles (MIT) under a fresh
 * MapLibre renderer, with globe + flat projection. Accepts children for overlays.
 *
 * Rendering stack (bottom -> top): deep-sea base, real Natural-Earth relief
 * (faded in only when zoomed in), depth-graded ocean from Natural-Earth
 * bathymetry (+ animated coastal shimmer / drifting isobaths), then the
 * political fills/borders which thin out on zoom-in so the real terrain reads.
 */
import { useEffect, useMemo, useRef } from "react";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import Map from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { startWater } from "./water.js";

let pmtilesRegistered = false;
function ensurePmtiles() {
  if (pmtilesRegistered) return;
  maplibregl.addProtocol("pmtiles", new Protocol().tile);
  pmtilesRegistered = true;
}
function tilesUrl(name) {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `pmtiles://${base}/assets/${name}.pmtiles`;
}
function assetUrl(name) {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `${base}/assets/${name}`;
}

// Web-Mercator clamp latitude — the relief image was reprojected to span exactly
// this, so its corners line up with the mercator vector tiles.
const MERC_LAT = 85.05112878;

// Ocean color by Natural-Earth depth band (0 = continental shelf, 6 = abyss).
// Bands nest and stack, so drawing shallow->deep yields the depth gradient.
const OCEAN_DEPTH_COLOR = ["match", ["get", "depth"],
  0, "#12455f", 1, "#0f3a51", 2, "#0c3044", 3, "#0a2637",
  4, "#081f2d", 5, "#071925", 6, "#05131d", "#0a2637"];

// Level-of-detail: far out keep the current flat command-map look; zooming in
// fades the real relief in and thins the political wash so terrain shows through.
export const RELIEF_OPACITY = ["interpolate", ["linear"], ["zoom"], 3.2, 0, 3.9, 0.2, 5.5, 0.92];
export const REGIONS_FILL_OPACITY = ["interpolate", ["linear"], ["zoom"], 3, 0.85, 4, 0.82, 5.5, 0.42];
export const COUNTRY_FILL_OPACITY = ["interpolate", ["linear"], ["zoom"], 3, 0.55, 4, 0.5, 5.5, 0.24];
const COUNTRY_LINE_WIDTH = ["interpolate", ["linear"], ["zoom"], 2, 0.5, 6, 1.5];

function buildStyle() {
  return {
    version: 8,
    sources: {
      relief: {
        type: "image",
        url: assetUrl("relief.jpg"),
        coordinates: [
          [-180, MERC_LAT], [180, MERC_LAT], [180, -MERC_LAT], [-180, -MERC_LAT],
        ],
      },
      bathymetry: { type: "geojson", data: assetUrl("bathymetry.geojson") },
      countries: { type: "vector", url: tilesUrl("countries") },
      regions: { type: "vector", url: tilesUrl("regions") },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#060c14" } },
      // Real geography, muted so it reads as a lit war map rather than satellite.
      { id: "relief", type: "raster", source: "relief",
        paint: {
          "raster-opacity": RELIEF_OPACITY, "raster-saturation": -0.18,
          "raster-brightness-max": 0.86, "raster-contrast": 0.06,
          "raster-resampling": "linear", "raster-fade-duration": 250,
        } },
      // Depth-graded ocean (opaque — also masks the relief's flat sea).
      { id: "ocean-depth", type: "fill", source: "bathymetry",
        paint: { "fill-color": OCEAN_DEPTH_COLOR, "fill-antialias": false } },
      // Animated coastal shimmer over the shallow shelf (opacity driven in water.js).
      { id: "ocean-glow", type: "fill", source: "bathymetry",
        filter: ["<=", ["get", "depth"], 1],
        paint: { "fill-color": "#2f7f96", "fill-opacity": 0.06 } },
      // Drifting isobaths / coastline (translate + opacity driven in water.js).
      { id: "ocean-contour", type: "line", source: "bathymetry",
        paint: {
          "line-color": "#4aa0b5",
          "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.4, 6, 1.1],
          "line-opacity": 0.11,
        } },
      { id: "regions-fill", type: "fill", source: "regions", "source-layer": "regions",
        paint: { "fill-color": "#0f1d33", "fill-opacity": REGIONS_FILL_OPACITY } },
      { id: "country-fill", type: "fill", source: "countries", "source-layer": "countries",
        paint: { "fill-color": "#17294a", "fill-opacity": COUNTRY_FILL_OPACITY } },
      { id: "country-line", type: "line", source: "countries", "source-layer": "countries",
        paint: { "line-color": "#38507a", "line-width": COUNTRY_LINE_WIDTH } },
    ],
  };
}

export default function WorldMap({
  globe = true, onMapClick, onMouseMove, onContextMenu, onMap,
  cursor = "grab", interactiveLayerIds, children,
}) {
  const mapRef = useRef(null);
  const stopWater = useRef(null);
  const mapStyle = useMemo(buildStyle, []);
  ensurePmtiles();

  const applyProjection = (map) => {
    try { map.setProjection({ type: globe ? "globe" : "mercator" }); } catch { /* older gl */ }
  };
  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (map) applyProjection(map);
  }, [globe]);
  useEffect(() => () => { stopWater.current?.(); }, []);

  return (
    <Map
      ref={mapRef}
      initialViewState={{ longitude: 12, latitude: 30, zoom: 2.2 }}
      minZoom={1.1}
      maxZoom={7}
      mapStyle={mapStyle}
      attributionControl={false}
      dragRotate={false}
      interactiveLayerIds={interactiveLayerIds}
      onLoad={(e) => { applyProjection(e.target); stopWater.current = startWater(e.target); if (onMap) onMap(e.target); }}
      onClick={(e) => onMapClick && onMapClick(e)}
      onContextMenu={(e) => { e.originalEvent?.preventDefault?.(); onContextMenu && onContextMenu(e); }}
      onMouseMove={(e) => onMouseMove && onMouseMove(e)}
      style={{ position: "absolute", inset: 0 }}
      cursor={cursor}
    >
      {children}
    </Map>
  );
}
