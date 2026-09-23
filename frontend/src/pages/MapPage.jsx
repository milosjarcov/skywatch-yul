import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FrameIcon, MinusIcon, PlusIcon } from "../components/Icons";
import Readout from "../components/Readout";
import Search from "../components/Search";
import TopBar from "../components/TopBar";
import TrafficList from "../components/TrafficList";
import { useFlights } from "../hooks/useFlights";
import { byCallsign, formatNumber, matchesSearch } from "../lib/flights";

// The map engines (Leaflet and MapLibre) are most of this page's JavaScript.
// Loading them as their own file lets the panels appear and the first data
// request start while they're still downloading.
const FlightMap = lazy(() => import("../components/FlightMap"));

// The tracker, laid out like an instrument panel: a top bar, the map, and a
// column on the right with the traffic list or the selected flight's readout.
export default function MapPage() {
  const feed = useFlights();
  const [searchParams, setSearchParams] = useSearchParams();
  // The selected plane lives in the URL (/map?flight=c06db5), so a link can
  // open straight to it and reloading keeps it open.
  const selectedId = searchParams.get("flight");
  const [query, setQuery] = useState("");
  const [hoveredId, setHoveredId] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef(null);
  const searchRef = useRef(null);
  const focusedLinkedFlight = useRef(false);

  // Where each plane is right now, from the live motion model.
  const tracker = useMemo(() => ({ positionAt: (id, now) => feed.motion.positionAt(id, now) }), [feed.motion]);

  // Planes in the air that match the search.
  const visible = useMemo(
    () => feed.flights.filter((f) => !f.on_ground && matchesSearch(f, query)).sort(byCallsign),
    [feed.flights, query],
  );

  // A selected plane stays on screen even if the search would hide it. If
  // it drops out of the feed entirely, keep showing its last report.
  const liveSelected = selectedId ? (feed.flights.find((f) => f.icao24 === selectedId) ?? null) : null;
  const [lastSeen, setLastSeen] = useState(null);
  if (liveSelected && liveSelected !== lastSeen) setLastSeen(liveSelected);
  const selected = liveSelected ?? (lastSeen?.icao24 === selectedId ? lastSeen : null);
  const mapFlights = useMemo(
    () => (liveSelected && !visible.includes(liveSelected) ? [...visible, liveSelected] : visible),
    [visible, liveSelected],
  );

  const hiddenCount = feed.flights.length - visible.length;
  let note = `${formatNumber(visible.length)} shown`;
  if (hiddenCount > 0) {
    const reasons = ["on the ground", query && "not matching"];
    note += `, ${formatNumber(hiddenCount)} hidden (${reasons.filter(Boolean).join(", ")})`;
  }

  // ---- Selecting ------------------------------------------------------------

  const select = useCallback(
    (flight, { fly = false } = {}) => {
      setSearchParams({ flight: flight.icao24 }, { replace: true });
      if (fly) mapRef.current?.focus(flight);
    },
    [setSearchParams],
  );

  const close = useCallback(() => setSearchParams({}, { replace: true }), [setSearchParams]);

  const selectById = useCallback(
    (id) => {
      const flight = id && feed.flights.find((f) => f.icao24 === id);
      if (flight) select(flight);
      else close();
    },
    [feed.flights, select, close],
  );

  // Opened from a link? Jump there once both the map and the plane exist.
  useEffect(() => {
    if (focusedLinkedFlight.current || !mapReady || !liveSelected) return;
    focusedLinkedFlight.current = true;
    mapRef.current.focus(liveSelected, false);
  }, [mapReady, liveSelected]);

  // Keyboard: "/" jumps to search; Escape closes the selected plane.
  useEffect(() => {
    function onKey(e) {
      // Typing in a text box shouldn't trigger shortcuts; a focused slider
      // or button is fine.
      const el = document.activeElement;
      const typing = el?.tagName === "TEXTAREA" || (el?.tagName === "INPUT" && ["text", "search"].includes(el.type));
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Escape" && !typing && selectedId) close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, selectedId]);

  return (
    <div className="deck">
      <TopBar feed={feed}>
        <Search
          flights={feed.flights}
          query={query}
          onQueryChange={setQuery}
          onPick={(flight) => {
            setQuery("");
            select(flight, { fly: true });
          }}
          onHover={setHoveredId}
          inputRef={searchRef}
        />
      </TopBar>

      <div className="deck-map">
        <Suspense fallback={<div className="map" />}>
          <FlightMap
            ref={mapRef}
            flights={mapFlights}
            tracker={tracker}
            clockOffset={feed.clockOffset}
            selectedId={selectedId}
            hoveredId={hoveredId}
            trail={selectedId ? feed.history.get(selectedId) : null}
            onSelect={selectById}
            onHover={setHoveredId}
            onReady={setMapReady}
          />
        </Suspense>
        <div className="map-controls">
          <button type="button" className="map-button" onClick={() => mapRef.current?.reset()} title="Show all of Montreal">
            <FrameIcon />
            <span className="sr-only">Show all of Montreal</span>
          </button>
          <button type="button" className="map-button" onClick={() => mapRef.current?.zoomIn()} title="Zoom in">
            <PlusIcon />
            <span className="sr-only">Zoom in</span>
          </button>
          <button type="button" className="map-button" onClick={() => mapRef.current?.zoomOut()} title="Zoom out">
            <MinusIcon />
            <span className="sr-only">Zoom out</span>
          </button>
        </div>
      </div>

      <aside className="deck-side">
        {selected ? (
          <Readout
            key={selected.icao24}
            flight={selected}
            gone={!liveSelected}
            clockOffset={feed.clockOffset}
            history={feed.history.get(selected.icao24)}
            onBack={close}
          />
        ) : (
          <TrafficList
            flights={visible}
            total={feed.flights.length}
            note={feed.loading ? "" : note}
            loading={feed.loading}
            error={feed.error}
            onRetry={feed.retry}
            selectedId={selectedId}
            hoveredId={hoveredId}
            onSelect={(flight) => select(flight, { fly: true })}
            onHover={setHoveredId}
          />
        )}
      </aside>
    </div>
  );
}
