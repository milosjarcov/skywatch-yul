export const YUL = [-73.7455, 45.4657];
export const REGION_CENTER = [-73.75, 45.5];
export const PLANE_PATH =
  "M12 2c.6 0 1 .7 1 1.4V9l8 5v1.5l-8-2.4v5.4l3 2V22l-4-1-4 1v-1.5l3-2v-5.4L3 15.5V14l8-5V3.4C11 2.7 11.4 2 12 2Z";
export const SAMPLE_FLIGHTS = [
  ["ACA872", 45.57, -73.87, 4200, 190, 60, 4],
  ["ACA415", 45.43, -73.61, 1800, 125, 245, -3],
  ["WJA213", 45.66, -74.02, 7600, 225, 85, 0],
  ["TSC264", 45.38, -73.92, 9800, 245, 45, 0],
  ["JZA763", 45.51, -73.44, 3100, 155, 290, -2],
  ["ROU151", 45.72, -73.62, 6400, 205, 155, 3],
  ["DAL512", 45.29, -73.48, 11000, 250, 325, 0],
  ["ACA109", 45.47, -73.75, 0, 8, 240, 0],
].map(
  ([callsign, lat, lon, alt_m, velocity_ms, heading, vertical_rate_ms], i) => ({
    callsign,
    lat,
    lon,
    alt_m,
    velocity_ms,
    heading,
    vertical_rate_ms,
    icao24: `sample${i}`,
    country: i === 6 ? "United States" : "Canada",
    on_ground: alt_m === 0,
  }),
);
export const formatNumber = (value, factor = 1) =>
  Number.isFinite(value)
    ? Math.round(value * factor).toLocaleString("en-CA")
    : "—";
export function flightPhase(flight) {
  if (flight.on_ground) return "On ground";
  if (!Number.isFinite(flight.vertical_rate_ms)) return "Airborne";
  if (flight.vertical_rate_ms > 0.5) return "Climbing";
  if (flight.vertical_rate_ms < -0.5) return "Descending";
  return "Level flight";
}
// Great-circle distance and circles use nautical miles, independent of map zoom.
export function distanceNM([lon1, lat1], [lon2, lat2]) {
  const rad = Math.PI / 180,
    dLat = (lat2 - lat1) * rad,
    dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 3440.065 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}
export function destination([lon, lat], nauticalMiles, bearing) {
  const r = Math.PI / 180,
    d = nauticalMiles / 3440.065,
    b = bearing * r,
    p = lat * r,
    l = lon * r;
  const p2 = Math.asin(
    Math.sin(p) * Math.cos(d) + Math.cos(p) * Math.sin(d) * Math.cos(b),
  );
  const l2 =
    l +
    Math.atan2(
      Math.sin(b) * Math.sin(d) * Math.cos(p),
      Math.cos(d) - Math.sin(p) * Math.sin(p2),
    );
  return [l2 / r, p2 / r];
}
export function rangeFeatures() {
  return {
    type: "FeatureCollection",
    features: [10, 20].flatMap((radius) => [
      {
        type: "Feature",
        properties: { kind: "ring" },
        geometry: {
          type: "LineString",
          coordinates: Array.from({ length: 129 }, (_, i) =>
            destination(YUL, radius, (i * 360) / 128),
          ),
        },
      },
      {
        type: "Feature",
        properties: { kind: "label", label: `${radius} NM` },
        geometry: { type: "Point", coordinates: destination(YUL, radius, 0) },
      },
    ]),
  };
}
