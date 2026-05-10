# scripts/seed_pipeline/tests/test_runs.py
# Python run-workflow payload fixtures

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from seed_pipeline.manifest import find_repo_root, read_json
from seed_pipeline.runs import (
    CLEANUP_STORAGE_BATCH_SIZE,
    CRITERION_BATCH_SIZE,
    FINALIZE_ASSET_BATCH_SIZE,
    ITEM_BATCH_SIZE,
    SeedRunOptions,
    TEMPLATE_BATCH_SIZE,
    UPLOAD_URL_BATCH_SIZE,
    _assets_requiring_upload,
    _child_upsert_batches,
    _checkpoint_matches,
    _is_production_env,
    _new_run_id,
    build_criterion_upserts,
    build_item_upserts,
    build_template_upserts,
    run_seed_manifest,
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
            templates[0]["coverMediaDedupeHash"],
            self.compiled["templates"][0]["coverImage"]["dedupeHash"],
        )
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

    def test_checkpoint_scope_includes_environment(self) -> None:
        checkpoint = {
            "datasetKey": self.compiled["datasetKey"],
            "releaseId": self.compiled["releaseId"],
            "env": "local",
        }

        self.assertTrue(_checkpoint_matches(checkpoint, self.compiled, "local"))
        self.assertFalse(_checkpoint_matches(checkpoint, self.compiled, "prod"))

    def test_child_upsert_batches_keep_each_template_complete(self) -> None:
        rows = [
            {"templateExternalId": "template-a", "itemExternalId": "a-1"},
            {"templateExternalId": "template-b", "itemExternalId": "b-1"},
            {"templateExternalId": "template-a", "itemExternalId": "a-2"},
        ]

        batches = _child_upsert_batches(rows, 2, "items")

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
            _child_upsert_batches(rows, 2, "items")

    def test_upload_selection_requires_full_media_identity(self) -> None:
        asset = self.compiled["templates"][0]["items"][0]["asset"]
        stale_state = {"media": [{"mediaDedupeHash": "tile-only"}]}
        current_state = {"media": [{"mediaDedupeHash": asset["dedupeHash"]}]}

        stale_needed = _assets_requiring_upload(self.compiled, stale_state)
        current_needed = _assets_requiring_upload(self.compiled, current_state)

        self.assertIn(
            "gaming:ssbu-fighters:mario",
            {entry["assetKey"] for entry in stale_needed},
        )
        self.assertNotIn(
            "gaming:ssbu-fighters:mario",
            {entry["assetKey"] for entry in current_needed},
        )

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
                "absentFromManifest": [],
            }
            clients: list[FakeSeedClient] = []

            def make_client(_settings: object) -> "FakeSeedClient":
                client = FakeSeedClient(state)
                clients.append(client)
                return client

            with (
                patch(
                    "seed_pipeline.runs.build_compiled_manifest_with_data",
                    return_value=(compiled_path, self.compiled),
                ),
                patch("seed_pipeline.runs.read_seed_settings", return_value=object()),
                patch("seed_pipeline.runs.ConvexSeedClient", make_client),
            ):
                run_seed_manifest(
                    Path("seed.json"),
                    root,
                    SeedRunOptions(env_name="local", confirm_activation=True),
                )

            checkpoint = json.loads(
                (compiled_path.parent / "run.json").read_text(encoding="utf-8")
            )
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
        self.assertEqual(checkpoint["previousActiveReleaseId"], "old-release")
        self.assertEqual(activate_args["previousReleaseId"], "old-release")
        self.assertEqual(sync_args["templateExternalId"], "gaming:ssbu-fighters")
        self.assertNotIn("templateExternalId", sync_args["items"][0])

    def test_run_ids_include_entropy_after_timestamp(self) -> None:
        first = _new_run_id(self.compiled)
        second = _new_run_id(self.compiled)

        self.assertRegex(first, r"2026-05-templates-v1-\d{8}T\d{6}Z-[0-9a-f]{8}")
        self.assertNotEqual(first, second)

    def test_production_environment_detection_catches_regional_names(self) -> None:
        self.assertTrue(_is_production_env("prod"))
        self.assertTrue(_is_production_env("production-eu"))
        self.assertTrue(_is_production_env("prod:happy-animal-123"))
        self.assertFalse(_is_production_env("local"))
        self.assertFalse(_is_production_env("preprod"))

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

    def query(self, _function_path: str, _args: dict[str, object]) -> dict[str, object]:
        return self.state

    def mutation(
        self, function_path: str, args: dict[str, object]
    ) -> dict[str, object]:
        self.mutations.append((function_path, args))
        if function_path == "marketplace/seedRuns:beginSeedRun":
            return {"run": {"runId": args["runId"], "status": "building"}}
        if function_path == "marketplace/seedRuns:verifySeedRelease":
            return {"verified": True, "diagnostics": []}
        if function_path == "marketplace/seedRuns:activateSeedRelease":
            return {
                "activeReleaseId": args["releaseId"],
                "previousReleaseId": args["previousReleaseId"],
            }
        return {"created": [], "updated": [], "unchanged": []}


def _compiled_asset_dedupe_hashes(compiled: dict[str, object]) -> set[str]:
    hashes: set[str] = set()
    for template in compiled["templates"]:
        if not isinstance(template, dict):
            continue
        cover = template.get("coverImage")
        if isinstance(cover, dict):
            _collect_asset_dedupe_hash(cover, hashes)
        for item in template["items"]:
            if isinstance(item, dict) and isinstance(item.get("asset"), dict):
                _collect_asset_dedupe_hash(item["asset"], hashes)
    return hashes


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
