// The basemap: OpenFreeMap's free dark vector style (no API key), recolored
// to look like a radar display. Land is near black, water a shade darker,
// roads faint, and labels muted, so the traffic is the brightest thing on
// screen. Airports stay a little stronger, so YUL's runways are easy to find.
//
// Each override is [layer id pattern, property, value].

export const MAP_CREDITS =
  '<a href="https://openfreemap.org">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export const AIRCRAFT_CREDIT = 'Aircraft <a href="https://opensky-network.org">OpenSky Network</a>';

export const DECK_MAP = {
  styleUrl: "https://tiles.openfreemap.org/styles/dark",
  overrides: [
    [/^background$/, "background-color", "#0b0f14"],
    [/^landuse_residential$/, "fill-color", "#0e1319"],
    [/^water$/, "fill-color", "#05080c"],
    [/^waterway$/, "line-color", "#05080c"],
    [/^(landuse_park|landcover_wood)$/, "fill-color", "#0c1215"],
    [/^building$/, "fill-color", "#11161d"],
    [/^aeroway-area$/, "fill-color", "#151b24"],
    [/^aeroway-(runway|runway-casing)$/, "line-color", "#343e4c"],
    [/^aeroway-taxiway$/, "line-color", "#202833"],
    [/^(highway_minor|highway_path|road_pier)$/, "line-color", "#141a21"],
    [/^highway_(major|motorway)_casing$/, "line-color", "#0b0f14"],
    [/^highway_major_(inner|subtle)$/, "line-color", "#1a212a"],
    [/^highway_motorway_(inner|subtle)$/, "line-color", "#222a35"],
    [/^(railway.*|boundary.*)$/, "line-color", "#171d25"],
    [/^place_/, "text-color", "#5d6773"],
    [/^place_/, "text-transform", "none"], // the style shouts in capitals
    [/^(highway_name_.*|water_name)$/, "visibility", "none"],
  ],
};

// Which paint properties each kind of layer has, by prefix. A text color
// only means something on a symbol layer, a line color on a line layer.
const PAINT_PREFIXES = {
  background: ["background-"],
  fill: ["fill-"],
  line: ["line-"],
  symbol: ["text-", "icon-"],
};

// Properties about arrangement rather than color, which MapLibre calls
// "layout" properties and sets through a different function.
const LAYOUT_PROPERTIES = new Set(["visibility", "text-transform"]);

// Colors are "paint" properties in MapLibre, while showing or hiding a layer
// ("visibility") is a "layout" property, so each goes through its own setter.
export function applyOverrides(gl, overrides) {
  for (const { id, type } of gl.getStyle().layers) {
    for (const [pattern, property, value] of overrides) {
      if (!pattern.test(id)) continue;
      if (LAYOUT_PROPERTIES.has(property)) gl.setLayoutProperty(id, property, value);
      else if (PAINT_PREFIXES[type]?.some((prefix) => property.startsWith(prefix))) gl.setPaintProperty(id, property, value);
    }
  }
}
