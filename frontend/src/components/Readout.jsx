import { useNow } from "../hooks/useNow";
import {
  ago,
  ALTITUDE_GRADIENT,
  altitudeFeet,
  altitudeMeters,
  colorAtFeet,
  compassWord,
  describe,
  displayName,
  feetPerMinute,
  formatNumber,
  fromYul,
  kmh,
  knots,
  MAX_FEET,
  operatorLine,
  trend,
} from "../lib/flights";
import { ArrowUpRightIcon, ChevronLeftIcon, XmarkIcon } from "./Icons";

const TREND_WORDS = { climbing: "Climbing", descending: "Descending", level: "Level" };

// A compass card with the plane's track marked, like the heading indicator
// in a cockpit.
function Compass({ heading }) {
  return (
    <svg className="compass" viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="21" className="compass-ring" />
      {Array.from({ length: 12 }, (_, i) => (
        <line
          key={i}
          x1="24"
          y1="3"
          x2="24"
          y2={i % 3 === 0 ? 8 : 6}
          className="compass-tick"
          transform={`rotate(${i * 30} 24 24)`}
        />
      ))}
      <text x="24" y="15" className="compass-n">
        N
      </text>
      <path d="M24 10 27.5 28h-7Z" className="compass-needle" transform={`rotate(${heading} 24 24)`} />
    </svg>
  );
}

// The plane's altitude since the page opened, one point per 15-second
// report, colored by altitude like everything else.
function AltitudeTrace({ flight, history, now }) {
  const points = (history ?? []).map(([, , alt, time]) => [time * 1000, alt * 3.28084]);
  if (points.length < 2) {
    return <p className="trace-empty">Fills in as reports arrive, one every 15 seconds.</p>;
  }
  points.push([now, altitudeFeet(flight) ?? points.at(-1)[1]]);
  const start = points[0][0];
  const span = Math.max(now - start, 60000);
  const peak = Math.max(...points.map(([, ft]) => ft));
  const top = Math.max(peak, 1000) * 1.2;
  const x = (t) => ((t - start) / span) * 100;
  const y = (ft) => 36 - (ft / top) * 32;
  const line = points.map(([t, ft], i) => `${i ? "L" : "M"}${x(t).toFixed(2)} ${y(ft).toFixed(2)}`).join(" ");
  const minutes = Math.max(1, Math.round(span / 60000));
  return (
    <>
      <svg className="trace" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" x2="100" y1="36" y2="36" className="trace-ground" />
        <path d={line} fill="none" stroke={colorAtFeet(peak)} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="trace-caption">
        Last {minutes} min, peak {formatNumber(peak)} ft
      </p>
    </>
  );
}

// One cell of the readout: an aviation abbreviation, the number, the unit,
// and a second line.
function Cell({ label, name, value, unit, sub, children }) {
  return (
    <div className="cell">
      <dt>
        <abbr title={name}>{label}</abbr>
      </dt>
      <dd className="cell-value">
        {value}
        {unit && <span className="cell-unit">{unit}</span>}
      </dd>
      {children}
      <dd className="cell-sub">{sub}</dd>
    </div>
  );
}

// Everything known about one aircraft, laid out like an instrument readout.
// `gone` means it dropped out of the feed (flew out of range or landed), so
// this is its last report.
export default function Readout({ flight, gone = false, clockOffset = 0, history, onBack, onClose }) {
  const now = useNow(1000) + clockOffset;
  const ft = altitudeFeet(flight);
  const kt = knots(flight);
  const fpm = feetPerMinute(flight);
  const direction = trend(flight);
  const reportAge = flight.position_time == null ? null : Math.max(0, now / 1000 - flight.position_time);
  const lookupUrl = flight.callsign ? `https://www.flightaware.com/live/flight/${flight.callsign}` : null;
  const airborne = !flight.on_ground;

  return (
    <section className="readout" aria-label={`Details for ${displayName(flight)}`}>
      <header className="pane-head readout-nav">
        {onBack && (
          <button type="button" className="text-button back" onClick={onBack}>
            <ChevronLeftIcon />
            Traffic
          </button>
        )}
        {onClose && (
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close details">
            <XmarkIcon />
          </button>
        )}
      </header>

      <div className="pane-scroll readout-body">
        <p className="readout-operator">{operatorLine(flight)}</p>
        <h2 className="readout-call">{displayName(flight)}</h2>
        <p className="readout-summary">{gone ? `Out of range. Last seen ${ago(reportAge ?? 0)}.` : describe(flight)}</p>

        <dl className="cells">
          <Cell
            label="ALT"
            name="Altitude"
            value={airborne ? (ft == null ? "---" : formatNumber(ft)) : "GND"}
            unit={airborne && ft != null ? "ft" : null}
            sub={airborne && ft != null ? `${formatNumber(altitudeMeters(flight))} m` : "On the ground"}
          >
            <dd className="meter" aria-hidden="true">
              <span className="meter-bar" style={{ background: ALTITUDE_GRADIENT }} />
              {airborne && ft != null && <span className="meter-mark" style={{ left: `${Math.min(ft / MAX_FEET, 1) * 100}%` }} />}
            </dd>
          </Cell>
          <Cell
            label="GS"
            name="Ground speed"
            value={kt == null ? "---" : formatNumber(kt)}
            unit={kt == null ? null : "kt"}
            sub={kt == null ? "" : `${formatNumber(kmh(flight))} km/h`}
          />
          <Cell
            label="TRK"
            name="Track, the direction it's moving over the ground"
            value={flight.heading == null ? "---" : `${String(Math.round(flight.heading) % 360).padStart(3, "0")}°`}
            sub={flight.heading == null ? "" : `Toward the ${compassWord(flight.heading)}`}
          >
            {flight.heading != null && (
              <dd className="cell-compass">
                <Compass heading={flight.heading} />
              </dd>
            )}
          </Cell>
          <Cell
            label="V/S"
            name="Vertical speed"
            value={fpm == null || !airborne ? "---" : `${fpm > 0 ? "+" : fpm < 0 ? "−" : ""}${formatNumber(Math.abs(fpm))}`}
            unit={fpm == null || !airborne ? null : "fpm"}
            sub={fpm == null || !airborne ? "" : TREND_WORDS[direction]}
          />
        </dl>

        <section className="readout-section">
          <h3>Altitude trace</h3>
          <AltitudeTrace flight={flight} history={history} now={now} />
        </section>

        <section className="readout-section">
          <h3>Details</h3>
          <dl className="rows">
            <div>
              <dt>Position</dt>
              <dd>{fromYul(flight)}</dd>
            </div>
            {flight.country && (
              <div>
                <dt>Registered in</dt>
                <dd>{flight.country}</dd>
              </div>
            )}
            <div>
              <dt>Transponder</dt>
              <dd className="mono">{flight.icao24.toUpperCase()}</dd>
            </div>
            <div>
              <dt>Last report</dt>
              <dd>{reportAge == null ? "Unknown" : ago(reportAge)}</dd>
            </div>
          </dl>
        </section>

        {lookupUrl && (
          <a className="readout-link" href={lookupUrl} target="_blank" rel="noreferrer">
            Route and history on FlightAware
            <ArrowUpRightIcon />
          </a>
        )}
        <p className="readout-note">
          From the aircraft's own ADS-B broadcasts, via the OpenSky Network. Between reports, its position is estimated
          from speed and track.
        </p>
      </div>
    </section>
  );
}
