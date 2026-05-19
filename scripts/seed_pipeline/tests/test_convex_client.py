# scripts/seed_pipeline/tests/test_convex_client.py
# Convex seed HTTP client auth and error handling fixtures

from __future__ import annotations

import json
import os
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

from seed_pipeline.convex_client import (
    CONVEX_CLIENT_HEADER,
    ConvexClientError,
    ConvexSeedClient,
    ConvexSeedSettings,
    read_seed_settings,
)


class FakeResponse:
    def __init__(self, payload: dict[str, object]) -> None:
        self.payload = payload

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self) -> bytes:
        return json.dumps(self.payload).encode("utf-8")


class ConvexSeedClientTests(unittest.TestCase):
    def test_settings_author_password_is_optional_for_reset_client(self) -> None:
        settings = ConvexSeedSettings(
            site_url="https://example.convex.site",
            seed_secret="super-secret",
            env_name="test",
        )

        self.assertIsNone(settings.author_password)

    def test_seed_secret_uses_auth_header_not_body(self) -> None:
        requests = []

        def fake_urlopen(request: object, timeout: int) -> FakeResponse:
            requests.append(request)
            return FakeResponse({"status": "success", "value": {"ok": True}})

        client = ConvexSeedClient(
            ConvexSeedSettings(
                site_url="https://example.convex.site",
                seed_secret="super-secret",
                env_name="test",
                author_password="test-author-password",
            )
        )

        with patch("seed_pipeline.convex_client.urlopen", fake_urlopen):
            self.assertEqual(
                client.query(
                    "marketplace/seedRuns:resolveSeedState",
                    {"datasetKey": "marketplace-core"},
                ),
                {"ok": True},
            )

        request = requests[0]
        self.assertEqual(
            request.full_url,
            "https://example.convex.site/api/seed/state",
        )
        self.assertEqual(request.get_header("Authorization"), "Bearer super-secret")
        self.assertEqual(request.get_header("Convex-client"), CONVEX_CLIENT_HEADER)
        body = request.data.decode("utf-8")
        self.assertIn("marketplace-core", body)
        self.assertNotIn("super-secret", body)

    def test_seed_secret_is_scrubbed_from_error_messages(self) -> None:
        def fake_urlopen(_request: object, timeout: int) -> FakeResponse:
            return FakeResponse(
                {
                    "status": "error",
                    "errorCode": "forbidden",
                    "errorMessage": "bad secret super-secret",
                }
            )

        client = ConvexSeedClient(
            ConvexSeedSettings(
                site_url="https://example.convex.site",
                seed_secret="super-secret",
                env_name="test",
                author_password="test-author-password",
            )
        )

        with patch("seed_pipeline.convex_client.urlopen", fake_urlopen):
            with self.assertRaisesRegex(
                ConvexClientError,
                "bad secret \\[redacted-seed-secret\\]",
            ) as raised:
                client.query(
                    "marketplace/seedRuns:resolveSeedState",
                    {"datasetKey": "marketplace-core"},
                )
        self.assertEqual(raised.exception.error_code, "forbidden")

    def test_structured_http_errors_preserve_code_and_status(self) -> None:
        def fake_urlopen(_request: object, timeout: int) -> FakeResponse:
            payload = {
                "status": "error",
                "errorCode": "invalid_state",
                "errorMessage": "active seed release changed",
            }
            raise HTTPError(
                "https://example.convex.site/api/seed/activate",
                409,
                "Conflict",
                hdrs=None,
                fp=BytesIO(json.dumps(payload).encode("utf-8")),
            )

        client = ConvexSeedClient(
            ConvexSeedSettings(
                site_url="https://example.convex.site",
                seed_secret="super-secret",
                env_name="test",
                author_password="test-author-password",
            )
        )

        with patch("seed_pipeline.convex_client.urlopen", fake_urlopen):
            with self.assertRaisesRegex(
                ConvexClientError,
                "active seed release changed",
            ) as raised:
                client.mutation(
                    "marketplace/seedRuns:activateSeedRelease",
                    {"datasetKey": "marketplace-core"},
                )
        self.assertEqual(raised.exception.error_code, "invalid_state")
        self.assertEqual(raised.exception.http_status, 409)

    def test_request_timeout_is_not_retried(self) -> None:
        attempts = 0

        def fake_urlopen(_request: object, timeout: int) -> FakeResponse:
            nonlocal attempts
            attempts += 1
            raise HTTPError(
                "https://example.convex.site/api/seed/begin",
                408,
                "Request Timeout",
                hdrs=None,
                fp=BytesIO(b"timed out"),
            )

        client = ConvexSeedClient(
            ConvexSeedSettings(
                site_url="https://example.convex.site",
                seed_secret="super-secret",
                env_name="test",
                author_password="test-author-password",
            )
        )

        with patch("seed_pipeline.convex_client.urlopen", fake_urlopen):
            with self.assertRaisesRegex(ConvexClientError, "timed out"):
                client.mutation(
                    "marketplace/seedRuns:beginSeedRun",
                    {"datasetKey": "marketplace-core"},
                )
        self.assertEqual(attempts, 1)

    def test_urlopen_timeout_is_not_retried(self) -> None:
        attempts = 0

        def fake_urlopen(_request: object, timeout: int) -> FakeResponse:
            nonlocal attempts
            attempts += 1
            raise TimeoutError("timed out")

        client = ConvexSeedClient(
            ConvexSeedSettings(
                site_url="https://example.convex.site",
                seed_secret="super-secret",
                env_name="test",
                author_password="test-author-password",
            )
        )

        with patch("seed_pipeline.convex_client.urlopen", fake_urlopen):
            with self.assertRaisesRegex(ConvexClientError, "timed out"):
                client.action("dev/reset:wipeDeployment", {"confirm": "RESET-example"})
        self.assertEqual(attempts, 1)

    def test_settings_resolve_site_url_from_convex_client_url(self) -> None:
        cases = {
            "http://127.0.0.1:3210": "http://127.0.0.1:3211",
            "https://example.convex.cloud": "https://example.convex.site",
        }
        for convex_url, site_url in cases.items():
            with self.subTest(convex_url=convex_url):
                with TemporaryDirectory() as directory:
                    repo_root = Path(directory)
                    (repo_root / ".env.local").write_text(
                        "\n".join(
                            [
                                f"VITE_CONVEX_URL={convex_url}",
                                "CONVEX_SEED_SECRET=super-secret",
                                "CONVEX_SEED_AUTHOR_PASSWORD=test-author-password",
                            ]
                        ),
                        encoding="utf-8",
                    )
                    with patch.dict(os.environ, {}, clear=True):
                        settings = read_seed_settings(repo_root, "test")
                self.assertEqual(settings.site_url, site_url)


if __name__ == "__main__":
    unittest.main()
