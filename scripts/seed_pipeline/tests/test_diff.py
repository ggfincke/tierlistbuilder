# scripts/seed_pipeline/tests/test_diff.py
# server-state diff fixtures for Python seed preflight

from __future__ import annotations

import threading
import time
import unittest
from unittest.mock import patch

from seed_pipeline.diff import (
	SEED_MEDIA_BY_HASHES_ROUTE,
	SEED_STATE_ROUTE,
	build_seed_diff,
	build_state_headline_request,
	build_state_items_request,
	resolve_seed_state,
)
from pathlib import Path

from seed_pipeline.manifest import read_json
from seed_pipeline.template_payloads import build_template_upserts


class SeedDiffTests(unittest.TestCase):
	def setUp(self) -> None:
		self.compiled = read_json(
			Path(__file__).resolve().parent / "fixtures" / "compiled-manifest.example.json"
		)

	def test_headline_request_extracts_templates_and_criteria(self) -> None:
		request = build_state_headline_request(self.compiled)
		self.assertEqual(request["authorEmail"], "tterrag456@gmail.com")
		self.assertEqual(
			request["templateExternalIds"],
			["gaming:ssbu-fighters", "gaming:zelda-games"],
		)
		self.assertEqual(request["itemExternalIds"], [])
		self.assertEqual(len(request["criterionExternalIds"]), 3)
		self.assertEqual(request["variantHashes"], [])

	def test_items_request_scopes_to_selected_templates(self) -> None:
		request = build_state_items_request(self.compiled, ["gaming:ssbu-fighters"])
		self.assertEqual(request["templateExternalIds"], ["gaming:ssbu-fighters"])
		self.assertTrue(
			all(
				entry["templateExternalId"] == "gaming:ssbu-fighters"
				for entry in request["itemExternalIds"]
			)
		)
		self.assertEqual(request["criterionExternalIds"], [])
		self.assertEqual(request["variantHashes"], [])

	def test_resolve_seed_state_chunks_media_hashes(self) -> None:
		class FakeClient:
			def __init__(self) -> None:
				self.calls: list[tuple[str, dict[str, object]]] = []

			def query(self, route: str, args: dict[str, object]) -> dict[str, object]:
				self.calls.append((route, args))
				if route == SEED_STATE_ROUTE:
					return {
						"activeReleaseId": None,
						"templates": [],
						"items": [],
						"criteria": [],
						"media": [{"mediaDedupeHash": "ignored"}],
					}
				if route == SEED_MEDIA_BY_HASHES_ROUTE:
					return {
						"media": [
							{
								"contentHash": content_hash,
								"mediaDedupeHash": content_hash,
							}
							for content_hash in args["variantHashes"]
						]
					}
				raise AssertionError(route)

		client = FakeClient()
		with patch("seed_pipeline.diff.SEED_STATE_VARIANT_HASH_BATCH_SIZE", 2):
			state = resolve_seed_state(client, self.compiled)

		self.assertEqual(client.calls[0][0], SEED_STATE_ROUTE)
		self.assertEqual(client.calls[0][1]["variantHashes"], [])
		media_calls = [
			args
			for route, args in client.calls
			if route == SEED_MEDIA_BY_HASHES_ROUTE
		]
		self.assertEqual([len(args["variantHashes"]) for args in media_calls], [2, 2, 2])
		self.assertEqual(len(state["media"]), 6)

	def test_resolve_seed_state_reads_media_chunks_in_parallel(self) -> None:
		class FakeClient:
			def __init__(self) -> None:
				self.active = 0
				self.max_active = 0
				self.lock = threading.Lock()

			def query(self, route: str, args: dict[str, object]) -> dict[str, object]:
				if route == SEED_STATE_ROUTE:
					return {
						"activeReleaseId": None,
						"templates": [],
						"items": [],
						"criteria": [],
						"media": [],
					}
				if route != SEED_MEDIA_BY_HASHES_ROUTE:
					raise AssertionError(route)
				with self.lock:
					self.active += 1
					self.max_active = max(self.max_active, self.active)
				try:
					time.sleep(0.01)
					return {
						"media": [
							{
								"contentHash": content_hash,
								"mediaDedupeHash": content_hash,
							}
							for content_hash in args["variantHashes"]
						]
					}
				finally:
					with self.lock:
						self.active -= 1

		client = FakeClient()
		with patch("seed_pipeline.diff.SEED_STATE_VARIANT_HASH_BATCH_SIZE", 1):
			state = resolve_seed_state(client, self.compiled)

		self.assertGreater(client.max_active, 1)
		self.assertEqual(len(state["media"]), 6)

	def test_resolve_seed_state_chunks_item_state_per_template(self) -> None:
		class FakeClient:
			def __init__(self) -> None:
				self.calls: list[tuple[str, dict[str, object]]] = []

			def query(self, route: str, args: dict[str, object]) -> dict[str, object]:
				self.calls.append((route, args))
				if route == SEED_MEDIA_BY_HASHES_ROUTE:
					return {"media": []}
				if route != SEED_STATE_ROUTE:
					raise AssertionError(route)
				items = [
					{
						"templateExternalId": entry["templateExternalId"],
						"itemExternalId": entry["itemExternalId"],
					}
					for entry in args["itemExternalIds"]
				]
				return {
					"activeReleaseId": None,
					"templates": [],
					"items": items,
					"criteria": [],
					"media": [],
				}

		client = FakeClient()
		with patch("seed_pipeline.diff.SEED_STATE_ITEM_BATCH_SIZE", 1):
			state = resolve_seed_state(client, self.compiled)

		item_state_calls = [
			args
			for route, args in client.calls
			if route == SEED_STATE_ROUTE and args["itemExternalIds"]
		]
		self.assertGreater(len(item_state_calls), 1)
		all_template_ids = [
			template_id for args in item_state_calls for template_id in args["templateExternalIds"]
		]
		self.assertCountEqual(
			all_template_ids,
			["gaming:ssbu-fighters", "gaming:zelda-games"],
		)
		self.assertEqual(len(state["items"]), 2)

	def test_empty_server_state_reports_creates_and_uploads(self) -> None:
		diff = build_seed_diff(
			self.compiled,
			{
				"activeReleaseId": None,
				"templates": [],
				"items": [],
				"criteria": [],
				"media": [],
			},
		)
		self.assertEqual(len(diff["templates"]["create"]), 2)
		self.assertEqual(len(diff["items"]["create"]), 2)
		self.assertEqual(len(diff["criteria"]["create"]), 3)
		self.assertEqual(len(diff["media"]["missing"]), 3)

	def test_template_diff_uses_metadata_content_hash(self) -> None:
		template = self.compiled["templates"][0]
		state = {
			"activeReleaseId": None,
			"templates": [
				{
					"externalId": template["externalId"],
					"releaseId": self.compiled["releaseId"],
					"title": template["title"],
					"description": template.get("description"),
					"category": template["category"],
					"tags": template.get("tags", []),
					"visibility": template["visibility"],
					"itemAspectRatio": template["itemAspectRatio"],
					"metadataContentHash": build_template_upserts(self.compiled)[0][
						"metadataContentHash"
					],
				}
			],
			"items": [],
			"criteria": [],
			"media": [],
		}
		compiled = read_json(
			Path(__file__).resolve().parent / "fixtures" / "compiled-manifest.example.json"
		)
		compiled["templates"][0]["coverZoom"] = 1.25

		diff = build_seed_diff(compiled, state)

		self.assertEqual(
			diff["templates"]["update"],
			[{"externalId": template["externalId"], "reasons": ["metadataContentHash"]}],
		)

	def test_media_diff_requires_full_asset_identity(self) -> None:
		asset = self.compiled["templates"][0]["items"][0]["asset"]
		variants = asset["variants"]
		state = {
			"activeReleaseId": None,
			"templates": [],
			"items": [],
			"criteria": [],
			"media": [
				{
					"contentHash": variants["tile"]["contentHash"],
					"mediaDedupeHash": "tile-only",
				},
				{
					"contentHash": variants["preview"]["contentHash"],
					"mediaDedupeHash": "preview-only",
				},
			],
		}

		diff = build_seed_diff(self.compiled, state)

		self.assertIn(asset["dedupeHash"], diff["media"]["missing"])

	def test_item_diff_compares_compiled_asset_dedupe_hash(self) -> None:
		template = self.compiled["templates"][0]
		item = template["items"][0]
		dedupe_hash = item["asset"]["dedupeHash"]
		server_item = {
			"templateExternalId": template["externalId"],
			"itemExternalId": item["externalId"],
			"order": item["order"],
			"label": item["label"],
			"mediaDedupeHash": dedupe_hash,
			"aspectRatio": item["aspectRatio"],
			"transform": item["transform"],
		}
		state = {
			"activeReleaseId": None,
			"templates": [],
			"items": [server_item],
			"criteria": [],
			"media": [],
		}
		diff = build_seed_diff(self.compiled, state)
		self.assertIn(
			{
				"templateExternalId": template["externalId"],
				"itemExternalId": item["externalId"],
			},
			diff["items"]["unchanged"],
		)
		self.assertEqual(diff["items"]["update"], [])

		state["items"] = [{**server_item, "mediaDedupeHash": None}]
		diff = build_seed_diff(self.compiled, state)
		self.assertEqual(
			diff["items"]["update"],
			[
				{
					"templateExternalId": template["externalId"],
					"itemExternalId": item["externalId"],
					"reasons": ["mediaDedupeHash"],
				}
			],
		)


if __name__ == "__main__":
	unittest.main()
