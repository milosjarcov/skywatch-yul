import { PLANE_PATH } from "../lib/planeGlyph";

// The app icon: a plane inside cyan range rings on a near-black square, like
// a target on a radar scope. Same drawing as public/favicon.svg.
export default function AppIcon({ size = 64, className }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14.5" fill="#10151c" />
      <g fill="none" stroke="#4cc9f0" strokeWidth="1.6">
        <circle cx="32" cy="32" r="12" opacity="0.55" />
        <circle cx="32" cy="32" r="22" opacity="0.3" />
      </g>
      <path d="M32 32 45 19" stroke="#e9edf2" strokeWidth="1.6" strokeLinecap="round" opacity="0.45" />
      <path d={PLANE_PATH} fill="#e9edf2" transform="translate(32 32) rotate(45) scale(1.2) translate(-12 -12)" />
    </svg>
  );
}
