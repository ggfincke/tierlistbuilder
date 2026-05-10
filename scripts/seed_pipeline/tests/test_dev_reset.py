# scripts/seed_pipeline/tests/test_dev_reset.py
# dev reset URL resolution regression coverage

from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from scripts import dev_reset


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


if __name__ == "__main__":
    unittest.main()
