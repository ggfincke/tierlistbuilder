# scripts/seed_pipeline/seed_pipeline/build.py
# compile source manifests into local cache artifacts

from __future__ import annotations

from pathlib import Path

from jsonschema import Draft202012Validator

from .assets import compile_asset
from .manifest import JsonObject, read_json, repo_relative, write_json
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
    # compile is local-only until the Convex ingest API exists
    compiled = _compile(manifest, manifest_path, repo_root, variants_dir)
    _assert_compiled_schema(compiled, repo_root)
    compiled_path = cache_root / "compiled-manifest.json"
    write_json(compiled_path, compiled)
    write_preflight_report(
        reports_dir / "preflight.md",
        compiled,
        warning_count=len(validation.warnings),
        error_count=len(validation.errors),
    )
    return compiled_path


def _compile(
    manifest: JsonObject,
    manifest_path: Path,
    repo_root: Path,
    variants_dir: Path,
) -> JsonObject:
    templates = []
    source_image_count = 0
    variant_count = 0
    estimated_bytes = 0
    criterion_count = 0
    item_count = 0
    for template in manifest["templates"]:
        compiled_template = _compile_template(template, repo_root, variants_dir)
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
    return {
        "schemaVersion": manifest["schemaVersion"],
        "datasetKey": manifest["datasetKey"],
        "releaseId": manifest["releaseId"],
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


def _compile_template(
    template: JsonObject, repo_root: Path, variants_dir: Path
) -> JsonObject:
    folder = repo_root / template["folder"]
    compiled = {
        "externalId": template["externalId"],
        "folder": template["folder"],
        "title": template["title"],
        "category": template["category"],
        "description": template["description"],
        "tags": template["tags"],
        "visibility": template["visibility"],
        "labelPolicy": template["labelPolicy"],
        "criteria": template["criteria"],
        "items": [],
    }
    if "coverImage" in template:
        compiled["coverImage"] = compile_asset(
            repo_root / template["coverImage"], repo_root, variants_dir
        )
    if "coverZoom" in template:
        compiled["coverZoom"] = template["coverZoom"]
    for order, item in enumerate(template["items"]):
        compiled["items"].append(
            {
                "externalId": item["externalId"],
                "order": order,
                "image": item["image"],
                "label": item["label"],
                "asset": compile_asset(folder / item["image"], repo_root, variants_dir),
            }
        )
    return compiled


def _assert_compiled_schema(compiled: JsonObject, repo_root: Path) -> None:
    schema = read_json(repo_root / COMPILED_SCHEMA_RELATIVE_PATH)
    validator = Draft202012Validator(schema)
    errors = sorted(validator.iter_errors(compiled), key=lambda item: item.json_path)
    if errors:
        # fail fast so later phases can trust compiled manifests on disk
        messages = "\n".join(f"{error.json_path}: {error.message}" for error in errors)
        raise ValueError(f"compiled manifest failed schema validation\n{messages}")
