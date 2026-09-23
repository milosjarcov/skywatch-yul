import { PLANE_PATH } from "../../lib/planeGlyph";

// A looping picture of replay: a plane flies back along the track it came
// in on while the scrubber underneath plays through the last ten minutes.
// Drawn with SVG animation, so it needs no data and no JavaScript.
const TRACK = "M70 238 C 170 226, 250 190, 300 142 S 420 64, 560 58";
const DURATION = "7s";

export default function RewindArt() {
  const reduceMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <svg className="rewind-art" viewBox="0 0 640 340" role="img" aria-label="A plane's track redrawn as the replay scrubber plays through the last ten minutes.">
      {/* Range rings, like the tracker's map. */}
      <g className="rewind-rings">
        <circle cx="300" cy="150" r="70" />
        <circle cx="300" cy="150" r="140" />
        <circle cx="300" cy="150" r="210" />
      </g>
      <text x="300" y="86" className="rewind-ring-label" textAnchor="middle">
        10 NM
      </text>

      {/* The track, drawing itself in as the plane moves along it. */}
      <path d={TRACK} className="rewind-track" pathLength="100">
        {!reduceMotion && (
          <animate attributeName="stroke-dashoffset" from="100" to="0" dur={DURATION} repeatCount="indefinite" />
        )}
      </path>
      <g className="rewind-plane" transform={reduceMotion ? "translate(560 58)" : undefined}>
        <path d={PLANE_PATH} transform="scale(1.35) translate(-12 -12) rotate(90 12 12)" />
        {reduceMotion ? null : <animateMotion path={TRACK} dur={DURATION} rotate="auto" repeatCount="indefinite" />}
      </g>

      {/* The scrubber. */}
      <line x1="70" x2="570" y1="300" y2="300" className="rewind-rail" />
      <line x1="70" x2="570" y1="300" y2="300" className="rewind-fill" pathLength="100">
        {!reduceMotion && (
          <animate attributeName="stroke-dashoffset" from="100" to="0" dur={DURATION} repeatCount="indefinite" />
        )}
      </line>
      <circle cx="70" cy="300" r="7" className="rewind-knob">
        {!reduceMotion && <animate attributeName="cx" from="70" to="570" dur={DURATION} repeatCount="indefinite" />}
      </circle>
      <text x="70" y="326" className="rewind-time">
        10 min ago
      </text>
      <text x="570" y="326" className="rewind-time" textAnchor="end">
        Now
      </text>
    </svg>
  );
}
