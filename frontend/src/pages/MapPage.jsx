import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FrameIcon, MinusIcon, PlusIcon } from "../components/Icons";
import Readout from "../components/Readout";
import ReplayBar, { formatAgo } from "../components/ReplayBar";
import Search from "../components/Search";
import SideView from "../components/SideView";
import TopBar from "../components/TopBar";
import TrafficList from "../components/TrafficList";
import { useFlights } from "../hooks/useFlights";
import { altitudeFeet, byCallsign, formatNumber, matchesSearch } from "../lib/flights";
import { positionFromHistory } from "../lib/replay";

// The map engines (Leaflet and MapLibre) are most of this page's JavaScript.
// Loading them as their own file lets the panels appear and the first data
// request start while they're still downloading.
const FlightMap = lazy(() => import("../components/FlightMap"));

const REPLAY_SPEED = 10; // replay plays back at ten times real time

// The tracker, laid out like an instrument panel: a top bar, the map with
// the vertical profile directly under it (so the two line up), and a column
// on the right with the traffic list or the selected flight's readout.
export default function MapPage() {
  const feed = useFlights();
  const [searchParams, setSearchParams] = useSearchParams();
  // The selected plane lives in the URL (/map?flight=c06db5), so a link can
  // open straight to it and reloading keeps it open.
  const selectedId = searchParams.get("flight");
  const [query, setQuery] = useState("");
  const [showGround, setShowGround] = useState(false);
  const [minFeet, setMinFeet] = useState(0);
  const [hoveredId, setHoveredId] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef(null);
  const searchRef = useRef(null);
  const focusedLinkedFlight = useRef(false);

  // ---- Replay -------------------------------------------------------------
  // null means live. Otherwise it's the moment being shown, in server-clock
  // seconds. The ref is what the animation loops read every frame; the
  // state only drives the controls, so playback doesn't re-render the whole
  // page sixty times a second.
  const replayRef = useRef(null);
  const [replayAt, setReplayAt] = useState(null);
  const [playing, setPlaying] = useState(false);
  const seek = useCallback((time) => {
    replayRef.current = time;
    setReplayAt(time);
  }, []);
  const goLive = useCallback(() => {
    replayRef.current = null;
    setReplayAt(null);
    setPlaying(false);
  }, []);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    let lastRender = 0;
    function tick(now) {
      frame = requestAnimationFrame(tick);
      replayRef.current += ((now - last) / 1000) * REPLAY_SPEED;
      last = now;
      if (replayRef.current >= (Date.now() + feed.clockOffset) / 1000) {
        goLive();
        return;
      }
      if (now - lastRender > 150) {
        lastRender = now;
        setReplayAt(replayRef.current);
      }
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, feed.clockOffset, goLive]);

  // One answer to "where is this plane?" for the map and the profile: the
  // live motion model, or the recorded history during replay.
  const tracker = useMemo(
    () => ({
      positionAt(id, now) {
        const at = replayRef.current;
        return at == null ? feed.motion.positionAt(id, now) : positionFromHistory(feed.history.get(id), at);
      },
    }),
    [feed.motion, feed.history],
  );

  // ---- Which planes to show -----------------------------------------------
  // Search and the ground switch decide which planes are on screen at all.
  // The profile shows all of those, fading the ones under the floor; the map
  // and the list leave the faded ones out.
  const searched = useMemo(
    () => feed.flights.filter((f) => (showGround || !f.on_ground) && matchesSearch(f, query)),
    [feed.flights, showGround, query],
  );
  const visible = useMemo(
    () => searched.filter((f) => f.on_ground || (altitudeFeet(f) ?? 0) >= minFeet).sort(byCallsign),
    [searched, minFeet],
  );

  // A selected plane stays on screen even if the filters would hide it. If
  // it drops out of the feed entirely, keep showing its last report.
  const liveSelected = selectedId ? (feed.flights.find((f) => f.icao24 === selectedId) ?? null) : null;
  const [lastSeen, setLastSeen] = useState(null);
  if (liveSelected && liveSelected !== lastSeen) setLastSeen(liveSelected);
  const selected = liveSelected ?? (lastSeen?.icao24 === selectedId ? lastSeen : null);
  const withSelected = useCallback(
    (list) => (liveSelected && !list.includes(liveSelected) ? [...list, liveSelected] : list),
    [liveSelected],
  );
  const mapFlights = useMemo(() => withSelected(visible), [withSelected, visible]);
  const profileFlights = useMemo(() => withSelected(searched), [withSelected, searched]);

  const hiddenCount = feed.flights.length - visible.length;
  let note = `${formatNumber(visible.length)} shown`;
  if (hiddenCount > 0) {
    const reasons = [!showGround && "on the ground", minFeet > 0 && `below ${formatNumber(minFeet)} ft`, query && "not matching"];
    note += `, ${formatNumber(hiddenCount)} hidden (${reasons.filter(Boolean).join(", ")})`;
  }

  // ---- Selecting ------------------------------------------------------------

  const projectX = useCallback((lat, lon) => mapRef.current?.projectX(lat, lon) ?? null, []);

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

  // Keyboard: "/" jumps to search; Escape leaves replay, then closes the
  // selected plane.
  useEffect(() => {
    function onKey(e) {
      // Typing in a text box shouldn't trigger shortcuts; a focused slider
      // or button is fine.
      const el = document.activeElement;
      const typing = el?.tagName === "TEXTAREA" || (el?.tagName === "INPUT" && ["text", "search"].includes(el.type));
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Escape" && !typing) {
        if (replayRef.current != null) goLive();
        else if (selectedId) close();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, goLive, selectedId]);

  const replaying = replayAt != null;
  const replayLabel = replaying ? formatAgo((Date.now() + feed.clockOffset) / 1000 - replayAt) : null;

  return (
    <div className={replaying ? "deck is-replaying" : "deck"}>
      <TopBar feed={feed} replayLabel={replayLabel} onExitReplay={goLive}>
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
            replaying={replaying}
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

      <div className="deck-profile">
        <SideView
          flights={profileFlights}
          tracker={tracker}
          clockOffset={feed.clockOffset}
          replaying={replaying}
          projectX={projectX}
          selectedId={selectedId}
          hoveredId={hoveredId}
          trail={selectedId ? feed.history.get(selectedId) : null}
          onSelect={selectById}
          onHover={setHoveredId}
          minFeet={minFeet}
          onMinFeetChange={setMinFeet}
          showGround={showGround}
          onShowGroundChange={setShowGround}
        />
        <ReplayBar
          recordingSince={feed.recordingSince}
          clockOffset={feed.clockOffset}
          replayAt={replayAt}
          playing={playing}
          onSeek={(time) => {
            setPlaying(false);
            seek(time);
          }}
          onPlay={(play, from) => {
            if (play) seek(from);
            setPlaying(play);
          }}
          onLive={goLive}
        />
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
