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
    ? "#89958f"
    : f.alt_m < 1500
      ? "#efad69"
      : f.alt_m < 6000
        ? "#dbd68b"
        : "#79cbb5";
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
      color: "#cce5d6",
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
          (f.on_ground || (f.alt_m ?? 0) >= min * 1000) &&
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
        .on("click", () => setSelected(f.icao24));
    });
  }, [visible, selected]);
  const age = stamp ? Math.max(0, Math.floor(now / 1000 - stamp)) : null,
    airborne = source.filter((f) => !f.on_ground);
  const status = demo
    ? "Demo data"
    : loading
      ? "Connecting"
      : error
        ? "Feed unavailable"
        : age > 45
          ? "Delayed feed"
          : "Live feed";
  return (
    <div className="app">
      <header>
        <a className="brand" href="./">
          <span className="brand-icon">
            <Plane />
          </span>
          skywatch <b>YUL</b>
        </a>
        <span className="tagline">A closer look at the sky.</span>
        <a
          className="github"
          href="https://github.com/milosjarcov/skywatch-yul"
          target="_blank"
          rel="noreferrer"
        >
          View project ↗
        </a>
      </header>
      <main>
        <section className="intro">
          <div>
            <div className="eyebrow">MONTRÉAL AIRSPACE EXPLORER</div>
            <h1>
              The city above the city<span>.</span>
            </h1>
            <p>
              Follow aircraft across Greater Montréal, one signal at a time.
            </p>
          </div>
          <div className="session">
            <span
              className={`status ${demo || error || age > 45 ? "muted" : ""}`}
            >
              ● &nbsp;{status}
            </span>
            <time>
              {new Date(now).toLocaleTimeString("en-GB", { timeZone: "UTC" })}{" "}
              UTC
            </time>
          </div>
        </section>
        <section className="stats" aria-label="Airspace summary">
          <div>
            <span>Aircraft in range</span>
            <strong>
              {loading && !demo ? "—" : source.length}
              <small>Greater Montréal</small>
            </strong>
          </div>
          <div>
            <span>Currently airborne</span>
            <strong>
              {loading && !demo ? "—" : airborne.length}
              <small>Tracked aircraft</small>
            </strong>
          </div>
          <div>
            <span>Highest altitude</span>
            <strong>
              {airborne.length
                ? fmt(Math.max(...airborne.map((f) => f.alt_m ?? 0)), 3.28084)
                : "—"}
              <small>ft above sea level</small>
            </strong>
          </div>
          <div>
            <span>Data refresh</span>
            <strong>
              15 <em>sec</em>
              <small>
                {demo
                  ? "Illustrative snapshot"
                  : age === null
                    ? "Awaiting first signal"
                    : `Updated ${age}s ago`}
              </small>
            </strong>
          </div>
        </section>
        <section className="workspace">
          <aside>
            <div className="sidebar-heading">
              <h2>Aircraft</h2>
              <span>{visible.length} visible</span>
            </div>
            <label className="search">
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="Search callsign or ICAO"
                placeholder="Search callsign or ICAO…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <div className="filters">
              <label>
                Minimum altitude <span>{min} km</span>
                <input
                  type="range"
                  aria-label="Minimum altitude"
                  min="0"
                  max="12"
                  step=".5"
                  value={min}
                  onChange={(e) => setMin(Number(e.target.value))}
                />
              </label>
              <label className="ground">
                Include ground traffic
                <input
                  type="checkbox"
                  checked={ground}
                  onChange={(e) => setGround(e.target.checked)}
                />
              </label>
            </div>
            <div className="list-label">
              <span>CALLSIGN / ORIGIN</span>
              <span>ALTITUDE</span>
            </div>
            <div className="flight-list">
              {visible.map((f) => (
                <button
                  className={`flight-row ${selected === f.icao24 ? "active" : ""}`}
                  key={f.icao24}
                  onClick={() => {
                    setSelected(f.icao24);
                    map.current.flyTo([f.lat, f.lon], 10, {
                      duration: window.matchMedia(
                        "(prefers-reduced-motion: reduce)",
                      ).matches
                        ? 0
                        : 0.7,
                    });
                  }}
                >
                  <span className="flight-icon" style={{ color: color(f) }}>
                    <Plane />
                  </span>
                  <span className="flight-name">
                    <b>{f.callsign || f.icao24}</b>
                    <small>{f.country || "Unknown origin"}</small>
                  </span>
                  <span className="flight-alt">
                    {f.on_ground ? "Ground" : fmt(f.alt_m, 3.28084)}
                    <small>{f.on_ground ? "On surface" : "ft"}</small>
                  </span>
                </button>
              ))}
              {!visible.length && (
                <div className="empty">
                  <Plane />
                  <h3>
                    {loading && !demo
                      ? "Scanning the skies…"
                      : error && !demo
                        ? "Waiting for a signal"
                        : "No aircraft to show"}
                  </h3>
                  <p>
                    {error && !demo
                      ? "The live source is unavailable. Explore the demo while we reconnect."
                      : "Adjust your filters or explore a sample of Montréal air traffic."}
                  </p>
                  <button
                    onClick={() => {
                      setSearch("");
                      setMin(0);
                      setGround(true);
                      if (!source.length) setDemo(true);
                    }}
                  >
                    {source.length ? "Reset filters" : "Explore demo"} →
                  </button>
                </div>
              )}
            </div>
            <div className="sidebar-footer">
              ● &nbsp; Select an aircraft to explore its flight
            </div>
          </aside>
          <div className="map-panel">
            <div id="map" ref={node} />
            <div className="map-top">
              <div className="location">
                ● &nbsp; YUL <span>Montréal, QC</span>
              </div>
              <button
                aria-label="Recenter map on Montréal"
                onClick={() => map.current.setView(CENTER, 9)}
              >
                ⌖
              </button>
            </div>
            {(demo || error || (!loading && age > 45)) && (
              <div className="notice" role="status">
                {demo
                  ? "DEMO MODE · Illustrative flights, not live positions"
                  : error
                    ? "Live connection interrupted · Retrying automatically"
                    : "Delayed positions · Waiting for a fresh snapshot"}
              </div>
            )}
            {active && (
              <section className="detail">
                <div className="detail-heading">
                  <div>
                    <div className="eyebrow">FLIGHT DETAILS</div>
                    <h2>{active.callsign || active.icao24}</h2>
                    <p>
                      {active.country || "Unknown origin"} · {active.icao24}
                    </p>
                  </div>
                  <button
                    aria-label="Close flight details"
                    onClick={() => setSelected(null)}
                  >
                    ×
                  </button>
                </div>
                <div className="detail-grid">
                  {[
                    ["Altitude", fmt(active.alt_m, 3.28084), "ft"],
                    ["Ground speed", fmt(active.velocity_ms, 1.94384), "kts"],
                    ["Heading", fmt(active.heading), "°"],
                    [
                      "Vertical rate",
                      fmt(active.vertical_rate_ms, 196.85),
                      "ft/min",
                    ],
                  ].map(([label, value, unit]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <b>
                        {value} <small>{unit}</small>
                      </b>
                    </div>
                  ))}
                </div>
              </section>
            )}
            <div className="legend">
              <span>ALTITUDE</span>
              <span>
                <i style={{ background: "#efad69" }} />
                &lt; 1.5 km
              </span>
              <span>
                <i style={{ background: "#dbd68b" }} />
                1.5–6 km
              </span>
              <span>
                <i style={{ background: "#79cbb5" }} />
                6+ km
              </span>
              {ground && (
                <span>
                  <i style={{ background: "#89958f" }} />
                  Ground
                </span>
              )}
            </div>
          </div>
        </section>
        <footer>
          <span>
            Built with curiosity. Powered by{" "}
            <a
              href="https://opensky-network.org/"
              target="_blank"
              rel="noreferrer"
            >
              OpenSky Network ↗
            </a>
          </span>
          <button
            onClick={() => {
              setDemo(!demo);
              setSelected(null);
              if (demo) setLoading(true);
            }}
          >
            {demo ? "Switch to live feed" : "Explore demo mode"} ↗
          </button>
          <span className="footer-note">
            For exploration · Not for navigation
          </span>
        </footer>
      </main>
    </div>
  );
}
