#!/usr/bin/env python3
"""Regression tests for social-data-collector.py error handling."""

from __future__ import annotations

import contextlib
import importlib.util
import io
import sys
import tempfile
import types
import unittest
from pathlib import Path
from typing import Any


COLLECTOR_PATH = Path(__file__).resolve().parents[1] / "scripts" / "social-data-collector.py"


def load_collector_module() -> types.ModuleType:
    spec = importlib.util.spec_from_file_location("social_data_collector", COLLECTOR_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


COLLECTOR = load_collector_module()


class FakeResponse:
    def __init__(self, status_code: int, payload: dict[str, Any], text: str = ""):
        self.status_code = status_code
        self._payload = payload
        self.text = text

    def json(self) -> dict[str, Any]:
        return self._payload


class FakeRedditRequests:
    auth = types.SimpleNamespace(HTTPBasicAuth=lambda client_id, client_secret: (client_id, client_secret))

    def __init__(self, oauth_response: FakeResponse, search_response: FakeResponse):
        self.oauth_response = oauth_response
        self.search_response = search_response

    def post(self, *args: Any, **kwargs: Any) -> FakeResponse:
        return self.oauth_response

    def get(self, *args: Any, **kwargs: Any) -> FakeResponse:
        return self.search_response


class SocialDataCollectorTests(unittest.TestCase):
    def run_main(self, argv: list[str]) -> int:
        original_argv = sys.argv
        sys.argv = ["social-data-collector.py", *argv]
        try:
            return COLLECTOR.main()
        finally:
            sys.argv = original_argv

    def test_fetch_twitter_missing_token_raises_collector_error(self):
        with self.assertRaisesRegex(COLLECTOR.CollectorError, "TWITTER_BEARER_TOKEN not set"):
            COLLECTOR.fetch_twitter("brand", 7, "", requests_module=object())

    def test_fetch_twitter_api_error_raises_collector_error(self):
        fake_requests = types.SimpleNamespace(
            get=lambda *args, **kwargs: FakeResponse(429, {}, "rate limited")
        )

        with self.assertRaisesRegex(COLLECTOR.CollectorError, "Twitter API error 429"):
            COLLECTOR.fetch_twitter("brand", 7, "token", requests_module=fake_requests)

    def test_fetch_twitter_request_exception_is_wrapped(self):
        def fail_get(*args: Any, **kwargs: Any) -> FakeResponse:
            raise TimeoutError("timeout")

        fake_requests = types.SimpleNamespace(get=fail_get)

        with self.assertRaisesRegex(COLLECTOR.CollectorError, "Twitter API request failed"):
            COLLECTOR.fetch_twitter("brand", 7, "token", requests_module=fake_requests)

    def test_fetch_twitter_unexpected_request_error_propagates(self):
        def fail_get(*args: Any, **kwargs: Any) -> FakeResponse:
            raise TypeError("programming bug")

        fake_requests = types.SimpleNamespace(get=fail_get)

        with self.assertRaisesRegex(TypeError, "programming bug"):
            COLLECTOR.fetch_twitter("brand", 7, "token", requests_module=fake_requests)

    def test_fetch_reddit_missing_access_token_raises_collector_error(self):
        fake_requests = FakeRedditRequests(
            oauth_response=FakeResponse(200, {}),
            search_response=FakeResponse(200, {"data": {"children": []}}),
        )

        with self.assertRaisesRegex(COLLECTOR.CollectorError, "missing access_token"):
            COLLECTOR.fetch_reddit("ecommerce", "brand", "client", "secret", requests_module=fake_requests)

    def test_fetch_reddit_search_error_raises_collector_error(self):
        fake_requests = FakeRedditRequests(
            oauth_response=FakeResponse(200, {"access_token": "token"}),
            search_response=FakeResponse(500, {}, "server error"),
        )

        with self.assertRaisesRegex(COLLECTOR.CollectorError, "Reddit search error 500"):
            COLLECTOR.fetch_reddit("ecommerce", "brand", "client", "secret", requests_module=fake_requests)

    def test_fetch_reddit_unexpected_oauth_error_propagates(self):
        def fail_post(*args: Any, **kwargs: Any) -> FakeResponse:
            raise TypeError("programming bug")

        fake_requests = types.SimpleNamespace(
            auth=FakeRedditRequests.auth,
            post=fail_post,
        )

        with self.assertRaisesRegex(TypeError, "programming bug"):
            COLLECTOR.fetch_reddit("ecommerce", "brand", "client", "secret", requests_module=fake_requests)

    def test_fetch_reddit_unexpected_search_error_propagates(self):
        def fail_get(*args: Any, **kwargs: Any) -> FakeResponse:
            raise TypeError("programming bug")

        fake_requests = types.SimpleNamespace(
            auth=FakeRedditRequests.auth,
            post=lambda *args, **kwargs: FakeResponse(200, {"access_token": "token"}),
            get=fail_get,
        )

        with self.assertRaisesRegex(TypeError, "programming bug"):
            COLLECTOR.fetch_reddit("ecommerce", "brand", "client", "secret", requests_module=fake_requests)

    def test_fetch_reddit_success_maps_posts_to_standard_rows(self):
        fake_requests = FakeRedditRequests(
            oauth_response=FakeResponse(200, {"access_token": "token"}),
            search_response=FakeResponse(
                200,
                {
                    "data": {
                        "children": [
                            {
                                "data": {
                                    "created_utc": 1717200000,
                                    "author": "user1",
                                    "ups": 5,
                                    "num_comments": 3,
                                    "title": "Great brand experience",
                                }
                            }
                        ]
                    }
                },
            ),
        )

        rows = COLLECTOR.fetch_reddit(" ecommerce ", "brand", "client", "secret", requests_module=fake_requests)

        self.assertEqual(1, len(rows))
        self.assertEqual("reddit", rows[0]["platform"])
        self.assertEqual("r/ecommerce", rows[0]["mention"])
        self.assertEqual(8, rows[0]["engagement"])
        self.assertEqual("Great brand experience", rows[0]["content"])

    def test_youtube_platform_returns_error_instead_of_empty_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "social.csv"
            stdout = io.StringIO()

            with contextlib.redirect_stdout(stdout):
                exit_code = self.run_main([
                    "--platform",
                    "youtube",
                    "--query",
                    "brand",
                    "--output",
                    str(output),
                ])

            self.assertEqual(1, exit_code)
            self.assertIn("YouTube API collection is not implemented", stdout.getvalue())
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
