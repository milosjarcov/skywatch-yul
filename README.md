# SkyWatch YUL

Live map of aircraft over Montreal (YUL), built on real-time ADS-B transponder
data from the [OpenSky Network](https://opensky-network.org/).

Planes appear as heading-rotated icons colored by altitude band (orange = low,
yellow = mid, blue = cruise, gray = on the ground). Click a plane for its
callsign, altitude, speed, and climb rate. Filter by callsign, minimum
altitude, or ground traffic. The map refreshes every 15 seconds.

## Stack

- **Backend:** FastAPI (Python) — a single `/api/flights` endpoint that
  proxies OpenSky
- **Frontend:** React + Vite + Leaflet
- **Data:** OpenSky Network REST API (anonymous access)

## The interesting problem: a 400-call budget

Anonymous OpenSky access allows roughly 400 API calls per day, and the data
only updates every 10 seconds anyway. Naively calling OpenSky once per browser
request would burn the budget in minutes with a handful of users.

The backend solves this with a **lazy cache**: each incoming request checks
the age of the cached snapshot and only calls OpenSky if it is older than 15
seconds. Any number of simultaneous users costs at most one upstream call per
15-second window, and zero calls when nobody is looking. If OpenSky is
unreachable, the backend serves the stale snapshot instead of an error, since
a slightly old plane position beats a broken map.

## Running locally

Backend (from the repo root):

```
pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --port 8000
```

Frontend (in a second terminal):

```
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The Vite dev server proxies `/api` to the backend.

## Possible next steps

- Register OpenSky OAuth2 credentials (raises the budget to 4,000 calls/day)
- Aircraft trails showing recent positions
- Let users pan to any region instead of fixed Montreal bounds
