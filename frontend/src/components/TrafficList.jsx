import { altitudeColor, altitudeFeet, displayName, formatNumber, knots, operatorLine, trend } from "../lib/flights";
import Spinner from "./Spinner";

const TREND_ARROWS = { climbing: "↑", descending: "↓", level: "" };

// Every aircraft on the map, as a column of strips like the paper flight
// strips air traffic controllers keep: a colored edge for altitude, the
// callsign and operator, then altitude and ground speed in aligned columns.
export default function TrafficList({
  flights,
  total,
  note,
  loading,
  error,
  onRetry,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
}) {
  let body;
  if (loading) {
    body = (
      <div className="pane-state">
        <Spinner />
        <p>Looking for aircraft…</p>
      </div>
    );
  } else if (error && !total) {
    body = (
      <div className="pane-state">
        <h3>No data</h3>
        <p>Either the SkyWatch server or OpenSky isn't answering. It tries again every 15 seconds.</p>
        <button type="button" className="button button-small" onClick={onRetry}>
          Try again now
        </button>
      </div>
    );
  } else if (!flights.length) {
    body = (
      <div className="pane-state">
        <h3>Nothing to show</h3>
        <p>{total ? "No aircraft match the search and filters." : "No aircraft in range right now."}</p>
      </div>
    );
  } else {
    body = (
      <ul className="strips">
        {flights.map((flight) => {
          const ft = altitudeFeet(flight);
          const kt = knots(flight);
          const id = flight.icao24;
          const classes = ["strip", id === selectedId && "is-selected", id === hoveredId && "is-hovered"];
          return (
            <li key={id}>
              <button
                type="button"
                className={classes.filter(Boolean).join(" ")}
                style={{ "--alt": altitudeColor(flight) }}
                onClick={() => onSelect(flight)}
                onMouseEnter={() => onHover(id)}
                onMouseLeave={() => onHover(null)}
              >
                <span className="strip-flight">
                  <span className="strip-call">{displayName(flight)}</span>
                  <span className="strip-op">{operatorLine(flight)}</span>
                </span>
                <span className="strip-alt">
                  {flight.on_ground ? "GND" : ft == null ? "" : formatNumber(ft)}
                  <span className="strip-trend" aria-label={trend(flight)}>
                    {flight.on_ground ? "" : TREND_ARROWS[trend(flight)]}
                  </span>
                </span>
                <span className="strip-gs">{kt == null ? "" : formatNumber(kt)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section className="traffic" aria-label="Traffic">
      <header className="pane-head">
        <h2>Traffic</h2>
        <p>{note}</p>
      </header>
      <div className="strip-head" aria-hidden="true">
        <span>Flight</span>
        <span>Alt ft</span>
        <span>GS kt</span>
      </div>
      <div className="pane-scroll">{body}</div>
    </section>
  );
}
