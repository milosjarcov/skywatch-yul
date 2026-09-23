"""SkyWatch YUL API.

One job: fetch live aircraft state vectors from the OpenSky Network for the
Montreal area and serve them to the frontend as clean JSON.

Design notes (why it's built this way):
- OpenSky anonymous access has a budget of ~400 calls/day, so we must NOT
  call it once per browser request. Instead we use a lazy cache: a request
  triggers a real OpenSky call only if the last one was more than
  CACHE_TTL_SECONDS ago. 50 simultaneous users still cost 1 call.
- FastAPI runs plain `def` routes on a thread pool, so several requests can
  check the cache at the same instant. A lock makes them take turns, which is
  what actually guarantees the "1 call" above: the first request refreshes
  the cache and the others get that fresh copy.
- OpenSky returns each aircraft as a bare list (not a dict), with nullable
  fields. parse_state() converts that into a named, predictable shape so the
  frontend never has to know about magic indexes.
- If OpenSky errors or times out while we hold stale data, we serve the stale
  data instead of failing. A 30-second-old plane position beats an error page.
"""

import logging
import threading
import time

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

OPENSKY_URL = "https://opensky-network.org/api/states/all"
CACHE_TTL_SECONDS = 15

# Bounding box around greater Montreal. 1 OpenSky credit per call at this size.
MONTREAL_BBOX = {
    "lamin": 45.2,
    "lamax": 45.8,
    "lomin": -74.3,
    "lomax": -73.2,
}

log = logging.getLogger("uvicorn.error")

app = FastAPI(title="SkyWatch YUL API")

# The Vite dev server proxies /api to us, but allow direct calls too.
# The frontend reads the Date header to line its clock up with ours, and
# browsers hide that header from cross-origin pages unless it's exposed.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
    expose_headers=["Date"],
)

# Module-level cache. Fine for a single-process app; a multi-worker deployment
# would move this to Redis, but that's deliberate over-engineering here.
# attempted_at is when we last *tried* OpenSky, successful or not, so a
# failing OpenSky also gets at most one call per window.
_cache = {"attempted_at": 0.0, "payload": None}
_cache_lock = threading.Lock()

# Running totals for /api/health, so you can watch the cache do its job.
_stats = {"requests": 0, "opensky_calls": 0, "opensky_calls_left": None}


def parse_state(state: list) -> dict:
    """Convert one OpenSky state vector (a positional list) into a dict.

    Index meanings come from the OpenSky REST docs:
    https://openskynetwork.github.io/opensky-api/rest.html#response
    """
    baro_alt, geo_alt = state[7], state[13]
    return {
        "icao24": state[0],
        "callsign": (state[1] or "").strip() or None,
        "country": state[2],
        # Unix time of the plane's last position report. It can be a few
        # seconds older than the snapshot; the frontend uses it to keep
        # moving planes between updates.
        "position_time": state[3],
        "lon": state[5],
        "lat": state[6],
        # Prefer barometric altitude, fall back to geometric; either can be null.
        "alt_m": baro_alt if baro_alt is not None else geo_alt,
        "on_ground": state[8],
        "velocity_ms": state[9],
        "heading": state[10],  # degrees clockwise from north
        "vertical_rate_ms": state[11],
    }


def fetch_from_opensky() -> dict:
    _stats["opensky_calls"] += 1
    resp = requests.get(OPENSKY_URL, params=MONTREAL_BBOX, timeout=15)
    # Every OpenSky response says how much of today's budget is left.
    remaining = resp.headers.get("X-Rate-Limit-Remaining", "")
    if remaining.isdigit():
        _stats["opensky_calls_left"] = int(remaining)
    resp.raise_for_status()
    raw = resp.json()
    # OpenSky sends null (not []) when no aircraft match, hence the `or []`.
    states = raw.get("states") or []
    flights = [parse_state(s) for s in states]
    # A plane without coordinates can't be drawn on a map; drop it.
    flights = [f for f in flights if f["lat"] is not None and f["lon"] is not None]
    return {
        "fetched_at": raw.get("time") or int(time.time()),
        "count": len(flights),
        "flights": flights,
    }


@app.get("/api/flights")
def get_flights():
    with _cache_lock:
        _stats["requests"] += 1
        now = time.time()

        if now - _cache["attempted_at"] < CACHE_TTL_SECONDS:
            if _cache["payload"] is None:
                # The last attempt failed moments ago. Don't retry yet.
                raise HTTPException(status_code=502, detail="OpenSky is unreachable")
            return _cache["payload"]

        _cache["attempted_at"] = now
        try:
            _cache["payload"] = fetch_from_opensky()
        except requests.RequestException as exc:
            # Keep whatever we had. attempted_at is already bumped, so
            # OpenSky gets a break until the next window either way.
            log.warning("OpenSky fetch failed: %s", exc)

        if _cache["payload"] is None:
            # No stale copy to fall back on; surface a real error.
            raise HTTPException(status_code=502, detail="OpenSky is unreachable")
        return _cache["payload"]


@app.get("/api/health")
def health():
    payload = _cache["payload"]
    return {
        "status": "ok",
        # How old the snapshot we're serving is, by OpenSky's clock.
        "snapshot_age_s": round(time.time() - payload["fetched_at"], 1) if payload else None,
        "requests_served": _stats["requests"],
        "opensky_calls": _stats["opensky_calls"],
        # None until the first OpenSky call. OpenSky resets it daily.
        "opensky_calls_left": _stats["opensky_calls_left"],
    }
