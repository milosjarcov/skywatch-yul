"""Tests for the caching rules in main.py.

Run from the repo root:

    python -m unittest backend.test_main -v

OpenSky is never called. Each test swaps fetch_from_opensky for a fake, so
the tests are fast, work offline, and don't spend the daily budget.
"""

import threading
import time
import unittest
from unittest import mock

import requests
from fastapi import HTTPException

from backend import main

# Several tests make OpenSky "fail" on purpose; skip the warnings that logs.
main.log.setLevel("ERROR")

SNAPSHOT = {"fetched_at": 1_790_000_000, "count": 0, "flights": []}

# One real state vector from OpenSky, as the positional list it arrives in.
STATE = [
    "c06db5", "PVL7713 ", "Canada", 1790177210, 1790177210, -73.2381, 45.6595,
    3733.8, False, 173.07, 236.03, -8.13, None, 3939.54, None, False, 0,
]


class ParseStateTests(unittest.TestCase):
    def test_names_the_fields(self):
        flight = main.parse_state(STATE)
        self.assertEqual(flight["icao24"], "c06db5")
        self.assertEqual(flight["callsign"], "PVL7713")  # trailing spaces trimmed
        self.assertEqual(flight["position_time"], 1790177210)
        self.assertEqual((flight["lat"], flight["lon"]), (45.6595, -73.2381))
        self.assertEqual(flight["alt_m"], 3733.8)

    def test_falls_back_to_geometric_altitude(self):
        state = STATE.copy()
        state[7] = None  # no barometric altitude
        self.assertEqual(main.parse_state(state)["alt_m"], 3939.54)

    def test_blank_callsign_becomes_none(self):
        state = STATE.copy()
        state[1] = "        "
        self.assertIsNone(main.parse_state(state)["callsign"])


class CacheTests(unittest.TestCase):
    def setUp(self):
        # Every test starts with an empty cache.
        main._cache.update(attempted_at=0.0, payload=None)

    def test_requests_inside_the_window_share_one_call(self):
        with mock.patch.object(main, "fetch_from_opensky", return_value=SNAPSHOT) as fetch:
            for _ in range(5):
                self.assertEqual(main.get_flights(), SNAPSHOT)
        self.assertEqual(fetch.call_count, 1)

    def test_simultaneous_requests_make_one_call(self):
        calls = []

        def slow_fetch():
            calls.append(1)
            time.sleep(0.2)  # a slow OpenSky, so the requests really do overlap
            return SNAPSHOT

        with mock.patch.object(main, "fetch_from_opensky", side_effect=slow_fetch):
            threads = [threading.Thread(target=main.get_flights) for _ in range(20)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join()
        # Without the lock, all 20 would see an expired cache and call OpenSky.
        self.assertEqual(len(calls), 1)

    def test_serves_the_last_snapshot_when_opensky_fails(self):
        with mock.patch.object(main, "fetch_from_opensky", return_value=SNAPSHOT):
            main.get_flights()
        main._cache["attempted_at"] -= main.CACHE_TTL_SECONDS  # the window has passed
        with mock.patch.object(main, "fetch_from_opensky", side_effect=requests.Timeout):
            self.assertEqual(main.get_flights(), SNAPSHOT)

    def test_502_when_there_is_nothing_to_fall_back_on(self):
        with mock.patch.object(main, "fetch_from_opensky", side_effect=requests.ConnectionError):
            with self.assertRaises(HTTPException) as caught:
                main.get_flights()
        self.assertEqual(caught.exception.status_code, 502)

    def test_a_failure_is_not_retried_inside_the_window(self):
        with mock.patch.object(main, "fetch_from_opensky", side_effect=requests.ConnectionError) as fetch:
            for _ in range(3):
                with self.assertRaises(HTTPException):
                    main.get_flights()
        self.assertEqual(fetch.call_count, 1)


if __name__ == "__main__":
    unittest.main()
