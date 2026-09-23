import { useEffect, useId, useRef, useState } from "react";
import { altitudeColor, colorAtFeet, displayName, formatNumber } from "../lib/flights";
import { SIDE_PATH } from "../lib/planeGlyph";
import Switch from "./Switch";

// The top of the chart. A little above 40,000 ft so airliners at cruising
// altitude don't sit on the edge.
const MAX_FEET = 45000;
const GRID = [2000, 5000, 10000, 20000, 30000, 40000];
const TOP_PAD = 14;
const GROUND_PAD = 18;
const PLANE = new Path2D(SIDE_PATH);
const HIT_RADIUS = 14;
const FEET_PER_METER = 3.28084;
const LABEL_FONT = '600 11px -apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, sans-serif';
const AXIS_FONT = '500 10px -apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, sans-serif';

const CYAN = "#4cc9f0";
const MAGENTA = "#f15bb5";
const AMBER = "#ffb703";

const snap = (feet) => Math.round(feet / 500) * 500;
const clampFeet = (feet) => Math.min(Math.max(feet, 0), 40000);
const feetLabel = (ft) => (ft >= 1000 ? `${ft / 1000}k` : `${ft}`);

// A vertical profile of the airspace, like the vertical situation display in
// a cockpit: every plane by altitude (up) and by how far east or west it is
// (across). In the app it sits directly under the map and uses the map's own
// projection for "across", so each plane lines up exactly below its spot on
// the map, even as you pan and zoom.
//
// It's drawn on a canvas and redrawn every frame, so planes glide in step
// with the map. The amber "floor" line is the minimum-altitude filter: drag
// it (or focus it and use the arrow keys) and everything below fades out.
//
// tracker.positionAt(id, now) says where a plane is (live or replayed).
// projectX(lat, lon, box) gives its horizontal position in page pixels.
export default function SideView({
  flights,
  tracker,
  clockOffset,
  replaying = false,
  projectX,
  selectedId,
  hoveredId,
  trail,
  onSelect,
  onHover,
  minFeet = 0,
  onMinFeetChange,
  showGround,
  onShowGroundChange,
  className = "",
  caption = "Altitude across the map, west to east",
}) {
  const bodyRef = useRef(null);
  const canvasRef = useRef(null);
  const drawn = useRef([]); // where each plane was drawn last frame, for hit testing
  const dragging = useRef(false);
  const [running, setRunning] = useState(true);
  const [plotHeight, setPlotHeight] = useState(120);
  const groundId = useId();
  const hasFloor = typeof onMinFeetChange === "function";

  const latest = useRef(null);
  latest.current = { flights, tracker, clockOffset, replaying, projectX, selectedId, hoveredId, trail, minFeet };

  // Only animate while on screen.
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setRunning(entry.isIntersecting));
    observer.observe(bodyRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const observer = new ResizeObserver(() => setPlotHeight(bodyRef.current.clientHeight));
    observer.observe(bodyRef.current);
    return () => observer.disconnect();
  }, []);

  // Altitude runs up the chart on a square-root scale. Most traffic near an
  // airport is low, and a straight scale would squash it into a thin strip
  // along the bottom. This one gives the first 10,000 ft almost half the height.
  const toUnit = (feet) => Math.sqrt(Math.min(Math.max(feet, 0), MAX_FEET) / MAX_FEET);
  const yFor = (feet, height) => {
    const bottom = height - GROUND_PAD;
    return bottom - toUnit(feet) * (bottom - TOP_PAD);
  };
  const feetFor = (y, height) => {
    const unit = (height - GROUND_PAD - y) / (height - GROUND_PAD - TOP_PAD);
    return Math.max(unit, 0) ** 2 * MAX_FEET;
  };

  useEffect(() => {
    if (!running) return;
    let frame = 0;

    function draw() {
      frame = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const box = canvas.getBoundingClientRect();
      const { width, height } = box;
      if (!width || !height) return;
      const ratio = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
      }
      const ctx = canvas.getContext("2d");
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const { flights, tracker, clockOffset, replaying, projectX, selectedId, hoveredId, trail, minFeet } = latest.current;
      const now = Date.now() + clockOffset;
      const ground = height - GROUND_PAD;

      // Altitude scale: a thin strip of the altitude colors on the left,
      // then hairlines with their altitude, skipping labels that would
      // collide on a short chart.
      const scale = ctx.createLinearGradient(0, ground, 0, yFor(40000, height));
      for (let ft = 0; ft <= 40000; ft += 2500) scale.addColorStop(toUnit(ft) / toUnit(40000), colorAtFeet(ft));
      ctx.fillStyle = scale;
      ctx.fillRect(0, yFor(40000, height), 2, ground - yFor(40000, height));
      ctx.font = AXIS_FONT;
      let lastLabel = Infinity;
      for (const ft of GRID) {
        const y = Math.round(yFor(ft, height)) + 0.5;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
        if (lastLabel - y < 15) continue;
        ctx.fillStyle = "rgba(152, 162, 174, 0.8)";
        ctx.fillText(feetLabel(ft), 8, y - 3);
        lastLabel = y;
      }
      ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
      ctx.beginPath();
      ctx.moveTo(0, ground + 0.5);
      ctx.lineTo(width, ground + 0.5);
      ctx.stroke();

      // Everything under the floor is shaded, since the map hides it.
      if (minFeet > 0) {
        const floorY = yFor(minFeet, height);
        ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
        ctx.fillRect(0, floorY, width, ground - floorY);
        ctx.strokeStyle = AMBER;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(0, floorY);
        ctx.lineTo(width, floorY);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // The selected plane's path through the sky so far, in magenta, the
      // color cockpit displays use for the active route.
      const selectedPosition = selectedId && tracker.positionAt(selectedId, now);
      if (selectedPosition && trail?.length) {
        const past = trail.filter((point) => !replaying || point[3] <= now / 1000);
        const points = past.map(([lat, lon, alt]) => [projectX(lat, lon, box), alt * FEET_PER_METER]);
        points.push([projectX(selectedPosition.lat, selectedPosition.lon, box), (selectedPosition.alt_m ?? 0) * FEET_PER_METER]);
        ctx.strokeStyle = MAGENTA;
        ctx.lineWidth = 2;
        ctx.lineJoin = "round";
        ctx.beginPath();
        let started = false;
        for (const [x, ft] of points) {
          if (x == null) continue;
          const px = x - box.left;
          const py = yFor(ft, height);
          if (started) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
          started = true;
        }
        ctx.stroke();
      }

      // The planes. Dimmed ones first, then low to high.
      const placed = [];
      for (const flight of flights) {
        const position = tracker.positionAt(flight.icao24, now);
        if (!position) continue;
        const x = projectX(position.lat, position.lon, box);
        if (x == null) continue;
        const px = x - box.left;
        if (px < -20 || px > width + 20) continue;
        const ft = flight.on_ground ? 0 : Math.max((position.alt_m ?? 0) * FEET_PER_METER, 0);
        placed.push({
          flight,
          x: px,
          y: flight.on_ground ? ground - 4 : yFor(ft, height),
          ft: Math.round(ft / 25) * 25,
          heading: position.heading,
          dim: minFeet > 0 && !flight.on_ground && ft < minFeet,
        });
      }
      placed.sort((a, b) => Number(b.dim) - Number(a.dim) || a.ft - b.ft);

      for (const plane of placed) {
        const { flight, x, y, heading, dim } = plane;
        const id = flight.icao24;
        const selected = id === selectedId;
        const hovered = id === hoveredId;
        // Eastbound planes face right, westbound left. Climbing tips the nose
        // up, descending tips it down (exaggerated 3x so you can see it).
        const flip = Math.sin((heading * Math.PI) / 180) < 0;
        const speed = Math.max(flight.velocity_ms ?? 0, 30);
        const pitch =
          flight.on_ground || replaying
            ? 0
            : Math.max(-0.45, Math.min(0.45, 3 * Math.atan2(flight.vertical_rate_ms ?? 0, speed)));
        const size = selected ? 26 : flight.on_ground ? 15 : 20;

        if ((hovered || selected) && !flight.on_ground) {
          ctx.strokeStyle = selected ? CYAN : "rgba(255, 255, 255, 0.35)";
          ctx.globalAlpha = selected ? 0.6 : 1;
          ctx.setLineDash([2, 3]);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, y + 8);
          ctx.lineTo(x, ground);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }
        if (selected) {
          ctx.strokeStyle = CYAN;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x, y, 16, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.globalAlpha = dim ? 0.25 : 1;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(flip ? -size / 24 : size / 24, size / 24);
        ctx.rotate(-pitch);
        ctx.translate(-12, -6);
        ctx.fillStyle = altitudeColor(flight);
        ctx.fill(PLANE);
        ctx.restore();
        ctx.globalAlpha = 1;

        if (selected || hovered) {
          const label = `${displayName(flight)}  ${flight.on_ground ? "GND" : `${formatNumber(plane.ft)} ft`}`;
          ctx.font = LABEL_FONT;
          const textWidth = ctx.measureText(label).width;
          const lx = Math.min(Math.max(x - textWidth / 2, 28), width - textWidth - 6);
          ctx.fillStyle = selected ? CYAN : "#e9edf2";
          ctx.fillText(label, lx, y - (selected ? 22 : 15));
        }
      }
      drawn.current = placed;
    }

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [running]);

  // ---- Pointer and keyboard -----------------------------------------------

  function localPoint(event) {
    const box = canvasRef.current.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top, height: box.height };
  }

  function nearestPlane(x, y) {
    let best = null;
    let bestDistance = HIT_RADIUS;
    for (const plane of drawn.current) {
      const distance = Math.hypot(plane.x - x, plane.y - y);
      if (distance < bestDistance) {
        best = plane;
        bestDistance = distance;
      }
    }
    return best;
  }

  const nearFloor = (y, height) => hasFloor && Math.abs(y - yFor(minFeet, height)) < 8;

  function onPointerDown(event) {
    const { x, y, height } = localPoint(event);
    if (nearFloor(y, height)) {
      dragging.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    const plane = nearestPlane(x, y);
    if (plane) onSelect?.(plane.flight.icao24);
  }

  function onPointerMove(event) {
    const { x, y, height } = localPoint(event);
    if (dragging.current) {
      onMinFeetChange(clampFeet(snap(feetFor(y, height))));
      return;
    }
    const plane = nearestPlane(x, y);
    onHover?.(plane ? plane.flight.icao24 : null);
    event.currentTarget.style.cursor = nearFloor(y, height) ? "ns-resize" : plane ? "pointer" : "default";
  }

  function onPointerUp(event) {
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function onHandleKey(event) {
    const steps = { ArrowUp: 1000, ArrowRight: 1000, ArrowDown: -1000, ArrowLeft: -1000, PageUp: 5000, PageDown: -5000 };
    if (event.key in steps) onMinFeetChange(clampFeet(minFeet + steps[event.key]));
    else if (event.key === "Home") onMinFeetChange(0);
    else if (event.key === "End") onMinFeetChange(40000);
    else return;
    event.preventDefault();
  }

  function onHandlePointerDown(event) {
    event.stopPropagation();
    dragging.current = true;
    canvasRef.current.setPointerCapture(event.pointerId);
  }

  return (
    <section className={`profile ${className}`} aria-label="Vertical profile">
      <header className="pane-head">
        <h2>Profile</h2>
        <p>{caption}</p>
        {onShowGroundChange && (
          <label className="pane-toggle" htmlFor={groundId}>
            Ground traffic
            <Switch id={groundId} checked={showGround} onChange={onShowGroundChange} />
          </label>
        )}
      </header>
      <div ref={bodyRef} className="profile-body">
        <canvas
          ref={canvasRef}
          className="profile-canvas"
          role="img"
          aria-label={`${flights.length} aircraft by altitude, from west to east.`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => !dragging.current && onHover?.(null)}
        />
        {hasFloor && (
          <div
            className={minFeet ? "floor-handle is-set" : "floor-handle"}
            style={{ top: `${yFor(minFeet, plotHeight)}px` }}
            role="slider"
            tabIndex={0}
            aria-label="Hide planes below this altitude"
            aria-valuemin={0}
            aria-valuemax={40000}
            aria-valuenow={minFeet}
            aria-valuetext={minFeet ? `${formatNumber(minFeet)} feet` : "Showing all altitudes"}
            onKeyDown={onHandleKey}
            onPointerDown={onHandlePointerDown}
          >
            {minFeet ? `Floor ${formatNumber(minFeet)} ft` : "Drag to set a floor"}
          </div>
        )}
      </div>
    </section>
  );
}
