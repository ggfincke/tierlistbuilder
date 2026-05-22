# scripts/seed_pipeline/seed_pipeline/rankings.py
# ranking seed compilation, commands, and reports

from __future__ import annotations

import time
from pathlib import Path

from .convex_client import ConvexClientError, is_convex_write_rate_error
from .manifest import JsonObject, as_list
from .report_layout import _append_section, report_header, write_report
from .run_context import (
	SeedRunContext,
	SeedRunOptions,
	assert_write_allowed,
	begin_seed_run,
	load_context,
	run_request,
)


SEED_RANKINGS_PREFLIGHT_FUNCTION = "marketplace/rankings/seed/actions:preflightSeedRankings"
SEED_RANKINGS_ENSURE_AUTHORS_FUNCTION = "marketplace/rankings/seed/actions:ensureSeedRankingAuthors"
SEED_RANKINGS_APPLY_FUNCTION = "marketplace/rankings/seed/actions:applySeedRankingChunk"
SEED_RANKINGS_CLEANUP_STALE_FUNCTION = "marketplace/rankings/seed/actions:cleanupStaleSeedRankings"
SEED_RANKINGS_VERIFY_FUNCTION = "marketplace/rankings/seed/actions:verifySeedRankings"
SEED_RANKINGS_ACTIVATE_FUNCTION = "marketplace/rankings/seed/lifecycle:activateSeedRankings"
SEED_RANKINGS_ROLLBACK_FUNCTION = "marketplace/rankings/seed/lifecycle:rollbackSeedRankings"
SEED_RANKINGS_QUEUE_AGGREGATES_FUNCTION = (
	"marketplace/rankings/seed/lifecycle:queueActiveSeedRankingAggregates"
)
MAX_RANKING_ACTIVATION_BATCHES = 200
RANKING_ACTIVATION_THROTTLE_SECONDS = 2.0
MAX_RANKING_APPLY_ATTEMPTS = 6
RANKING_APPLY_THROTTLE_BASE_SECONDS = 3.0
RANKING_APPLY_THROTTLE_MAX_SECONDS = 30.0
# Ranking target applies are server-heavy. Run them sequentially with a short
# cooldown so retries do not stack more writes onto an already-throttled backend.
RANKING_APPLY_TARGET_COOLDOWN_SECONDS = 0.25


def preflight_rankings_manifest(
	manifest_path: Path,
	repo_root: Path,
	options: SeedRunOptions,
) -> Path:
	context = load_context(manifest_path, repo_root, options, "rankings:preflight")
	result = _ranking_query(context, SEED_RANKINGS_PREFLIGHT_FUNCTION)
	return _write_ranking_summary_report(context, "preflight", result)


def apply_rankings_manifest(
	manifest_path: Path,
	repo_root: Path,
	options: SeedRunOptions,
) -> Path:
	context = load_context(manifest_path, repo_root, options, "rankings:apply")
	assert_write_allowed(options, "rankings apply")
	ranking_seeds = _require_ranking_seeds(context.compiled)
	if options.dry_run:
		context.progress.log("dry run complete; no ranking writes performed")
		preflight = _ranking_query(context, SEED_RANKINGS_PREFLIGHT_FUNCTION)
		return _write_ranking_apply_report(context, preflight, dry_run=True)
	begin_seed_run(context)
	result = _apply_rankings_with_authors(context, ranking_seeds)
	return _write_ranking_apply_report(context, result)


def verify_rankings_manifest(
	manifest_path: Path,
	repo_root: Path,
	options: SeedRunOptions,
) -> Path:
	context = load_context(manifest_path, repo_root, options, "rankings:verify")
	result = _ranking_query(context, SEED_RANKINGS_VERIFY_FUNCTION)
	return _write_ranking_summary_report(context, "verify", result)


def activate_rankings_manifest(
	manifest_path: Path,
	repo_root: Path,
	options: SeedRunOptions,
) -> Path:
	context = load_context(manifest_path, repo_root, options, "rankings:activate")
	assert_write_allowed(options, "rankings activate")
	if not options.confirm_activation:
		msg = "ranking activation requires --confirm-activation"
		raise RuntimeError(msg)
	result = _activate_rankings_until_complete(context)
	return _write_ranking_activation_report(context, result)


def rollback_rankings_manifest(
	manifest_path: Path,
	repo_root: Path,
	options: SeedRunOptions,
) -> Path:
	context = load_context(manifest_path, repo_root, options, "rankings:rollback")
	assert_write_allowed(options, "rankings rollback")
	if not options.confirm_activation:
		msg = "ranking rollback requires --confirm-activation"
		raise RuntimeError(msg)
	if not options.target_release_id:
		msg = "ranking rollback requires --target-release-id"
		raise RuntimeError(msg)
	result = _rollback_rankings_until_complete(context, options.target_release_id)
	return _write_ranking_activation_report(context, result, rollback=True)


def run_rankings_manifest(
	manifest_path: Path,
	repo_root: Path,
	options: SeedRunOptions,
) -> Path:
	context = load_context(manifest_path, repo_root, options, "rankings:run")
	assert_write_allowed(options, "rankings run")
	preflight = _ranking_query(context, SEED_RANKINGS_PREFLIGHT_FUNCTION)
	if _has_error_diagnostics(preflight):
		return _write_ranking_run_report(
			context,
			["preflight failed; apply skipped"],
			preflight,
		)
	if options.dry_run:
		context.progress.log("dry run complete; no ranking writes performed")
		return _write_ranking_run_report(context, ["dry-run preflight complete"], preflight)
	begin_seed_run(context)
	ranking_seeds = _require_ranking_seeds(context.compiled)
	apply_result = _apply_rankings_with_authors(context, ranking_seeds)
	verify_result = _ranking_query(context, SEED_RANKINGS_VERIFY_FUNCTION)
	rankings_applied = _rankings_applied(apply_result)
	steps = [
		"preflight complete",
		(
			f"apply complete: {rankings_applied} rankings "
			f"({apply_result.get('rankingsUnchanged', 0)} unchanged)"
		),
	]
	if _has_error_diagnostics(verify_result):
		steps.append("verification failed; activation skipped")
		return _write_ranking_run_report(context, steps, verify_result)
	steps.append("verification complete")
	if options.confirm_activation:
		activation = _activate_rankings_until_complete(context)
		steps.append(f"activation complete: {activation['activatedRankings']} rankings")
	else:
		steps.append("activation skipped; pass --confirm-activation to publish")
	return _write_ranking_run_report(context, steps, verify_result)


def _ranking_query(context: SeedRunContext, function_path: str) -> JsonObject:
	return context.client.query(
		function_path,
		{
			"datasetKey": context.compiled["datasetKey"],
			"releaseId": context.compiled["releaseId"],
			"rankingSeeds": _require_ranking_seeds(context.compiled),
		},
	)


def _activate_rankings_until_complete(context: SeedRunContext) -> JsonObject:
	result = _run_ranking_lifecycle_until_complete(
		context,
		SEED_RANKINGS_ACTIVATE_FUNCTION,
		{
			"datasetKey": context.compiled["datasetKey"],
			"releaseId": context.compiled["releaseId"],
			"queueAggregates": False,
		},
		active_release_id=context.compiled["releaseId"],
	)
	_queue_active_ranking_aggregates_if_changed(context, result)
	return result


def _rollback_rankings_until_complete(
	context: SeedRunContext, target_release_id: str
) -> JsonObject:
	# convex auto-discovers what to roll back from publishedRankings, so the
	# only release id that matters is the one becoming active again
	result = _run_ranking_lifecycle_until_complete(
		context,
		SEED_RANKINGS_ROLLBACK_FUNCTION,
		{
			"datasetKey": context.compiled["datasetKey"],
			"targetReleaseId": target_release_id,
		},
		active_release_id=target_release_id,
	)
	_queue_active_ranking_aggregates_if_changed(context, result)
	return result


def _run_ranking_lifecycle_until_complete(
	context: SeedRunContext,
	function_path: str,
	args: JsonObject,
	active_release_id: str,
) -> JsonObject:
	# active_release_id is the release that becomes active after the call —
	# the compiled releaseId for activate, the targetReleaseId for rollback.
	# downstream aggregate-queue calls scan THIS release's rows.
	totals: JsonObject = {
		"datasetKey": context.compiled["datasetKey"],
		"releaseId": active_release_id,
		"activatedRankings": 0,
		"rolledBackRankings": 0,
		"aggregateJobsQueued": 0,
	}
	for batch_number in range(1, MAX_RANKING_ACTIVATION_BATCHES + 1):
		try:
			result = context.client.mutation(function_path, args)
		except ConvexClientError as error:
			if not is_convex_write_rate_error(error):
				raise
			context.progress.log("ranking activation throttled; retrying shortly")
			time.sleep(RANKING_ACTIVATION_THROTTLE_SECONDS)
			continue
		changed = int(result.get("activatedRankings", 0)) + int(result.get("rolledBackRankings", 0))
		for key in ("activatedRankings", "rolledBackRankings", "aggregateJobsQueued"):
			totals[key] = int(totals.get(key, 0)) + int(result.get(key, 0))
		if changed == 0:
			return totals
		context.progress.log(
			"ranking activation batches: "
			f"{batch_number} ({totals['activatedRankings']} activated, "
			f"{totals['rolledBackRankings']} rolled back)"
		)
	msg = "ranking activation did not converge within batch limit"
	raise RuntimeError(msg)


def _queue_active_ranking_aggregates_if_changed(
	context: SeedRunContext, result: JsonObject
) -> None:
	changed = int(result.get("activatedRankings", 0)) + int(result.get("rolledBackRankings", 0))
	if changed == 0:
		return
	queued = context.client.mutation(
		SEED_RANKINGS_QUEUE_AGGREGATES_FUNCTION,
		{
			"datasetKey": context.compiled["datasetKey"],
			"releaseId": result["releaseId"],
		},
	)
	result["aggregateJobsQueued"] = int(result.get("aggregateJobsQueued", 0)) + int(
		queued.get("aggregateJobsQueued", 0)
	)


def _require_ranking_seeds(compiled: JsonObject) -> JsonObject:
	ranking_seeds = compiled.get("rankingSeeds")
	if not isinstance(ranking_seeds, dict):
		msg = "compiled manifest does not include rankingSeeds"
		raise RuntimeError(msg)
	return ranking_seeds


def _rankings_applied(result: JsonObject) -> int:
	return int(result.get("sampleRankingsApplied", 0)) + int(
		result.get("curatedRankingsApplied", 0)
	)


def _apply_rankings_with_authors(
	context: SeedRunContext,
	ranking_seeds: JsonObject,
) -> JsonObject:
	author_password = context.client.settings.author_password
	if not author_password:
		msg = "CONVEX_SEED_AUTHOR_PASSWORD is not set"
		raise RuntimeError(msg)
	author_result = _ensure_ranking_authors(context, ranking_seeds, author_password)
	return _apply_ranking_targets(context, ranking_seeds, author_result)


def _apply_ranking_targets(
	context: SeedRunContext,
	ranking_seeds: JsonObject,
	author_result: JsonObject,
) -> JsonObject:
	chunks = _ranking_seed_target_manifests(ranking_seeds)
	if not chunks:
		msg = "compiled rankingSeeds does not include targets"
		raise RuntimeError(msg)

	def _label(chunk: JsonObject) -> str:
		target = as_list(chunk.get("targets"))[0]
		return (
			str(target.get("templateExternalId")) if isinstance(target, dict) else "unknown target"
		)

	def _apply_one(chunk: JsonObject) -> JsonObject:
		return _run_ranking_action_with_retries(
			context,
			SEED_RANKINGS_APPLY_FUNCTION,
			{
				**run_request(context),
				"rankingSeeds": chunk,
			},
			f"ranking target {_label(chunk)}",
		)

	results: list[JsonObject] = []
	for index, chunk in enumerate(chunks, start=1):
		results.append(_apply_one(chunk))
		context.progress.log(f"ranking target {index}/{len(chunks)}: {_label(chunk)}")
		if index < len(chunks):
			time.sleep(RANKING_APPLY_TARGET_COOLDOWN_SECONDS)
	merged = _merge_apply_results(context, results, author_result)
	cleanup = _cleanup_stale_ranking_rows(context, ranking_seeds)
	# cleanup deletions are tracked separately from replacement rewrites —
	# rankingsReplaced means "rewrote existing seed row with new content"; a
	# cleanup deletion means "manifest no longer plans this row". conflating
	# them would skew the change-detection that drives aggregate requeueing
	merged["rankingsCleaned"] = int(cleanup.get("rankingsDeleted", 0))
	merged["boardsCleaned"] = int(cleanup.get("boardsDeleted", 0))
	return merged


def _ranking_apply_retry_delay(attempt: int) -> float:
	return min(
		RANKING_APPLY_THROTTLE_MAX_SECONDS,
		RANKING_APPLY_THROTTLE_BASE_SECONDS * (2 ** max(0, attempt - 1)),
	)


def _run_ranking_action_with_retries(
	context: SeedRunContext,
	function_path: str,
	args: JsonObject,
	throttle_label: str,
) -> JsonObject:
	for attempt in range(1, MAX_RANKING_APPLY_ATTEMPTS + 1):
		try:
			return context.client.action(function_path, args)
		except ConvexClientError as error:
			if not is_convex_write_rate_error(error) or attempt >= MAX_RANKING_APPLY_ATTEMPTS:
				raise
			delay = _ranking_apply_retry_delay(attempt)
			context.progress.log(
				f"{throttle_label} throttled by write-rate limit; retrying in {delay:.1f}s"
			)
			time.sleep(delay)
	msg = f"{throttle_label} retry loop exited unexpectedly"
	raise RuntimeError(msg)


def _cleanup_stale_ranking_rows(
	context: SeedRunContext,
	ranking_seeds: JsonObject,
) -> JsonObject:
	context.progress.log("cleaning stale ranking seed rows")
	return _run_ranking_action_with_retries(
		context,
		SEED_RANKINGS_CLEANUP_STALE_FUNCTION,
		{
			**run_request(context),
			"rankingSeeds": ranking_seeds,
		},
		"ranking stale cleanup",
	)


def _ensure_ranking_authors(
	context: SeedRunContext,
	ranking_seeds: JsonObject,
	author_password: str,
) -> JsonObject:
	context.progress.log("ensuring ranking seed authors")
	return context.client.action(
		SEED_RANKINGS_ENSURE_AUTHORS_FUNCTION,
		{
			**run_request(context),
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


# canonical diagnostic identity tuple matches the Convex SeedDiagnosticRow
# shape ({severity, code, path, message}); same tuple is used both client-side
# (here) and on the server to dedup across chunks
_DIAGNOSTIC_KEY_FIELDS = ("severity", "code", "path", "message")
# numeric fields aggregated across per-target apply responses
_APPLY_RESULT_TOTAL_FIELDS = (
	"boardsReplaced",
	"rankingsReplaced",
	"rankingsUnchanged",
	"sampleRankingsApplied",
	"curatedRankingsApplied",
	"rankingTiersWritten",
	"rankingItemsWritten",
)


def _diagnostic_key(item: JsonObject) -> tuple[str, ...]:
	return tuple(str(item.get(field)) for field in _DIAGNOSTIC_KEY_FIELDS)


def _merge_apply_results(
	context: SeedRunContext,
	results: list[JsonObject],
	author_result: JsonObject,
) -> JsonObject:
	diagnostics: list[object] = []
	seen_diagnostics: set[tuple[str, ...]] = set()

	def append_diagnostics(rows: object) -> None:
		for item in as_list(rows):
			if not isinstance(item, dict):
				continue
			key = _diagnostic_key(item)
			if key in seen_diagnostics:
				continue
			seen_diagnostics.add(key)
			diagnostics.append(item)

	append_diagnostics(author_result.get("diagnostics"))
	merged: JsonObject = {
		"datasetKey": context.compiled["datasetKey"],
		"releaseId": context.compiled["releaseId"],
		"authorsCreated": int(author_result.get("authorsCreated", 0)),
		"authorsReused": int(author_result.get("authorsReused", 0)),
		"authorsPatched": int(author_result.get("authorsPatched", 0)),
		"rankingsCleaned": 0,
		"boardsCleaned": 0,
		"aggregateLanes": [],
		"diagnostics": diagnostics,
		**{field: 0 for field in _APPLY_RESULT_TOTAL_FIELDS},
	}
	lane_totals: dict[tuple[str, str], JsonObject] = {}
	for result in results:
		for key in _APPLY_RESULT_TOTAL_FIELDS:
			merged[key] = int(merged[key]) + int(result.get(key, 0))
		append_diagnostics(result.get("diagnostics"))
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


def _ranking_summary_extras(result: JsonObject) -> list[str]:
	return [
		f"- Targets: {result.get('targetCount', 0)}",
		f"- Profiles: {result.get('profileCount', 0)}",
		f"- Authors required: {result.get('authorCount', 0)}",
		f"- Sample rankings planned: {result.get('sampleRankingsPlanned', 0)}",
		f"- Curated rankings planned: {result.get('curatedRankingsPlanned', 0)}",
		f"- Existing seed rankings: {result.get('existingSeedRankings', 0)}",
		f"- Existing active seed rankings: {result.get('existingActiveSeedRankings', 0)}",
	]


_RANKING_REPORT_TITLES = {
	"preflight": "Ranking Seed Preflight Report",
	"verify": "Ranking Seed Verify Report",
	"run": "Ranking Seed Run Report",
}

_RANKING_REPORT_FILENAMES = {
	"preflight": "ranking-preflight.md",
	"verify": "ranking-verify.md",
	"run": "ranking-run.md",
	"apply": "ranking-apply.md",
	"activation": "ranking-activation.md",
}


def _write_ranking_summary_report(
	context: SeedRunContext,
	kind: str,
	result: JsonObject,
) -> Path:
	lines = report_header(
		context, _RANKING_REPORT_TITLES[kind], extra=_ranking_summary_extras(result)
	)
	_append_ranking_lanes(lines, result.get("aggregateLanes", []))
	_append_diagnostics(lines, result.get("diagnostics", []))
	return write_report(context, _RANKING_REPORT_FILENAMES[kind], lines)


def _write_ranking_apply_report(
	context: SeedRunContext,
	result: JsonObject,
	dry_run: bool = False,
) -> Path:
	rankings_applied = _rankings_applied(result)
	lines = report_header(
		context,
		"Ranking Seed Apply Report",
		dry_run=dry_run,
		extra=[
			f"- Authors created: {result.get('authorsCreated', 0)}",
			f"- Authors reused: {result.get('authorsReused', 0)}",
			f"- Authors patched: {result.get('authorsPatched', 0)}",
			f"- Rankings applied: {rankings_applied}",
			f"- Sample rankings: {result.get('sampleRankingsApplied', 0)}",
			f"- Curated rankings: {result.get('curatedRankingsApplied', 0)}",
			f"- Boards replaced: {result.get('boardsReplaced', 0)}",
			f"- Rankings replaced: {result.get('rankingsReplaced', 0)}",
			f"- Rankings unchanged: {result.get('rankingsUnchanged', 0)}",
			f"- Rankings cleaned (stale): {result.get('rankingsCleaned', 0)}",
			f"- Boards cleaned (stale): {result.get('boardsCleaned', 0)}",
			f"- Ranking tiers written: {result.get('rankingTiersWritten', 0)}",
			f"- Ranking items written: {result.get('rankingItemsWritten', 0)}",
		],
	)
	_append_ranking_lanes(lines, result.get("aggregateLanes", []))
	_append_diagnostics(lines, result.get("diagnostics", []))
	return write_report(context, _RANKING_REPORT_FILENAMES["apply"], lines)


def _write_ranking_activation_report(
	context: SeedRunContext,
	result: JsonObject,
	rollback: bool = False,
) -> Path:
	title = "Ranking Seed Rollback Report" if rollback else "Ranking Seed Activation Report"
	lines = report_header(
		context,
		title,
		extra=[
			f"- Activated rankings: {result.get('activatedRankings', 0)}",
			f"- Rolled back rankings: {result.get('rolledBackRankings', 0)}",
			f"- Aggregate jobs queued: {result.get('aggregateJobsQueued', 0)}",
		],
	)
	return write_report(context, _RANKING_REPORT_FILENAMES["activation"], lines)


def _write_ranking_run_report(
	context: SeedRunContext,
	steps: list[str],
	result: JsonObject,
) -> Path:
	lines = report_header(
		context, _RANKING_REPORT_TITLES["run"], extra=_ranking_summary_extras(result)
	)
	lines.extend(["## Steps", ""])
	lines.extend(f"- {step}" for step in steps)
	lines.append("")
	_append_ranking_lanes(lines, result.get("aggregateLanes", []))
	_append_diagnostics(lines, result.get("diagnostics", []))
	return write_report(context, _RANKING_REPORT_FILENAMES["run"], lines)


def _append_ranking_lanes(lines: list[str], lanes: object) -> None:
	lane_list = [lane for lane in as_list(lanes) if isinstance(lane, dict)]
	_append_section(
		lines,
		"Ranking Lanes",
		lane_list,
		lambda lane: (
			"- "
			f"`{lane.get('templateExternalId')}` / `{lane.get('criterionExternalId')}`: "
			f"{lane.get('sampleRankings', 0)} sample, "
			f"{lane.get('curatedRankings', 0)} curated"
		),
	)


def _append_diagnostics(lines: list[str], diagnostics: object) -> None:
	rows = [item for item in as_list(diagnostics) if isinstance(item, dict)]
	_append_section(
		lines,
		"Diagnostics",
		rows,
		lambda item: (
			f"- `{item.get('severity')}` `{item.get('code')}` "
			f"{item.get('path')}: {item.get('message')}"
		),
	)
