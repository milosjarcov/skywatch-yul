// Everything the UI needs to turn a flight from the API into something a
// person can read: units, colors, names, and plain-English descriptions.
//
// The API speaks SI units (meters, meters per second) because that's what
// OpenSky sends. Aviation doesn't: altitude is in feet and speed in knots,
// from the cockpit to air traffic control, so that's what the UI shows.

// Montréal-Trudeau International Airport.
export const YUL = { lat: 45.4706, lon: -73.7408 };

// The box the API asks OpenSky about (MONTREAL_BBOX in backend/main.py).
// Planes outside it don't exist as far as SkyWatch knows.
export const COVERAGE = { south: 45.2, north: 45.8, west: -74.3, east: -73.2 };

const FEET_PER_METER = 3.28084;
const KNOTS_PER_MS = 1.94384;
const KMH_PER_MS = 3.6;
const FPM_PER_MS = 196.85; // feet per minute

const numberFormat = new Intl.NumberFormat("en-US");
export const formatNumber = (n) => numberFormat.format(Math.round(n));

// ---- Altitude --------------------------------------------------------------

// Feet, rounded the way transponders report it (in 25 ft steps). Barometric
// altitude isn't corrected for local air pressure, so planes near the ground
// sometimes read below zero; those show as 0.
export function altitudeFeet(flight) {
  if (flight.alt_m == null) return null;
  return Math.max(0, Math.round((flight.alt_m * FEET_PER_METER) / 25) * 25);
}

export function altitudeMeters(flight) {
  return flight.alt_m == null ? null : Math.max(0, Math.round(flight.alt_m));
}

// Altitude colors run from warm near the ground to blue at cruising height,
// like the sky at dusk. Colors in between are blended, so a plane climbing
// out of YUL slowly shifts from orange to blue on the map.
export const MAX_FEET = 40000;
const ALTITUDE_STOPS = [
  [0, [255, 159, 10]], // orange
  [8000, [255, 55, 95]], // pink
  [18000, [191, 90, 242]], // purple
  [28000, [94, 92, 230]], // indigo
  [38000, [10, 132, 255]], // blue
];
export const GROUND_COLOR = "#8e8e93";

export function colorAtFeet(feet) {
  const ft = Math.min(Math.max(feet, 0), ALTITUDE_STOPS.at(-1)[0]);
  let i = 1;
  while (ALTITUDE_STOPS[i][0] < ft) i++;
  const [loFt, lo] = ALTITUDE_STOPS[i - 1];
  const [hiFt, hi] = ALTITUDE_STOPS[i];
  const t = (ft - loFt) / (hiFt - loFt);
  const [r, g, b] = lo.map((c, k) => Math.round(c + (hi[k] - c) * t));
  return `rgb(${r}, ${g}, ${b})`;
}

export function altitudeColor(flight) {
  if (flight.on_ground) return GROUND_COLOR;
  return colorAtFeet(altitudeFeet(flight) ?? 0);
}

// The same scale as a CSS gradient, 0 ft on the left and MAX_FEET on the right.
export const ALTITUDE_GRADIENT = `linear-gradient(90deg, ${ALTITUDE_STOPS.map(
  ([ft, [r, g, b]]) => `rgb(${r}, ${g}, ${b}) ${(ft / MAX_FEET) * 100}%`,
).join(", ")})`;

// ---- Speed, climb, and direction -------------------------------------------

export const knots = (flight) => (flight.velocity_ms == null ? null : flight.velocity_ms * KNOTS_PER_MS);
export const kmh = (flight) => (flight.velocity_ms == null ? null : flight.velocity_ms * KMH_PER_MS);
export const feetPerMinute = (flight) =>
  flight.vertical_rate_ms == null ? null : Math.round((flight.vertical_rate_ms * FPM_PER_MS) / 10) * 10;

// More than about 300 ft/min either way counts as climbing or descending.
// Below that it's just the normal wobble of level flight.
export function trend(flight) {
  if (flight.on_ground || flight.vertical_rate_ms == null) return "level";
  if (flight.vertical_rate_ms > 1.5) return "climbing";
  if (flight.vertical_rate_ms < -1.5) return "descending";
  return "level";
}

const COMPASS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
const COMPASS_SHORT = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const compassIndex = (degrees) => Math.round((((degrees % 360) + 360) % 360) / 45) % 8;
export const compassWord = (degrees) => COMPASS[compassIndex(degrees)];
export const compassShort = (degrees) => COMPASS_SHORT[compassIndex(degrees)];

// Distance (km) and direction (degrees from north) from one point to
// another, along the curve of the Earth. The haversine formula.
export function distanceAndBearing(from, to) {
  const rad = Math.PI / 180;
  const lat1 = from.lat * rad;
  const lat2 = to.lat * rad;
  const dLat = lat2 - lat1;
  const dLon = (to.lon - from.lon) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const km = 2 * 6371 * Math.asin(Math.sqrt(a));
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const bearing = (Math.atan2(y, x) / rad + 360) % 360;
  return { km, bearing };
}

// Aviation measures distance in nautical miles (1,852 m).
export const KM_PER_NM = 1.852;

// Where a plane is relative to YUL, the way a controller would say it:
// distance in nautical miles and the bearing from the airport.
export function fromYul(flight) {
  const { km, bearing } = distanceAndBearing(YUL, flight);
  const nm = km / KM_PER_NM;
  if (nm < 1) return "Over YUL";
  return `${formatNumber(nm)} NM ${compassWord(bearing)} of YUL, bearing ${String(Math.round(bearing) % 360).padStart(3, "0")}°`;
}

// Altitude in hundreds of feet, as air traffic control data blocks show it:
// 12,400 ft is "124".
export function hundredsOfFeet(flight) {
  const ft = altitudeFeet(flight);
  return ft == null ? "---" : String(Math.round(ft / 100)).padStart(3, "0");
}

// ---- Names -----------------------------------------------------------------

// Most airline callsigns start with the airline's three-letter ICAO code:
// ACA875 is an Air Canada flight. These are airlines that turn up around
// Montreal. Anything else just shows its registration country.
const AIRLINES = {
  AAL: "American Airlines",
  ACA: "Air Canada",
  AFR: "Air France",
  AIE: "Air Inuit",
  AMX: "Aeroméxico",
  ASA: "Alaska Airlines",
  ASP: "AirSprint",
  AUA: "Austrian Airlines",
  AVA: "Avianca",
  BAW: "British Airways",
  CCA: "Air China",
  CFC: "Royal Canadian Air Force",
  CJT: "Cargojet",
  CMP: "Copa Airlines",
  CRQ: "Air Creebec",
  DAL: "Delta Air Lines",
  DLH: "Lufthansa",
  EDV: "Endeavor Air",
  EIN: "Aer Lingus",
  ENY: "Envoy Air",
  FDX: "FedEx",
  FLE: "Flair Airlines",
  GTI: "Atlas Air",
  IBE: "Iberia",
  ICE: "Icelandair",
  ITY: "ITA Airways",
  JBU: "JetBlue",
  JIA: "PSA Airlines",
  JZA: "Jazz",
  KLM: "KLM",
  NKS: "Spirit Airlines",
  POE: "Porter Airlines",
  PVL: "PAL Airlines",
  QTR: "Qatar Airways",
  RAM: "Royal Air Maroc",
  ROU: "Air Canada Rouge",
  RPA: "Republic Airways",
  SKW: "SkyWest Airlines",
  SWG: "Sunwing Airlines",
  SWR: "Swiss",
  TAP: "TAP Air Portugal",
  THY: "Turkish Airlines",
  TOM: "TUI Airways",
  TSC: "Air Transat",
  UAE: "Emirates",
  UAL: "United Airlines",
  UPS: "UPS Airlines",
  WEN: "WestJet Encore",
  WJA: "WestJet",
};

export function airline(flight) {
  const callsign = flight.callsign;
  if (!callsign || !/^[A-Z]{3}\d/.test(callsign)) return null;
  return AIRLINES[callsign.slice(0, 3)] ?? null;
}

// Callsign if the plane sends one, otherwise its transponder address.
export const displayName = (flight) => flight.callsign ?? flight.icao24.toUpperCase();

// The second line under a flight's name: who flies it, or where it's from.
export const operatorLine = (flight) =>
  airline(flight) ?? (flight.country ? `Registered in ${flight.country}` : "Unknown operator");

// ---- Describing a flight ---------------------------------------------------

// One sentence about what the plane is doing right now.
export function describe(flight) {
  const ft = altitudeFeet(flight);
  const heading = flight.heading == null ? "" : `, heading ${compassWord(flight.heading)}`;
  if (flight.on_ground) {
    const kt = knots(flight) ?? 0;
    return kt >= 3 ? `Moving on the ground at ${formatNumber(kt)} knots${heading}.` : "Stopped on the ground.";
  }
  if (ft == null) return `In the air${heading}.`;
  const altitude = `${formatNumber(ft)} ft`;
  switch (trend(flight)) {
    case "climbing":
      return `Climbing through ${altitude}${heading}.`;
    case "descending":
      return `Descending through ${altitude}${heading}.`;
    default:
      return `${ft >= 18000 ? "Cruising" : "Flying level"} at ${altitude}${heading}.`;
  }
}

// ---- Filtering and sorting -------------------------------------------------

// Matches a search against the callsign, transponder code, airline name, and
// registration country, so "C06DB5", "air canada", and "france" all work.
export function matchesSearch(flight, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [flight.callsign, flight.icao24, airline(flight), flight.country].some((value) =>
    value?.toLowerCase().includes(q),
  );
}

// Ground traffic is hidden unless asked for, and the altitude filter only
// applies to planes in the air.
export function passesFilters(flight, { showGround, minFeet }) {
  if (flight.on_ground) return showGround;
  return (altitudeFeet(flight) ?? 0) >= minFeet;
}

// Alphabetical by callsign, with "numeric" so ACA875 comes before ACA1557.
// A stable order matters: rows that reshuffled every 15 seconds would be
// impossible to read. Planes without a callsign go last.
const collator = new Intl.Collator("en", { numeric: true });
export function byCallsign(a, b) {
  if (!a.callsign !== !b.callsign) return a.callsign ? -1 : 1;
  return collator.compare(displayName(a), displayName(b));
}

// ---- Time ------------------------------------------------------------------

export function ago(seconds) {
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${Math.round(seconds)} seconds ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
  return "over an hour ago";
}
