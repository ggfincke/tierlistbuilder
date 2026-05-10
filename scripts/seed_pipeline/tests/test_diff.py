# scripts/seed_pipeline/tests/test_diff.py
# server-state diff fixtures for Python seed preflight

from __future__ import annotations

import unittest

from seed_pipeline.diff import build_seed_diff, build_state_request
from seed_pipeline.manifest import find_repo_root, read_json


class SeedDiffTests(unittest.TestCase):
    def setUp(self) -> None:
        repo_root = find_repo_root()
        self.compiled = read_json(
            repo_root / "data/seeds/examples/compiled-manifest.example.json"
        )

    def test_state_request_extracts_ids_and_hashes(self) -> None:
        request = build_state_request(self.compiled)
        self.assertEqual(request["authorEmail"], "tterrag456@gmail.com")
        self.assertEqual(
            request["templateExternalIds"],
            ["gaming:ssbu-fighters", "gaming:zelda-games"],
        )
        self.assertEqual(len(request["itemExternalIds"]), 2)
        self.assertEqual(len(request["criterionExternalIds"]), 3)
        self.assertEqual(len(request["variantHashes"]), 6)

    def test_empty_server_state_reports_creates_and_uploads(self) -> None:
        diff = build_seed_diff(
            self.compiled,
            {
                "activeReleaseId": None,
                "templates": [],
                "items": [],
                "criteria": [],
                "media": [],
                "absentFromManifest": [],
            },
        )
        self.assertEqual(len(diff["templates"]["create"]), 2)
        self.assertEqual(len(diff["items"]["create"]), 2)
        self.assertEqual(len(diff["criteria"]["create"]), 3)
        self.assertEqual(len(diff["media"]["missing"]), 3)

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
            "absentFromManifest": [],
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
            "absentFromManifest": [],
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
