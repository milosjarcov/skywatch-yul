import { useCallback, useEffect, useRef, useState } from "react";
import { getJson } from "../lib/api";
import { Motion } from "../lib/motion";

// The backend refreshes its cache every 15 seconds, so asking more often
// would only get the same snapshot back.
export const REFRESH_MS = 15000;

// How far back to remember each plane's reports, for the selected plane's
// trail and its altitude chart.
export const HISTORY_SECONDS = 10 * 60;

// Remembers where each plane has been since the page opened, as
// [lat, lon, altitude in meters, report time in seconds, heading] points.
// Planes that leave the feed are forgotten.
function recordPositions(history, flights, snapshotTime) {
  const seen = new Set();
  for (const flight of flights) {
    seen.add(flight.icao24);
    const points = history.get(flight.icao24) ?? [];
    const last = points.at(-1);
    const time = flight.position_time ?? snapshotTime;
    if (!last || (time > last[3] && (last[0] !== flight.lat || last[1] !== flight.lon))) {
      points.push([flight.lat, flight.lon, flight.on_ground ? 0 : (flight.alt_m ?? 0), time, flight.heading ?? last?.[4] ?? 0]);
    }
    while (points.length && points[0][3] < snapshotTime - HISTORY_SECONDS) points.shift();
    history.set(flight.icao24, points);
  }
  for (const id of history.keys()) if (!seen.has(id)) history.delete(id);
}

// Polls /api/flights every 15 seconds and returns the latest snapshot.
//
// It stops polling while the tab is hidden. That matters more than it
// sounds: one forgotten background tab asking every 15 seconds would keep
// the server calling OpenSky all day and spend the whole 400-call budget in
// under two hours. When the tab comes back, it catches up right away.
export function useFlights() {
  const [feed, setFeed] = useState({
    flights: [],
    fetchedAt: null, // OpenSky's timestamp for the snapshot, in Unix seconds
    error: null,
    loading: true,
    polledAt: 0, // when we last asked, by this browser's clock
    clockOffset: 0, // server clock minus browser clock, in ms
  });
  const history = useRef(new Map());
  // One motion model per page, shared by everything that draws planes, so
  // the map and the side view always agree on where each plane is.
  const motion = useRef(null);
  motion.current ??= new Motion();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let timer = 0;
    let controller = null;
    let lastPoll = 0;
    let stopped = false;

    async function poll() {
      clearTimeout(timer);
      controller?.abort();
      controller = new AbortController();
      lastPoll = Date.now();
      try {
        const { data, serverDate } = await getJson("/api/flights", { signal: controller.signal });
        // The Date header only has whole seconds, which is plenty here.
        const clockOffset = Number.isNaN(serverDate) ? 0 : serverDate - Date.now();
        recordPositions(history.current, data.flights, data.fetched_at);
        motion.current.update(data.flights, data.fetched_at, Date.now() + clockOffset);
        setFeed({
          flights: data.flights,
          fetchedAt: data.fetched_at,
          error: null,
          loading: false,
          polledAt: lastPoll,
          clockOffset,
        });
      } catch (err) {
        if (err.name === "AbortError") return;
        setFeed((old) => ({ ...old, error: err.message, loading: false, polledAt: lastPoll }));
      }
      schedule(REFRESH_MS);
    }

    function schedule(ms) {
      clearTimeout(timer);
      if (!stopped && !document.hidden) timer = setTimeout(poll, ms);
    }

    function onVisibilityChange() {
      if (document.hidden) {
        clearTimeout(timer);
        return;
      }
      const waited = Date.now() - lastPoll;
      if (waited >= REFRESH_MS) poll();
      else schedule(REFRESH_MS - waited);
    }

    if (!document.hidden) poll();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [attempt]);

  // Ask again right now (the "Try Again" button).
  const retry = useCallback(() => {
    setFeed((old) => ({ ...old, loading: !old.flights.length, error: null }));
    setAttempt((n) => n + 1);
  }, []);

  return { ...feed, history: history.current, motion: motion.current, retry };
}
