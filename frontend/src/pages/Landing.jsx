import { lazy, Suspense, useCallback, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppIcon from "../components/AppIcon";
import { ArrowUpRightIcon } from "../components/Icons";
import RewindArt from "../components/landing/RewindArt";
import Readout from "../components/Readout";
import SideView from "../components/SideView";
import { useFlights } from "../hooks/useFlights";
import { useReveal } from "../hooks/useInView";
import { airline, altitudeFeet, COVERAGE, distanceAndBearing, formatNumber, YUL } from "../lib/flights";
import { GITHUB_URL, PORTFOLIO_URL } from "../lib/links";
import "../landing.css";

// The live maps are most of the page's JavaScript, so they load on their
// own after the text is up.
const FlightMap = lazy(() => import("../components/FlightMap"));

// The close-up on the "Live, down to the second" section: between YUL and
// downtown, where the traffic is busiest.
const CLOSE_UP = { lat: 45.49, lon: -73.68, zoom: 11.25 };

const HIGHLIGHTS = [
  ["15 s", "between fresh positions, with smooth motion in between."],
  ["10 min", "of rewind, recorded right in your browser."],
  ["5,700 km²", "of sky around Montreal, covered live."],
  ["0", "accounts, apps, or downloads. It just opens."],
];

const RELIABILITY = [
  [
    "One feed for everyone.",
    "However many people are watching, SkyWatch asks for new data once, and everyone gets the same live picture.",
  ],
  ["Keeps going when the data doesn't.", "If the source goes quiet, you still see the last known positions, never an error page."],
  ["Rests when you do.", "Switch tabs and it stops refreshing, then catches up the instant you're back."],
];

// The profile has no map above it here, so it spreads the coverage area's
// west and east edges across its own width.
function linearProjectX(lat, lon, box) {
  return box.left + ((lon - COVERAGE.west) / (COVERAGE.east - COVERAGE.west)) * box.width;
}

// The plane shown up close: an airline flight in the air, as near YUL as
// possible, so it stays in range while you read.
function pickFeatured(flights) {
  let best = null;
  let bestScore = -Infinity;
  for (const flight of flights) {
    if (flight.on_ground || !flight.callsign || (flight.alt_m ?? 0) < 300) continue;
    const score = (airline(flight) ? 50 : 0) - distanceAndBearing(YUL, flight).km;
    if (score > bestScore) {
      best = flight;
      bestScore = score;
    }
  }
  return best ?? flights.find((f) => !f.on_ground) ?? null;
}

// The front page, written like a product page: what SkyWatch lets you do,
// shown with the real thing running live. How it's built lives in the
// README, one click away.
export default function Landing() {
  const rootRef = useRef(null);
  const heroTextRef = useRef(null);
  const feed = useFlights();
  const navigate = useNavigate();
  const [minFeet, setMinFeet] = useState(0);
  const [hoveredId, setHoveredId] = useState(null);

  useReveal(rootRef);

  const tracker = useMemo(() => ({ positionAt: (id, now) => feed.motion.positionAt(id, now) }), [feed.motion]);
  const airborne = useMemo(() => feed.flights.filter((f) => !f.on_ground), [feed.flights]);
  const highest = useMemo(
    () => airborne.reduce((best, f) => ((altitudeFeet(f) ?? 0) > (altitudeFeet(best) ?? -1) ? f : best), airborne[0]),
    [airborne],
  );

  // Keep following the same plane from one update to the next, and only
  // pick a new one if it leaves.
  const [featuredId, setFeaturedId] = useState(null);
  const current = feed.flights.find((f) => f.icao24 === featuredId);
  const nextFeatured = current ? null : pickFeatured(feed.flights);
  if (!current && nextFeatured && nextFeatured.icao24 !== featuredId) setFeaturedId(nextFeatured.icao24);
  const featured = current ?? nextFeatured;

  // Keep the planes clear of the headline: the map treats the text column
  // (or, on a phone, the text above it) as covered.
  const heroInsets = useCallback(() => {
    const text = heroTextRef.current?.getBoundingClientRect();
    if (!text) return { top: 0, right: 0, bottom: 0, left: 0 };
    return window.innerWidth > 860 ? { top: 0, right: 0, bottom: 0, left: text.right } : { top: 0, right: 0, bottom: 0, left: 0 };
  }, []);

  const openOnMap = useCallback((id) => id && navigate(`/map?flight=${id}`), [navigate]);
  const count = (n) => (feed.loading ? "…" : formatNumber(n));

  return (
    <div className="landing" ref={rootRef}>
      <header className="site-nav">
        <div className="site-nav-inner">
          <Link to="/" className="brand">
            <AppIcon size={24} />
            <span>SkyWatch YUL</span>
          </Link>
          <nav aria-label="Page">
            <a href="#features">Features</a>
            <a href="#rewind">Rewind</a>
            <a href="#highlights">Highlights</a>
            <a href={GITHUB_URL}>GitHub</a>
          </nav>
          <Link to="/map" className="button button-primary nav-cta">
            Open SkyWatch
          </Link>
        </div>
      </header>

      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-map" aria-hidden="true">
            <Suspense fallback={null}>
              <FlightMap display flights={airborne} tracker={tracker} clockOffset={feed.clockOffset} getInsets={heroInsets} />
            </Suspense>
          </div>
          <div className="hero-inner">
            <div className="hero-text" ref={heroTextRef}>
              <p className="hero-kicker">SkyWatch YUL</p>
              <h1 id="hero-title">
                The sky over Montreal.
                <br />
                Live.
              </h1>
              <p className="hero-lead">
                Every aircraft around the city on one radar, with where it's headed, how high it's flying, and how
                fast. Right in your browser. No account, no download.
              </p>
              <dl className="readings">
                <div>
                  <dt>In the air now</dt>
                  <dd>{count(airborne.length)}</dd>
                </div>
                <div>
                  <dt>On the ground</dt>
                  <dd>{count(feed.flights.length - airborne.length)}</dd>
                </div>
                <div>
                  <dt>Highest right now</dt>
                  <dd>
                    {highest ? formatNumber(altitudeFeet(highest) ?? 0) : "…"}
                    {highest && <small> ft</small>}
                  </dd>
                </div>
              </dl>
              <div className="hero-actions">
                <Link to="/map" className="button button-primary">
                  Open SkyWatch
                </Link>
                <a href="#features" className="button button-ghost">
                  See what it can do
                </a>
              </div>
              {feed.error && !feed.flights.length && (
                <p className="hero-note">The live feed is taking a break. SkyWatch keeps trying on its own.</p>
              )}
            </div>
          </div>
        </section>

        <section className="feature" id="features" aria-labelledby="live-title">
          <header className="feature-head">
            <h2 id="live-title" data-reveal>
              Live, down to the second.
            </h2>
            <p data-reveal>
              Planes glide across the map as they fly, never in jumps. Each one carries its flight number, altitude,
              and speed right beside it, just like on an air traffic controller's screen. A line out front shows where
              it will be a minute from now.
            </p>
          </header>
          <div className="showcase" data-reveal>
            <Suspense fallback={null}>
              <FlightMap display view={CLOSE_UP} flights={feed.flights} tracker={tracker} clockOffset={feed.clockOffset} />
            </Suspense>
          </div>
        </section>

        <section className="feature" aria-labelledby="side-title">
          <header className="feature-head">
            <h2 id="side-title" data-reveal>
              A whole new angle on the sky.
            </h2>
            <p data-reveal>
              Maps show where a plane is. SkyWatch also shows how high. Every flight, stacked by altitude and lined up
              under the map, climbing and descending as it goes. Drag the line to clear out low traffic in one move.
            </p>
          </header>
          <div className="showcase showcase-profile" data-reveal>
            <SideView
              flights={airborne}
              tracker={tracker}
              clockOffset={feed.clockOffset}
              projectX={linearProjectX}
              hoveredId={hoveredId}
              onHover={setHoveredId}
              onSelect={openOnMap}
              minFeet={minFeet}
              onMinFeetChange={setMinFeet}
              caption="Live. Try dragging the line."
            />
          </div>
        </section>

        <section className="feature feature-split" aria-labelledby="detail-title">
          <header className="feature-head">
            <h2 id="detail-title" data-reveal>
              Every flight, up close.
            </h2>
            <p data-reveal>
              Tap any plane for the full picture: the airline, its altitude, speed, and heading, whether it's climbing
              or coming in to land, and a trace of its altitude that builds while you watch.
            </p>
            {featured && (
              <Link to={`/map?flight=${featured.icao24}`} className="text-link">
                Follow this flight live
                <ArrowUpRightIcon />
              </Link>
            )}
          </header>
          <div className="device" data-reveal inert>
            {featured ? (
              <Readout flight={featured} clockOffset={feed.clockOffset} history={feed.history.get(featured.icao24)} />
            ) : (
              <p className="device-empty">A live flight appears here as soon as the feed answers.</p>
            )}
          </div>
        </section>

        <section className="feature feature-split is-reversed" id="rewind" aria-labelledby="rewind-title">
          <header className="feature-head">
            <h2 id="rewind-title" data-reveal>
              Rewind the sky.
            </h2>
            <p data-reveal>
              Missed a landing? Scrub back through the last ten minutes and watch every plane retrace its path, or
              play it all back at ten times speed. The moment you're done, you're live again.
            </p>
          </header>
          <div className="device device-art" data-reveal>
            <RewindArt />
          </div>
        </section>

        <section className="highlights" id="highlights" aria-labelledby="highlights-title">
          <h2 id="highlights-title" data-reveal>
            Pro-grade. Zero setup.
          </h2>
          <dl className="stats">
            {HIGHLIGHTS.map(([value, label]) => (
              <div key={value} data-reveal>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="reliability" aria-labelledby="reliability-title">
          <h2 id="reliability-title" data-reveal>
            Built to stay up.
          </h2>
          <div className="reliability-grid">
            {RELIABILITY.map(([title, text]) => (
              <div key={title} data-reveal>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
          <a className="text-link" href={GITHUB_URL} data-reveal>
            See how it's built
            <ArrowUpRightIcon />
          </a>
        </section>

        <section className="closing" aria-labelledby="closing-title">
          <h2 id="closing-title" data-reveal>
            The sky is busier than you think.
          </h2>
          <p data-reveal>
            {airborne.length
              ? `${formatNumber(airborne.length)} aircraft are up there right now.`
              : "See every flight over Montreal, as it happens."}
          </p>
          <div data-reveal>
            <Link to="/map" className="button button-primary button-large">
              Open SkyWatch
            </Link>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <p>Designed and built by Milos Jarcov in Montreal.</p>
          <nav aria-label="Elsewhere">
            <a href={PORTFOLIO_URL}>Portfolio</a>
            <a href={GITHUB_URL}>Source code</a>
          </nav>
          <p className="credits">
            Aircraft positions from the <a href="https://opensky-network.org">OpenSky Network</a>. Map data from{" "}
            <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, tiles by{" "}
            <a href="https://openfreemap.org">OpenFreeMap</a> and <a href="https://www.openmaptiles.org/">OpenMapTiles</a>.
            For watching, not for navigation.
          </p>
        </div>
      </footer>
    </div>
  );
}
