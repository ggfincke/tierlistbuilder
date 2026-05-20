# scripts/seed_pipeline/tests/test_manifest.py
# focused coverage for manifest validation & deterministic local builds

from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from PIL import Image

from seed_pipeline import assets as assets_module
from seed_pipeline.build import build_compiled_manifest
from seed_pipeline.manifest import (
	find_repo_root,
	iter_compiled_asset_entries,
	iter_compiled_assets,
	read_json,
)
from seed_pipeline.settings import COMPILE_FINGERPRINT_FILENAME
from seed_pipeline.validate import validate_source_manifest


class ManifestValidationTests(unittest.TestCase):
	def test_validate_rejects_duplicate_items_before_build(self) -> None:
		with tempfile.TemporaryDirectory() as directory:
			root = Path(directory)
			_write_repo_fixture(root)
			manifest = _source_manifest()
			manifest["templates"][0]["items"].append(
				{
					"externalId": "mario",
					"image": "02-luigi.png",
					"label": "Luigi",
				}
			)
			manifest_path = _write_split_dataset(root, manifest)
			result = validate_source_manifest(manifest_path, root)
		self.assertFalse(result.ok)
		self.assertIn("duplicateItemExternalId", {error.code for error in result.errors})

	def test_validate_rejects_bad_local_manifest_semantics(self) -> None:
		with tempfile.TemporaryDirectory() as directory:
			root = Path(directory)
			_write_repo_fixture(root)
			manifest = _source_manifest()
			template = manifest["templates"][0]
			template["criteria"][0]["isPrimary"] = False
			template["items"][0]["image"] = "missing.png"
			template["items"][0]["label"] = " "
			manifest_path = _write_split_dataset(root, manifest)
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
		self.assertEqual(result.errors[0].code, "missingMarketplaceCore")

	def test_validate_rejects_symlinked_images_outside_repo(self) -> None:
		with tempfile.TemporaryDirectory() as directory:
			root = Path(directory) / "repo"
			outside = Path(directory) / "outside"
			_write_repo_fixture(root)
			outside.mkdir()
			Image.new("RGBA", (32, 32), (255, 255, 0, 255)).save(outside / "escape.png")
			link = root / "examples" / "gaming" / "ssbu-fighters" / "escape.png"
			link.symlink_to(outside / "escape.png")
			manifest = _source_manifest()
			manifest["templates"][0]["items"][0]["image"] = "escape.png"
			manifest_path = _write_split_dataset(root, manifest)
			result = validate_source_manifest(manifest_path, root)
		self.assertFalse(result.ok)
		self.assertIn("pathEscapesRepo", {error.code for error in result.errors})

	def test_build_writes_deterministic_compiled_manifest(self) -> None:
		with tempfile.TemporaryDirectory() as directory:
			root = Path(directory)
			_write_repo_fixture(root)
			manifest_path = _write_split_dataset(root, _source_manifest())
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

	def test_build_preserves_item_order_with_parallel_workers(self) -> None:
		with tempfile.TemporaryDirectory() as directory:
			root = Path(directory)
			_write_repo_fixture(root)
			manifest = _source_manifest()
			manifest["templates"][0]["items"].append(
				{
					"externalId": "luigi",
					"image": "02-luigi.png",
					"label": "Luigi",
				}
			)
			manifest_path = _write_split_dataset(root, manifest)
			with mock.patch("seed_pipeline.build.BUILD_WORKERS", 2):
				compiled_path = build_compiled_manifest(manifest_path, root)
			compiled = json.loads(compiled_path.read_text(encoding="utf-8"))

		self.assertEqual(
			[item["externalId"] for item in compiled["templates"][0]["items"]],
			["mario", "luigi"],
		)

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
					manifest = _source_manifest()
					template = manifest["templates"][0]
					template["labelPolicy"] = policy
					del template["items"][0]["label"]
					manifest_path = _write_split_dataset(root, manifest)
					compiled_path = build_compiled_manifest(manifest_path, root)
					compiled = json.loads(compiled_path.read_text(encoding="utf-8"))
				item = compiled["templates"][0]["items"][0]
				self.assertEqual(item["label"], expected_label)

	def test_variant_paths_include_cache_fingerprint(self) -> None:
		with tempfile.TemporaryDirectory() as directory:
			root = Path(directory)
			_write_repo_fixture(root)
			manifest_path = _write_split_dataset(root, _source_manifest())
			compiled_path = build_compiled_manifest(manifest_path, root)
			compiled = json.loads(compiled_path.read_text(encoding="utf-8"))
		variants = compiled["templates"][0]["items"][0]["asset"]["variants"]
		fingerprint = hashlib.sha256(variants["tile"]["cacheKey"].encode("utf-8")).hexdigest()[:16]
		self.assertIn(fingerprint, variants["tile"]["path"])
		self.assertNotEqual(variants["tile"]["path"], variants["preview"]["path"])

	def test_compile_cache_invalidates_when_variant_policy_changes(self) -> None:
		with tempfile.TemporaryDirectory() as directory:
			root = Path(directory)
			_write_repo_fixture(root)
			manifest_path = _write_split_dataset(root, _source_manifest())

			first_path = build_compiled_manifest(manifest_path, root)
			first = json.loads(first_path.read_text(encoding="utf-8"))
			first_preview = first["templates"][0]["items"][0]["asset"]["variants"]["preview"]

			with mock.patch.object(assets_module, "PREVIEW_MAX_SIZE", 1):
				second_path = build_compiled_manifest(manifest_path, root)
				second = json.loads(second_path.read_text(encoding="utf-8"))
				fingerprint = json.loads(
					(second_path.parent / COMPILE_FINGERPRINT_FILENAME).read_text(encoding="utf-8")
				)

		second_preview = second["templates"][0]["items"][0]["asset"]["variants"]["preview"]
		self.assertEqual(second_preview["width"], 1)
		self.assertEqual(second_preview["height"], 1)
		self.assertNotEqual(first_preview["path"], second_preview["path"])
		self.assertEqual(fingerprint["variantPolicy"]["preview"]["maxSize"], 1)

	def test_find_repo_root_finds_current_workspace(self) -> None:
		root = find_repo_root(Path.cwd())
		self.assertTrue((root / "package.json").is_file())

	def test_iter_compiled_assets_includes_cover_and_item_assets(self) -> None:
		compiled = read_json(_FIXTURES_DIR / "compiled-manifest.example.json")

		entries = list(iter_compiled_asset_entries(compiled))

		self.assertEqual(
			[entry["assetKey"] for entry in entries],
			[
				"gaming:ssbu-fighters:cover",
				"gaming:ssbu-fighters:mario",
				"gaming:zelda-games:the-legend-of-zelda",
			],
		)
		self.assertEqual(
			[entry["asset"] for entry in entries],
			list(iter_compiled_assets(compiled)),
		)


_FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"


def _write_repo_fixture(root: Path) -> None:
	# schemas live inside the pipeline package now, so the temp repo only needs
	# package.json (find_repo_root sentinel) + scripts/seed_pipeline (the second
	# sentinel) + the asset folder for source images
	root.mkdir(parents=True, exist_ok=True)
	(root / "package.json").write_text("{}", encoding="utf-8")
	(root / "scripts" / "seed_pipeline").mkdir(parents=True)
	image_dir = root / "examples" / "gaming" / "ssbu-fighters"
	image_dir.mkdir(parents=True)
	Image.new("RGBA", (32, 32), (255, 0, 0, 255)).save(image_dir / "01-mario.png")
	Image.new("RGBA", (32, 32), (0, 255, 0, 255)).save(image_dir / "02-luigi.png")
	# cover lives inside the template folder under the new split layout
	Image.new("RGB", (64, 32), (0, 0, 255)).save(image_dir / "_cover.jpg")


# tests build manifests in the legacy in-memory shape (templates[] inline + coverImage
# string path) for ergonomic mutation; this helper splits that shape into the on-disk
# layout the composition layer expects (thin marketplace-core + per-folder _template.json
# + auto-detected _cover.*)
_TEMPLATE_BODY_FIELDS = (
	"title",
	"category",
	"description",
	"tags",
	"visibility",
	"labelPolicy",
	"labels",
	"coverZoom",
	"suggestedTiers",
	"criteria",
	"items",
)


def _write_split_dataset(root: Path, legacy: dict[str, object]) -> Path:
	templates: list[dict[str, object]] = list(legacy["templates"])  # type: ignore[arg-type]
	template_order = [str(tpl["externalId"]) for tpl in templates]
	core = {
		"schemaVersion": 2,
		"datasetKey": legacy["datasetKey"],
		"releaseId": legacy["releaseId"],
		"authorEmail": legacy["authorEmail"],
		"templateOrder": template_order,
	}
	core_path = root / "data" / "seeds" / "marketplace-core.json"
	_write_json(core_path, core)
	for tpl in templates:
		folder_rel = str(tpl["folder"])
		# ensure assets dir exists; the template file itself lives at
		# data/seeds/templates/<cat>/<slug>.json so it stays tracked while
		# examples/ remains fully gitignored
		(root / folder_rel).mkdir(parents=True, exist_ok=True)
		external_id = str(tpl["externalId"])
		category, _, slug = external_id.partition(":")
		body: dict[str, object] = {
			"schemaVersion": 2,
			"externalId": external_id,
			"folder": folder_rel,
		}
		for key in _TEMPLATE_BODY_FIELDS:
			if key in tpl:
				body[key] = tpl[key]
		_write_json(root / "data" / "seeds" / "templates" / category / f"{slug}.json", body)
	if "rankingSeeds" in legacy:
		rankings: dict[str, object] = {"schemaVersion": 2}
		for key, value in legacy["rankingSeeds"].items():  # type: ignore[attr-defined]
			rankings[key] = value
		_write_json(root / "data" / "seeds" / "ranking-profiles.json", rankings)
	return core_path


def _source_manifest() -> dict[str, object]:
	return {
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
