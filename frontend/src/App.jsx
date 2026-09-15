import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
const AirspaceMap = lazy(() => import("./components/AirspaceMap"));
import useFlightFeed from "./useFlightFeed";
import {
  SAMPLE_FLIGHTS,
  YUL,
  PLANE_PATH,
  formatNumber as fmt,
  flightPhase,
  distanceNM,
} from "./airspace";

function Icon({ name, size = 18 }) {
  const paths = {
    search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
    target: "M12 2v4m0 12v4M2 12h4m12 0h4M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
    arrow: "M7 17 17 7M7 7h10v10",
    plus: "M12 5v14M5 12h14",
    minus: "M5 12h14",
    close: "m6 6 12 12M6 18 18 6",
    sliders: "M4 7h16M4 17h16M8 4v6m8 4v6",
    layers: "m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5",
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export default function App() {
  const map = useRef(null),
    about = useRef(null),
    searchInput = useRef(null);
  const [demo, setDemo] = useState(false),
    [search, setSearch] = useState(""),
    [ground, setGround] = useState(false),
    [minAlt, setMinAlt] = useState(0),
    [sort, setSort] = useState("callsign"),
    [selected, setSelected] = useState(null),
    [labels, setLabels] = useState(true),
    [ranges, setRanges] = useState(false),
    [now, setNow] = useState(Date.now()),
    [filters, setFilters] = useState(false);
  const feed = useFlightFeed(demo);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    function key(event) {
      if (
        event.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          document.activeElement?.tagName,
        ) &&
        !about.current?.open
      ) {
        event.preventDefault();
        searchInput.current?.focus();
      }
      if (event.key === "Escape") setSelected(null);
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const source = demo ? SAMPLE_FLIGHTS : feed.flights;
  const airborne = source.filter((f) => !f.on_ground).length;
  const visible = useMemo(
    () =>
      source
        .filter(
          (f) =>
            (ground || !f.on_ground) &&
            (f.on_ground || (f.alt_m ?? 0) >= minAlt * 0.3048) &&
            `${f.callsign ?? ""} ${f.icao24}`
              .toLowerCase()
              .includes(search.trim().toLowerCase()),
        )
        .sort((a, b) =>
          sort === "altitude"
            ? (b.alt_m ?? -1) - (a.alt_m ?? -1)
            : (a.callsign || a.icao24).localeCompare(b.callsign || b.icao24),
        ),
    [source, ground, minAlt, search, sort],
  );
  const active = visible.find((f) => f.icao24 === selected);
  const age = feed.stamp
    ? Math.max(0, Math.floor(now / 1000 - feed.stamp))
    : null;
  const status = demo
    ? "Sample positions"
    : feed.error
      ? "Connection interrupted"
      : feed.loading
        ? "Connecting"
        : age > 45
          ? "Delayed positions"
          : "Live positions";
  const hasFilters = search.trim() || minAlt > 0;
  function selectFlight(f) {
    setSelected(f.icao24);
    map.current?.focus(f);
  }
  function switchMode() {
    setDemo(!demo);
    setSelected(null);
  }
  return (
    <div className="app">
      <header className="masthead">
        <a className="brand" href="./" aria-label="Skywatch home">
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d={PLANE_PATH}
              fill="currentColor"
              transform="rotate(35 12 12)"
            />
          </svg>
          <span>skywatch</span>
          <span className="brand-code">YUL</span>
        </a>
        <nav aria-label="Project navigation">
          <button onClick={() => about.current.showModal()}>
            About the data
          </button>
          <a
            href="https://github.com/milosjarcov/skywatch-yul"
            target="_blank"
            rel="noreferrer"
          >
            View source <Icon name="arrow" size={14} />
          </a>
        </nav>
      </header>
      <main>
        <section className="page-heading">
          <div>
            <p className="location-line">
              Québec, Canada <span> / Live aircraft tracker</span>
            </p>
            <h1>
              Montréal <em>airspace</em>
            </h1>
          </div>
          <div className="feed-summary">
            <span
              className={`feed-state ${demo || feed.error || age > 45 ? "is-muted" : ""}`}
            >
              <i />
              {status}
            </span>
            <p>
              {feed.loading && !demo ? (
                "Waiting for the first update"
              ) : (
                <>
                  <b>{airborne}</b> airborne <span>·</span> {source.length}{" "}
                  tracked
                </>
              )}
            </p>
            <time>
              {new Date(now).toLocaleTimeString("en-GB", { timeZone: "UTC" })}{" "}
              UTC
            </time>
          </div>
        </section>
        <div className="workspace">
          <section
            className={`map-panel ${active ? "has-selection" : ""}`}
            aria-label="Interactive Montréal airspace map"
          >
            <Suspense
              fallback={
                <div className="map-loading" role="status">
                  Loading the map…
                </div>
              }
            >
              <AirspaceMap
                ref={map}
                flights={visible}
                selected={active?.icao24}
                onSelect={selectFlight}
                labels={labels}
                ranges={ranges}
              />
            </Suspense>
            <div className="map-topline">
              <button
                className="airport-link"
                onClick={() => map.current?.airport()}
              >
                <span className="airport-cross">＋</span>
                <b>YUL</b>
                <span>Montréal–Trudeau</span>
              </button>
              <span className="north" title="Map orientation: north up">
                N <span>↑</span>
              </span>
            </div>
            {demo && (
              <div className="sample-note">
                Sample data. Positions are illustrative.
              </div>
            )}
            {!demo && (feed.error || age > 45) && (
              <div className="sample-note" role="status">
                {feed.error
                  ? "Live feed interrupted. Retrying automatically."
                  : "Positions are delayed. Waiting for fresh data."}
              </div>
            )}
            <div className="map-controls">
              <button
                title="Recenter on Montréal"
                aria-label="Recenter map"
                onClick={() => map.current?.reset()}
              >
                <Icon name="target" />
              </button>
              <div className="zoom-controls">
                <button
                  aria-label="Zoom in"
                  onClick={() => map.current?.zoom(1)}
                >
                  <Icon name="plus" />
                </button>
                <button
                  aria-label="Zoom out"
                  onClick={() => map.current?.zoom(-1)}
                >
                  <Icon name="minus" />
                </button>
              </div>
            </div>
            <div className="map-layers">
              <Icon name="layers" size={16} />
              <button aria-pressed={labels} onClick={() => setLabels(!labels)}>
                Callsigns
              </button>
              <span />
              <button aria-pressed={ranges} onClick={() => setRanges(!ranges)}>
                Distance rings
              </button>
            </div>
            {active && (
              <section
                className="flight-detail"
                aria-label="Selected aircraft details"
              >
                <div className="detail-title">
                  <div>
                    <span className="small-label">Selected aircraft</span>
                    <h2>{active.callsign || active.icao24}</h2>
                  </div>
                  <div className="phase">
                    <i />
                    {flightPhase(active)}
                  </div>
                  <button
                    className="close-detail"
                    aria-label="Close flight details"
                    onClick={() => setSelected(null)}
                  >
                    <Icon name="close" />
                  </button>
                </div>
                <dl className="telemetry">
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
                <div className="detail-bottom">
                  <span>
                    {active.country || "Unknown registration"} <span>·</span>{" "}
                    {active.icao24}
                  </span>
                  <span>
                    {distanceNM(YUL, [active.lon, active.lat]).toFixed(1)} NM
                    from YUL
                  </span>
                </div>
              </section>
            )}
          </section>
          <aside className="aircraft-panel" aria-label="Aircraft browser">
            <div className="list-heading">
              <h2>Aircraft</h2>
              <span>{String(visible.length).padStart(2, "0")}</span>
            </div>
            <div className="search-row">
              <Icon name="search" size={16} />
              <input
                ref={searchInput}
                aria-label="Search callsign or ICAO"
                placeholder="Search callsign or ICAO"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search ? (
                <button aria-label="Clear search" onClick={() => setSearch("")}>
                  <Icon name="close" size={14} />
                </button>
              ) : (
                <kbd>/</kbd>
              )}
            </div>
            <div className="filter-row">
              <button
                className={
                  filters || ground || minAlt
                    ? "filter-button active"
                    : "filter-button"
                }
                aria-expanded={filters}
                aria-controls="aircraft-filters"
                onClick={() => setFilters(!filters)}
              >
                <Icon name="sliders" size={14} />
                Filters{(ground || minAlt > 0) && <i />}
              </button>
              <label className="sort-control">
                <span className="sr-only">Sort aircraft</span>
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="callsign">Callsign A–Z</option>
                  <option value="altitude">Highest altitude</option>
                </select>
              </label>
            </div>
            {filters && (
              <div id="aircraft-filters" className="filter-content">
                <label>
                  Minimum airborne altitude <output>{fmt(minAlt)} ft</output>
                  <input
                    type="range"
                    aria-label="Minimum altitude"
                    min="0"
                    max="40000"
                    step="1000"
                    value={minAlt}
                    onChange={(e) => setMinAlt(Number(e.target.value))}
                  />
                </label>
                <label className="ground-filter">
                  <input
                    type="checkbox"
                    checked={ground}
                    onChange={(e) => setGround(e.target.checked)}
                  />
                  Include ground traffic
                </label>
              </div>
            )}
            <div className="table-head">
              <span>Callsign / Registration</span>
              <span>Altitude, ft</span>
            </div>
            <div className="flight-list">
              {visible.map((f) => (
                <button
                  className={`flight-row ${active?.icao24 === f.icao24 ? "selected" : ""}`}
                  aria-pressed={active?.icao24 === f.icao24}
                  key={f.icao24}
                  onClick={() => selectFlight(f)}
                >
                  <span className="row-name">
                    <b>{f.callsign || f.icao24}</b>
                    <small>{f.country || "Unknown registration"}</small>
                  </span>
                  <span className="row-altitude">
                    {f.on_ground ? "Ground" : fmt(f.alt_m, 3.28084)}
                    <span className="trend" aria-label={flightPhase(f)}>
                      {f.on_ground
                        ? ""
                        : f.vertical_rate_ms > 0.5
                          ? "↗"
                          : f.vertical_rate_ms < -0.5
                            ? "↘"
                            : "–"}
                    </span>
                  </span>
                </button>
              ))}
              {!visible.length && (
                <div className="empty">
                  <h3>
                    {feed.loading && !demo
                      ? "Loading aircraft"
                      : hasFilters
                        ? "No matching aircraft"
                        : feed.error && !demo
                          ? "Feed unavailable"
                          : "No aircraft to display"}
                  </h3>
                  <p>
                    {hasFilters
                      ? "Try a different callsign or lower your altitude filter."
                      : feed.error && !demo
                        ? "The live feed will retry automatically. You can explore sample data in the meantime."
                        : "Aircraft appear here as positions are received."}
                  </p>
                  {hasFilters ? (
                    <button
                      onClick={() => {
                        setSearch("");
                        setMinAlt(0);
                      }}
                    >
                      Clear filters
                    </button>
                  ) : (
                    !feed.loading && (
                      <button
                        onClick={() =>
                          source.length ? setGround(true) : setDemo(true)
                        }
                      >
                        {source.length
                          ? "Show ground traffic"
                          : "Explore sample data"}
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
            <div className="list-footer">
              <span>
                {demo
                  ? "Illustrative snapshot"
                  : age === null
                    ? "Refreshes every 15s"
                    : `Updated ${age}s ago`}
              </span>
              <button onClick={switchMode}>
                {demo ? "Return to live" : "Try sample data"} <span>↗</span>
              </button>
            </div>
          </aside>
        </div>
        <footer className="page-footer">
          <p>
            Aircraft positions by{" "}
            <a
              href="https://opensky-network.org/"
              target="_blank"
              rel="noreferrer"
            >
              OpenSky Network
            </a>
          </p>
          <p>For observation. Not for navigation.</p>
        </footer>
      </main>
      <dialog
        ref={about}
        className="about-dialog"
        aria-label="About Skywatch and aircraft data"
      >
        <div className="dialog-top">
          <span className="small-label">About Skywatch</span>
          <button
            aria-label="Close about dialog"
            onClick={() => about.current.close()}
          >
            <Icon name="close" />
          </button>
        </div>
        <h2>
          A window into
          <br />
          <em>Montréal’s airspace.</em>
        </h2>
        <p>
          Skywatch visualizes aircraft broadcasting ADS-B positions over Greater
          Montréal. The OpenSky Network supplies the data; the map refreshes
          every 15 seconds.
        </p>
        <dl>
          <div>
            <dt>What you’re seeing</dt>
            <dd>
              Reported positions, altitude, speed, heading, and vertical rate.
              Coverage varies; this is not a complete picture of all air
              traffic.
            </dd>
          </div>
          <div>
            <dt>Reading the map</dt>
            <dd>
              Aircraft point in their reported direction of travel. The selected
              aircraft is orange. Optional rings show distances of 10 and 20
              nautical miles from Montréal–Trudeau.
            </dd>
          </div>
          <div>
            <dt>Data notes</dt>
            <dd>
              Country means registration country, not departure location.
              Altitude is reported barometric altitude when available. Delayed
              positions and sample data are explicitly labeled.
            </dd>
          </div>
        </dl>
        <div className="dialog-footer">
          <a
            href="https://github.com/milosjarcov/skywatch-yul"
            target="_blank"
            rel="noreferrer"
          >
            Explore the source <Icon name="arrow" size={14} />
          </a>
          <button onClick={() => about.current.close()}>Back to the map</button>
        </div>
      </dialog>
    </div>
  );
}
