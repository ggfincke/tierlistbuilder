# scripts/seed_pipeline/seed_pipeline/build.py
# compile source manifests into local cache artifacts

from __future__ import annotations

import re
from pathlib import Path

from jsonschema import Draft202012Validator

from .assets import SourceAsset, compile_asset, inspect_source
from .crop import RatioDecision, resolve_item_transform, resolve_ratio_decision
from .manifest import JsonObject, read_json, repo_relative, write_json
from .progress import ProgressLogger, progress_interval
from .ranking_config import compile_ranking_seeds
from .reports import write_preflight_report
from .settings import (
    CACHE_ROOT_RELATIVE_PATH,
    COMPILED_SCHEMA_RELATIVE_PATH,
    DETERMINISTIC_GENERATED_AT,
    VARIANT_SPEC_VERSION,
)
from .validate import ManifestValidationError, validate_source_manifest


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
