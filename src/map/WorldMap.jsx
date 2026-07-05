/*!
 * GoldenDome board. Reused Open Historia PMTiles tiles (MIT) under a fresh
 * MapLibre renderer, with globe + flat projection. Accepts children for overlays.
 */
import { useEffect, useMemo, useRef } from "react";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import Map from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

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
function buildStyle() {
  return {
    version: 8,
    sources: {
      countries: { type: "vector", url: tilesUrl("countries") },
      regions: { type: "vector", url: tilesUrl("regions") },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#060a12" } },
      { id: "regions-fill", type: "fill", source: "regions", "source-layer": "regions",
        paint: { "fill-color": "#0f1d33", "fill-opacity": 0.85 } },
      { id: "country-fill", type: "fill", source: "countries", "source-layer": "countries",
        paint: { "fill-color": "#17294a", "fill-opacity": 0.55 } },
      { id: "country-line", type: "line", source: "countries", "source-layer": "countries",
        paint: { "line-color": "#38507a", "line-width": 0.6 } },
    ],
  };
}

export default function WorldMap({
  globe = true, onMapClick, onMouseMove, onContextMenu, onMap,
  cursor = "grab", interactiveLayerIds, children,
}) {
  const mapRef = useRef(null);
  const mapStyle = useMemo(buildStyle, []);
  ensurePmtiles();

  const applyProjection = (map) => {
    try { map.setProjection({ type: globe ? "globe" : "mercator" }); } catch { /* older gl */ }
  };
  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (map) applyProjection(map);
  }, [globe]);

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
      onLoad={(e) => { applyProjection(e.target); if (onMap) onMap(e.target); }}
      onClick={(e) => onMapClick && onMapClick(e)}
      onContextMenu={(e) => { e.originalEvent?.preventDefault?.(); onContextMenu && onContextMenu(e); }}
      onMouseMove={(e) => onMouseMove && onMouseMove(e.lngLat)}
      style={{ position: "absolute", inset: 0 }}
      cursor={cursor}
    >
      {children}
    </Map>
  );
}
