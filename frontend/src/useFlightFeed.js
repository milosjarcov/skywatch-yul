import { useEffect, useState } from "react";
export default function useFlightFeed(demo) {
  const [data, setData] = useState({
    flights: [],
    stamp: null,
    error: false,
    loading: true,
  });
  useEffect(() => {
    if (demo) return;
    let cancelled = false,
      pending = false;
    let controller;
    async function load() {
      if (pending) return;
      pending = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const res = await fetch("/api/flights", { signal: controller.signal });
        if (!res.ok) throw Error();
        const next = await res.json();
        if (!Array.isArray(next.flights) || !Number.isFinite(next.fetched_at))
          throw Error();
        if (!cancelled)
          setData({
            flights: next.flights.filter(
              (f) =>
                f &&
                typeof f.icao24 === "string" &&
                Number.isFinite(f.lat) &&
                Number.isFinite(f.lon),
            ),
            stamp: next.fetched_at,
            error: false,
            loading: false,
          });
      } catch {
        if (!cancelled)
          setData((old) => ({ ...old, error: true, loading: false }));
      } finally {
        clearTimeout(timeout);
        pending = false;
      }
    }
    setData((old) => ({ ...old, loading: !old.stamp }));
    load();
    const timer = setInterval(load, 15000);
    return () => {
      cancelled = true;
      controller?.abort();
      clearInterval(timer);
    };
  }, [demo]);
  return data;
}
