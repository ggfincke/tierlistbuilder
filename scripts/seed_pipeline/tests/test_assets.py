# scripts/seed_pipeline/tests/test_assets.py
# focused coverage for local variant cache behavior & limits

from __future__ import annotations

import tempfile
import time
import unittest
from pathlib import Path

from PIL import Image

from seed_pipeline.assets import build_variant, inspect_source
from seed_pipeline.settings import (
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

    def test_variant_spec_version_changes_output_path(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source_path = _write_source_image(root)
            source = inspect_source(source_path, root)
            variants_dir = root / ".seed-cache" / "variants"
            current = build_variant(source.path, source.sha256, "tile", variants_dir)
            changed = build_variant(
                source.path,
                source.sha256,
                "tile",
                variants_dir,
                variant_spec_version="seed-variants-v2",
            )
        self.assertNotEqual(current["path"], changed["path"])
        self.assertNotEqual(current["cacheKey"], changed["cacheKey"])

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


def _write_source_image(root: Path, size: tuple[int, int] = (64, 64)) -> Path:
    path = root / "examples" / "gaming" / "fixture.png"
    path.parent.mkdir(parents=True)
    Image.new("RGBA", size, (255, 0, 0, 255)).save(path)
    return path


if __name__ == "__main__":
    unittest.main()
