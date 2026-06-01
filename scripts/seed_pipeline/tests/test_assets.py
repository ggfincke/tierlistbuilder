# scripts/seed_pipeline/tests/test_assets.py
# focused coverage for local variant cache behavior & limits

from __future__ import annotations

import json
import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from PIL import Image

from seed_pipeline import assets as assets_module
from seed_pipeline.assets import (
	_inspect_cache_path,
	build_variant,
	inspect_source,
)
from seed_pipeline.settings import (
	INSPECT_CACHE_SCHEMA_VERSION,
	PREVIEW_MAX_BYTES,
	PREVIEW_MAX_SIZE,
	TILE_MAX_BYTES,
	TILE_MAX_SIZE,
)


class AssetBuildTests(unittest.TestCase):
	def test_build_variant_reuses_cached_output(self) -> None:
		with tempfile.TemporaryDirectory() as directory:
			root = Path(directory)
			source_path = _write_source_image(root)
			source = inspect_source(source_path, root)
			variants_dir = root / ".seed-cache" / "variants"
			first = build_variant(source.path, source.sha256, "tile", variants_dir)
			output_path = Path(first["path"])
			first_mtime = output_path.stat().st_mtime_ns
			time.sleep(0.01)
			second = build_variant(source.path, source.sha256, "tile", variants_dir)
			second_mtime = Path(second["path"]).stat().st_mtime_ns
		self.assertEqual(first["path"], second["path"])
		self.assertEqual(first_mtime, second_mtime)

	def test_build_variant_regenerates_corrupt_cache_file(self) -> None:
		with tempfile.TemporaryDirectory() as directory:
			root = Path(directory)
			source_path = _write_source_image(root)
			source = inspect_source(source_path, root)
			variants_dir = root / ".seed-cache" / "variants"
			first = build_variant(source.path, source.sha256, "tile", variants_dir)
			output_path = Path(first["path"])
			output_path.write_bytes(b"")

			second = build_variant(source.path, source.sha256, "tile", variants_dir)
			regenerated_size = Path(second["path"]).stat().st_size

		self.assertEqual(first["path"], second["path"])
		self.assertGreater(regenerated_size, 0)

	def test_generated_variants_stay_inside_configured_limits(self) -> None:
		with tempfile.TemporaryDirectory() as directory:
			root = Path(directory)
			source_path = _write_source_image(root, size=(1600, 900))
			source = inspect_source(source_path, root)
			variants_dir = root / ".seed-cache" / "variants"
			tile = build_variant(source.path, source.sha256, "tile", variants_dir)
			preview = build_variant(source.path, source.sha256, "preview", variants_dir)
		self.assertLessEqual(tile["byteSize"], TILE_MAX_BYTES)
		self.assertLessEqual(tile["width"], TILE_MAX_SIZE)
		self.assertLessEqual(tile["height"], TILE_MAX_SIZE)
		self.assertLessEqual(preview["byteSize"], PREVIEW_MAX_BYTES)
		self.assertLessEqual(preview["width"], PREVIEW_MAX_SIZE)
		self.assertLessEqual(preview["height"], PREVIEW_MAX_SIZE)


class InspectCacheTests(unittest.TestCase):
	def test_cache_invalidates_when_source_mtime_changes(self) -> None:
		with tempfile.TemporaryDirectory() as directory:
			root = Path(directory)
			source_path = _write_source_image(root)
			inspect_source(source_path, root)
			# bump mtime by an obvious delta so ns comparison differs
			stat = source_path.stat()
			os.utime(source_path, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1_000_000))
			with mock.patch.object(
				assets_module,
				"analyze_image",
				wraps=assets_module.analyze_image,
			) as inspect_spy:
				inspect_source(source_path, root)
		self.assertEqual(inspect_spy.call_count, 1)

	def test_schema_version_mismatch_invalidates_cache(self) -> None:
		with tempfile.TemporaryDirectory() as directory:
			root = Path(directory)
			source_path = _write_source_image(root)
			first = inspect_source(source_path, root)
			cache_path = _inspect_cache_path(root.resolve(), first.repo_relative_path)
			payload = json.loads(cache_path.read_text())
			payload["schemaVersion"] = INSPECT_CACHE_SCHEMA_VERSION + 99
			cache_path.write_text(json.dumps(payload))
			with mock.patch.object(
				assets_module,
				"analyze_image",
				wraps=assets_module.analyze_image,
			) as inspect_spy:
				inspect_source(source_path, root)
		self.assertEqual(inspect_spy.call_count, 1)


def _write_source_image(root: Path, size: tuple[int, int] = (64, 64)) -> Path:
	path = root / "examples" / "gaming" / "fixture.png"
	path.parent.mkdir(parents=True)
	Image.new("RGBA", size, (255, 0, 0, 255)).save(path)
	return path


if __name__ == "__main__":
	unittest.main()
