# scripts/seed_pipeline/seed_pipeline/rankings.py
# ranking seed compilation, commands, and reports

from __future__ import annotations

from pathlib import Path
from .manifest import JsonObject, as_list
from .reports import _report_header, _write_report
from .runs import (
    SeedRunOptions,
    _assert_write_allowed,
    _begin_seed_run,
    _load_context,
    _run_request,
)


SEED_RANKINGS_PREFLIGHT_FUNCTION = "marketplace/rankings/seed:preflightSeedRankings"
SEED_RANKINGS_ENSURE_AUTHORS_FUNCTION = (
    "marketplace/rankings/seed:ensureSeedRankingAuthors"
)
SEED_RANKINGS_APPLY_FUNCTION = "marketplace/rankings/seed:applySeedRankings"
SEED_RANKINGS_VERIFY_FUNCTION = "marketplace/rankings/seed:verifySeedRankings"
SEED_RANKINGS_ACTIVATE_FUNCTION = "marketplace/rankings/seedLifecycle:activateSeedRankings"
SEED_RANKINGS_ROLLBACK_FUNCTION = "marketplace/rankings/seedLifecycle:rollbackSeedRankings"


def preflight_rankings_manifest(
    manifest_path: Path,
    repo_root: Path,
    options: SeedRunOptions,
) -> Path:
    context = _load_context(manifest_path, repo_root, options, "rankings:preflight")
    result = _ranking_query(context, SEED_RANKINGS_PREFLIGHT_FUNCTION)
    return write_ranking_preflight_report(context, result)


def apply_rankings_manifest(
    manifest_path: Path,
    repo_root: Path,
    options: SeedRunOptions,
) -> Path:
    context = _load_context(manifest_path, repo_root, options, "rankings:apply")
    _assert_write_allowed(options, "rankings apply")
    ranking_seeds = _require_ranking_seeds(context.compiled)
    if options.dry_run:
        context.progress.log("dry run complete; no ranking writes performed")
        preflight = _ranking_query(context, SEED_RANKINGS_PREFLIGHT_FUNCTION)
        return write_ranking_apply_report(context, preflight, dry_run=True)
    _begin_seed_run(context)
    author_password = context.client.settings.author_password
    if not author_password:
        msg = "CONVEX_SEED_AUTHOR_PASSWORD is not set"
        raise RuntimeError(msg)
    author_result = _ensure_ranking_authors(context, ranking_seeds, author_password)
    result = _apply_ranking_targets(
        context,
        ranking_seeds,
        author_password,
        author_result,
    )
    return write_ranking_apply_report(context, result)


def verify_rankings_manifest(
    manifest_path: Path,
    repo_root: Path,
    options: SeedRunOptions,
) -> Path:
    context = _load_context(manifest_path, repo_root, options, "rankings:verify")
    result = _ranking_query(context, SEED_RANKINGS_VERIFY_FUNCTION)
    return write_ranking_verify_report(context, result)


def activate_rankings_manifest(
    manifest_path: Path,
    repo_root: Path,
    options: SeedRunOptions,
) -> Path:
    context = _load_context(manifest_path, repo_root, options, "rankings:activate")
    _assert_write_allowed(options, "rankings activate")
    if not options.confirm_activation:
        msg = "ranking activation requires --confirm-activation"
        raise RuntimeError(msg)
    result = context.client.mutation(
        SEED_RANKINGS_ACTIVATE_FUNCTION,
        {
            "datasetKey": context.compiled["datasetKey"],
            "releaseId": context.compiled["releaseId"],
        },
    )
    return write_ranking_activation_report(context, result)


def rollback_rankings_manifest(
    manifest_path: Path,
    repo_root: Path,
    options: SeedRunOptions,
) -> Path:
    context = _load_context(manifest_path, repo_root, options, "rankings:rollback")
    _assert_write_allowed(options, "rankings rollback")
    if not options.confirm_activation:
        msg = "ranking rollback requires --confirm-activation"
        raise RuntimeError(msg)
    if not options.target_release_id:
        msg = "ranking rollback requires --target-release-id"
        raise RuntimeError(msg)
    result = context.client.mutation(
        SEED_RANKINGS_ROLLBACK_FUNCTION,
        {
            "datasetKey": context.compiled["datasetKey"],
            "releaseId": context.compiled["releaseId"],
            "targetReleaseId": options.target_release_id,
        },
    )
    return write_ranking_activation_report(context, result, rollback=True)


def run_rankings_manifest(
    manifest_path: Path,
    repo_root: Path,
    options: SeedRunOptions,
) -> Path:
    context = _load_context(manifest_path, repo_root, options, "rankings:run")
    _assert_write_allowed(options, "rankings run")
    preflight = _ranking_query(context, SEED_RANKINGS_PREFLIGHT_FUNCTION)
    if _has_error_diagnostics(preflight):
        return write_ranking_run_report(
            context,
            ["preflight failed; apply skipped"],
            preflight,
        )
    if options.dry_run:
        context.progress.log("dry run complete; no ranking writes performed")
        return write_ranking_run_report(context, ["dry-run preflight complete"], preflight)
    _begin_seed_run(context)
    author_password = context.client.settings.author_password
    if not author_password:
        msg = "CONVEX_SEED_AUTHOR_PASSWORD is not set"
        raise RuntimeError(msg)
    ranking_seeds = _require_ranking_seeds(context.compiled)
    author_result = _ensure_ranking_authors(context, ranking_seeds, author_password)
    apply_result = _apply_ranking_targets(
        context,
        ranking_seeds,
        author_password,
        author_result,
    )
    verify_result = _ranking_query(context, SEED_RANKINGS_VERIFY_FUNCTION)
    steps = [
        "preflight complete",
        f"apply complete: {apply_result['rankingsApplied']} rankings",
    ]
    if _has_error_diagnostics(verify_result):
        steps.append("verification failed; activation skipped")
        return write_ranking_run_report(context, steps, verify_result)
    steps.append("verification complete")
    if options.confirm_activation:
        activation = context.client.mutation(
            SEED_RANKINGS_ACTIVATE_FUNCTION,
            {
                "datasetKey": context.compiled["datasetKey"],
                "releaseId": context.compiled["releaseId"],
            },
        )
        steps.append(
            f"activation complete: {activation['activatedRankings']} rankings"
        )
    else:
        steps.append("activation skipped; pass --confirm-activation to publish")
    return write_ranking_run_report(context, steps, verify_result)


def _ranking_query(context: object, function_path: str) -> JsonObject:
    return context.client.query(
        function_path,
        {
            "datasetKey": context.compiled["datasetKey"],
            "releaseId": context.compiled["releaseId"],
            "rankingSeeds": _require_ranking_seeds(context.compiled),
        },
    )


def _require_ranking_seeds(compiled: JsonObject) -> JsonObject:
    ranking_seeds = compiled.get("rankingSeeds")
    if not isinstance(ranking_seeds, dict):
        msg = "compiled manifest does not include rankingSeeds"
        raise RuntimeError(msg)
    return ranking_seeds


def _apply_ranking_targets(
    context: object,
    ranking_seeds: JsonObject,
    author_password: str,
    author_result: JsonObject,
) -> JsonObject:
    chunks = _ranking_seed_target_manifests(ranking_seeds)
    if not chunks:
        msg = "compiled rankingSeeds does not include targets"
        raise RuntimeError(msg)
    results: list[JsonObject] = []
    for index, chunk in enumerate(chunks):
        target = as_list(chunk.get("targets"))[0]
        template_external_id = (
            target.get("templateExternalId")
            if isinstance(target, dict)
            else "unknown target"
        )
        context.progress.log(
            f"ranking target {index + 1}/{len(chunks)}: {template_external_id}"
        )
        result = context.client.action(
            SEED_RANKINGS_APPLY_FUNCTION,
            {
                **_run_request(context),
                "authorPassword": author_password,
                "rankingSeeds": chunk,
                "ensureAuthors": False,
            },
        )
        results.append(result)
    return _merge_apply_results(context, results, author_result)


def _ensure_ranking_authors(
    context: object,
    ranking_seeds: JsonObject,
    author_password: str,
) -> JsonObject:
    context.progress.log("ensuring ranking seed authors")
    return context.client.action(
        SEED_RANKINGS_ENSURE_AUTHORS_FUNCTION,
        {
            **_run_request(context),
            "authorPassword": author_password,
            "rankingSeeds": ranking_seeds,
        },
    )


def _ranking_seed_target_manifests(ranking_seeds: JsonObject) -> list[JsonObject]:
    profiles = as_list(ranking_seeds.get("profiles"))
    default_profile_count = int(ranking_seeds.get("defaultProfileCount") or 0)
    chunks: list[JsonObject] = []
    for target in as_list(ranking_seeds.get("targets")):
        if not isinstance(target, dict):
            continue
        raw_count = target.get("sampleProfileCount", default_profile_count)
        sample_profile_count = (
            int(raw_count) if isinstance(raw_count, int | float) else default_profile_count
        )
        target_profiles = profiles[: max(0, min(len(profiles), sample_profile_count))]
        chunks.append(
            {
                "profileSet": ranking_seeds["profileSet"],
                "defaultProfileCount": ranking_seeds["defaultProfileCount"],
                "includeAllTemplates": False,
                "profiles": target_profiles,
                "targets": [target],
            }
        )
    return chunks


def _merge_apply_results(
    context: object,
    results: list[JsonObject],
    author_result: JsonObject,
) -> JsonObject:
    merged: JsonObject = {
        "datasetKey": context.compiled["datasetKey"],
        "releaseId": context.compiled["releaseId"],
        "authorsCreated": int(author_result.get("authorsCreated", 0)),
        "authorsReused": int(author_result.get("authorsReused", 0)),
        "authorsPatched": int(author_result.get("authorsPatched", 0)),
        "boardsReplaced": 0,
        "rankingsReplaced": 0,
        "sampleRankingsApplied": 0,
        "curatedRankingsApplied": 0,
        "rankingsApplied": 0,
        "rankingTiersWritten": 0,
        "rankingItemsWritten": 0,
        "aggregateLanes": [],
        "diagnostics": list(as_list(author_result.get("diagnostics"))),
    }
    lane_totals: dict[tuple[str, str], JsonObject] = {}
    for result in results:
        for key in [
            "boardsReplaced",
            "rankingsReplaced",
            "sampleRankingsApplied",
            "curatedRankingsApplied",
            "rankingsApplied",
            "rankingTiersWritten",
            "rankingItemsWritten",
        ]:
            merged[key] = int(merged[key]) + int(result.get(key, 0))
        merged["diagnostics"].extend(as_list(result.get("diagnostics")))
        for lane in as_list(result.get("aggregateLanes")):
            if not isinstance(lane, dict):
                continue
            lane_key = (
                str(lane.get("templateExternalId")),
                str(lane.get("criterionExternalId")),
            )
            total = lane_totals.setdefault(
                lane_key,
                {
                    "templateExternalId": lane_key[0],
                    "criterionExternalId": lane_key[1],
                    "sampleRankings": 0,
                    "curatedRankings": 0,
                },
            )
            total["sampleRankings"] = int(total["sampleRankings"]) + int(
                lane.get("sampleRankings", 0)
            )
            total["curatedRankings"] = int(total["curatedRankings"]) + int(
                lane.get("curatedRankings", 0)
            )
    merged["aggregateLanes"] = sorted(
        lane_totals.values(),
        key=lambda lane: (
            str(lane["templateExternalId"]),
            str(lane["criterionExternalId"]),
        ),
    )
    return merged


def _has_error_diagnostics(result: JsonObject) -> bool:
    return any(
        isinstance(item, dict) and item.get("severity") == "error"
        for item in as_list(result.get("diagnostics"))
    )


def write_ranking_preflight_report(context: object, result: JsonObject) -> Path:
    lines = _ranking_report_header(context, "Ranking Seed Preflight Report", result)
    _append_ranking_lanes(lines, result.get("aggregateLanes", []))
    _append_diagnostics(lines, result.get("diagnostics", []))
    return _write_report(context, "ranking-preflight.md", lines)


def write_ranking_apply_report(
    context: object,
    result: JsonObject,
    dry_run: bool = False,
) -> Path:
    lines = _report_header(
        context,
        "Ranking Seed Apply Report",
        dry_run=dry_run,
        extra=[
            f"- Authors created: {result.get('authorsCreated', 0)}",
            f"- Authors reused: {result.get('authorsReused', 0)}",
            f"- Authors patched: {result.get('authorsPatched', 0)}",
            f"- Rankings applied: {result.get('rankingsApplied', 0)}",
            f"- Sample rankings: {result.get('sampleRankingsApplied', 0)}",
            f"- Curated rankings: {result.get('curatedRankingsApplied', 0)}",
            f"- Boards replaced: {result.get('boardsReplaced', 0)}",
            f"- Rankings replaced: {result.get('rankingsReplaced', 0)}",
            f"- Ranking tiers written: {result.get('rankingTiersWritten', 0)}",
            f"- Ranking items written: {result.get('rankingItemsWritten', 0)}",
        ],
    )
    _append_ranking_lanes(lines, result.get("aggregateLanes", []))
    _append_diagnostics(lines, result.get("diagnostics", []))
    return _write_report(context, "ranking-apply.md", lines)


def write_ranking_verify_report(context: object, result: JsonObject) -> Path:
    lines = _ranking_report_header(context, "Ranking Seed Verify Report", result)
    _append_ranking_lanes(lines, result.get("aggregateLanes", []))
    _append_diagnostics(lines, result.get("diagnostics", []))
    return _write_report(context, "ranking-verify.md", lines)


def write_ranking_activation_report(
    context: object,
    result: JsonObject,
    rollback: bool = False,
) -> Path:
    title = "Ranking Seed Rollback Report" if rollback else "Ranking Seed Activation Report"
    lines = _report_header(
        context,
        title,
        extra=[
            f"- Activated rankings: {result.get('activatedRankings', 0)}",
            f"- Rolled back rankings: {result.get('rolledBackRankings', 0)}",
            f"- Aggregate jobs queued: {result.get('aggregateJobsQueued', 0)}",
        ],
    )
    return _write_report(context, "ranking-activation.md", lines)


def write_ranking_run_report(
    context: object,
    steps: list[str],
    result: JsonObject,
) -> Path:
    lines = _ranking_report_header(context, "Ranking Seed Run Report", result)
    lines.extend(["## Steps", ""])
    lines.extend(f"- {step}" for step in steps)
    lines.append("")
    _append_ranking_lanes(lines, result.get("aggregateLanes", []))
    _append_diagnostics(lines, result.get("diagnostics", []))
    return _write_report(context, "ranking-run.md", lines)


def _ranking_report_header(
    context: object,
    title: str,
    result: JsonObject,
) -> list[str]:
    return _report_header(
        context,
        title,
        extra=[
            f"- Targets: {result.get('targetCount', 0)}",
            f"- Profiles: {result.get('profileCount', 0)}",
            f"- Authors required: {result.get('authorCount', 0)}",
            f"- Sample rankings planned: {result.get('sampleRankingsPlanned', 0)}",
            f"- Curated rankings planned: {result.get('curatedRankingsPlanned', 0)}",
            f"- Existing seed rankings: {result.get('existingSeedRankings', 0)}",
            f"- Existing active seed rankings: {result.get('existingActiveSeedRankings', 0)}",
        ],
    )


def _append_ranking_lanes(lines: list[str], lanes: object) -> None:
    lines.extend(["## Ranking Lanes", ""])
    lane_list = [lane for lane in as_list(lanes) if isinstance(lane, dict)]
    if not lane_list:
        lines.extend(["- None", ""])
        return
    for lane in lane_list:
        lines.append(
            "- "
            f"`{lane.get('templateExternalId')}` / `{lane.get('criterionExternalId')}`: "
            f"{lane.get('sampleRankings', 0)} sample, "
            f"{lane.get('curatedRankings', 0)} curated"
        )
    lines.append("")


def _append_diagnostics(lines: list[str], diagnostics: object) -> None:
    lines.extend(["## Diagnostics", ""])
    rows = [item for item in as_list(diagnostics) if isinstance(item, dict)]
    if not rows:
        lines.extend(["- None", ""])
        return
    for item in rows:
        lines.append(
            f"- `{item.get('severity')}` `{item.get('code')}` "
            f"{item.get('path')}: {item.get('message')}"
        )
    lines.append("")
