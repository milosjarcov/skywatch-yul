// Moving planes between updates.
//
// The API hands out a fresh snapshot every 15 seconds. Drawn as-is, every
// plane would sit still for 15 seconds and then jump. Instead we do what
// radar screens do between sweeps: assume each plane keeps flying at the
// speed and along the track it last reported, and move it along that line.
// This is called dead reckoning. When the next snapshot arrives, each plane
// glides from where we guessed it was to where it really is, instead of
// snapping there.

const EARTH_RADIUS_M = 6371000;

// Guessing further ahead than this gets unreliable (planes turn), and data
// this old means something is wrong upstream, so planes stop and wait.
const MAX_GUESS_SECONDS = 45;

// How long a plane takes to glide onto its corrected course.
const BLEND_MS = 1200;

const toRadians = (degrees) => (degrees * Math.PI) / 180;
const toDegrees = (radians) => (radians * 180) / Math.PI;

// Where a plane should be `seconds` after its last report, if it holds its
// ground speed and track. Treating the Earth as flat is accurate to within
// meters over the few kilometers a plane covers in that time.
export function projectPosition(flight, seconds) {
  const { lat, lon, velocity_ms: speed, heading } = flight;
  if (flight.on_ground || !speed || heading == null) return { lat, lon };

  const meters = speed * Math.min(Math.max(seconds, 0), MAX_GUESS_SECONDS);
  const track = toRadians(heading);
  const north = meters * Math.cos(track);
  const east = meters * Math.sin(track);
  // A degree of longitude shrinks toward the poles, by cos(latitude).
  return {
    lat: lat + toDegrees(north / EARTH_RADIUS_M),
    lon: lon + toDegrees(east / (EARTH_RADIUS_M * Math.cos(toRadians(lat)))),
  };
}

const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

// Blend two headings the short way around: 350 to 10 goes through 0,
// not backwards through 180.
function lerpHeading(from, to, t) {
  const delta = ((to - from + 540) % 360) - 180;
  return (from + delta * t + 360) % 360;
}

// Keeps track of every plane on screen and answers "where should it be drawn
// right now?" Times are in milliseconds on the server's clock, so a laptop
// with a wrong clock still moves planes the right distance.
export class Motion {
  tracks = new Map(); // icao24 -> { flight, reportedAt, from }

  update(flights, snapshotTime, now) {
    const next = new Map();
    for (const flight of flights) {
      const old = this.tracks.get(flight.icao24);
      // Same object as before (the list was only re-filtered): keep going.
      if (old?.flight === flight) {
        next.set(flight.icao24, old);
        continue;
      }
      next.set(flight.icao24, {
        flight,
        reportedAt: (flight.position_time ?? snapshotTime) * 1000,
        // Start the glide from wherever the plane is drawn right now.
        from: old ? { ...this.sample(old, now), at: now } : null,
      });
    }
    this.tracks = next;
  }

  positionAt(id, now) {
    const track = this.tracks.get(id);
    return track ? this.sample(track, now) : null;
  }

  sample({ flight, reportedAt, from }, now) {
    const guess = projectPosition(flight, (now - reportedAt) / 1000);
    const heading = flight.heading ?? 0;
    const alt_m = flight.on_ground ? 0 : flight.alt_m;
    const t = from ? (now - from.at) / BLEND_MS : 1;
    if (t >= 1) return { ...guess, heading, alt_m };
    const e = easeInOut(Math.max(t, 0));
    return {
      lat: lerp(from.lat, guess.lat, e),
      lon: lerp(from.lon, guess.lon, e),
      heading: lerpHeading(from.heading, heading, e),
      alt_m,
    };
  }
}
