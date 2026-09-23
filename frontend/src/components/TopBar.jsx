import { Link } from "react-router-dom";
import { useNow } from "../hooks/useNow";
import { REFRESH_MS } from "../hooks/useFlights";
import { ago, formatNumber } from "../lib/flights";
import AppIcon from "./AppIcon";
import { WarningIcon } from "./Icons";

// Positions older than this mean OpenSky is struggling (the server keeps
// serving its last snapshot when OpenSky doesn't answer).
const STALE_AFTER_S = 90;

// Montreal time, and UTC the way aviation writes it ("18:02Z").
const localClock = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Toronto",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZoneName: "short",
});
const utcClock = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function clockParts(date) {
  const parts = Object.fromEntries(localClock.formatToParts(date).map((p) => [p.type, p.value]));
  return { local: `${parts.hour}:${parts.minute}:${parts.second}`, zone: parts.timeZoneName, utc: `${utcClock.format(date)}Z` };
}

function feedStatus(feed, now) {
  const { flights, fetchedAt, error, loading, clockOffset } = feed;
  const age = fetchedAt == null ? null : Math.max(0, (now + clockOffset) / 1000 - fetchedAt);
  if (loading) return { text: "Connecting…" };
  if (error && !flights.length) return { text: "Feed unavailable, retrying", warning: true };
  if (error) return { text: `Can't refresh. Data from ${ago(age)}`, warning: true };
  if (age > STALE_AFTER_S) return { text: `Data from ${ago(age)}`, warning: true };
  return { text: `Updated ${ago(age)}` };
}

// The strip across the top of the tracker: what this is, how much traffic
// there is, the search box (passed in as children), how fresh the data is,
// and the time. The seconds tick, and the ring fills over the 15 seconds
// until the next update.
export default function TopBar({ feed, replayLabel, onExitReplay, children }) {
  const now = useNow(1000);
  const airborne = feed.flights.filter((f) => !f.on_ground).length;
  const clock = clockParts(new Date(now + feed.clockOffset));
  const status = feedStatus(feed, now);

  return (
    <header className="topbar">
      <Link to="/" className="brand">
        <AppIcon size={24} />
        <span>SkyWatch YUL</span>
      </Link>

      <p className="topbar-stats">
        <span>
          <strong>{formatNumber(feed.flights.length)}</strong> aircraft
        </span>
        <span>
          <strong>{formatNumber(airborne)}</strong> airborne
        </span>
      </p>

      <div className="topbar-search">{children}</div>

      {replayLabel ? (
        <p className="topbar-status is-replay">
          Replay, {replayLabel}
          <button type="button" className="text-button" onClick={onExitReplay}>
            Back to live
          </button>
        </p>
      ) : (
        <p className={status.warning ? "topbar-status is-warning" : "topbar-status"}>
          {status.warning ? (
            <WarningIcon />
          ) : (
            // key restarts the fill each time a poll lands.
            <svg key={feed.polledAt} className="refresh-ring" viewBox="0 0 16 16" aria-hidden="true" style={{ "--refresh": `${REFRESH_MS}ms` }}>
              <circle className="refresh-track" cx="8" cy="8" r="6" />
              {!feed.loading && <circle className="refresh-fill" cx="8" cy="8" r="6" pathLength="100" />}
            </svg>
          )}
          {status.text}
        </p>
      )}

      <p className="topbar-clock" aria-label={`Montreal time ${clock.local}`}>
        <span>{clock.local}</span>
        <small>{clock.zone}</small>
        <span className="topbar-utc">{clock.utc}</span>
      </p>
    </header>
  );
}
