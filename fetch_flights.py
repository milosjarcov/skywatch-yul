"""Milestone 1: fetch live aircraft over Montreal from the OpenSky Network API."""

import requests

# Bounding box around greater Montreal (lat/lon corners)
MONTREAL_BBOX = {
    "lamin": 45.2,
    "lamax": 45.8,
    "lomin": -74.3,
    "lomax": -73.2,
}

URL = "https://opensky-network.org/api/states/all"

# Indexes into each state vector (the API returns a list of lists,
# see https://openskynetwork.github.io/opensky-api/rest.html#response)
CALLSIGN = 1
ORIGIN_COUNTRY = 2
BARO_ALTITUDE = 7
VELOCITY = 9


def main():
    response = requests.get(URL, params=MONTREAL_BBOX, timeout=15)
    response.raise_for_status()
    data = response.json()

    states = data.get("states") or []
    print(f"{len(states)} aircraft over Montreal right now\n")
    print(f"{'CALLSIGN':<10} {'COUNTRY':<20} {'ALT (m)':>8} {'SPEED (m/s)':>12}")

    for state in states:
        callsign = (state[CALLSIGN] or "").strip() or "unknown"
        country = state[ORIGIN_COUNTRY] or "unknown"
        altitude = state[BARO_ALTITUDE]
        velocity = state[VELOCITY]

        alt_str = f"{altitude:.0f}" if altitude is not None else "n/a"
        vel_str = f"{velocity:.1f}" if velocity is not None else "n/a"
        print(f"{callsign:<10} {country:<20} {alt_str:>8} {vel_str:>12}")


if __name__ == "__main__":
    main()
