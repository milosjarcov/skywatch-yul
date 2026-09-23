import { PLANE_PATH } from "../lib/planeGlyph";

// The plane symbol as a React element, turned to face `heading` (degrees
// clockwise from north). Colored with currentColor.
export default function PlaneGlyph({ heading = 0, size = "1em", className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      style={{ transform: `rotate(${heading}deg)` }}
      aria-hidden="true"
      focusable="false"
    >
      <path d={PLANE_PATH} fill="currentColor" />
    </svg>
  );
}
