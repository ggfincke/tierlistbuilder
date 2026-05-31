# scripts/seed_pipeline/seed_pipeline/build.py
# compile source manifests into local cache artifacts

from __future__ import annotations

import json
import os
import re
from pathlib import Path

from jsonschema import Draft202012Validator

from .assets import (
	SourceAsset,
	asset_variants,
	compile_asset,
	inspect_source,
	sha256_file,
	variant_policy_fingerprint,
)
from .concurrency import run_in_parallel
from .crop import RatioDecision, resolve_item_transform, resolve_ratio_decision
from .manifest import (
	JsonObject,
	read_json,
	repo_relative,
	write_json,
)
from .progress import ProgressLogger, progress_interval
from .ranking_config import compile_ranking_seeds
from .reports import write_preflight_report
from .settings import (
	CACHE_ROOT_RELATIVE_PATH,
	COMPILE_FINGERPRINT_FILENAME,
	COMPILE_FINGERPRINT_SCHEMA_VERSION,
	COMPILED_SCHEMA_PATH,
	DETERMINISTIC_GENERATED_AT,
	INSPECT_CACHE_SCHEMA_VERSION,
	VARIANT_META_SCHEMA_VERSION,
	VARIANT_SPEC_VERSION,
)
from .sidecars import read_sidecar_json, write_sidecar_json
from .source import list_source_files, list_source_schema_paths
from .validate import (
	ManifestValidationError,
	ValidationDiagnostic,
	validate_source_manifest,
)


BUILD_WORKERS = max(os.cpu_count() or 1, 1)
AUTO_PLATE_MEDIA_PLATE_SUPPRESSING_MODES = frozenset({"off", "uniform"})


def build_compiled_manifest(
	manifest_path: Path,
	repo_root: Path,
	fail_on_warning: bool = False,
) -> Path:
	return build_compiled_manifest_with_data(manifest_path, repo_root, fail_on_warning)[0]


def build_compiled_manifest_with_data(
	manifest_path: Path,
	repo_root: Path,
	fail_on_warning: bool = False,
	progress: ProgressLogger | None = None,
) -> tuple[Path, JsonObject]:
	progress = progress or ProgressLogger("build")
	# peek at the top-level fingerprint before doing any per-source work; on a
	# warm tree this returns immediately and skips validation + compile entirely
	cached = _try_compile_cache_hit(manifest_path, repo_root, fail_on_warning, progress)
	if cached is not None:
		return cached
	progress.log(f"validating source manifest: {repo_relative(manifest_path, repo_root)}")
	validation = validate_source_manifest(manifest_path, repo_root)
	if validation.errors:
		raise ManifestValidationError(validation.errors)
	if fail_on_warning and validation.warnings:
		raise ManifestValidationError(validation.warnings)
	manifest = validation.manifest
	cache_root = (
		repo_root / CACHE_ROOT_RELATIVE_PATH / manifest["datasetKey"] / manifest["releaseId"]
	)
	variants_dir = cache_root / "variants"
	reports_dir = cache_root / "reports"
	# compile all data locally before any upload/apply command can mutate Convex
	progress.log(
		f"compiling {len(manifest['templates'])} templates for "
		f"{manifest['datasetKey']}:{manifest['releaseId']}"
	)
	compiled = _compile(manifest, manifest_path, repo_root, variants_dir, progress)
	progress.log("validating compiled manifest schema")
	_assert_compiled_schema(compiled, repo_root)
	compiled_path = cache_root / "compiled-manifest.json"
	progress.log(f"writing compiled manifest: {repo_relative(compiled_path, repo_root)}")
	write_json(compiled_path, compiled)
	write_preflight_report(
		reports_dir / "preflight.md",
		compiled,
		warning_count=len(validation.warnings),
		error_count=len(validation.errors),
	)
	# write fingerprint last so an interrupted run never produces a false cache hit
	_write_compile_fingerprint(
		cache_root / COMPILE_FINGERPRINT_FILENAME,
		manifest_path,
		manifest,
		repo_root,
		validation.warnings,
	)
	totals = compiled["totals"]
	progress.log(
		"build complete: "
		f"{totals['templateCount']} templates, "
		f"{totals['itemCount']} items, "
		f"{totals['sourceImageCount']} source images, "
		f"{totals['variantCount']} variants"
	)
	return compiled_path, compiled


def _compile(
	manifest: JsonObject,
	manifest_path: Path,
	repo_root: Path,
	variants_dir: Path,
	progress: ProgressLogger,
) -> JsonObject:
	# accumulate upload totals from compiled assets, not source manifest guesses
	templates = []
	source_image_count = 0
	variant_count = 0
	estimated_bytes = 0
	criterion_count = 0
	item_count = 0
	templates_total = len(manifest["templates"])
	for index, template in enumerate(manifest["templates"], start=1):
		item_total = len(template["items"])
		progress.log(
			f"template {index}/{templates_total}: {template['externalId']} ({item_total} items)"
		)
		compiled_template = _compile_template(template, repo_root, variants_dir, progress)
		templates.append(compiled_template)
		criterion_count += len(compiled_template["criteria"])
		item_count += len(compiled_template["items"])
		assets = [item["asset"] for item in compiled_template["items"]]
		if compiled_template.get("coverImage") is not None:
			assets.append(compiled_template["coverImage"])
		# count covers as source images because upload/finalization treats them as media
		source_image_count += len(assets)
		variant_count += sum(len(asset["variants"]) for asset in assets)
		estimated_bytes += sum(
			variant["byteSize"] for asset in assets for variant in asset["variants"].values()
		)
	compiled = {
		"schemaVersion": manifest["schemaVersion"],
		"datasetKey": manifest["datasetKey"],
		"releaseId": manifest["releaseId"],
		"authorEmail": manifest["authorEmail"],
		"sourceManifestPath": repo_relative(manifest_path, repo_root),
		"generatedAt": DETERMINISTIC_GENERATED_AT,
		"variantSpecVersion": VARIANT_SPEC_VERSION,
		"totals": {
			"templateCount": len(templates),
			"itemCount": item_count,
			"criterionCount": criterion_count,
			"sourceImageCount": source_image_count,
			"variantCount": variant_count,
			"estimatedUploadBytes": estimated_bytes,
			"estimatedStorageBytes": estimated_bytes,
		},
		"templates": templates,
		"warnings": [],
		"errors": [],
	}
	ranking_seeds = compile_ranking_seeds(manifest, templates)
	if ranking_seeds is not None:
		compiled["rankingSeeds"] = ranking_seeds
	return compiled


def _compile_template(
	template: JsonObject,
	repo_root: Path,
	variants_dir: Path,
	progress: ProgressLogger,
) -> JsonObject:
	folder = repo_root / template["folder"]
	# probe every item first so one ratio decision covers the whole template
	items = list(template["items"])
	item_total = len(items)
	log_every = progress_interval(item_total)

	def inspect_item(item: JsonObject) -> SourceAsset:
		return inspect_source(folder / item["image"], repo_root)

	item_sources = run_in_parallel(
		items,
		inspect_item,
		BUILD_WORKERS,
		on_complete=lambda completed, total, _item: progress.count(
			f"{template['externalId']} inspect",
			completed,
			total,
			every=log_every,
		),
	)
	# use source pixels, not configured intent, to select the template display ratio
	ratio_decision = resolve_ratio_decision(source.aspect_ratio for source in item_sources)
	compiled = {
		"externalId": template["externalId"],
		"folder": template["folder"],
		"title": template["title"],
		"category": template["category"],
		"description": template["description"],
		"tags": template["tags"],
		"visibility": template["visibility"],
		"labelPolicy": template["labelPolicy"],
		"itemAspectRatio": ratio_decision.item_aspect_ratio,
		"defaultItemImagePadding": template.get("defaultItemImagePadding"),
		"ratioSource": ratio_decision.ratio_source,
		"criteria": template["criteria"],
		"items": [],
	}
	if "coverImage" in template:
		# cover media follows the same variant pipeline but does not affect item ratio
		progress.log(f"{template['externalId']} cover variants")
		compiled["coverImage"] = compile_asset(
			repo_root / template["coverImage"], repo_root, variants_dir
		)
	if "coverZoom" in template:
		compiled["coverZoom"] = template["coverZoom"]
	if "labels" in template:
		compiled["labels"] = template["labels"]
	if "autoPlate" in template:
		compiled["autoPlate"] = template["autoPlate"]
	if "suggestedTiers" in template:
		compiled["suggestedTiers"] = template["suggestedTiers"]
	auto_plate_mode = template["autoPlate"]["mode"] if "autoPlate" in template else None
	item_inputs = list(zip(range(item_total), items, item_sources, strict=True))

	def compile_item(args: tuple[int, JsonObject, SourceAsset]) -> JsonObject:
		order, item, source = args
		return _compile_item(
			item,
			order,
			source,
			template["labelPolicy"],
			repo_root,
			variants_dir,
			ratio_decision,
			auto_plate_mode,
		)

	compiled["items"] = run_in_parallel(
		item_inputs,
		compile_item,
		BUILD_WORKERS,
		on_complete=lambda completed, total, _item: progress.count(
			f"{template['externalId']} variants",
			completed,
			total,
			every=log_every,
		),
	)
	return compiled


def _compile_item(
	item: JsonObject,
	order: int,
	source: SourceAsset,
	label_policy: str,
	repo_root: Path,
	variants_dir: Path,
	ratio_decision: RatioDecision,
	auto_plate_mode: str | None = None,
) -> JsonObject:
	# transforms are derived after the template ratio is fixed
	transform = resolve_item_transform(
		source.aspect_ratio,
		source.content_bbox,
		ratio_decision.item_aspect_ratio,
		ratio_decision.ratio_source,
	)
	# off & uniform boards never render the per-item plate (off plates nothing;
	# uniform fills one color behind every tile), so drop the detector verdict to
	# keep compiled data honest & stale recommendations out of the editor swatch
	media_plate = (
		None if auto_plate_mode in AUTO_PLATE_MEDIA_PLATE_SUPPRESSING_MODES else source.media_plate
	)
	# transform is null when natural rendering already matches the template ratio
	compiled_item = {
		"externalId": item["externalId"],
		"order": order,
		"image": item["image"],
		"label": _resolve_item_label(item, source, label_policy),
		"aspectRatio": source.aspect_ratio,
		"transform": transform,
		"mediaPlate": media_plate,
		"imagePadding": item.get("imagePadding"),
		"asset": compile_asset(source.path, repo_root, variants_dir, source),
	}
	# curated per-item backdrop (e.g. a dark card for a white logo on a uniform
	# white wall). this is the manual layer & wins over board policy at render time
	if "backgroundColor" in item:
		compiled_item["backgroundColor"] = item["backgroundColor"]
	return compiled_item


def _resolve_item_label(item: JsonObject, source: SourceAsset, label_policy: str) -> str | None:
	explicit = item.get("label")
	if isinstance(explicit, str) and explicit.strip():
		if label_policy in {"explicit-required", "explicit-or-filename-fallback"}:
			return explicit
	if label_policy in {"explicit-or-filename-fallback", "filename-derived"}:
		return _label_from_filename(source.path)
	if label_policy == "hidden":
		return None
	return explicit if isinstance(explicit, str) else None


def _label_from_filename(path: Path) -> str:
	stem = re.sub(r"^[0-9]+[-_\s]+", "", path.stem)
	words = [word for word in re.split(r"[-_\s]+", stem) if word]
	return " ".join(word[:1].upper() + word[1:] for word in words)


def _assert_compiled_schema(compiled: JsonObject, repo_root: Path) -> None:
	schema = read_json(COMPILED_SCHEMA_PATH)
	validator = Draft202012Validator(schema)
	# validate generated output too; source schema alone cannot catch compiler drift
	errors = sorted(validator.iter_errors(compiled), key=lambda item: item.json_path)
	if errors:
		# fail fast so later phases can trust compiled manifests on disk
		messages = "\n".join(f"{error.json_path}: {error.message}" for error in errors)
		raise ValueError(f"compiled manifest failed schema validation\n{messages}")


def _try_compile_cache_hit(
	manifest_path: Path,
	repo_root: Path,
	fail_on_warning: bool,
	progress: ProgressLogger,
) -> tuple[Path, JsonObject] | None:
	# parse the manifest once locally to learn dataset/release before deciding
	# where the cache lives; full validation only runs on a miss
	raw_manifest = read_sidecar_json(manifest_path)
	if raw_manifest is None:
		return None
	dataset_key = raw_manifest.get("datasetKey")
	release_id = raw_manifest.get("releaseId")
	if not isinstance(dataset_key, str) or not isinstance(release_id, str):
		return None
	cache_root = repo_root / CACHE_ROOT_RELATIVE_PATH / dataset_key / release_id
	fingerprint_path = cache_root / COMPILE_FINGERPRINT_FILENAME
	compiled_path = cache_root / "compiled-manifest.json"
	variants_dir = cache_root / "variants"
	# variants must still be on disk for upload phases; if the user wiped them
	# (but left compiled-manifest.json) treat that as a miss & rebuild
	if not fingerprint_path.is_file() or not compiled_path.is_file() or not variants_dir.is_dir():
		return None
	cached_fingerprint = read_sidecar_json(fingerprint_path)
	if cached_fingerprint is None:
		return None
	if cached_fingerprint.get("schemaVersion") != COMPILE_FINGERPRINT_SCHEMA_VERSION:
		return None
	try:
		current_fingerprint = _compute_compile_fingerprint(manifest_path, raw_manifest, repo_root)
	except (OSError, KeyError, TypeError, ValueError):
		# malformed manifest or missing source — fall through to validation,
		# which will produce a real diagnostic instead of a generic exception
		return None
	if not _fingerprint_inputs_match(cached_fingerprint, current_fingerprint):
		return None
	cached_warnings = _restore_validation_warnings(cached_fingerprint)
	if fail_on_warning and cached_warnings:
		raise ManifestValidationError(cached_warnings)
	try:
		compiled = read_json(compiled_path)
	except (OSError, json.JSONDecodeError):
		return None
	# the upload phase reads each compiled variant by path. if a cleanup
	# script or a user removed individual variant files but left the
	# directory in place, treating this as a hit lets the build phase return
	# success only for the upload phase to fail opening a missing path. walk
	# the compiled tree & verify every variant file actually exists
	if not _compiled_variants_present(compiled):
		return None
	totals = compiled.get("totals")
	if isinstance(totals, dict):
		progress.log(
			"compile cache hit: "
			f"{totals.get('templateCount', '?')} templates, "
			f"{totals.get('itemCount', '?')} items, "
			f"{totals.get('sourceImageCount', '?')} source images, "
			f"{totals.get('variantCount', '?')} variants "
			f"({repo_relative(compiled_path, repo_root)})"
		)
	else:
		progress.log(f"compile cache hit: {repo_relative(compiled_path, repo_root)}")
	return compiled_path, compiled


def _compiled_variants_present(compiled: JsonObject) -> bool:
	assets = _compiled_assets(compiled)
	if assets is None:
		return False
	return all(_asset_variants_present(asset) for asset in assets)


def _compiled_assets(compiled: JsonObject) -> list[object] | None:
	templates = compiled.get("templates")
	if not isinstance(templates, list):
		return None
	assets: list[object] = []
	for template in templates:
		if not isinstance(template, dict):
			return None
		cover = template.get("coverImage")
		if cover is not None:
			assets.append(cover)
		items = template.get("items")
		if not isinstance(items, list):
			return None
		for item in items:
			if not isinstance(item, dict):
				return None
			asset = item.get("asset")
			assets.append(asset)
	return assets


def _asset_variants_present(asset: object) -> bool:
	variants = list(asset_variants(asset))
	# every compiled asset carries tile + preview + editor (see asset_variants)
	return len(variants) == 3 and all(
		_variant_path_present(variant) for variant in variants
	)


def _variant_path_present(variant: JsonObject) -> bool:
	path_value = variant.get("path")
	return isinstance(path_value, str) and Path(path_value).is_file()


def _compute_compile_fingerprint(
	manifest_path: Path,
	manifest: JsonObject,
	repo_root: Path,
) -> JsonObject:
	repo_resolved = repo_root.resolve()
	manifest_resolved = manifest_path.resolve()
	images: list[Path] = []
	templates = manifest.get("templates")
	if not isinstance(templates, list):
		raise KeyError("templates")
	for template in templates:
		if not isinstance(template, dict):
			raise KeyError("template")
		folder_rel = template.get("folder")
		if not isinstance(folder_rel, str):
			raise KeyError("template.folder")
		folder = repo_root / folder_rel
		items = template.get("items")
		if not isinstance(items, list):
			raise KeyError("template.items")
		for item in items:
			if not isinstance(item, dict):
				raise KeyError("item")
			image = item.get("image")
			if not isinstance(image, str):
				raise KeyError("item.image")
			images.append(folder / image)
		cover = template.get("coverImage")
		if isinstance(cover, str):
			images.append(repo_root / cover)
	image_entries = []
	for image_path in images:
		resolved = image_path.resolve()
		stat = resolved.stat()
		# mtime+size invalidation matches the per-source inspect sidecar so the
		# two layers stay coherent: any change here also evicts inspect entries
		image_entries.append(
			{
				"path": resolved.relative_to(repo_resolved).as_posix(),
				"mtimeNs": stat.st_mtime_ns,
				"byteSize": stat.st_size,
			}
		)
	image_entries.sort(key=lambda entry: entry["path"])
	# the composed manifest is assembled from many files (marketplace-core.json,
	# ranking-profiles.json, every _template.json). hash each so any edit invalidates
	# the cache; schema changes also count as inputs because validation rules
	# changing without any data change can still alter compiled output. schemas
	# live inside the pipeline package now, so they're keyed by basename rather
	# than a repo-relative path that wouldn't exist for installed packages or
	# temp-root test fixtures.
	source_entries = _hashed_path_entries(
		list_source_files(manifest_path, repo_root), repo_resolved
	)
	schema_entries = _hashed_package_files(list_source_schema_paths())
	return {
		"schemaVersion": COMPILE_FINGERPRINT_SCHEMA_VERSION,
		# repoRoot guards against the cached compiled-manifest carrying absolute
		# sourcePath strings that no longer point anywhere after a repo move
		"repoRoot": str(repo_resolved),
		"manifestPath": manifest_resolved.relative_to(repo_resolved).as_posix(),
		"sourceFiles": source_entries,
		"sourceSchemas": schema_entries,
		"compiledSchemaSha": sha256_file(COMPILED_SCHEMA_PATH),
		"variantSpecVersion": VARIANT_SPEC_VERSION,
		"variantPolicy": variant_policy_fingerprint(),
		"inspectCacheSchemaVersion": INSPECT_CACHE_SCHEMA_VERSION,
		"variantMetaSchemaVersion": VARIANT_META_SCHEMA_VERSION,
		"totalSources": len(image_entries),
		"sources": image_entries,
	}


def _hashed_entries(
	paths: list[Path], key: str, repo_resolved: Path | None = None
) -> list[JsonObject]:
	entries: list[JsonObject] = []
	for raw in paths:
		resolved = raw.resolve()
		value = (
			resolved.relative_to(repo_resolved).as_posix()
			if repo_resolved is not None
			else resolved.name
		)
		entries.append({key: value, "sha256": sha256_file(resolved)})
	entries.sort(key=lambda entry: entry[key])
	return entries


def _hashed_path_entries(paths: list[Path], repo_resolved: Path) -> list[JsonObject]:
	return _hashed_entries(paths, "path", repo_resolved)


def _hashed_package_files(paths: list[Path]) -> list[JsonObject]:
	return _hashed_entries(paths, "name")


def _fingerprint_inputs_match(cached: JsonObject, current: JsonObject) -> bool:
	# validationWarnings is an output bundled w/ the fingerprint, not an input;
	# comparing only inputs lets warnings replay without affecting hit/miss
	cached_inputs = {key: value for key, value in cached.items() if key != "validationWarnings"}
	return cached_inputs == current


def _restore_validation_warnings(
	fingerprint: JsonObject,
) -> tuple[ValidationDiagnostic, ...]:
	raw = fingerprint.get("validationWarnings")
	if not isinstance(raw, list):
		return ()
	restored: list[ValidationDiagnostic] = []
	for entry in raw:
		if not isinstance(entry, dict):
			continue
		try:
			restored.append(
				ValidationDiagnostic(
					code=str(entry["code"]),
					message=str(entry["message"]),
					path=str(entry["path"]),
					severity=str(entry["severity"]),
				)
			)
		except (KeyError, TypeError):
			# drop malformed warnings rather than failing the whole cache hit;
			# at worst the user sees a stale warning count, never a crash
			continue
	return tuple(restored)


def _write_compile_fingerprint(
	fingerprint_path: Path,
	manifest_path: Path,
	manifest: JsonObject,
	repo_root: Path,
	warnings: tuple[ValidationDiagnostic, ...],
) -> None:
	payload = _compute_compile_fingerprint(manifest_path, manifest, repo_root)
	payload["validationWarnings"] = [warning.to_json() for warning in warnings]
	write_sidecar_json(fingerprint_path, payload)
