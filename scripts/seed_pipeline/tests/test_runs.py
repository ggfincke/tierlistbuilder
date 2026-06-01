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
	build_style_item_upserts,
	build_template_upserts,
	run_seed_manifest,
)
from seed_pipeline.template_payloads import (
	style_items_content_hash,
	template_style_items_content_hash,
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

	def test_style_payloads_omit_absent_optional_defaults(self) -> None:
		compiled = _compiled_with_alt_style(self.compiled)

		style = build_template_upserts(compiled)[0]["styles"][1]

		self.assertNotIn("labels", style)
		self.assertNotIn("autoPlate", style)

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
			for route, args in client.mutations
			if route == "/api/seed/activate"
		][0]
		sync_args = [
			args
			for client in clients
			for route, args in client.mutations
			if route == "/api/seed/sync-template-items"
		][0]
		criteria_args = [
			args
			for client in clients
			for route, args in client.mutations
			if route == "/api/seed/upsert-criteria"
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

	def test_run_does_not_skip_active_release_when_style_item_hash_drifted(self) -> None:
		compiled = _compiled_with_alt_style(self.compiled)
		state = _state_matching_compiled(compiled)
		state["templates"][0]["styleItemsContentHash"] = "v1:stale-style-items"
		with tempfile.TemporaryDirectory() as directory:
			root = Path(directory)
			compiled_path = root / ".seed-cache" / "compiled-manifest.json"
			compiled_path.parent.mkdir(parents=True)
			clients: list[FakeSeedClient] = []

			def make_client(_settings: object) -> "FakeSeedClient":
				client = FakeSeedClient(state)
				clients.append(client)
				return client

			with (
				patch(
					"seed_pipeline.run_context.build_compiled_manifest_with_data",
					return_value=(compiled_path, compiled),
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

		style_sync_args = [
			args
			for client in clients
			for route, args in client.mutations
			if route == "/api/seed/sync-template-style-items"
		]
		self.assertEqual(len(style_sync_args), 1)
		self.assertRegex(
			style_sync_args[0]["styleItemsContentHash"],
			r"^v1:[0-9a-f]{32}$",
		)
		self.assertNotIn("templateExternalId", style_sync_args[0]["items"][0])
		self.assertNotIn("styleExternalId", style_sync_args[0]["items"][0])

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

	def query(self, _route: str, _args: dict[str, object]) -> dict[str, object]:
		return self.state

	def mutation(self, route: str, args: dict[str, object]) -> dict[str, object]:
		self.mutations.append((route, args))
		if route == "/api/seed/begin":
			return {"run": {"runId": args["runId"], "status": "building"}}
		if route == "/api/seed/verify-chunk":
			template_external_ids = args["templateExternalIds"]
			return {
				"diagnostics": [],
				"totals": {
					"templateCount": len(template_external_ids),
					"itemCount": 0,
					"criterionCount": 0,
				},
			}
		if route == "/api/seed/complete-verification":
			return {"verified": True, "diagnostics": []}
		if route == "/api/seed/activate":
			return {
				"activeReleaseId": args["releaseId"],
				"previousReleaseId": args["previousReleaseId"],
			}
		return {"created": [], "updated": [], "unchanged": []}

	def action(self, route: str, args: dict[str, object]) -> dict[str, object]:
		self.actions.append((route, args))
		return {"created": False}


class FakeSeedSettings:
	author_password = "test-author-password"


def _compiled_with_alt_style(compiled: dict[str, object]) -> dict[str, object]:
	styled = json.loads(json.dumps(compiled))
	template = styled["templates"][0]
	item = template["items"][0]
	template["styles"] = [
		{
			"id": "default",
			"label": "Default",
			"order": 0,
			"isDefault": True,
			"folder": template["folder"],
			"itemAspectRatio": template["itemAspectRatio"],
			"coverImage": template["coverImage"],
		},
		{
			"id": "alt",
			"label": "Alt",
			"order": 1,
			"isDefault": False,
			"folder": template["folder"],
			"itemAspectRatio": item["aspectRatio"],
			"itemAssets": {
				item["externalId"]: {
					"externalId": item["externalId"],
					"aspectRatio": item["aspectRatio"],
					"transform": item["transform"],
					"mediaPlate": item["mediaPlate"],
					"imagePadding": item["imagePadding"],
					"asset": item["asset"],
				}
			},
		},
	]
	return styled


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
	style_item_hashes = _style_item_hashes_for_test(compiled)
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
				"imagePadding": item.get("imagePadding"),
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
				"styleItemsContentHash": style_item_hashes.get(external_id),
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
				"imagePadding": item.get("imagePadding"),
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


def _style_item_hashes_for_test(compiled: dict[str, object]) -> dict[str, str]:
	rows_by_template_style: dict[tuple[str, str], list[dict[str, object]]] = {}
	for row in build_style_item_upserts(compiled):
		template_external_id = str(row["templateExternalId"])
		style_external_id = str(row["styleExternalId"])
		rows_by_template_style.setdefault(
			(template_external_id, style_external_id),
			[],
		).append(
			{
				key: value
				for key, value in row.items()
				if key not in ("templateExternalId", "styleExternalId")
			}
		)
	style_hashes_by_template: dict[str, list[dict[str, object]]] = {}
	for (template_external_id, style_external_id), items in rows_by_template_style.items():
		style_hashes_by_template.setdefault(template_external_id, []).append(
			{
				"styleExternalId": style_external_id,
				"styleItemsContentHash": style_items_content_hash(
					template_external_id,
					style_external_id,
					items,
				),
			}
		)
	return {
		template_external_id: template_style_items_content_hash(
			template_external_id,
			style_hashes,
		)
		for template_external_id, style_hashes in style_hashes_by_template.items()
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
