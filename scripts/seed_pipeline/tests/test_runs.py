# scripts/seed_pipeline/tests/test_runs.py
# Python run-workflow payload fixtures

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from seed_pipeline.manifest import find_repo_root, iter_compiled_assets, read_json
from seed_pipeline.run_context import (
	SeedRunOptions,
	checkpoint_matches,
	is_production_env,
	new_run_id,
)
from seed_pipeline.runs import (
	CLEANUP_STORAGE_BATCH_SIZE,
	CRITERION_BATCH_SIZE,
	FINALIZE_ASSET_BATCH_SIZE,
	ITEM_BATCH_SIZE,
	TEMPLATE_BATCH_SIZE,
	UPLOAD_URL_BATCH_SIZE,
	assets_requiring_upload,
	child_upsert_batches,
	packed_child_upsert_batches,
	build_criterion_upserts,
	build_item_upserts,
	build_template_upserts,
	run_seed_manifest,
)


class SeedRunPayloadTests(unittest.TestCase):
	def setUp(self) -> None:
		self.compiled = read_json(
			Path(__file__).resolve().parent / "fixtures" / "compiled-manifest.example.json"
		)

	def test_builds_convex_apply_payloads(self) -> None:
		templates = build_template_upserts(self.compiled)
		items = build_item_upserts(self.compiled)
		criteria = build_criterion_upserts(self.compiled)

		self.assertEqual(
			[template["externalId"] for template in templates],
			["gaming:ssbu-fighters", "gaming:zelda-games"],
		)
		self.assertEqual(
			templates[0]["coverMediaDedupeHash"],
			self.compiled["templates"][0]["coverImage"]["dedupeHash"],
		)
		self.assertRegex(templates[0]["metadataContentHash"], r"^v1:[0-9a-f]{32}$")
		self.assertIsNotNone(templates[0]["coverFraming"])
		self.assertGreater(len(templates[1]["suggestedTiers"]), 0)
		self.assertIsNone(templates[1]["coverFraming"])
		self.assertEqual(len(items), 2)
		self.assertEqual(
			items[0]["mediaDedupeHash"],
			self.compiled["templates"][0]["items"][0]["asset"]["dedupeHash"],
		)
		self.assertEqual(len(criteria), 3)
		self.assertEqual(criteria[0]["criterionExternalId"], "competitive")
		self.assertRegex(criteria[0]["criteriaContentHash"], r"^v1:[0-9a-f]{32}$")

	def test_template_upserts_forward_labels(self) -> None:
		compiled = json.loads(json.dumps(self.compiled))
		compiled["templates"][0]["labels"] = {"show": False}

		templates = build_template_upserts(compiled)

		self.assertEqual(templates[0]["labels"], {"show": False})

	def test_template_metadata_hash_includes_labels(self) -> None:
		labels_hidden = json.loads(json.dumps(self.compiled))
		labels_visible = json.loads(json.dumps(self.compiled))
		labels_hidden["templates"][0]["labels"] = {"show": False}
		labels_visible["templates"][0]["labels"] = {"show": True}

		hidden_template = build_template_upserts(labels_hidden)[0]
		visible_template = build_template_upserts(labels_visible)[0]

		self.assertNotEqual(
			hidden_template["metadataContentHash"],
			visible_template["metadataContentHash"],
		)
		hidden_payload = {
			key: value for key, value in hidden_template.items() if key != "metadataContentHash"
		}
		self.assertEqual(
			hidden_template["metadataContentHash"],
			_hash_for_test("template-metadata", hidden_payload),
		)

	def test_checkpoint_scope_includes_environment(self) -> None:
		checkpoint = {
			"datasetKey": self.compiled["datasetKey"],
			"releaseId": self.compiled["releaseId"],
			"env": "local",
		}

		self.assertTrue(checkpoint_matches(checkpoint, self.compiled, "local"))
		self.assertFalse(checkpoint_matches(checkpoint, self.compiled, "prod"))

	def test_child_upsert_batches_keep_each_template_complete(self) -> None:
		rows = [
			{"templateExternalId": "template-a", "itemExternalId": "a-1"},
			{"templateExternalId": "template-b", "itemExternalId": "b-1"},
			{"templateExternalId": "template-a", "itemExternalId": "a-2"},
		]

		batches = child_upsert_batches(rows, 2, "items")

		self.assertEqual(
			[[item["itemExternalId"] for item in batch] for batch in batches],
			[["a-1", "a-2"], ["b-1"]],
		)

	def test_child_upsert_batches_reject_oversized_template(self) -> None:
		rows = [
			{"templateExternalId": "template-a", "itemExternalId": "a-1"},
			{"templateExternalId": "template-a", "itemExternalId": "a-2"},
			{"templateExternalId": "template-a", "itemExternalId": "a-3"},
		]

		with self.assertRaisesRegex(RuntimeError, "exceeding per-call limit"):
			child_upsert_batches(rows, 2, "items")

	def test_packed_child_upsert_batches_pack_complete_template_groups(self) -> None:
		rows = [
			{"templateExternalId": "template-a", "criterionExternalId": "a-1"},
			{"templateExternalId": "template-b", "criterionExternalId": "b-1"},
			{"templateExternalId": "template-b", "criterionExternalId": "b-2"},
			{"templateExternalId": "template-c", "criterionExternalId": "c-1"},
		]

		batches = packed_child_upsert_batches(rows, 3, "criteria")

		self.assertEqual(
			[[item["criterionExternalId"] for item in batch] for batch in batches],
			[["a-1", "b-1", "b-2"], ["c-1"]],
		)

	def test_upload_selection_requires_full_media_identity(self) -> None:
		asset = self.compiled["templates"][0]["items"][0]["asset"]
		stale_state = {"media": [{"mediaDedupeHash": "tile-only"}]}
		current_state = {"media": [{"mediaDedupeHash": asset["dedupeHash"]}]}

		stale_needed = assets_requiring_upload(self.compiled, stale_state)
		current_needed = assets_requiring_upload(self.compiled, current_state)

		self.assertIn(
			"gaming:ssbu-fighters:mario",
			{entry["assetKey"] for entry in stale_needed},
		)
		self.assertNotIn(
			"gaming:ssbu-fighters:mario",
			{entry["assetKey"] for entry in current_needed},
		)

	def test_upload_selection_deduplicates_missing_media_identity(self) -> None:
		first_template = self.compiled["templates"][0]
		first_item = first_template["items"][0]
		first_template["items"].append(
			{
				**first_item,
				"externalId": f"{first_item['externalId']}-copy",
			}
		)

		needed = assets_requiring_upload(self.compiled, {"media": []})

		duplicate_hash = first_item["asset"]["dedupeHash"]
		matching = [entry for entry in needed if entry["asset"]["dedupeHash"] == duplicate_hash]
		self.assertEqual(len(matching), 1)

	def test_run_persists_activation_guard_before_reloading_context(self) -> None:
		with tempfile.TemporaryDirectory() as directory:
			root = Path(directory)
			compiled_path = root / ".seed-cache" / "compiled-manifest.json"
			compiled_path.parent.mkdir(parents=True)
			state = {
				"activeReleaseId": "old-release",
				"templates": [],
				"items": [],
				"criteria": [],
				"media": [
					{"mediaDedupeHash": dedupe_hash}
					for dedupe_hash in _compiled_asset_dedupe_hashes(self.compiled)
				],
			}
			clients: list[FakeSeedClient] = []

			def make_client(_settings: object) -> "FakeSeedClient":
				client = FakeSeedClient(state)
				clients.append(client)
				return client

			with (
				patch(
					"seed_pipeline.run_context.build_compiled_manifest_with_data",
					return_value=(compiled_path, self.compiled),
				),
				patch(
					"seed_pipeline.run_context.read_seed_settings",
					return_value=object(),
				),
				patch("seed_pipeline.run_context.ConvexSeedClient", make_client),
			):
				run_seed_manifest(
					Path("seed.json"),
					root,
					SeedRunOptions(env_name="local", confirm_activation=True),
				)

			checkpoint = json.loads((compiled_path.parent / "run.json").read_text(encoding="utf-8"))
		activate_args = [
			args
			for client in clients
			for function_path, args in client.mutations
			if function_path == "marketplace/seedRuns:activateSeedRelease"
		][0]
		sync_args = [
			args
			for client in clients
			for function_path, args in client.mutations
			if function_path == "marketplace/seedRuns:syncSeedTemplateItems"
		][0]
		criteria_args = [
			args
			for client in clients
			for function_path, args in client.mutations
			if function_path == "marketplace/seedRuns:upsertSeedCriteria"
		][0]
		self.assertEqual(checkpoint["previousActiveReleaseId"], "old-release")
		self.assertEqual(activate_args["previousReleaseId"], "old-release")
		self.assertEqual(sync_args["templateExternalId"], "gaming:ssbu-fighters")
		self.assertRegex(sync_args["itemsContentHash"], r"^v1:[0-9a-f]{32}$")
		self.assertFalse(sync_args["allowContentHashSkip"])
		self.assertIn("gaming:ssbu-fighters", criteria_args["forceTemplateExternalIds"])
		self.assertNotIn("templateExternalId", sync_args["items"][0])

	def test_run_skips_writes_when_active_release_hashes_match(self) -> None:
		with tempfile.TemporaryDirectory() as directory:
			root = Path(directory)
			compiled_path = root / ".seed-cache" / "compiled-manifest.json"
			compiled_path.parent.mkdir(parents=True)
			clients: list[FakeSeedClient] = []

			def make_client(_settings: object) -> "FakeSeedClient":
				client = FakeSeedClient(_state_matching_compiled(self.compiled))
				clients.append(client)
				return client

			with (
				patch(
					"seed_pipeline.run_context.build_compiled_manifest_with_data",
					return_value=(compiled_path, self.compiled),
				),
				patch(
					"seed_pipeline.run_context.read_seed_settings",
					return_value=object(),
				),
				patch("seed_pipeline.run_context.ConvexSeedClient", make_client),
			):
				run_seed_manifest(
					Path("seed.json"),
					root,
					SeedRunOptions(env_name="local", confirm_activation=True),
				)

		self.assertEqual(clients[0].mutations, [])
		self.assertEqual(clients[0].actions, [])

	def test_run_ids_include_entropy_after_timestamp(self) -> None:
		first = new_run_id(self.compiled)
		second = new_run_id(self.compiled)

		self.assertRegex(first, r"2026-05-templates-v1-\d{8}T\d{6}Z-[0-9a-f]{8}")
		self.assertNotEqual(first, second)

	def test_production_environment_detection_catches_regional_names(self) -> None:
		self.assertTrue(is_production_env("prod"))
		self.assertTrue(is_production_env("production-eu"))
		self.assertTrue(is_production_env("prod:happy-animal-123"))
		self.assertFalse(is_production_env("local"))
		self.assertFalse(is_production_env("preprod"))

	def test_python_batch_limits_match_convex_seed_limits(self) -> None:
		repo_root = find_repo_root()
		limits = _read_seed_limits(repo_root / "convex" / "lib" / "limits.ts")

		self.assertEqual(TEMPLATE_BATCH_SIZE, limits["templateUpsertsPerCall"])
		self.assertEqual(ITEM_BATCH_SIZE, limits["itemUpsertsPerCall"])
		self.assertEqual(CRITERION_BATCH_SIZE, limits["criterionUpsertsPerCall"])
		self.assertEqual(UPLOAD_URL_BATCH_SIZE, limits["uploadUrlsPerCall"])
		self.assertEqual(FINALIZE_ASSET_BATCH_SIZE, limits["mediaAssetsPerFinalize"])
		self.assertEqual(CLEANUP_STORAGE_BATCH_SIZE, limits["storageIdsPerCleanup"])


class FakeSeedClient:
	def __init__(self, state: dict[str, object]) -> None:
		self.state = state
		self.mutations: list[tuple[str, dict[str, object]]] = []
		self.actions: list[tuple[str, dict[str, object]]] = []
		self.settings = FakeSeedSettings()

	def query(self, _function_path: str, _args: dict[str, object]) -> dict[str, object]:
		return self.state

	def mutation(self, function_path: str, args: dict[str, object]) -> dict[str, object]:
		self.mutations.append((function_path, args))
		if function_path == "marketplace/seedRuns:beginSeedRun":
			return {"run": {"runId": args["runId"], "status": "building"}}
		if function_path == "marketplace/seedRuns:verifySeedReleaseChunk":
			template_external_ids = args["templateExternalIds"]
			return {
				"diagnostics": [],
				"totals": {
					"templateCount": len(template_external_ids),
					"itemCount": 0,
					"criterionCount": 0,
				},
			}
		if function_path == "marketplace/seedRuns:completeSeedReleaseVerification":
			return {"verified": True, "diagnostics": []}
		if function_path == "marketplace/seedRuns:activateSeedRelease":
			return {
				"activeReleaseId": args["releaseId"],
				"previousReleaseId": args["previousReleaseId"],
			}
		return {"created": [], "updated": [], "unchanged": []}

	def action(self, function_path: str, args: dict[str, object]) -> dict[str, object]:
		self.actions.append((function_path, args))
		return {"created": False}


class FakeSeedSettings:
	author_password = "test-author-password"


def _compiled_asset_dedupe_hashes(compiled: dict[str, object]) -> set[str]:
	hashes: set[str] = set()
	for asset in iter_compiled_assets(compiled):
		_collect_asset_dedupe_hash(asset, hashes)
	return hashes


def _state_matching_compiled(compiled: dict[str, object]) -> dict[str, object]:
	templates = []
	metadata_hashes = {
		str(template["externalId"]): template["metadataContentHash"]
		for template in build_template_upserts(compiled)
	}
	item_hashes: dict[str, str] = {}
	for template in compiled["templates"]:
		if not isinstance(template, dict):
			continue
		rows = [
			{
				"itemExternalId": item["externalId"],
				"order": item["order"],
				"label": item.get("label"),
				"mediaDedupeHash": item["asset"]["dedupeHash"],
				"aspectRatio": item.get("aspectRatio"),
				"transform": item.get("transform"),
				"mediaPlate": item.get("mediaPlate"),
				"backgroundColor": item.get("backgroundColor"),
			}
			for item in template["items"]
			if isinstance(item, dict)
		]
		item_hashes[str(template["externalId"])] = _hash_for_test(
			"template-items",
			{"templateExternalId": template["externalId"], "items": rows},
		)
	criteria_hashes = {
		str(row["templateExternalId"]): row["criteriaContentHash"]
		for row in build_criterion_upserts(compiled)
	}
	for template in compiled["templates"]:
		if not isinstance(template, dict):
			continue
		external_id = str(template["externalId"])
		templates.append(
			{
				"externalId": external_id,
				"releaseId": compiled["releaseId"],
				"title": template["title"],
				"description": template.get("description"),
				"category": template["category"],
				"tags": template.get("tags", []),
				"visibility": template["visibility"],
				"status": "active",
				"itemAspectRatio": template["itemAspectRatio"],
				"metadataContentHash": metadata_hashes[external_id],
				"itemsContentHash": item_hashes[external_id],
				"criteriaContentHash": criteria_hashes[external_id],
			}
		)
	return {
		"activeReleaseId": compiled["releaseId"],
		"templates": templates,
		"items": [
			{
				"templateExternalId": template["externalId"],
				"itemExternalId": item["externalId"],
				"order": item["order"],
				"label": item.get("label"),
				"mediaDedupeHash": item["asset"]["dedupeHash"],
				"aspectRatio": item.get("aspectRatio"),
				"transform": item.get("transform"),
				"mediaPlate": item.get("mediaPlate"),
				"backgroundColor": item.get("backgroundColor"),
			}
			for template in compiled["templates"]
			if isinstance(template, dict)
			for item in template["items"]
			if isinstance(item, dict)
		],
		"criteria": [
			{
				"templateExternalId": template["externalId"],
				"criterionExternalId": criterion["externalId"],
				"name": criterion["name"],
				"shortName": criterion.get("shortName"),
				"prompt": criterion["prompt"],
				"axisTop": criterion.get("axisTop"),
				"axisBottom": criterion.get("axisBottom"),
				"order": criterion["order"],
				"isPrimary": criterion["isPrimary"],
				"status": criterion["status"],
			}
			for template in compiled["templates"]
			if isinstance(template, dict)
			for criterion in template["criteria"]
			if isinstance(criterion, dict)
		],
		"media": [
			{"mediaDedupeHash": dedupe_hash}
			for dedupe_hash in _compiled_asset_dedupe_hashes(compiled)
		],
	}


def _hash_for_test(kind: str, payload: object) -> str:
	serialized = json.dumps(
		{"kind": kind, "payload": payload},
		sort_keys=True,
		separators=(",", ":"),
		ensure_ascii=False,
	)
	import hashlib

	return "v1:" + hashlib.sha256(serialized.encode("utf-8")).hexdigest()[:32]


def _collect_asset_dedupe_hash(asset: dict[str, object], hashes: set[str]) -> None:
	dedupe_hash = asset.get("dedupeHash")
	if isinstance(dedupe_hash, str):
		hashes.add(dedupe_hash)


def _read_seed_limits(path: Path) -> dict[str, int]:
	source = path.read_text(encoding="utf-8")
	_, body = source.split("export const SEED_LIMITS = {", 1)
	body, _ = body.split("} as const", 1)
	limits: dict[str, int] = {}
	for line in body.splitlines():
		stripped = line.strip().rstrip(",")
		if ":" not in stripped:
			continue
		key, value = stripped.split(":", 1)
		value = value.strip()
		if value.isdigit():
			limits[key.strip()] = int(value)
	return limits


if __name__ == "__main__":
	unittest.main()
