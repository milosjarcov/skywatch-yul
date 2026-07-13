import { useEffect, useRef, useState } from "react";
import L from "leaflet";

const REFRESH_MS = 15000; // matches the backend cache TTL, so faster polling gains nothing
const MONTREAL_CENTER = [45.5, -73.75];

// Altitude bands drive marker color: ground traffic gray, low orange, high blue.
function altitudeColor(flight) {
  if (flight.on_ground) return "#8a8a8a";
  const alt = flight.alt_m ?? 0;
  if (alt < 1500) return "#e07b39";
  if (alt < 6000) return "#d4a017";
  return "#2f6fb0";
}

// SVG plane pointing north; we rotate it to the aircraft's heading.
function planeIcon(flight) {
  const color = altitudeColor(flight);
  const heading = flight.heading ?? 0;
  return L.divIcon({
    className: "plane-icon",
    html: `<svg viewBox="0 0 24 24" width="26" height="26" style="transform: rotate(${heading}deg)">
      <path fill="${color}" stroke="#222" stroke-width="0.5"
        d="M12 2 L14 9 L21 13 L21 15 L14 12.5 L13.5 18 L16 20 L16 21.5 L12 20.5 L8 21.5 L8 20 L10.5 18 L10 12.5 L3 15 L3 13 L10 9 Z"/>
    </svg>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function popupHtml(f) {
  const fmt = (v, unit, digits = 0) =>
    v == null ? "n/a" : `${v.toFixed(digits)} ${unit}`;
  return `
    <b>${f.callsign ?? "(no callsign)"}</b> · ${f.country ?? ""}<br/>
    Altitude: ${fmt(f.alt_m, "m")}<br/>
    Speed: ${fmt(f.velocity_ms == null ? null : f.velocity_ms * 3.6, "km/h")}<br/>
    Climb: ${fmt(f.vertical_rate_ms, "m/s", 1)}<br/>
    ICAO24: ${f.icao24}
  `;
}

export default function App() {
  const mapRef = useRef(null);
  const markerLayerRef = useRef(null);
  const [flights, setFlights] = useState([]);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [error, setError] = useState(null);

  // Filters
  const [showGround, setShowGround] = useState(false);
  const [minAltKm, setMinAltKm] = useState(0);
  const [search, setSearch] = useState("");

  // Create the map once.
  useEffect(() => {
    const map = L.map("map").setView(MONTREAL_CENTER, 9);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    mapRef.current = map;
    markerLayerRef.current = L.layerGroup().addTo(map);
    return () => map.remove();
  }, []);

  // Poll the backend.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/flights");
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setFlights(data.flights);
        setFetchedAt(data.fetched_at);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const visible = flights.filter((f) => {
    if (!showGround && f.on_ground) return false;
    if ((f.alt_m ?? 0) < minAltKm * 1000 && !f.on_ground) return false;
    if (search && !(f.callsign ?? "").toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });

  // Redraw markers whenever the visible set changes.
  useEffect(() => {
    const layer = markerLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const f of visible) {
      L.marker([f.lat, f.lon], { icon: planeIcon(f) })
        .bindPopup(popupHtml(f))
        .addTo(layer);
    }
  }, [visible]);

  return (
    <div className="app">
      <header>
        <h1>ADS-B Tracker <span className="sub">Montreal</span></h1>
        <div className="controls">
          <input
            type="text"
            placeholder="Search callsign…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label>
            Min altitude: {minAltKm} km
            <input
              type="range"
              min="0"
              max="12"
              step="0.5"
              value={minAltKm}
              onChange={(e) => setMinAltKm(Number(e.target.value))}
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={showGround}
              onChange={(e) => setShowGround(e.target.checked)}
            />
            Ground traffic
          </label>
        </div>
        <div className="status">
          {error ? (
            <span className="error">⚠ {error}</span>
          ) : (
            <span>
              {visible.length} of {flights.length} aircraft
              {fetchedAt &&
                ` · data from ${new Date(fetchedAt * 1000).toLocaleTimeString()}`}
            </span>
          )}
        </div>
      </header>
      <div id="map" />
    </div>
  );
}
