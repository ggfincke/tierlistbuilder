# scripts/seed_pipeline/tests/test_dev_reset.py
# dev reset URL resolution regression coverage

from __future__ import annotations

from io import StringIO
import os
import sys
import unittest
from unittest.mock import patch

from seed_pipeline import dev_reset


class DevResetUrlTests(unittest.TestCase):
    def test_resolve_site_url_normalizes_client_url_sources(self) -> None:
        cases = [
            (
                "cli local client url",
                "http://127.0.0.1:3210",
                {},
                {},
                "http://127.0.0.1:3211",
            ),
            (
                "cli cloud client url",
                "https://example.convex.cloud",
                {},
                {},
                "https://example.convex.site",
            ),
            (
                "shell local client fallback",
                None,
                {"VITE_CONVEX_URL": "http://127.0.0.1:3210"},
                {},
                "http://127.0.0.1:3211",
            ),
            (
                "dotenv cloud client fallback",
                None,
                {},
                {"CONVEX_URL": "https://example.convex.cloud"},
                "https://example.convex.site",
            ),
            (
                "site url wins over client url",
                None,
                {
                    "CONVEX_SITE_URL": "https://site.convex.site",
                    "CONVEX_URL": "https://client.convex.cloud",
                },
                {},
                "https://site.convex.site",
            ),
        ]
        for name, cli_override, env, env_file, expected in cases:
            with self.subTest(name=name):
                with patch.dict(os.environ, env, clear=True):
                    self.assertEqual(
                        dev_reset.resolve_site_url(cli_override, env_file), expected
                    )

    def test_resolve_site_url_returns_none_without_any_source(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            self.assertIsNone(dev_reset.resolve_site_url(None, {}))

    def test_main_constructs_reset_client_without_author_password(self) -> None:
        calls: list[tuple[object, str, dict[str, object]]] = []

        class FakeClient:
            def __init__(self, settings: object) -> None:
                self.settings = settings

            def action(
                self, function_path: str, args: dict[str, object]
            ) -> dict[str, object]:
                calls.append((self.settings, function_path, args))
                return {
                    "deploymentMarker": "127.0.0.1:3211",
                    "deletedStorageBlobs": 0,
                    "deletedCounts": {},
                }

        env = {
            "CONVEX_DEPLOYMENT": "dev:local-test",
            "CONVEX_SITE_URL": "http://127.0.0.1:3211",
            "CONVEX_SEED_SECRET": "super-secret",
        }
        with (
            patch.dict(os.environ, env, clear=True),
            patch.object(sys, "argv", ["dev_reset.py", "--yes"]),
            patch("seed_pipeline.dev_reset.load_dotenv", return_value={}),
            patch("seed_pipeline.dev_reset.ConvexSeedClient", FakeClient),
            patch("sys.stdout", new_callable=StringIO),
        ):
            self.assertEqual(dev_reset.main(), 0)

        settings, function_path, args = calls[0]
        self.assertEqual(function_path, dev_reset.RESET_FUNCTION)
        self.assertEqual(args["confirm"], "RESET-127.0.0.1:3211")
        self.assertIsNone(getattr(settings, "author_password"))


if __name__ == "__main__":
    unittest.main()
