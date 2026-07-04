/*!
 * GoldenDome board. Reused Open Historia PMTiles tiles (MIT) under a fresh
 * MapLibre renderer, with globe + flat projection and game overlays.
 */
import { useEffect, useMemo, useRef } from "react";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import Map, { Marker, Source, Layer } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { TOOLS, SLOT_COLOR } from "../game/constants.js";

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
  cities = [], myCityIds, placements = [], tool, mySlot,
  onMapClick, onCityClick, arcs = [], flashes = {}, globe = true,
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

  const arcsFC = useMemo(() => ({ type: "FeatureCollection", features: arcs }), [arcs]);

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
      style={{ position: "absolute", inset: 0 }}
      cursor={tool && tool !== "silo" ? "crosshair" : "grab"}
    >
      <Source id="arcs" type="geojson" data={arcsFC}>
        <Layer id="arc-line" type="line"
          paint={{
            "line-color": ["match", ["get", "slot"], 0, SLOT_COLOR[0], 1, SLOT_COLOR[1], "#fff"],
            "line-width": 2, "line-opacity": 0.85,
          }} />
      </Source>

      {cities.map((c) => {
        const mine = myCityIds?.has(c.id);
        const flash = flashes[c.id];
        const targetable = tool === "silo" && !mine && c.alive;
        return (
          <Marker key={c.id} longitude={c.lng} latitude={c.lat} anchor="center"
            onClick={(ev) => { ev.originalEvent.stopPropagation(); onCityClick && onCityClick(c); }}>
            <div className={`gd-city ${mine ? "mine" : "enemy"} ${!c.alive ? "dead" : ""} ${targetable ? "targetable" : ""} ${flash ? "flash-" + flash : ""}`}
              title={`${c.name} — ${c.hp} hp`}>
              <span className="gd-city-dot" />
              <span className="gd-city-name">{c.name}</span>
            </div>
          </Marker>
        );
      })}

      {placements.map((p) => (
        <Marker key={p.id} longitude={p.lng} latitude={p.lat} anchor="center">
          <div className="gd-placement" style={{ color: SLOT_COLOR[mySlot] }} title={TOOLS[p.kind]?.label}>
            {TOOLS[p.kind]?.glyph}
          </div>
        </Marker>
      ))}
    </Map>
  );
}
