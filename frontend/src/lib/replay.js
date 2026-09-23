// Replaying the recent past.
//
// useFlights keeps every plane's reports from the last ten minutes, as
// [lat, lon, altitude in meters, report time in seconds, heading] points.
// To show the sky as it was at some earlier moment, find the two reports on
// either side of that moment and blend between them.

const lerp = (a, b, t) => a + (b - a) * t;

function lerpHeading(from, to, t) {
  const delta = ((to - from + 540) % 360) - 180;
  return (from + delta * t + 360) % 360;
}

// Where the plane was at `time` (Unix seconds), or null if we have no
// reports around then (it hadn't arrived yet, or had already left).
export function positionFromHistory(points, time) {
  if (!points?.length || time < points[0][3]) return null;
  const next = points.findIndex((point) => point[3] > time);
  if (next === -1) {
    // After the last report. Hold it for one refresh, then let it go.
    const [lat, lon, alt_m, reportedAt, heading] = points.at(-1);
    return time - reportedAt <= 20 ? { lat, lon, alt_m, heading } : null;
  }
  const [lat1, lon1, alt1, t1, heading1] = points[next - 1];
  const [lat2, lon2, alt2, t2, heading2] = points[next];
  const f = (time - t1) / (t2 - t1);
  return {
    lat: lerp(lat1, lat2, f),
    lon: lerp(lon1, lon2, f),
    alt_m: lerp(alt1, alt2, f),
    heading: lerpHeading(heading1, heading2, f),
  };
}
