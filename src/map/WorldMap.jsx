/*!
 * GoldenDome board. PMTiles tiles under a MapLibre renderer, with globe + flat
 * projection. Accepts children for overlays.
 *
 * Rendering stack (bottom -> top): deep-sea base, real Natural-Earth relief
 * (faded in only when zoomed in), depth-graded ocean from Natural-Earth
 * bathymetry (+ animated coastal shimmer / drifting isobaths), then the
 * political fills/borders which thin out on zoom-in so the real terrain reads.
 */
import {useEffect, useMemo, useRef} from "react";
import maplibregl from "maplibre-gl";
import {Protocol} from "pmtiles";
import Map from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import {startWater} from "./water.js";

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
// Monochrome depth ramp — near-black abyss up to a dark-grey continental shelf.
const OCEAN_DEPTH_COLOR = ["match", ["get", "depth"],
    0, "#2b3037", 1, "#24282e", 2, "#1e2127", 3, "#181a1f",
    4, "#131519", 5, "#0f1013", 6, "#0a0b0d", "#181a1f"];

// Level-of-detail: far out keep the current flat command-map look; zooming in
// fades the real relief in and thins the political wash so terrain shows through.
export const RELIEF_OPACITY = ["interpolate", ["linear"], ["zoom"], 3.2, 0, 3.9, 0.2, 5.5, 0.92];
export const REGIONS_FILL_OPACITY = ["interpolate", ["linear"], ["zoom"], 3, 0.85, 4, 0.82, 5.5, 0.42];
export const COUNTRY_FILL_OPACITY = ["interpolate", ["linear"], ["zoom"], 2, 0.96, 3, 0.9, 4, 0.62, 5.5, 0.24];
// Far out, land is a light grey that clearly reads against the near-black ocean;
// as you zoom in and the real (desaturated) relief fades up, land settles darker.
const COUNTRY_FILL_COLOR = ["interpolate", ["linear"], ["zoom"], 2, "#767b84", 3.2, "#4c515a", 4.2, "#3a3f47", 5.5, "#2e3239"];
const COUNTRY_LINE_COLOR = ["interpolate", ["linear"], ["zoom"], 2, "#9ba1ab", 4, "#686e77", 6, "#464b53"];
const COUNTRY_LINE_WIDTH = ["interpolate", ["linear"], ["zoom"], 2, 0.6, 6, 1.5];

function buildStyle(globe) {
    return {
        version: 8,
        // Bake the projection into the style so the very first painted frame is
        // already a globe (or flat). Without this, MapLibre renders one flat
        // mercator frame before onLoad's setProjection kicks in — the "flat
        // flashes before the globe" ugliness on the attract screen.
        projection: {type: globe ? "globe" : "mercator"},
        sources: {
            relief: {
                type: "image",
                url: assetUrl("relief.jpg"),
                coordinates: [
                    [-180, MERC_LAT], [180, MERC_LAT], [180, -MERC_LAT], [-180, -MERC_LAT],
                ],
            },
            bathymetry: {type: "geojson", data: assetUrl("bathymetry.geojson")},
            countries: {type: "vector", url: tilesUrl("countries")},
            regions: {type: "vector", url: tilesUrl("regions")},
        },
        layers: [
            {id: "bg", type: "background", paint: {"background-color": "#08090b"}},
            // Real geography, fully desaturated to greyscale so it reads as a mono command map.
            {
                id: "relief", type: "raster", source: "relief",
                paint: {
                    "raster-opacity": RELIEF_OPACITY, "raster-saturation": -1,
                    "raster-brightness-max": 0.82, "raster-contrast": 0.08,
                    "raster-resampling": "linear", "raster-fade-duration": 250,
                }
            },
            // Depth-graded ocean (opaque — also masks the relief's flat sea).
            {
                id: "ocean-depth", type: "fill", source: "bathymetry",
                paint: {"fill-color": OCEAN_DEPTH_COLOR, "fill-antialias": false}
            },
            // Animated coastal shimmer over the shallow shelf (opacity driven in water.js).
            {
                id: "ocean-glow", type: "fill", source: "bathymetry",
                filter: ["<=", ["get", "depth"], 1],
                paint: {"fill-color": "#464d55", "fill-opacity": 0.06}
            },
            // Drifting isobaths / coastline (translate + opacity driven in water.js).
            {
                id: "ocean-contour", type: "line", source: "bathymetry",
                paint: {
                    "line-color": "#535a63",
                    "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.4, 6, 1.1],
                    "line-opacity": 0.11,
                }
            },
            {
                id: "regions-fill", type: "fill", source: "regions", "source-layer": "regions",
                paint: {"fill-color": "#1b1e23", "fill-opacity": REGIONS_FILL_OPACITY}
            },
            {
                id: "country-fill", type: "fill", source: "countries", "source-layer": "countries",
                paint: {"fill-color": COUNTRY_FILL_COLOR, "fill-opacity": COUNTRY_FILL_OPACITY}
            },
            // Subtle national tint washed over the grey land — per-country flag color
            // is injected at runtime (LiveGame) once colors.json loads; fades out as
            // you zoom in and the real relief takes over.
            {
                id: "country-tint", type: "fill", source: "countries", "source-layer": "countries",
                paint: {
                    "fill-color": "#767b84",
                    "fill-opacity": ["interpolate", ["linear"], ["zoom"], 2, 0.16, 3.4, 0.1, 5, 0]
                }
            },
            {
                id: "country-line", type: "line", source: "countries", "source-layer": "countries",
                paint: {
                    "line-color": COUNTRY_LINE_COLOR, "line-width": COUNTRY_LINE_WIDTH,
                    "line-opacity": ["interpolate", ["linear"], ["zoom"], 2, 0.6, 5, 0.42]
                }
            },
        ],
    };
}

export default function WorldMap({
                                     globe = true, onMapClick, onMouseMove, onContextMenu, onMap,
                                     cursor = "grab", interactiveLayerIds, children,
                                 }) {
    const mapRef = useRef(null);
    const stopWater = useRef(null);
    // Seed the style's projection from the initial globe value so first paint is
    // correct. Runtime flat/globe toggles still go through setProjection below,
    // so the style itself is only built once (no source/layer churn on toggle).
    const initialGlobe = useRef(globe).current;
    const mapStyle = useMemo(() => buildStyle(initialGlobe), [initialGlobe]);
    ensurePmtiles();

    const applyProjection = (map) => {
        try {
            map.setProjection({type: globe ? "globe" : "mercator"});
        } catch { /* older gl */
        }
    };
    useEffect(() => {
        const map = mapRef.current?.getMap?.();
        if (map) applyProjection(map);
    }, [globe]);
    useEffect(() => () => {
        stopWater.current?.();
    }, []);

    return (
        <Map
            ref={mapRef}
            initialViewState={{longitude: 12, latitude: 30, zoom: 2.2}}
            minZoom={1.1}
            maxZoom={7}
            mapStyle={mapStyle}
            attributionControl={false}
            dragRotate={false}
            interactiveLayerIds={interactiveLayerIds}
            onLoad={(e) => {
                try {
                    e.target.boxZoom.disable();
                    // Kill MapLibre's built-in keyboard nav: it zooms on +/- and pans on
                    // the arrows, which collides with the game's own bindings (+/- = game
                    // speed, WASD = pan, Z/X = zoom). The game owns every key now.
                    e.target.keyboard.disable();
                } catch { /* older gl */
                }
                applyProjection(e.target);
                stopWater.current = startWater(e.target);
                if (onMap) onMap(e.target);
            }}
            onClick={(e) => onMapClick && onMapClick(e)}
            onContextMenu={(e) => {
                e.originalEvent?.preventDefault?.();
                onContextMenu && onContextMenu(e);
            }}
            onMouseMove={(e) => onMouseMove && onMouseMove(e)}
            style={{position: "absolute", inset: 0}}
            cursor={cursor}
        >
            {children}
        </Map>
    );
}
