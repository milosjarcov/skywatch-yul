import { useEffect, useImperativeHandle, useRef, useState } from "react";
import L from "leaflet";
import "../lib/maplibre";
import { maplibreGL } from "@maplibre/maplibre-gl-leaflet";
import {
  altitudeColor,
  altitudeFeet,
  COVERAGE,
  displayName,
  formatNumber,
  hundredsOfFeet,
  KM_PER_NM,
  knots,
  trend,
  YUL,
} from "../lib/flights";
import { AIRCRAFT_CREDIT, applyOverrides, DECK_MAP, MAP_CREDITS } from "../lib/mapStyles";
import { projectPosition } from "../lib/motion";
import { PLANE_PATH } from "../lib/planeGlyph";

const COVERAGE_BOUNDS = L.latLngBounds([COVERAGE.south, COVERAGE.west], [COVERAGE.north, COVERAGE.east]);

// Distance rings around YUL, like the range rings on a radar scope.
const RINGS_NM = [10, 20, 30];

// Data blocks (callsign, altitude, speed) show from this zoom level in, and
// always for the selected or hovered plane. Further out they'd pile up.
const BLOCK_ZOOM = 10;

// How far ahead each plane's velocity vector reaches: where it will be in
// one minute if it holds its speed and track.
const VECTOR_SECONDS = 60;

const TREND_ARROWS = { climbing: "↑", descending: "↓", level: "" };

// Leaflet rounds marker positions to whole pixels. That's invisible for a pin
// that sits still, but a plane crossing the screen at one pixel per second
// would visibly tick along. This marker keeps the fraction, so planes glide.
const SmoothMarker = L.Marker.extend({
  update() {
    if (this._icon && this._map) this._setPos(this._map.latLngToLayerPoint(this._latlng));
    return this;
  },
});

// One template for every plane: the symbol, and a data block beside it the
// way air traffic control shows targets. Leaflet builds a fresh element from
// it per marker; the code below fills in color, rotation, and text.
const PLANE_ICON = L.divIcon({
  className: "target",
  html: `<svg class="target-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="${PLANE_PATH}"/></svg><span class="block"><span class="block-call"></span><span class="block-data"></span></span>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

const labelIcon = (text, className) =>
  L.divIcon({ className, html: `<span>${text}</span>`, iconSize: [0, 0], iconAnchor: [0, 0] });

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The radar-style live map. Leaflet does the panning, zooming, and markers;
// MapLibre draws the vector basemap underneath as a single Leaflet layer.
//
// Planes are managed by hand instead of through React: they move every
// frame, and 60 re-renders a second of the whole map would be wasteful.
// React says *which* planes exist; a requestAnimationFrame loop asks
// `tracker` *where* they are, which is either the live motion model or, in
// replay, the recorded history.
//
// display: a look-only version for the front page (no dragging, zooming,
// or clicking). view: { lat, lon, zoom } to show a close-up instead of the
// whole coverage area.
// ref gets { focus, reset, zoomIn, zoomOut, projectX }; onReady(true) fires
// once those work. getInsets() says how many pixels of each edge are
// covered, so the map can center things in the part you can see.
export default function FlightMap({
  ref,
  flights,
  tracker,
  replaying = false,
  clockOffset,
  selectedId,
  hoveredId,
  trail,
  onSelect,
  onHover,
  onReady,
  getInsets = () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  display = false,
  view = null,
}) {
  const containerRef = useRef(null);
  const [map, setMap] = useState(null);
  const planes = useRef(new Map()); // icao24 -> { flight, marker, el, glyph, call, data, heading, shown }
  const lines = useRef({ trail: null, vectors: null });

  // The animation loop and event handlers read the latest props from here,
  // so they never have to be torn down and rebuilt when props change.
  const latest = useRef(null);
  latest.current = { tracker, replaying, clockOffset, selectedId, trail, onSelect, onHover, getInsets };

  const paddingFor = () => {
    const { top, right, bottom, left } = latest.current.getInsets();
    return { paddingTopLeft: [left + 24, top + 24], paddingBottomRight: [right + 24, bottom + 24] };
  };

  // Create the map once.
  useEffect(() => {
    const leaflet = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      minZoom: 7.5,
      maxZoom: 15,
      zoomSnap: 0.25,
      // Planes only exist inside the coverage box, so don't let the map
      // wander off somewhere empty.
      maxBounds: COVERAGE_BOUNDS.pad(1.5),
      maxBoundsViscosity: 0.8,
      ...(display && {
        dragging: false,
        touchZoom: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
      }),
    });

    // A rough first view, replaced by a proper fit as soon as the map knows
    // its size. It can start at 0 x 0 (inside a hidden tab or panel), and
    // fitting a box into 0 pixels would zoom all the way in.
    leaflet.setView(COVERAGE_BOUNDS.getCenter(), 9);
    let framed = false;
    const resizeObserver = new ResizeObserver(() => {
      leaflet.invalidateSize({ pan: false });
      if (!leaflet.getSize().x || (framed && !display)) return;
      framed = true;
      if (view) leaflet.setView([view.lat, view.lon], view.zoom, { animate: false });
      else leaflet.fitBounds(COVERAGE_BOUNDS, { ...paddingFor(), animate: false });
    });
    resizeObserver.observe(containerRef.current);

    L.control
      .attribution({ position: "bottomleft", prefix: '<a href="https://leafletjs.com">Leaflet</a>' })
      .addAttribution(AIRCRAFT_CREDIT)
      .addTo(leaflet);

    // Range rings around YUL, labeled on their north side.
    for (const nm of RINGS_NM) {
      L.circle([YUL.lat, YUL.lon], { radius: nm * KM_PER_NM * 1000, className: "range-ring", interactive: false, fill: false }).addTo(
        leaflet,
      );
      const north = YUL.lat + (nm * KM_PER_NM) / 111.32;
      L.marker([north, YUL.lon], { icon: labelIcon(`${nm} NM`, "ring-label"), interactive: false, keyboard: false }).addTo(leaflet);
    }
    // The edge of what SkyWatch can see. Planes that cross it drop off the map.
    L.rectangle(COVERAGE_BOUNDS, { className: "coverage", interactive: false, fill: false, weight: 1 }).addTo(leaflet);
    L.marker([YUL.lat, YUL.lon], { icon: labelIcon("YUL", "airport"), interactive: false, keyboard: false, zIndexOffset: -1000 }).addTo(
      leaflet,
    );

    // All velocity vectors are one multi-line, so a frame is one path update.
    lines.current.vectors = L.polyline([], { className: "vectors", interactive: false, weight: 1 }).addTo(leaflet);
    lines.current.trail = L.polyline([], { className: "trail", interactive: false, weight: 2.5 }).addTo(leaflet);

    // Clicking empty map closes the selected plane.
    if (!display) leaflet.on("click", () => latest.current.onSelect?.(null));

    const updateBlocks = () => leaflet.getContainer().classList.toggle("show-blocks", leaflet.getZoom() >= BLOCK_ZOOM);
    leaflet.on("zoomend", updateBlocks);
    updateBlocks();

    setMap(leaflet);
    const markers = planes.current;
    return () => {
      resizeObserver.disconnect();
      leaflet.remove();
      markers.clear();
      setMap(null);
    };
    // view is read once, when the map is created.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [display]);

  // The basemap.
  useEffect(() => {
    if (!map) return;
    const layer = maplibreGL({
      style: DECK_MAP.styleUrl,
      // Handed to Leaflet's credits box. The plugin can't read credits from
      // the style itself until it has loaded, which is too late for Leaflet.
      attributionControl: { customAttribution: MAP_CREDITS },
    }).addTo(map);
    const gl = layer.getMaplibreMap();
    gl.on("style.load", () => applyOverrides(gl, DECK_MAP.overrides));
    return () => {
      map.removeLayer(layer);
    };
  }, [map]);

  // Add, update, and remove plane markers to match `flights`.
  useEffect(() => {
    if (!map) return;
    const seen = new Set();
    for (const flight of flights) {
      const id = flight.icao24;
      seen.add(id);
      let plane = planes.current.get(id);
      if (!plane) {
        const marker = new SmoothMarker([flight.lat, flight.lon], {
          icon: PLANE_ICON,
          interactive: !display,
          keyboard: !display,
          opacity: 0, // shown by the animation loop once it has a position
        });
        if (!display) {
          marker.on("click", () => latest.current.onSelect?.(id));
          marker.on("mouseover", () => latest.current.onHover?.(id));
          marker.on("mouseout", () => latest.current.onHover?.(null));
        }
        marker.addTo(map);
        const el = marker.getElement();
        if (!display) el.setAttribute("role", "button");
        plane = {
          marker,
          el,
          glyph: el.querySelector(".target-glyph"),
          call: el.querySelector(".block-call"),
          data: el.querySelector(".block-data"),
          heading: null,
          shown: false,
        };
        planes.current.set(id, plane);
      }
      plane.flight = flight;
      const name = displayName(flight);
      const selected = id === selectedId;
      const kt = knots(flight);
      plane.el.style.setProperty("--alt", altitudeColor(flight));
      plane.el.classList.toggle("is-selected", selected);
      plane.el.classList.toggle("is-ground", flight.on_ground);
      plane.call.textContent = name;
      plane.data.textContent = flight.on_ground
        ? `GND ${kt == null ? "" : formatNumber(kt)}`
        : `${hundredsOfFeet(flight)}${TREND_ARROWS[trend(flight)]} ${kt == null ? "" : formatNumber(kt)}`;
      plane.el.setAttribute(
        "aria-label",
        flight.on_ground ? `${name}, on the ground` : `${name}, ${formatNumber(altitudeFeet(flight) ?? 0)} feet`,
      );
      plane.marker.setZIndexOffset(selected ? 1000 : flight.on_ground ? -500 : 0);
    }
    for (const [id, plane] of planes.current) {
      if (seen.has(id)) continue;
      plane.marker.remove();
      planes.current.delete(id);
    }
  }, [map, flights, selectedId, display]);

  // Hovering a plane anywhere (here, in the list, or in the profile) lights
  // it up here too.
  useEffect(() => {
    for (const [id, plane] of planes.current) plane.el.classList.toggle("is-hovered", id === hoveredId);
  }, [hoveredId, flights]);

  // Replay shows callsigns only: the live altitude and speed in the data
  // blocks wouldn't match where the planes were back then.
  useEffect(() => {
    map?.getContainer().classList.toggle("is-replaying", replaying);
  }, [map, replaying]);

  // The animation loop: every frame, put each plane where the tracker says
  // it is, draw the one-minute vectors, and stretch the selected plane's
  // track to meet it.
  useEffect(() => {
    if (!map) return;
    let frame = 0;
    // Leaflet animates zooms with a CSS transform. Moving markers in the
    // middle of that would put them in the wrong place, so pause until it ends.
    let zooming = false;
    const onZoomStart = () => (zooming = true);
    const onZoomEnd = () => (zooming = false);
    map.on("zoomstart", onZoomStart);
    map.on("zoomend", onZoomEnd);

    function tick() {
      frame = requestAnimationFrame(tick);
      if (zooming) return;
      const { tracker, replaying, clockOffset, selectedId, trail } = latest.current;
      const now = Date.now() + clockOffset;
      const vectors = [];
      for (const [id, plane] of planes.current) {
        const position = tracker.positionAt(id, now);
        if (!position) {
          if (plane.shown) plane.marker.setOpacity(0);
          plane.shown = false;
          continue;
        }
        if (!plane.shown) plane.marker.setOpacity(1);
        plane.shown = true;
        plane.marker.setLatLng([position.lat, position.lon]);
        if (plane.heading === null || Math.abs(position.heading - plane.heading) > 0.1) {
          plane.glyph.style.transform = `rotate(${position.heading}deg)`;
          plane.heading = position.heading;
        }
        const { flight } = plane;
        if (!replaying && flight && !flight.on_ground && flight.velocity_ms) {
          const ahead = projectPosition({ ...flight, ...position, on_ground: false }, VECTOR_SECONDS);
          vectors.push([
            [position.lat, position.lon],
            [ahead.lat, ahead.lon],
          ]);
        }
      }
      lines.current.vectors.setLatLngs(vectors);

      const selected = selectedId && tracker.positionAt(selectedId, now);
      const past = trail?.filter((point) => !replaying || point[3] <= now / 1000) ?? [];
      lines.current.trail.setLatLngs(
        selected && past.length ? [...past.map(([lat, lon]) => [lat, lon]), [selected.lat, selected.lon]] : [],
      );
    }
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      map.off("zoomstart", onZoomStart);
      map.off("zoomend", onZoomEnd);
    };
  }, [map]);

  useImperativeHandle(
    ref,
    () => ({
      // Fly to a plane, centered in the part of the map nothing covers.
      // Leaflet only centers on the whole map, so the target is shifted by
      // half the difference between opposite covered edges first.
      focus(flight, animate = true) {
        if (!map) return;
        const position =
          latest.current.tracker.positionAt(flight.icao24, Date.now() + latest.current.clockOffset) ?? flight;
        const { top, right, bottom, left } = latest.current.getInsets();
        const zoom = Math.max(map.getZoom(), 10.5);
        const target = map.project([position.lat, position.lon], zoom);
        const center = map.unproject(target.add([(right - left) / 2, (bottom - top) / 2]), zoom);
        if (animate && !reducedMotion()) map.flyTo(center, zoom, { duration: 0.8 });
        else map.setView(center, zoom, { animate: false });
      },
      // Back to the whole coverage area.
      reset() {
        if (!map) return;
        if (reducedMotion()) map.fitBounds(COVERAGE_BOUNDS, { ...paddingFor(), animate: false });
        else map.flyToBounds(COVERAGE_BOUNDS, { ...paddingFor(), duration: 0.8 });
      },
      zoomIn: () => map?.zoomIn(),
      zoomOut: () => map?.zoomOut(),
      // Where a point lands horizontally, in page pixels. The profile under
      // the map uses it to line planes up with their spots on the map.
      projectX(lat, lon) {
        if (!map) return null;
        return map.latLngToContainerPoint([lat, lon]).x + map.getContainer().getBoundingClientRect().left;
      },
    }),
    [map],
  );

  useEffect(() => {
    onReady?.(Boolean(map));
  }, [map, onReady]);

  return <div ref={containerRef} className={display ? "map is-display" : "map"} />;
}
