/*!
 * GoldenDome world-map board.
 * Renders the reused Open Historia PMTiles world tiles (MIT) through a fresh,
 * minimal MapLibre renderer. Tile data (c) 2026 Open Historia contributors /
 * Nicholas Krol, used under the MIT License (see NOTICE).
 */
import { useMemo } from "react";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import Map from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

// Register the pmtiles:// protocol with MapLibre exactly once.
let pmtilesRegistered = false;
function ensurePmtiles() {
  if (pmtilesRegistered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  pmtilesRegistered = true;
}

// Static tiles live in /public/assets and are read client-side via HTTP range
// requests, so no tile server is needed.
function tilesUrl(name) {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `pmtiles://${base}/assets/${name}.pmtiles`;
}

function buildStyle() {
  return {
    version: 8,
    sources: {
      countries: { type: "vector", url: tilesUrl("countries") },
      regions: { type: "vector", url: tilesUrl("regions") },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#070b12" } },
      {
        id: "regions-fill",
        type: "fill",
        source: "regions",
        "source-layer": "regions",
        paint: { "fill-color": "#132339", "fill-opacity": 0.85 },
      },
      {
        id: "country-fill",
        type: "fill",
        source: "countries",
        "source-layer": "countries",
        paint: { "fill-color": "#1b2c49", "fill-opacity": 0.55 },
      },
      {
        id: "country-line",
        type: "line",
        source: "countries",
        "source-layer": "countries",
        paint: { "line-color": "#3f5578", "line-width": 0.6 },
      },
    ],
  };
}

export default function WorldMap() {
  ensurePmtiles();
  const mapStyle = useMemo(buildStyle, []);
  return (
    <Map
      initialViewState={{ longitude: 12, latitude: 28, zoom: 2.2 }}
      minZoom={1.2}
      maxZoom={7}
      mapStyle={mapStyle}
      attributionControl={false}
      dragRotate={false}
      style={{ position: "absolute", inset: 0 }}
    />
  );
}
