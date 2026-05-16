# scripts/seed_pipeline/seed_pipeline/build.py
# compile source manifests into local cache artifacts

from __future__ import annotations

import json
import re
from pathlib import Path

from jsonschema import Draft202012Validator

from .assets import (
    SourceAsset,
    compile_asset,
    inspect_source,
    sha256_file,
    variant_policy_fingerprint,
)
from .crop import RatioDecision, resolve_item_transform, resolve_ratio_decision
from .manifest import JsonObject, read_json, repo_relative, write_json
from .progress import ProgressLogger, progress_interval
from .ranking_config import compile_ranking_seeds
from .reports import write_preflight_report
from .settings import (
    CACHE_ROOT_RELATIVE_PATH,
    COMPILE_FINGERPRINT_FILENAME,
    COMPILE_FINGERPRINT_SCHEMA_VERSION,
    COMPILED_SCHEMA_RELATIVE_PATH,
    DETERMINISTIC_GENERATED_AT,
    INSPECT_CACHE_SCHEMA_VERSION,
    SOURCE_SCHEMA_RELATIVE_PATH,
    VARIANT_META_SCHEMA_VERSION,
    VARIANT_SPEC_VERSION,
)
from .sidecars import read_sidecar_json, write_sidecar_json
from .validate import (
    ManifestValidationError,
    ValidationDiagnostic,
    validate_source_manifest,
)


def build_compiled_manifest(
    manifest_path: Path,
    repo_root: Path,
    fail_on_warning: bool = False,
) -> Path:
    return build_compiled_manifest_with_data(
        manifest_path, repo_root, fail_on_warning
    )[0]


def build_compiled_manifest_with_data(
    manifest_path: Path,
    repo_root: Path,
    fail_on_warning: bool = False,
    progress: ProgressLogger | None = None,
) -> tuple[Path, JsonObject]:
    progress = progress or ProgressLogger("build")
    # peek at the top-level fingerprint before doing any per-source work; on a
    # warm tree this returns immediately and skips validation + compile entirely
    cached = _try_compile_cache_hit(
        manifest_path, repo_root, fail_on_warning, progress
    )
    if cached is not None:
        return cached
    progress.log(
        f"validating source manifest: {repo_relative(manifest_path, repo_root)}"
    )
    validation = validate_source_manifest(manifest_path, repo_root)
    if validation.errors:
        raise ManifestValidationError(validation.errors)
    if fail_on_warning and validation.warnings:
        raise ManifestValidationError(validation.warnings)
    manifest = validation.manifest
    cache_root = (
        repo_root
        / CACHE_ROOT_RELATIVE_PATH
        / manifest["datasetKey"]
        / manifest["releaseId"]
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
    progress.log(
        f"writing compiled manifest: {repo_relative(compiled_path, repo_root)}"
    )
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
            f"template {index}/{templates_total}: {template['externalId']} "
            f"({item_total} items)"
        )
        compiled_template = _compile_template(
            template, repo_root, variants_dir, progress
        )
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
            variant["byteSize"]
            for asset in assets
            for variant in asset["variants"].values()
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
    item_sources = []
    item_total = len(template["items"])
    log_every = progress_interval(item_total)
    for index, item in enumerate(template["items"], start=1):
        item_sources.append(inspect_source(folder / item["image"], repo_root))
        progress.count(
            f"{template['externalId']} inspect",
            index,
            item_total,
            every=log_every,
        )
    # use source pixels, not configured intent, to select the template display ratio
    ratio_decision = resolve_ratio_decision(
        source.aspect_ratio for source in item_sources
    )
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
    if "suggestedTiers" in template:
        compiled["suggestedTiers"] = template["suggestedTiers"]
    for order, item in enumerate(template["items"]):
        source = item_sources[order]
        compiled["items"].append(
            _compile_item(
                item,
                order,
                source,
                template["labelPolicy"],
                repo_root,
                variants_dir,
                ratio_decision,
            )
        )
        progress.count(
            f"{template['externalId']} variants",
            order + 1,
            item_total,
            every=log_every,
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
) -> JsonObject:
    # transforms are derived after the template ratio is fixed
    transform = resolve_item_transform(
        source.aspect_ratio,
        source.content_bbox,
        ratio_decision.item_aspect_ratio,
        ratio_decision.ratio_source,
    )
    # transform is null when natural rendering already matches the template ratio
    return {
        "externalId": item["externalId"],
        "order": order,
        "image": item["image"],
        "label": _resolve_item_label(item, source, label_policy),
        "aspectRatio": source.aspect_ratio,
        "transform": transform,
        "asset": compile_asset(source.path, repo_root, variants_dir, source),
    }


def _resolve_item_label(
    item: JsonObject, source: SourceAsset, label_policy: str
) -> str | None:
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
    schema = read_json(repo_root / COMPILED_SCHEMA_RELATIVE_PATH)
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
    raw_manifest = _peek_manifest(manifest_path)
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
    if (
        not fingerprint_path.is_file()
        or not compiled_path.is_file()
        or not variants_dir.is_dir()
    ):
        return None
    cached_fingerprint = read_sidecar_json(fingerprint_path)
    if cached_fingerprint is None:
        return None
    if cached_fingerprint.get("schemaVersion") != COMPILE_FINGERPRINT_SCHEMA_VERSION:
        return None
    try:
        current_fingerprint = _compute_compile_fingerprint(
            manifest_path, raw_manifest, repo_root
        )
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
        progress.log(
            f"compile cache hit: {repo_relative(compiled_path, repo_root)}"
        )
    return compiled_path, compiled


def _compiled_variants_present(compiled: JsonObject) -> bool:
    templates = compiled.get("templates")
    if not isinstance(templates, list):
        return False
    for template in templates:
        if not isinstance(template, dict):
            return False
        for item in template.get("items") or []:
            if not isinstance(item, dict):
                return False
            if not _asset_variants_present(item.get("asset")):
                return False
        cover = template.get("coverImage")
        if cover is not None and not _asset_variants_present(cover):
            return False
    return True


def _asset_variants_present(asset: object) -> bool:
    if not isinstance(asset, dict):
        return False
    variants = asset.get("variants")
    if not isinstance(variants, dict):
        return False
    for variant in variants.values():
        if not isinstance(variant, dict):
            return False
        path_value = variant.get("path")
        if not isinstance(path_value, str):
            return False
        if not Path(path_value).is_file():
            return False
    return True


def _peek_manifest(manifest_path: Path) -> JsonObject | None:
    try:
        with manifest_path.open("r", encoding="utf-8") as file:
            value = json.load(file)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None
    return value if isinstance(value, dict) else None


def _compute_compile_fingerprint(
    manifest_path: Path,
    manifest: JsonObject,
    repo_root: Path,
) -> JsonObject:
    repo_resolved = repo_root.resolve()
    manifest_resolved = manifest_path.resolve()
    sources: list[Path] = []
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
            sources.append(folder / image)
        cover = template.get("coverImage")
        if isinstance(cover, str):
            sources.append(repo_root / cover)
    source_entries = []
    for source_path in sources:
        resolved = source_path.resolve()
        stat = resolved.stat()
        # mtime+size invalidation matches the per-source inspect sidecar so the
        # two layers stay coherent: any change here also evicts inspect entries
        source_entries.append(
            {
                "path": resolved.relative_to(repo_resolved).as_posix(),
                "mtimeNs": stat.st_mtime_ns,
                "byteSize": stat.st_size,
            }
        )
    source_entries.sort(key=lambda entry: entry["path"])
    return {
        "schemaVersion": COMPILE_FINGERPRINT_SCHEMA_VERSION,
        # repoRoot guards against the cached compiled-manifest carrying absolute
        # sourcePath strings that no longer point anywhere after a repo move
        "repoRoot": str(repo_resolved),
        "manifestPath": manifest_resolved.relative_to(repo_resolved).as_posix(),
        "manifestSha": sha256_file(manifest_resolved),
        # schema shas catch the case where validation rules change without any
        # source file changing; compiled output could become silently invalid
        "sourceSchemaSha": sha256_file(repo_root / SOURCE_SCHEMA_RELATIVE_PATH),
        "compiledSchemaSha": sha256_file(repo_root / COMPILED_SCHEMA_RELATIVE_PATH),
        "variantSpecVersion": VARIANT_SPEC_VERSION,
        "variantPolicy": variant_policy_fingerprint(),
        "inspectCacheSchemaVersion": INSPECT_CACHE_SCHEMA_VERSION,
        "variantMetaSchemaVersion": VARIANT_META_SCHEMA_VERSION,
        "totalSources": len(source_entries),
        "sources": source_entries,
    }


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
