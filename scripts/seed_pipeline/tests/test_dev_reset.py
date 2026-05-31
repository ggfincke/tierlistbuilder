# scripts/seed_pipeline/tests/test_dev_reset.py
# dev reset URL resolution regression coverage

from __future__ import annotations

from io import StringIO
import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from seed_pipeline import dev_reset
from seed_pipeline.convex_client import resolve_convex_site_url


class DevResetUrlTests(unittest.TestCase):
	def test_resolve_convex_site_url_normalizes_client_url_sources(self) -> None:
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
				with TemporaryDirectory() as directory:
					repo_root = Path(directory)
					if env_file:
						(repo_root / ".env.local").write_text(
							"\n".join(f"{key}={value}" for key, value in env_file.items()),
							encoding="utf-8",
						)
					with patch.dict(os.environ, env, clear=True):
						self.assertEqual(
							resolve_convex_site_url(repo_root, cli_override),
							expected,
						)

	def test_resolve_convex_site_url_returns_none_without_any_source(self) -> None:
		with TemporaryDirectory() as directory:
			with patch.dict(os.environ, {}, clear=True):
				self.assertIsNone(resolve_convex_site_url(Path(directory)))

	def test_main_constructs_reset_client_without_author_password(self) -> None:
		calls: list[tuple[object, str, dict[str, object]]] = []

		class FakeClient:
			def __init__(self, settings: object) -> None:
				self.settings = settings

			def action(self, function_path: str, args: dict[str, object]) -> dict[str, object]:
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
