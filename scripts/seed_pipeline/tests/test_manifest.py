# scripts/seed_pipeline/tests/test_manifest.py
# focused coverage for manifest validation & deterministic local builds

from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from seed_pipeline.build import build_compiled_manifest
from seed_pipeline.manifest import find_repo_root
from seed_pipeline.validate import validate_source_manifest


class ManifestValidationTests(unittest.TestCase):
    def test_validate_rejects_duplicate_items_before_build(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _write_repo_fixture(root)
            manifest_path = root / "data" / "seeds" / "marketplace-core.json"
            manifest = _source_manifest()
            manifest["templates"][0]["items"].append(
                {
                    "externalId": "mario",
                    "image": "02-luigi.png",
                    "label": "Luigi",
                }
            )
            _write_json(manifest_path, manifest)
            result = validate_source_manifest(manifest_path, root)
        self.assertFalse(result.ok)
        self.assertIn("duplicateItemExternalId", {error.code for error in result.errors})

    def test_validate_rejects_bad_local_manifest_semantics(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _write_repo_fixture(root)
            manifest_path = root / "data" / "seeds" / "marketplace-core.json"
            manifest = _source_manifest()
            template = manifest["templates"][0]
            template["criteria"][0]["isPrimary"] = False
            template["items"][0]["image"] = "missing.png"
            template["items"][0]["label"] = " "
            _write_json(manifest_path, manifest)
            result = validate_source_manifest(manifest_path, root)
        codes = {error.code for error in result.errors}
        self.assertFalse(result.ok)
        self.assertIn("invalidPrimaryCriterionCount", codes)
        self.assertIn("missingImageFile", codes)
        self.assertIn("missingExplicitLabel", codes)

    def test_validate_reports_missing_manifest_as_diagnostic(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _write_repo_fixture(root)
            missing_path = root / "data" / "seeds" / "missing.json"
            result = validate_source_manifest(missing_path, root)
        self.assertFalse(result.ok)
        self.assertEqual(result.errors[0].code, "missingManifest")

    def test_validate_rejects_symlinked_images_outside_repo(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "repo"
            outside = Path(directory) / "outside"
            _write_repo_fixture(root)
            outside.mkdir()
            Image.new("RGBA", (32, 32), (255, 255, 0, 255)).save(
                outside / "escape.png"
            )
            link = root / "examples" / "gaming" / "ssbu-fighters" / "escape.png"
            link.symlink_to(outside / "escape.png")
            manifest_path = root / "data" / "seeds" / "marketplace-core.json"
            manifest = _source_manifest()
            manifest["templates"][0]["items"][0]["image"] = "escape.png"
            _write_json(manifest_path, manifest)
            result = validate_source_manifest(manifest_path, root)
        self.assertFalse(result.ok)
        self.assertIn("pathEscapesRepo", {error.code for error in result.errors})

    def test_build_writes_deterministic_compiled_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _write_repo_fixture(root)
            manifest_path = root / "data" / "seeds" / "marketplace-core.json"
            _write_json(manifest_path, _source_manifest())
            first_path = build_compiled_manifest(manifest_path, root)
            first = json.loads(first_path.read_text(encoding="utf-8"))
            second_path = build_compiled_manifest(manifest_path, root)
            second = json.loads(second_path.read_text(encoding="utf-8"))
            report_exists = (first_path.parent / "reports" / "preflight.md").is_file()
        self.assertEqual(first, second)
        self.assertEqual(first["totals"]["templateCount"], 1)
        self.assertEqual(first["totals"]["itemCount"], 1)
        self.assertEqual(first["templates"][0]["items"][0]["label"], "Mario")
        self.assertIn("preview:", first["templates"][0]["items"][0]["asset"]["dedupeHash"])
        self.assertTrue(report_exists)

    def test_build_honors_non_explicit_label_policies(self) -> None:
        cases = {
            "explicit-or-filename-fallback": "Mario",
            "filename-derived": "Mario",
            "hidden": None,
        }
        for policy, expected_label in cases.items():
            with self.subTest(policy=policy):
                with tempfile.TemporaryDirectory() as directory:
                    root = Path(directory)
                    _write_repo_fixture(root)
                    manifest_path = root / "data" / "seeds" / "marketplace-core.json"
                    manifest = _source_manifest()
                    template = manifest["templates"][0]
                    template["labelPolicy"] = policy
                    del template["items"][0]["label"]
                    _write_json(manifest_path, manifest)
                    compiled_path = build_compiled_manifest(manifest_path, root)
                    compiled = json.loads(compiled_path.read_text(encoding="utf-8"))
                item = compiled["templates"][0]["items"][0]
                self.assertEqual(item["label"], expected_label)

    def test_variant_paths_include_cache_fingerprint(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _write_repo_fixture(root)
            manifest_path = root / "data" / "seeds" / "marketplace-core.json"
            _write_json(manifest_path, _source_manifest())
            compiled_path = build_compiled_manifest(manifest_path, root)
            compiled = json.loads(compiled_path.read_text(encoding="utf-8"))
        variants = compiled["templates"][0]["items"][0]["asset"]["variants"]
        fingerprint = hashlib.sha256(
            variants["tile"]["cacheKey"].encode("utf-8")
        ).hexdigest()[:16]
        self.assertIn(fingerprint, variants["tile"]["path"])
        self.assertNotEqual(variants["tile"]["path"], variants["preview"]["path"])

    def test_find_repo_root_finds_current_workspace(self) -> None:
        root = find_repo_root(Path.cwd())
        self.assertTrue((root / "package.json").is_file())


def _write_repo_fixture(root: Path) -> None:
    schemas = find_repo_root(Path.cwd()) / "data" / "seeds" / "schemas"
    target_schemas = root / "data" / "seeds" / "schemas"
    target_schemas.mkdir(parents=True)
    for schema in schemas.iterdir():
        (target_schemas / schema.name).write_text(schema.read_text(encoding="utf-8"))
    (root / "package.json").write_text("{}", encoding="utf-8")
    image_dir = root / "examples" / "gaming" / "ssbu-fighters"
    image_dir.mkdir(parents=True)
    Image.new("RGBA", (32, 32), (255, 0, 0, 255)).save(image_dir / "01-mario.png")
    Image.new("RGBA", (32, 32), (0, 255, 0, 255)).save(image_dir / "02-luigi.png")
    cover_dir = root / "data" / "seeds" / "assets" / "covers"
    cover_dir.mkdir(parents=True)
    Image.new("RGB", (64, 32), (0, 0, 255)).save(cover_dir / "ssbu-fighters.jpg")


def _source_manifest() -> dict[str, object]:
    return {
        "schemaVersion": 1,
        "datasetKey": "marketplace-core",
        "releaseId": "2026-05-templates-v1",
        "authorEmail": "tterrag456@gmail.com",
        "templates": [
            {
                "externalId": "gaming:ssbu-fighters",
                "folder": "examples/gaming/ssbu-fighters",
                "title": "Super Smash Bros. Ultimate roster sample",
                "category": "gaming",
                "description": "Sample fixture.",
                "tags": ["nintendo"],
                "visibility": "public",
                "labelPolicy": "explicit-required",
                "coverImage": "data/seeds/assets/covers/ssbu-fighters.jpg",
                "criteria": [
                    {
                        "externalId": "competitive",
                        "name": "Competitive",
                        "shortName": "Comp",
                        "prompt": "Rank fighters by competitive viability.",
                        "axisTop": "Strongest",
                        "axisBottom": "Weakest",
                        "order": 0,
                        "isPrimary": True,
                        "status": "active",
                    }
                ],
                "items": [
                    {
                        "externalId": "mario",
                        "image": "01-mario.png",
                        "label": "Mario",
                    }
                ],
            }
        ],
    }


def _write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
