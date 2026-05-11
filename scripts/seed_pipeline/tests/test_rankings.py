# scripts/seed_pipeline/tests/test_rankings.py
# ranking seed manifest compilation and route guards

from __future__ import annotations

import unittest

from seed_pipeline.convex_client import SEED_HTTP_ROUTES
from seed_pipeline.ranking_config import compile_ranking_seeds
from seed_pipeline.rankings import _ranking_seed_target_manifests


class RankingSeedCompilationTests(unittest.TestCase):
    def test_include_all_templates_expands_primary_lanes(self) -> None:
        manifest = _manifest(
            {
                "includeAllTemplates": True,
                "targets": [
                    {
                        "templateExternalId": "gaming:ssbu-fighters",
                        "sampleProfileCount": 3,
                        "lanes": [
                            {
                                "criterionExternalId": "competitive",
                                "titleSuffix": "competitive fixture",
                                "description": "Fixture lane.",
                                "boostTerms": ["mario"],
                                "dropTerms": [],
                            }
                        ],
                    }
                ],
            }
        )
        compiled = compile_ranking_seeds(manifest, _compiled_templates())

        self.assertIsNotNone(compiled)
        assert compiled is not None
        self.assertEqual(len(compiled["targets"]), 2)
        explicit = compiled["targets"][0]
        generic = compiled["targets"][1]
        self.assertEqual(explicit["sampleProfileCount"], 3)
        self.assertEqual(generic["templateExternalId"], "gaming:zelda-games")
        self.assertEqual(generic["sampleProfileCount"], 16)
        self.assertEqual(generic["lanes"][0]["criterionExternalId"], "favorites")

    def test_curated_defaults_are_made_explicit(self) -> None:
        manifest = _manifest(
            {
                "targets": [
                    {
                        "templateExternalId": "gaming:ssbu-fighters",
                        "sampleProfileCount": 1,
                        "lanes": [
                            {
                                "criterionExternalId": "competitive",
                                "titleSuffix": "fixture",
                                "description": "Fixture lane.",
                                "boostTerms": [],
                                "dropTerms": [],
                            }
                        ],
                        "curatedRankings": [
                            {
                                "externalId": "fixture-list",
                                "authorKey": "fixture-author",
                                "authorDisplayName": "Fixture Author",
                                "criterionExternalId": "competitive",
                                "title": "Fixture List",
                                "description": "Fixture curated list.",
                                "tiers": [
                                    {
                                        "name": "S",
                                        "colorSpec": {"kind": "palette", "index": 0},
                                    }
                                ],
                                "tierGroups": [
                                    {"tierName": "S", "labels": ["Mario"]}
                                ],
                            }
                        ],
                    }
                ],
            }
        )
        compiled = compile_ranking_seeds(manifest, _compiled_templates())

        self.assertIsNotNone(compiled)
        assert compiled is not None
        curated = compiled["targets"][0]["curatedRankings"][0]
        self.assertEqual(curated["coverage"], "full-template")
        self.assertEqual(curated["featuredRank"], None)
        self.assertEqual(curated["featuredBadge"], None)
        self.assertEqual(curated["parentLabelByLabel"], {})

    def test_include_all_requires_an_active_criterion(self) -> None:
        manifest = _manifest({"includeAllTemplates": True, "targets": []})
        templates = [
            {
                "externalId": "broken:template",
                "title": "Broken template",
                "criteria": [
                    {
                        "externalId": "default",
                        "status": "deprecated",
                        "isPrimary": True,
                    }
                ],
            }
        ]

        with self.assertRaisesRegex(ValueError, "no active ranking criterion"):
            compile_ranking_seeds(manifest, templates)

    def test_ranking_routes_are_registered(self) -> None:
        self.assertEqual(
            SEED_HTTP_ROUTES[
                ("query", "marketplace/rankings/seed:preflightSeedRankings")
            ],
            "/api/seed/rankings/preflight",
        )

    def test_apply_chunks_ranking_targets_by_target_profile_count(self) -> None:
        ranking_seeds = _manifest(
            {
                "profiles": [
                    {"key": "a", "displayName": "A", "chaos": 0, "contrarian": 0},
                    {"key": "b", "displayName": "B", "chaos": 0, "contrarian": 0},
                    {"key": "c", "displayName": "C", "chaos": 0, "contrarian": 0},
                ],
                "targets": [
                    {
                        "templateExternalId": "one",
                        "sampleProfileCount": 2,
                        "lanes": [],
                    },
                    {
                        "templateExternalId": "two",
                        "sampleProfileCount": 1,
                        "lanes": [],
                    },
                ],
            }
        )["rankingSeeds"]

        chunks = _ranking_seed_target_manifests(ranking_seeds)

        self.assertEqual(len(chunks), 2)
        self.assertEqual(
            [profile["key"] for profile in chunks[0]["profiles"]],
            ["a", "b"],
        )
        self.assertEqual(
            [profile["key"] for profile in chunks[1]["profiles"]],
            ["a"],
        )
        self.assertEqual(chunks[0]["targets"][0]["templateExternalId"], "one")
        self.assertEqual(chunks[1]["targets"][0]["templateExternalId"], "two")
        self.assertEqual(
            SEED_HTTP_ROUTES[
                ("action", "marketplace/rankings/seed:applySeedRankings")
            ],
            "/api/seed/rankings/apply",
        )
        self.assertEqual(
            SEED_HTTP_ROUTES[
                (
                    "mutation",
                    "marketplace/rankings/seedLifecycle:activateSeedRankings",
                )
            ],
            "/api/seed/rankings/activate",
        )


def _manifest(overrides: dict[str, object]) -> dict[str, object]:
    ranking_seeds = {
        "profileSet": "fixture-v1",
        "defaultProfileCount": 16,
        "includeAllTemplates": False,
        "profiles": [
            {
                "key": "ava",
                "displayName": "Ava",
                "chaos": 0.2,
                "contrarian": 0.1,
            }
        ],
        "targets": [],
        **overrides,
    }
    return {"rankingSeeds": ranking_seeds}


def _compiled_templates() -> list[dict[str, object]]:
    return [
        {
            "externalId": "gaming:ssbu-fighters",
            "title": "Super Smash Bros. Ultimate roster",
            "criteria": [
                {
                    "externalId": "competitive",
                    "status": "active",
                    "isPrimary": True,
                },
                {
                    "externalId": "favorites",
                    "status": "active",
                    "isPrimary": False,
                },
            ],
        },
        {
            "externalId": "gaming:zelda-games",
            "title": "Legend of Zelda mainline",
            "criteria": [
                {
                    "externalId": "default",
                    "status": "active",
                    "isPrimary": False,
                },
                {
                    "externalId": "favorites",
                    "status": "active",
                    "isPrimary": True,
                },
            ],
        },
    ]


if __name__ == "__main__":
    unittest.main()
