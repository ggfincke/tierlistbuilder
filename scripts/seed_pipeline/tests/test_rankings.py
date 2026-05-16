# scripts/seed_pipeline/tests/test_rankings.py
# ranking seed manifest compilation and route guards

from __future__ import annotations

import unittest
from unittest.mock import patch

from seed_pipeline.convex_client import ConvexClientError, SEED_HTTP_ROUTES
from seed_pipeline.concurrency import run_in_parallel
from seed_pipeline.ranking_config import compile_ranking_seeds
from seed_pipeline.rankings import (
    RANKING_APPLY_THROTTLE_BASE_SECONDS,
    SEED_RANKINGS_ACTIVATE_FUNCTION,
    SEED_RANKINGS_APPLY_FUNCTION,
    SEED_RANKINGS_CLEANUP_STALE_FUNCTION,
    _apply_ranking_targets,
    _ranking_seed_target_manifests,
    _run_ranking_lifecycle_until_complete,
)


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

    def test_include_all_caps_generic_profile_count_for_large_templates(self) -> None:
        manifest = _manifest({"includeAllTemplates": True, "targets": []})
        templates = [
            {
                "externalId": "gaming:large-template",
                "title": "Large Template",
                "items": [
                    {"externalId": f"item-{index}"} for index in range(1342)
                ],
                "criteria": [
                    {
                        "externalId": "favorites",
                        "status": "active",
                        "isPrimary": True,
                    }
                ],
            }
        ]

        compiled = compile_ranking_seeds(manifest, templates)

        self.assertIsNotNone(compiled)
        assert compiled is not None
        target = compiled["targets"][0]
        self.assertEqual(target["templateExternalId"], "gaming:large-template")
        self.assertEqual(target["sampleProfileCount"], 4)

    def test_explicit_target_uses_default_sample_count_when_omitted(self) -> None:
        manifest = _manifest(
            {
                "targets": [
                    {
                        "templateExternalId": "gaming:ssbu-fighters",
                        "lanes": [
                            {
                                "criterionExternalId": "competitive",
                                "titleSuffix": "competitive fixture",
                                "description": "Fixture lane.",
                                "boostTerms": [],
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
        self.assertEqual(compiled["targets"][0]["sampleProfileCount"], 16)

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
                ("action", "marketplace/rankings/seed:applySeedRankingChunk")
            ],
            "/api/seed/rankings/apply",
        )
        self.assertEqual(
            SEED_HTTP_ROUTES[
                ("action", "marketplace/rankings/seed:cleanupStaleSeedRankings")
            ],
            "/api/seed/rankings/cleanup-stale",
        )
        self.assertEqual(
            SEED_HTTP_ROUTES[
                ("action", "marketplace/rankings/seed:ensureSeedRankingAuthors")
            ],
            "/api/seed/rankings/ensure-authors",
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
        self.assertEqual(
            SEED_HTTP_ROUTES[
                (
                    "mutation",
                    "marketplace/rankings/seedLifecycle:queueActiveSeedRankingAggregates",
                )
            ],
            "/api/seed/rankings/queue-aggregates",
        )

    @patch("seed_pipeline.rankings.time.sleep")
    def test_activation_runner_keeps_batch_size_server_owned(
        self, sleep: object
    ) -> None:
        context = _FakeRankingLifecycleContext(
            [
                {
                    "releaseId": "release-a",
                    "activatedRankings": 32,
                    "rolledBackRankings": 0,
                    "aggregateJobsQueued": 0,
                },
                {
                    "releaseId": "release-a",
                    "activatedRankings": 0,
                    "rolledBackRankings": 0,
                    "aggregateJobsQueued": 0,
                },
            ]
        )
        args = {
            "datasetKey": "marketplace-core",
            "releaseId": "release-a",
            "queueAggregates": False,
        }

        result = _run_ranking_lifecycle_until_complete(
            context,
            SEED_RANKINGS_ACTIVATE_FUNCTION,
            args,
            active_release_id="release-a",
        )

        self.assertEqual(result["activatedRankings"], 32)
        self.assertEqual(len(context.client.mutations), 2)
        first_call = context.client.mutations[0]
        self.assertEqual(first_call[0], SEED_RANKINGS_ACTIVATE_FUNCTION)
        self.assertEqual(first_call[1], args)
        self.assertNotIn("batchSize", first_call[1])
        self.assertNotIn("limit", first_call[1])
        # no proactive between-batch sleep: only convex-write-rate throttling
        # triggers the retry sleep, and no throttling was simulated here
        sleep.assert_not_called()

    @patch("seed_pipeline.rankings.time.sleep")
    def test_apply_retries_convex_write_rate_throttle(self, sleep: object) -> None:
        ranking_seeds = _manifest(
            {
                "profiles": [
                    {"key": "a", "displayName": "A", "chaos": 0, "contrarian": 0}
                ],
                "targets": [
                    {
                        "templateExternalId": "one",
                        "sampleProfileCount": 1,
                        "lanes": [],
                    }
                ],
            }
        )["rankingSeeds"]
        context = _FakeRankingApplyContext(
            [
                ConvexClientError(
                    "Too many writes per second. Your deployment is limited to "
                    "4 MiB bytes written per 1 second."
                ),
                {
                    "releaseId": "release-a",
                    "boardsReplaced": 1,
                    "rankingsReplaced": 1,
                    "rankingsUnchanged": 0,
                    "sampleRankingsApplied": 1,
                    "curatedRankingsApplied": 0,
                    "rankingTiersWritten": 5,
                    "rankingItemsWritten": 10,
                    "aggregateLanes": [],
                    "diagnostics": [],
                },
                {
                    "releaseId": "release-a",
                    "rankingsDeleted": 2,
                    "boardsDeleted": 2,
                },
            ]
        )

        result = _apply_ranking_targets(
            context,
            ranking_seeds,
            {"authorsCreated": 0, "authorsReused": 1, "authorsPatched": 0},
        )

        # rankings applied = sample + curated (derived, no longer stored)
        self.assertEqual(
            result["sampleRankingsApplied"] + result["curatedRankingsApplied"], 1
        )
        # apply rewrites are reported separately from stale-cleanup deletions;
        # conflating them used to skew the change-detection that drives
        # aggregate requeueing
        self.assertEqual(result["rankingsReplaced"], 1)
        self.assertEqual(result["boardsReplaced"], 1)
        self.assertEqual(result["rankingsCleaned"], 2)
        self.assertEqual(result["boardsCleaned"], 2)
        self.assertEqual(len(context.client.actions), 3)
        for function_path, payload in context.client.actions[:2]:
            self.assertEqual(function_path, SEED_RANKINGS_APPLY_FUNCTION)
            self.assertNotIn("batchSize", payload)
            self.assertNotIn("limit", payload)
        cleanup_function, cleanup_payload = context.client.actions[2]
        self.assertEqual(cleanup_function, SEED_RANKINGS_CLEANUP_STALE_FUNCTION)
        self.assertEqual(cleanup_payload["rankingSeeds"], ranking_seeds)
        sleep.assert_called_once_with(RANKING_APPLY_THROTTLE_BASE_SECONDS)
        self.assertTrue(
            any("throttled by write-rate limit" in msg for msg in context.progress.messages)
        )

    def test_run_in_parallel_reports_one_based_completion_counts(self) -> None:
        callbacks: list[tuple[int, int, str]] = []
        items = [{"id": "a"}, {"id": "b"}, {"id": "c"}]

        results = run_in_parallel(
            items,
            lambda item: {"id": item["id"], "done": True},
            max_workers=2,
            on_complete=lambda completed, total, item: callbacks.append(
                (completed, total, str(item["id"]))
            ),
        )

        self.assertEqual(
            results,
            [
                {"id": "a", "done": True},
                {"id": "b", "done": True},
                {"id": "c", "done": True},
            ],
        )
        self.assertEqual([completed for completed, _, _ in callbacks], [1, 2, 3])
        self.assertEqual({total for _, total, _ in callbacks}, {3})


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


class _FakeRankingLifecycleClient:
    def __init__(self, responses: list[dict[str, object]]) -> None:
        self.responses = list(responses)
        self.mutations: list[tuple[str, dict[str, object]]] = []

    def mutation(
        self, function_path: str, args: dict[str, object]
    ) -> dict[str, object]:
        self.mutations.append((function_path, dict(args)))
        if not self.responses:
            raise AssertionError("unexpected mutation call")
        return self.responses.pop(0)


class _FakeRankingLifecycleProgress:
    def __init__(self) -> None:
        self.messages: list[str] = []

    def log(self, message: str) -> None:
        self.messages.append(message)


class _FakeRankingLifecycleContext:
    def __init__(self, responses: list[dict[str, object]]) -> None:
        self.compiled = {
            "datasetKey": "marketplace-core",
            "releaseId": "release-a",
        }
        self.client = _FakeRankingLifecycleClient(responses)
        self.progress = _FakeRankingLifecycleProgress()


class _FakeRankingApplyClient:
    def __init__(self, responses: list[object]) -> None:
        self.responses = list(responses)
        self.actions: list[tuple[str, dict[str, object]]] = []

    def action(
        self, function_path: str, args: dict[str, object]
    ) -> dict[str, object]:
        self.actions.append((function_path, dict(args)))
        if not self.responses:
            raise AssertionError("unexpected action call")
        response = self.responses.pop(0)
        if isinstance(response, BaseException):
            raise response
        assert isinstance(response, dict)
        return response


class _FakeRankingApplyContext:
    def __init__(self, responses: list[object]) -> None:
        self.compiled = {
            "datasetKey": "marketplace-core",
            "releaseId": "release-a",
        }
        self.checkpoint = {"runId": "run-a"}
        self.client = _FakeRankingApplyClient(responses)
        self.progress = _FakeRankingLifecycleProgress()


if __name__ == "__main__":
    unittest.main()
