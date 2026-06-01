# scripts/seed_pipeline/seed_pipeline/run_context.py
# shared seed run options, context loading, checkpointing, and write guards

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

from .build import build_compiled_manifest_with_data
from .convex_client import ConvexSeedClient, read_seed_settings
from .manifest import JsonObject, read_json, write_json
from .progress import ProgressLogger


SEED_BEGIN_FUNCTION = "marketplace/seed/templates/endpoints:beginSeedRun"


@dataclass(frozen=True)
class SeedRunOptions:
	env_name: str
	convex_url: str | None = None
	seed_secret: str | None = None
	run_id: str | None = None
	dry_run: bool = False
	yes: bool = False
	fail_on_warning: bool = False
	max_upload_bytes: int | None = None
	confirm_activation: bool = False
	previous_release_id: str | None = None
	target_release_id: str | None = None
	state_json: Path | None = None


@dataclass(frozen=True)
class SeedRunContext:
	compiled_path: Path
	compiled: JsonObject
	client: ConvexSeedClient
	checkpoint_path: Path
	checkpoint: JsonObject
	progress: ProgressLogger
	# memoization for compiled-payload builds; build_*_upserts each iterate
	# every template/item/criterion, so caching avoids rebuilding them across
	# the hash-skip check and the actual upsert phase in run_seed_manifest
	payload_cache: dict[str, list[JsonObject]] = field(default_factory=dict)


def load_context(
	manifest_path: Path,
	repo_root: Path,
	options: SeedRunOptions,
	label: str,
) -> SeedRunContext:
	progress = ProgressLogger(label)
	compiled_path, compiled = build_compiled_manifest_with_data(
		manifest_path,
		repo_root,
		fail_on_warning=options.fail_on_warning,
		progress=progress,
	)
	totals = compiled["totals"]
	progress.log(
		"compiled manifest ready: "
		f"{totals['templateCount']} templates, "
		f"{totals['itemCount']} items, "
		f"{totals['sourceImageCount']} source images, "
		f"{totals['variantCount']} variants"
	)
	progress.log(f"loading seed settings for {options.env_name}")
	settings = read_seed_settings(
		repo_root, options.env_name, options.convex_url, options.seed_secret
	)
	checkpoint_path = compiled_path.parent / "run.json"
	checkpoint = load_checkpoint(checkpoint_path)
	if not checkpoint_matches(checkpoint, compiled, options.env_name):
		checkpoint = {}
	# reuse runId by default so interrupted commands resume the same server row
	checkpoint.setdefault("datasetKey", compiled["datasetKey"])
	checkpoint.setdefault("releaseId", compiled["releaseId"])
	checkpoint.setdefault("env", options.env_name)
	checkpoint["runId"] = options.run_id or checkpoint.get("runId") or new_run_id(compiled)
	checkpoint.setdefault("uploadedStorageIds", [])
	return SeedRunContext(
		compiled_path=compiled_path,
		compiled=compiled,
		client=ConvexSeedClient(settings),
		checkpoint_path=checkpoint_path,
		checkpoint=checkpoint,
		progress=progress,
	)


def begin_seed_run(context: SeedRunContext) -> None:
	totals = context.compiled["totals"]
	context.progress.log(
		"starting seed run: "
		f"{totals['templateCount']} templates, "
		f"{totals['itemCount']} items, "
		f"{totals['variantCount']} image variants"
	)
	result = context.client.mutation(
		SEED_BEGIN_FUNCTION,
		{
			**run_request(context),
			"templateCount": totals["templateCount"],
			"itemCount": totals["itemCount"],
			"imageVariantCount": totals["variantCount"],
		},
	)
	context.checkpoint["run"] = result["run"]
	write_checkpoint(context)


def run_request(context: SeedRunContext) -> JsonObject:
	return {
		"datasetKey": context.compiled["datasetKey"],
		"releaseId": context.compiled["releaseId"],
		"runId": context.checkpoint["runId"],
	}


def assert_write_allowed(options: SeedRunOptions, command: str) -> None:
	if options.dry_run:
		return
	if is_production_env(options.env_name) and not options.yes:
		msg = f"{command} against production requires --yes"
		raise RuntimeError(msg)


def is_production_env(env_name: str) -> bool:
	normalized = env_name.strip().lower()
	return normalized in {"prod", "production"} or normalized.startswith(
		("prod-", "prod_", "prod:", "production-", "production_", "production:")
	)


def load_checkpoint(path: Path) -> JsonObject:
	if not path.is_file():
		return {}
	return read_json(path)


def checkpoint_matches(
	checkpoint: JsonObject,
	compiled: JsonObject,
	env_name: str,
) -> bool:
	if not checkpoint:
		return True
	return (
		checkpoint.get("datasetKey") == compiled["datasetKey"]
		and checkpoint.get("releaseId") == compiled["releaseId"]
		and checkpoint.get("env") == env_name
	)


def write_checkpoint(context: SeedRunContext) -> None:
	write_json(context.checkpoint_path, context.checkpoint)


def new_run_id(compiled: JsonObject) -> str:
	timestamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
	return f"{compiled['releaseId']}-{timestamp}-{uuid.uuid4().hex[:8]}"
