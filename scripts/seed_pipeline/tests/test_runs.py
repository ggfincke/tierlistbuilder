# scripts/seed_pipeline/tests/test_runs.py
# Python run-workflow payload fixtures

from __future__ import annotations

import unittest

from seed_pipeline.manifest import find_repo_root, read_json
from seed_pipeline.runs import (
    build_criterion_upserts,
    build_item_upserts,
    build_template_upserts,
)


class SeedRunPayloadTests(unittest.TestCase):
    def setUp(self) -> None:
        repo_root = find_repo_root()
        self.compiled = read_json(
            repo_root / "data/seeds/examples/compiled-manifest.example.json"
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
            templates[0]["coverMediaContentHash"],
            self.compiled["templates"][0]["coverImage"]["variants"]["tile"][
                "contentHash"
            ],
        )
        self.assertIsNotNone(templates[0]["coverFraming"])
        self.assertGreater(len(templates[1]["suggestedTiers"]), 0)
        self.assertIsNone(templates[1]["coverFraming"])
        self.assertEqual(len(items), 2)
        self.assertEqual(
            items[0]["mediaContentHash"],
            self.compiled["templates"][0]["items"][0]["asset"]["variants"]["tile"][
                "contentHash"
            ],
        )
        self.assertEqual(len(criteria), 3)
        self.assertEqual(criteria[0]["criterionExternalId"], "competitive")


if __name__ == "__main__":
    unittest.main()
