import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
const CENTER = [45.5, -73.75];
const SAMPLE = [
  ["ACA872", 45.57, -73.87, 4200, 190, 60],
  ["ACA415", 45.43, -73.61, 1800, 125, 245],
  ["WJA213", 45.66, -74.02, 7600, 225, 85],
  ["TSC264", 45.38, -73.92, 9800, 245, 45],
  ["JZA763", 45.51, -73.44, 3100, 155, 290],
  ["ROU151", 45.72, -73.62, 6400, 205, 155],
  ["DAL512", 45.29, -73.48, 11000, 250, 325],
  ["ACA109", 45.47, -73.75, 0, 8, 240],
].map(([callsign, lat, lon, alt_m, velocity_ms, heading], i) => ({
  callsign,
  lat,
  lon,
  alt_m,
  velocity_ms,
  heading,
  icao24: `demo${i}`,
  country: i === 6 ? "United States" : "Canada",
  on_ground: alt_m === 0,
  vertical_rate_ms: 0,
}));
const color = (f) =>
  f.on_ground
    ? "#737b85"
    : f.alt_m < 1524
      ? "#b6612e"
      : f.alt_m < 6096
        ? "#8a732e"
        : "#315c8a";
const fmt = (v, k = 1) =>
  v == null ? "—" : Math.round(v * k).toLocaleString();
const plane =
  "M12 2 14 9 21 13 21 15 14 12.5 13.5 18 16 20 16 21.5 12 20.5 8 21.5 8 20 10.5 18 10 12.5 3 15 3 13 10 9Z";
function Plane() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d={plane} />
    </svg>
  );
}
export default function App() {
  const node = useRef(null),
    map = useRef(null),
    layer = useRef(null);
  const [flights, setFlights] = useState([]),
    [stamp, setStamp] = useState(null),
    [error, setError] = useState(false),
    [loading, setLoading] = useState(true),
    [demo, setDemo] = useState(false),
    [search, setSearch] = useState(""),
    [ground, setGround] = useState(false),
    [min, setMin] = useState(0),
    [selected, setSelected] = useState(null),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    map.current = L.map(node.current, { zoomControl: false }).setView(
      CENTER,
      9,
    );
    layer.current = L.layerGroup().addTo(map.current);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map.current);
    L.control.zoom({ position: "bottomright" }).addTo(map.current);
    L.circleMarker([45.4657, -73.7455], {
      radius: 5,
      color: "#303943",
      fillOpacity: 1,
    })
      .addTo(map.current)
      .bindTooltip("YUL · Montréal–Trudeau", {
        permanent: true,
        direction: "bottom",
        className: "airport-label",
      });
    const observer = new ResizeObserver(() => map.current.invalidateSize());
    observer.observe(node.current);
    return () => {
      observer.disconnect();
      map.current.remove();
    };
  }, []);
  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    const controller = new AbortController();
    async function load() {
      try {
        const res = await fetch("/api/flights", { signal: controller.signal });
        if (!res.ok) throw Error();
        const data = await res.json();
        if (!Array.isArray(data.flights) || !Number.isFinite(data.fetched_at))
          throw Error();
        if (!cancelled) {
          setFlights(data.flights);
          setStamp(data.fetched_at);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const id = setInterval(load, 15000);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(id);
    };
  }, [demo]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const source = demo ? SAMPLE : flights;
  const visible = useMemo(
    () =>
      source.filter(
        (f) =>
          (ground || !f.on_ground) &&
          (f.on_ground || (f.alt_m ?? 0) >= min * 0.3048) &&
          `${f.callsign ?? ""} ${f.icao24}`
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
      ),
    [source, ground, min, search],
  );
  const active = visible.find((f) => f.icao24 === selected);
  useEffect(() => {
    layer.current.clearLayers();
    visible.forEach((f) => {
      if (!Number.isFinite(f.lat) || !Number.isFinite(f.lon)) return;
      const icon = L.divIcon({
        className: `aircraft-marker ${selected === f.icao24 ? "selected" : ""}`,
        html: `<svg width="28" height="28" viewBox="0 0 24 24" style="transform:rotate(${Number(f.heading) || 0}deg)"><path fill="${color(f)}" d="${plane}"/></svg>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      const label = document.createElement("span");
      label.textContent = f.callsign || f.icao24;
      L.marker([f.lat, f.lon], { icon, title: f.callsign || f.icao24 })
        .addTo(layer.current)
        .bindTooltip(label)
        .on("click", () => selectFlight(f));
    });
  }, [visible, selected]);
  const age = stamp ? Math.max(0, Math.floor(now / 1000 - stamp)) : null,
    airborne = source.filter((f) => !f.on_ground);
  const status = demo
    ? "Sample data"
    : loading
      ? "Connecting"
      : error
        ? "Feed unavailable"
        : age > 45
          ? "Delayed feed"
          : "Live feed";
  function toggleDemo() {
    setDemo(!demo);
    setSelected(null);
    if (demo) setLoading(true);
  }
  function selectFlight(flight) {
    setSelected(flight.icao24);
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const isMobile = window.matchMedia("(max-width: 700px)").matches;
    const zoom = Math.max(map.current.getZoom(), 10);
    // Leave room below the selected marker for the mobile details panel.
    const position = map.current.project([flight.lat, flight.lon], zoom);
    if (isMobile) position.y += map.current.getSize().y * 0.25;
    map.current.flyTo(map.current.unproject(position, zoom), zoom, {
      duration: reducedMotion ? 0 : 0.5,
    });
    if (isMobile) {
      node.current.scrollIntoView({
        behavior: reducedMotion ? "instant" : "smooth",
        block: "start",
      });
    }
  }
  const hasFilters = search.trim() || min > 0;
  return (
    <div className="app">
      <header className="app-header">
        <a className="brand" href="./" aria-label="SkyWatch YUL home">
          <Plane /> <span>SkyWatch</span>
          <span className="region-code">YUL</span>
        </a>
        <span className="header-description">Aircraft over Montréal</span>
        <div className="header-status">
          <span
            className={`status ${demo || error || age > 45 ? "muted" : ""}`}
          >
            <i aria-hidden="true" />
            {status}
          </span>
          <time>
            {new Date(now).toLocaleTimeString("en-GB", { timeZone: "UTC" })} UTC
          </time>
        </div>
        <a
          className="github"
          href="https://github.com/milosjarcov/skywatch-yul"
          target="_blank"
          rel="noreferrer"
        >
          GitHub <span aria-hidden="true">↗</span>
        </a>
      </header>
      <main className="workspace">
        <aside className="sidebar" aria-label="Aircraft browser">
          <div className="sidebar-intro">
            <h1>Montréal</h1>
            <p>
              {loading && !demo ? (
                "Connecting to OpenSky…"
              ) : error && !demo && !stamp ? (
                "Live data is currently unavailable"
              ) : (
                <>
                  {source.length} aircraft in range <span>·</span>{" "}
                  {airborne.length} airborne
                </>
              )}
            </p>
          </div>
          <div className="filter-area">
            <label className="search">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                aria-hidden="true"
              >
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m16 16 5 5" />
              </svg>
              <input
                aria-label="Search callsign or ICAO"
                placeholder="Find a callsign or ICAO"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  className="clear-search"
                  aria-label="Clear search"
                  onClick={() => setSearch("")}
                >
                  ×
                </button>
              )}
            </label>
            <details className="filters">
              <summary>
                Filters{" "}
                <span>
                  {min > 0
                    ? `${fmt(min)} ft minimum`
                    : ground
                      ? "Ground included"
                      : "Airborne only"}
                </span>
              </summary>
              <div className="filter-controls">
                <label className="altitude-filter">
                  Minimum altitude <output>{fmt(min)} ft</output>
                  <input
                    type="range"
                    aria-label="Minimum altitude"
                    min="0"
                    max="40000"
                    step="1000"
                    value={min}
                    onChange={(e) => setMin(Number(e.target.value))}
                  />
                </label>
                <label className="ground">
                  <input
                    type="checkbox"
                    checked={ground}
                    onChange={(e) => setGround(e.target.checked)}
                  />
                  Include ground traffic
                </label>
              </div>
            </details>
          </div>
          <div className="list-label">
            <span>
              Aircraft <b>{visible.length}</b>
            </span>
            <span>
              Altitude <small>ft</small>
            </span>
            <span>
              Speed <small>kt</small>
            </span>
          </div>
          <div className="flight-list">
            {visible.map((f) => (
              <button
                className={`flight-row ${selected === f.icao24 ? "active" : ""}`}
                aria-pressed={selected === f.icao24}
                key={f.icao24}
                onClick={() => selectFlight(f)}
              >
                <span className="flight-name">
                  <b>
                    <i style={{ background: color(f) }} aria-hidden="true" />
                    {f.callsign || f.icao24}
                  </b>
                  <small>{f.country || "Unknown registration"}</small>
                </span>
                <span className="flight-value">
                  {f.on_ground ? "Ground" : fmt(f.alt_m, 3.28084)}
                </span>
                <span className="flight-value">
                  {fmt(f.velocity_ms, 1.94384)}
                </span>
              </button>
            ))}
            {!visible.length && (
              <div className="empty">
                <h2>
                  {loading && !demo
                    ? "Loading aircraft…"
                    : hasFilters
                      ? "No matching aircraft"
                      : error && !demo
                        ? "Live feed unavailable"
                        : "No aircraft in view"}
                </h2>
                <p>
                  {hasFilters
                    ? "Try another callsign or lower the minimum altitude."
                    : error && !demo
                      ? "We’ll retry automatically. You can use sample data in the meantime."
                      : "Aircraft appear here when a position is received."}
                </p>
                {hasFilters ? (
                  <button
                    onClick={() => {
                      setSearch("");
                      setMin(0);
                    }}
                  >
                    Clear filters
                  </button>
                ) : (
                  !loading && (
                    <button
                      onClick={() => {
                        if (source.length) setGround(true);
                        else setDemo(true);
                      }}
                    >
                      {source.length
                        ? "Include ground traffic"
                        : "Use sample data"}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
          <div className="sidebar-bottom">
            <span>
              {demo
                ? "Illustrative aircraft positions"
                : age === null
                  ? "Updates every 15 seconds"
                  : `Updated ${age}s ago`}
            </span>
            <button onClick={toggleDemo}>
              {demo ? "Return to live" : "Use sample data"}
            </button>
          </div>
        </aside>
        <section className="map-panel" aria-label="Montréal aircraft map">
          <div id="map" ref={node} />
          <div className="map-tools">
            <button
              aria-label="Recenter map on Montréal"
              title="Recenter on Montréal"
              onClick={() => map.current.setView(CENTER, 9)}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="6" />
                <path d="M12 2v5m0 10v5M2 12h5m10 0h5" />
              </svg>
            </button>
          </div>
          {(demo || error || (!loading && age > 45)) && (
            <div className="notice" role="status">
              {demo
                ? "Sample data · These positions are not live"
                : error
                  ? "Connection lost. Retrying automatically."
                  : "Positions are delayed. Waiting for an update."}
            </div>
          )}
          {active && (
            <section className="detail" aria-label="Selected aircraft details">
              <div className="detail-heading">
                <div>
                  <h2>{active.callsign || active.icao24}</h2>
                  <p>
                    {active.country || "Unknown registration"} <span>·</span>{" "}
                    {active.icao24}
                    {active.on_ground ? " · On ground" : ""}
                  </p>
                </div>
                <button
                  aria-label="Close flight details"
                  onClick={() => setSelected(null)}
                >
                  ×
                </button>
              </div>
              <dl className="detail-grid">
                {[
                  ["Altitude", fmt(active.alt_m, 3.28084), "ft"],
                  ["Ground speed", fmt(active.velocity_ms, 1.94384), "kt"],
                  ["Heading", fmt(active.heading), "°"],
                  [
                    "Vertical rate",
                    fmt(active.vertical_rate_ms, 196.85),
                    "ft/min",
                  ],
                ].map(([label, value, unit]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>
                      {value} <small>{unit}</small>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          <div className="legend" aria-label="Aircraft altitude colors">
            <span>Altitude</span>
            <span>
              <i style={{ background: "#b6612e" }} />
              &lt; 5,000 ft
            </span>
            <span>
              <i style={{ background: "#8a732e" }} />
              5,000–20,000 ft
            </span>
            <span>
              <i style={{ background: "#315c8a" }} />
              20,000+ ft
            </span>
            {ground && (
              <span>
                <i style={{ background: "#737b85" }} />
                Ground
              </span>
            )}
          </div>
        </section>
      </main>
      <footer className="app-footer">
        <span>
          Data from{" "}
          <a
            href="https://opensky-network.org/"
            target="_blank"
            rel="noreferrer"
          >
            OpenSky Network
          </a>
        </span>
        <span>
          Greater Montréal <span className="footer-separator">/</span> Not for
          navigation
        </span>
      </footer>
    </div>
  );
}
