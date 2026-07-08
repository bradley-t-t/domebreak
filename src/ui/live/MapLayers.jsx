// All of the MapLibre Sources/Layers behind the live map: territory/ownership
// tint, population heat, backdrop cities, radar/defense range overlays, the
// selection+placement ranges, command/sail traces, fallout haze and the
// capture-progress ring — plus the live city dots themselves. Pure
// presentational fan-out over the FeatureCollections computed in
// useLiveLayers/useOwnershipLayer. Pulled out of LiveGame.jsx verbatim — same
// Source/Layer tree, same paint expressions, same conditional gating.
import {Layer, Source} from "react-map-gl/maplibre";
import {vitPaint} from "../common/status.js";
import RadarSweep from "./RadarSweep.jsx";

const REGIONS_URL = `pmtiles://${typeof window !== "undefined" ? window.location.origin : ""}/assets/regions.pmtiles`;
// Controlled-territory tint: strong enough to read the owner color at the whole-earth
// view, easing off as you zoom in and the real relief takes over.
const REGION_OWNER_OPACITY = ["interpolate", ["linear"], ["zoom"], 2, 0.7, 4, 0.52, 5.5, 0.32];
const REGION_OWNER_LINE_WIDTH = ["interpolate", ["linear"], ["zoom"], 2, 0.6, 6, 1.4];
// Diplomacy filter tint: solid enough at the whole-earth view to read green/red/grey
// at a glance, easing back as you zoom in so terrain and cities stay legible.
const REGION_DIPLO_OPACITY = ["interpolate", ["linear"], ["zoom"], 2, 0.8, 4, 0.62, 6, 0.4];

export default function MapLayers({
                                       layers, hoveredGid, ownership, diplomacy, popFC, backdropFC, radarFC, radarEmitters, defenseFC,
                                       ranges, cmdLines, sailLines, falloutFC, captureFC, liveFC, mySlot, teamColor,
                                       planArcsFC, planTargetsFC, planColor
                                   }) {
    return (
        <>
            <Source id="db-regions" type="vector" url={REGIONS_URL}>
                {/* Controlled-territory recolor: land captured in war in the
                    conqueror's flag color, drawn under the national borders so
                    those still read on top. */}
                {layers.countries && <Layer id="region-owner" type="fill" source-layer="regions" beforeId="country-line"
                       paint={{"fill-color": ownership.fill, "fill-opacity": REGION_OWNER_OPACITY}}/>}
                {layers.countries && <Layer id="region-owner-line" type="line" source-layer="regions" beforeId="country-line"
                       filter={["in", ["get", "GID_1"], ["literal", ownership.ids]]}
                       paint={{"line-color": "#0a0c0f", "line-width": REGION_OWNER_LINE_WIDTH, "line-opacity": 0.55}}/>}
                {/* Diplomacy filter: recolor every nation by your standing toward it —
                    green = you/allies, red = at war, grey = neutral. Keyed by GID_0 so
                    it blankets whole countries; drawn under the borders (and above the
                    ownership tint) so those still read on top. */}
                {layers.diplomacy && <Layer id="region-diplomacy" type="fill" source-layer="regions" beforeId="country-line"
                       paint={{"fill-color": diplomacy.fill, "fill-opacity": REGION_DIPLO_OPACITY}}/>}
                {layers.states && <Layer id="region-all" type="line" source-layer="regions" paint={{
                    "line-color": "#6b7079",
                    "line-opacity": 0.3,
                    "line-width": 0.5
                }}/>}
                <Layer id="region-hover" type="line" source-layer="regions"
                       filter={["==", ["get", "GID_0"], hoveredGid || "__none__"]}
                       paint={{"line-color": "#d6dbe2", "line-opacity": 0.7, "line-width": 1}}/>
            </Source>
            {layers.pop && <Source id="pop-src" type="geojson" data={popFC}>
                <Layer id="pop-heat" type="heatmap" paint={{
                    "heatmap-weight": ["get", "wt"],
                    "heatmap-intensity": 1.1,
                    "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 1, 8, 6, 42],
                    "heatmap-opacity": 0.75,
                    "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(0,0,0,0)", 0.2, "#3a3f46", 0.45, "#6b7178", 0.7, "#a7aeb6", 1, "#eef2f6"]
                }}/>
            </Source>}
            {layers.backdrop &&
                <Source id="backdrop-src" type="geojson" data={backdropFC}><Layer id="backdrop-cities" type="circle"
                                                                                  paint={{
                                                                                      "circle-radius": ["case", ["==", ["get", "cap"], 1], 2.3, 1.3],
                                                                                      "circle-color": "#6a707a",
                                                                                      "circle-opacity": 0.5
                                                                                  }}/></Source>}
            {layers.radar && <Source id="radar-src" type="geojson" data={radarFC}>
                {/* Subtle covered-area tint (per radar-type color) under the ring. */}
                <Layer id="radar-fill" type="fill"
                       paint={{"fill-color": ["get", "color"], "fill-opacity": 0.05}}/>
                <Layer id="radar-cov" type="line"
                       paint={{
                           "line-color": ["get", "color"],
                           "line-opacity": 0.4,
                           "line-width": 0.9,
                           "line-dasharray": [3, 3]
                       }}/>
            </Source>}
            {/* Rotating PPI sweep over the coverage rings — animated old-radar look. */}
            {layers.radar && <RadarSweep emitters={radarEmitters}/>}
            {layers.defense && <Source id="defall-src" type="geojson" data={defenseFC}>
                <Layer id="defall-fill" type="fill" paint={{"fill-color": ["get", "color"], "fill-opacity": 0.05}}/>
                <Layer id="defall-line" type="line"
                       paint={{"line-color": ["get", "color"], "line-opacity": 0.4, "line-width": 0.8}}/>
            </Source>}
            <Source id="ranges" type="geojson" data={ranges}>
                <Layer id="range-fill" type="fill" filter={["!=", ["get", "radar"], 1]} paint={{
                    "fill-color": ["get", "color"],
                    "fill-opacity": ["case", ["==", ["get", "sel"], 1], 0.14, 0.05]
                }}/>
                <Layer id="range-line" type="line" filter={["!=", ["get", "radar"], 1]} paint={{
                    "line-color": ["get", "color"],
                    "line-width": ["case", ["==", ["get", "sel"], 1], 1.6, 0.7],
                    "line-opacity": 0.6
                }}/>
                {/* Subtle covered-area tint for a selected or being-placed radar
                    (large areas, so kept fainter than the defense-ring fill). */}
                <Layer id="radar-sel-fill" type="fill" filter={["==", ["get", "radar"], 1]} paint={{
                    "fill-color": ["get", "color"],
                    "fill-opacity": 0.07
                }}/>
                <Layer id="radar-ring" type="line" filter={["==", ["get", "radar"], 1]} paint={{
                    "line-color": ["get", "color"],
                    "line-width": 0.9,
                    "line-opacity": 0.5,
                    "line-dasharray": [3, 3]
                }}/>
            </Source>
            <Source id="cmd" type="geojson" data={cmdLines}><Layer id="cmd-line" type="line" paint={{
                "line-color": teamColor(mySlot),
                "line-width": 1.4,
                "line-opacity": 0.5,
                "line-dasharray": [2, 3]
            }}/></Source>
            {/* Battle-plan preview: the active plan's attacker→target strike arcs and
                a ring on each planned target, both in the plan's color. Drawn over the
                standing command lines so a plan you're authoring reads on top. */}
            {planArcsFC && <Source id="plan-arc" type="geojson" data={planArcsFC}><Layer id="plan-arc-line" type="line"
                paint={{
                    "line-color": planColor || "#f0a63c",
                    "line-width": 1.9,
                    "line-opacity": 0.9,
                    "line-dasharray": [2, 1.6]
                }}/></Source>}
            {planTargetsFC && <Source id="plan-tgt" type="geojson" data={planTargetsFC}><Layer id="plan-tgt-ring" type="circle"
                paint={{
                    "circle-radius": 7,
                    "circle-color": "rgba(0,0,0,0)",
                    "circle-stroke-color": planColor || "#f0a63c",
                    "circle-stroke-width": 1.8,
                    "circle-stroke-opacity": 0.9
                }}/></Source>}
            <Source id="sail" type="geojson" data={sailLines}>
                <Layer id="sail-line" type="line" filter={["==", ["get", "k"], "line"]} paint={{
                    "line-color": teamColor(mySlot),
                    "line-width": 1.2,
                    "line-opacity": 0.5,
                    "line-dasharray": [1, 2]
                }}/>
                <Layer id="sail-dot" type="circle" filter={["==", ["get", "k"], "dot"]} paint={{
                    "circle-radius": 3,
                    "circle-color": "transparent",
                    "circle-stroke-color": teamColor(mySlot),
                    "circle-stroke-width": 1.2,
                    "circle-opacity": 0.6
                }}/>
            </Source>
            {/* Radioactive fallout footprint: a glowing contamination haze whose
                opacity tracks the cloud's live intensity, plus a dashed edge marking
                the danger radius. Drawn under the cities so ruins and dots stay legible. */}
            <Source id="fallout-src" type="geojson" data={falloutFC}>
                <Layer id="fallout-haze" type="fill" paint={{
                    "fill-color": "#8cff3a",
                    "fill-opacity": ["*", ["get", "intensity"], 0.17]
                }}/>
                <Layer id="fallout-edge" type="line" paint={{
                    "line-color": "#b6ff5c",
                    "line-width": 1,
                    "line-dasharray": [2, 2],
                    "line-opacity": ["*", ["get", "intensity"], 0.55]
                }}/>
            </Source>
            {/* Ground occupation: a ring around each city being captured, filling
                toward solid in the occupier's color as capture progress climbs.
                Drawn under the cities so the city dot stays legible on top. */}
            <Source id="capture-src" type="geojson" data={captureFC}>
                <Layer id="capture-fill" type="fill" paint={{
                    "fill-color": ["get", "color"],
                    "fill-opacity": ["*", ["get", "progress"], 0.3]
                }}/>
                <Layer id="capture-ring" type="line" paint={{
                    "line-color": ["get", "color"],
                    "line-width": 1.5,
                    "line-dasharray": [3, 2],
                    "line-opacity": ["+", 0.35, ["*", ["get", "progress"], 0.55]]
                }}/>
            </Source>
            <Source id="live-src" type="geojson" data={liveFC}>
                {/* Destroyed city: a scorched crater with a burnt scar ring, drawn
                    larger than a live city so a ruin reads unmistakably at map scale. */}
                <Layer id="live-city-ruin" type="circle" filter={["==", ["get", "dead"], 1]} paint={{
                    "circle-radius": ["case", ["==", ["get", "cap"], 1], 9, 7],
                    "circle-color": "#160c0a",
                    "circle-opacity": 0.88,
                    "circle-stroke-color": "#c2410c",
                    "circle-stroke-width": 1.8,
                    "circle-stroke-opacity": 0.9
                }}/>
                {/* City-health halo: a ring that only appears once a city is damaged,
                    thickening and reddening (green→amber→red) as vitality falls to 0.
                    Faction fill (below) still encodes ownership. */}
                <Layer id="live-city-health" type="circle" filter={["<", ["get", "vit"], 0.999]} paint={{
                    "circle-radius": ["case", ["==", ["get", "cap"], 1], 8, 6],
                    "circle-color": "rgba(0,0,0,0)",
                    "circle-stroke-width": ["interpolate", ["linear"], ["get", "vit"], 0, 3, 1, 0.6],
                    "circle-stroke-color": vitPaint(),
                    "circle-stroke-opacity": ["interpolate", ["linear"], ["get", "vit"], 0, 0.95, 0.9, 0.85, 1, 0]
                }}/>
                <Layer id="live-cities" type="circle" paint={{
                    "circle-radius": ["case", ["==", ["get", "cap"], 1], 5, 3],
                    "circle-color": ["get", "color"],
                    "circle-stroke-color": ["case", ["==", ["get", "mine"], 1], "#ffffff", "#05070c"],
                    "circle-stroke-width": ["case", ["==", ["get", "mine"], 1], 1.4, 0.6]
                }}/>
            </Source>
        </>
    );
}
