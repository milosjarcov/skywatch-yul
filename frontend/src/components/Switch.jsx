// An iOS-style toggle. Underneath it's a real checkbox with role="switch",
// so keyboards and screen readers treat it as an on/off control.
export default function Switch({ checked, onChange, id, label }) {
  return (
    <input
      id={id}
      type="checkbox"
      role="switch"
      className="switch"
      checked={checked}
      aria-label={label}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}
