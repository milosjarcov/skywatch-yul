// Purpose-built airspace basemap. Only geography useful for orientation is shown.
// Tile schema: OpenMapTiles, served by OpenFreeMap. No raster tint or road-map skin.
export function createMapStyle() {
  const source = "basemap";
  return {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      basemap: {
        type: "vector",
        url: "https://tiles.openfreemap.org/planet",
        attribution:
          '<a href="https://openfreemap.org/">OpenFreeMap</a> · © <a href="https://www.openmaptiles.org/">OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      },
    },
    layers: [
      {
        id: "paper",
        type: "background",
        paint: { "background-color": "#edeae2" },
      },
      {
        id: "urban-areas",
        type: "fill",
        source,
        "source-layer": "landuse",
        filter: ["==", ["get", "class"], "residential"],
        paint: { "fill-color": "#e3e0d6", "fill-opacity": 0.55 },
      },
      {
        id: "water",
        type: "fill",
        source,
        "source-layer": "water",
        paint: { "fill-color": "#c5d8da" },
      },
      {
        id: "shoreline",
        type: "line",
        source,
        "source-layer": "water",
        paint: { "line-color": "#adc6c9", "line-width": 0.7 },
      },
      {
        id: "rivers",
        type: "line",
        source,
        "source-layer": "waterway",
        minzoom: 10,
        paint: { "line-color": "#b4cdd0", "line-width": 1 },
      },
      {
        id: "major-roads",
        type: "line",
        source,
        "source-layer": "transportation",
        minzoom: 10,
        filter: ["match", ["get", "class"], ["motorway", "trunk"], true, false],
        paint: {
          "line-color": "#d2cec3",
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 14, 1.4],
        },
      },
      {
        id: "airport-grounds",
        type: "fill",
        source,
        "source-layer": "landuse",
        filter: ["==", ["get", "class"], "aerodrome"],
        paint: { "fill-color": "#d7d3c9" },
      },
      {
        id: "aprons",
        type: "fill",
        source,
        "source-layer": "aeroway",
        minzoom: 10,
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": "#d4d0c6" },
      },
      {
        id: "runways",
        type: "line",
        source,
        "source-layer": "aeroway",
        minzoom: 10,
        filter: [
          "all",
          ["==", ["geometry-type"], "LineString"],
          ["==", ["get", "class"], "runway"],
        ],
        paint: {
          "line-color": "#9c9c90",
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.8, 15, 9],
        },
      },
      {
        id: "taxiways",
        type: "line",
        source,
        "source-layer": "aeroway",
        minzoom: 12,
        filter: [
          "all",
          ["==", ["geometry-type"], "LineString"],
          ["==", ["get", "class"], "taxiway"],
        ],
        paint: { "line-color": "#b8b3a8", "line-width": 1 },
      },
      {
        id: "place-labels",
        type: "symbol",
        source,
        "source-layer": "place",
        minzoom: 7,
        filter: ["match", ["get", "class"], ["city", "town"], true, false],
        layout: {
          "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"]],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 7, 10, 11, 13],
          "text-padding": 30,
          "text-letter-spacing": 0.03,
        },
        paint: {
          "text-color": "#949489",
          "text-halo-color": "#edeae2",
          "text-halo-width": 1.5,
        },
      },
      {
        id: "airports",
        type: "symbol",
        source,
        "source-layer": "aerodrome_label",
        minzoom: 9,
        filter: ["has", "iata"],
        layout: {
          "text-field": ["get", "iata"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
          "text-letter-spacing": 0.12,
          "text-offset": [0, 1.5],
        },
        paint: {
          "text-color": "#727b77",
          "text-halo-color": "#edeae2",
          "text-halo-width": 2,
        },
      },
    ],
  };
}
