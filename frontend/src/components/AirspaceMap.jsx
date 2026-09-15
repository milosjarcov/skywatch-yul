import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import * as maplibregl from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { createMapStyle } from "../mapStyle";
import { REGION_CENTER, YUL, PLANE_PATH, rangeFeatures } from "../airspace";

maplibregl.setWorkerUrl(mapWorkerUrl);
const motionDuration = (ms) =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : ms;

const AirspaceMap = forwardRef(function AirspaceMap(
  { flights, selected, onSelect, labels, ranges },
  ref,
) {
  const container = useRef(null),
    map = useRef(null),
    markers = useRef(new Map()),
    select = useRef(onSelect);
  const [ready, setReady] = useState(false),
    [mapStatus, setMapStatus] = useState("loading"),
    [attempt, setAttempt] = useState(0);
  select.current = onSelect;
  useImperativeHandle(
    ref,
    () => ({
      focus(flight) {
        const m = map.current;
        if (!m) return;
        const mobile = window.matchMedia("(max-width: 760px)").matches;
        m.easeTo({
          center: [flight.lon, flight.lat],
          zoom: Math.max(m.getZoom(), 10),
          offset: mobile ? [0, -125] : [0, -30],
          duration: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? 0
            : 650,
        });
        if (mobile)
          container.current.scrollIntoView({
            behavior: motionDuration(1) ? "smooth" : "instant",
            block: "start",
          });
      },
      reset() {
        map.current?.fitBounds(
          [
            [-74.3, 45.2],
            [-73.2, 45.8],
          ],
          { padding: 45, duration: motionDuration(500) },
        );
      },
      airport() {
        map.current?.easeTo({
          center: YUL,
          zoom: 12,
          duration: motionDuration(700),
        });
      },
      zoom(amount) {
        if (amount > 0) map.current?.zoomIn();
        else map.current?.zoomOut();
      },
    }),
    [],
  );
  useEffect(() => {
    setReady(false);
    setMapStatus("loading");
    let m;
    try {
      m = new maplibregl.Map({
        container: container.current,
        style: createMapStyle(),
        center: REGION_CENTER,
        zoom: 9.2,
        minZoom: 7,
        maxZoom: 15,
        maxBounds: [
          [-76, 44],
          [-71.5, 47],
        ],
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      });
      map.current = m;
      m.touchZoomRotate.disableRotation();
      m.fitBounds(
        [
          [-74.3, 45.2],
          [-73.2, 45.8],
        ],
        { padding: 45, duration: 0 },
      );
      m.addControl(
        new maplibregl.AttributionControl({ compact: true }),
        "bottom-right",
      );
      m.addControl(
        new maplibregl.ScaleControl({ maxWidth: 90, unit: "nautical" }),
        "bottom-left",
      );
    } catch {
      m?.remove();
      map.current = null;
      setMapStatus("error");
      return;
    }
    const timeout = setTimeout(
      () => setMapStatus((s) => (s === "loading" ? "error" : s)),
      15000,
    );
    m.on("error", () => setMapStatus("error"));
    m.on("sourcedata", (e) => {
      if (e.sourceId === "basemap" && e.isSourceLoaded) {
        clearTimeout(timeout);
        setMapStatus("ready");
      }
    });
    m.on("style.load", () => {
      m.addSource("range-rings", { type: "geojson", data: rangeFeatures() });
      m.addLayer({
        id: "range-lines",
        type: "line",
        source: "range-rings",
        filter: ["==", ["get", "kind"], "ring"],
        layout: { visibility: "none" },
        paint: {
          "line-color": "#9a9f94",
          "line-width": 1,
          "line-dasharray": [3, 5],
          "line-opacity": 0.6,
        },
      });
      m.addLayer({
        id: "range-labels",
        type: "symbol",
        source: "range-rings",
        filter: ["==", ["get", "kind"], "label"],
        layout: {
          visibility: "none",
          "text-field": ["get", "label"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 10,
          "text-offset": [0, -0.7],
        },
        paint: {
          "text-color": "#7b847c",
          "text-halo-color": "#edeae2",
          "text-halo-width": 2,
        },
      });
      setReady(true);
    });
    const airport = document.createElement("button");
    airport.className = "airport-pin";
    airport.type = "button";
    airport.setAttribute("aria-label", "Zoom to Montréal–Trudeau airport");
    airport.innerHTML = '<span aria-hidden="true">＋</span><span>YUL</span>';
    airport.addEventListener("click", () =>
      m.easeTo({ center: YUL, zoom: 12, duration: motionDuration(600) }),
    );
    new maplibregl.Marker({ element: airport }).setLngLat(YUL).addTo(m);
    const observer = new ResizeObserver(() => m.resize());
    observer.observe(container.current);
    return () => {
      clearTimeout(timeout);
      observer.disconnect();
      for (const entry of markers.current.values()) entry.marker.remove();
      markers.current.clear();
      m.remove();
      map.current = null;
    };
  }, [attempt]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const current = new Set(flights.map((f) => f.icao24));
    for (const [id, entry] of markers.current) {
      if (!current.has(id)) {
        entry.marker.remove();
        markers.current.delete(id);
      }
    }
    flights.forEach((f) => {
      let entry = markers.current.get(f.icao24);
      if (!entry) {
        const el = document.createElement("button");
        el.type = "button";
        el.className = "aircraft";
        const icon = document.createElement("span");
        icon.className = "aircraft-shape";
        icon.innerHTML = `<svg width="25" height="25" viewBox="0 0 24 24" aria-hidden="true"><path d="${PLANE_PATH}" fill="currentColor"/></svg>`;
        const label = document.createElement("span");
        label.className = "aircraft-label";
        el.append(icon, label);
        entry = {
          el,
          icon,
          label,
          flight: f,
          marker: new maplibregl.Marker({ element: el, anchor: "center" })
            .setLngLat([f.lon, f.lat])
            .addTo(m),
        };
        el.addEventListener("click", () => select.current(entry.flight));
        markers.current.set(f.icao24, entry);
      }
      entry.flight = f;
      entry.marker.setLngLat([f.lon, f.lat]);
      entry.el.className = `maplibregl-marker aircraft ${selected === f.icao24 ? "is-selected" : ""} ${f.on_ground ? "on-ground" : ""} ${labels ? "with-label" : ""}`;
      entry.el.setAttribute("aria-label", `Select ${f.callsign || f.icao24}`);
      entry.el.setAttribute("aria-pressed", String(selected === f.icao24));
      entry.icon.style.transform = `rotate(${Number.isFinite(f.heading) ? f.heading : 0}deg)`;
      entry.label.textContent = f.callsign || f.icao24;
    });
  }, [flights, selected, labels, ready]);
  useEffect(() => {
    if (!ready) return;
    for (const id of ["range-lines", "range-labels"])
      map.current.setLayoutProperty(
        id,
        "visibility",
        ranges ? "visible" : "none",
      );
  }, [ranges, ready]);
  return (
    <>
      <div className="map-canvas" ref={container} />
      {mapStatus !== "ready" && (
        <div className="map-loading" role="status">
          {mapStatus === "loading" ? (
            "Loading the map…"
          ) : (
            <>
              Map unavailable. Aircraft data is still shown in the list.{" "}
              <button onClick={() => setAttempt((n) => n + 1)}>
                Retry map
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
});
export default AirspaceMap;
