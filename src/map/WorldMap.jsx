/*!
 * GoldenDome board. Reused Open Historia PMTiles tiles (MIT) under a fresh
 * MapLibre renderer, with globe + flat projection. Renders optional lobby city
 * markers and accepts children for live-game overlays.
 */
import { useEffect, useMemo, useRef } from "react";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import Map, { Marker } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { SLOT_COLOR } from "../game/constants.js";

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
      { id: "bg", type: "background", paint: { "background-color": "#060b16" } },
      { id: "regions-fill", type: "fill", source: "regions", "source-layer": "regions",
        paint: { "fill-color": "#12233d", "fill-opacity": 0.85 } },
      { id: "country-fill", type: "fill", source: "countries", "source-layer": "countries",
        paint: { "fill-color": "#1b3054", "fill-opacity": 0.6 } },
      { id: "country-line", type: "line", source: "countries", "source-layer": "countries",
        paint: { "line-color": "#4d6ea6", "line-width": 0.7, "line-opacity": 0.8 } },
    ],
  };
}

export default function WorldMap({
  cities = [], myCityIds, slotByPlayer = {}, globe = true,
  onMapClick, onMouseMove, cursor = "grab", children,
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
      onLoad={(e) => applyProjection(e.target)}
      onClick={(e) => onMapClick && onMapClick(e.lngLat)}
      onMouseMove={(e) => onMouseMove && onMouseMove(e.lngLat)}
      style={{ position: "absolute", inset: 0 }}
      cursor={cursor}
    >
      {cities.map((c) => {
        const mine = myCityIds?.has(c.id);
        const color = c.alive === false ? "#3a3a3a" : (SLOT_COLOR[slotByPlayer[c.player_id]] || "#8aa0bd");
        return (
          <Marker key={c.id} longitude={c.lng} latitude={c.lat} anchor="center">
            <div className={`gd-city ${mine ? "mine" : "enemy"}`} title={c.name}>
              <span className="gd-city-dot" style={{ background: color }} />
              <span className="gd-city-name">{c.name}</span>
            </div>
          </Marker>
        );
      })}
      {children}
    </Map>
  );
}
