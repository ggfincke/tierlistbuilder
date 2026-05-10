# scripts/seed_pipeline/seed_pipeline/runs.py
# orchestrate Convex seed uploads, applies, verification, & activation

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from .build import build_compiled_manifest_with_data
from .convex_client import ConvexSeedClient, read_seed_settings
from .diff import build_seed_diff, build_state_request
from .manifest import JsonObject, as_list, read_json, write_json
from .reports import (
    write_activation_report,
    write_apply_report,
    write_cleanup_report,
    write_diff_report,
    write_run_report,
    write_upload_report,
    write_verify_report,
)


SEED_BEGIN_FUNCTION = "marketplace/seedRuns:beginSeedRun"
SEED_STATE_FUNCTION = "marketplace/seedRuns:resolveSeedState"
SEED_UPLOAD_URLS_FUNCTION = "marketplace/seedRuns:generateSeedUploadUrls"
SEED_REGISTER_UPLOADS_FUNCTION = (
    "marketplace/seedPipeline/storageUploads:registerSeedUploadedStorageIds"
)
SEED_FINALIZE_MEDIA_FUNCTION = "marketplace/seedRuns:finalizeSeedUploadedMedia"
SEED_CLEANUP_FUNCTION = (
    "marketplace/seedPipeline/storageUploads:cleanupAbandonedSeedRun"
)
SEED_UPSERT_TEMPLATES_FUNCTION = "marketplace/seedRuns:upsertSeedTemplates"
SEED_UPSERT_ITEMS_FUNCTION = "marketplace/seedRuns:upsertSeedItems"
SEED_UPSERT_CRITERIA_FUNCTION = "marketplace/seedRuns:upsertSeedCriteria"
SEED_VERIFY_FUNCTION = "marketplace/seedRuns:verifySeedRelease"
SEED_ACTIVATE_FUNCTION = "marketplace/seedRuns:activateSeedRelease"
SEED_ROLLBACK_FUNCTION = "marketplace/seedRuns:rollbackSeedRelease"

TEMPLATE_BATCH_SIZE = 128
ITEM_BATCH_SIZE = 2048
CRITERION_BATCH_SIZE = 512
UPLOAD_URL_BATCH_SIZE = 128
FINALIZE_ASSET_BATCH_SIZE = 64
CLEANUP_STORAGE_BATCH_SIZE = 256
# bound per-asset upload concurrency. each variant POST is one HTTP request
# from a single Convex storage URL; small pool keeps RTT-bound uploads parallel
# without overwhelming the deployment
UPLOAD_WORKERS = 8

# mirror Convex defaults when a manifest omits curated template tiers
DEFAULT_SUGGESTED_TIERS = [
    {"name": "S", "colorSpec": {"kind": "palette", "index": 0}},
    {"name": "A", "colorSpec": {"kind": "palette", "index": 1}},
    {"name": "B", "colorSpec": {"kind": "palette", "index": 2}},
    {"name": "C", "colorSpec": {"kind": "palette", "index": 3}},
    {"name": "D", "colorSpec": {"kind": "palette", "index": 4}},
    {"name": "E", "colorSpec": {"kind": "palette", "index": 5}},
]

SURFACE_ASPECT_RATIOS = {
    "browseHero": 3 / 2,
    "detailHero": 4 / 3,
    "card": 16 / 10,
}


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


def upload_seed_manifest(
    manifest_path: Path,
    repo_root: Path,
    options: SeedRunOptions,
) -> Path:
    context = _load_context(manifest_path, repo_root, options)
    state = _resolve_state(context, options)
    diff = build_seed_diff(context.compiled, state)
    write_diff_report(context, state, diff, options.env_name)
    # upload a whole asset when any variant is missing so media dedupe stays exact
    assets = _assets_requiring_upload(context.compiled, state)
    _assert_write_allowed(options, "upload")
    _assert_upload_budget(assets, options.max_upload_bytes)
    if options.dry_run:
        return write_upload_report(context, assets, [], [], dry_run=True)

    _begin_seed_run(context)
    uploaded_assets = _upload_assets(context, assets)
    finalized, rejected = _finalize_uploaded_assets(context, uploaded_assets)
    _write_checkpoint(context)
    report_path = write_upload_report(context, assets, finalized, rejected)
    if rejected:
        msg = f"seed upload rejected {len(rejected)} variant(s); report: {report_path}"
        raise RuntimeError(msg)
    return report_path


def apply_seed_manifest(
    manifest_path: Path,
    repo_root: Path,
    options: SeedRunOptions,
) -> Path:
    context = _load_context(manifest_path, repo_root, options)
    _assert_write_allowed(options, "apply")
    if options.dry_run:
        return write_apply_report(context, [], [], [], dry_run=True)

    _begin_seed_run(context)
    # write parent templates before children so item/criterion upserts resolve IDs
    template_results = _upsert_templates(context)
    criterion_results = _upsert_criteria(context)
    item_results = _upsert_items(context)
    return write_apply_report(
        context, template_results, criterion_results, item_results
    )


def verify_seed_manifest(
    manifest_path: Path,
    repo_root: Path,
    options: SeedRunOptions,
) -> Path:
    context = _load_context(manifest_path, repo_root, options)
    _assert_write_allowed(options, "verify")
    if options.dry_run:
        return write_verify_report(context, {"verified": False, "diagnostics": []}, True)

    # verification mutates run status, so register/resume the run first
    _begin_seed_run(context)
    result = context.client.mutation(
        SEED_VERIFY_FUNCTION,
        {
            **_run_request(context),
            "expectedTotals": context.compiled["totals"],
        },
    )
    return write_verify_report(context, result)


def activate_seed_manifest(
    manifest_path: Path,
    repo_root: Path,
    options: SeedRunOptions,
) -> Path:
    context = _load_context(manifest_path, repo_root, options)
    _assert_write_allowed(options, "activate")
    if not options.confirm_activation:
        msg = "activation requires --confirm-activation"
        raise RuntimeError(msg)
    # default to the active release captured during preflight/run resume
    previous_release_id = _resolve_previous_release_id(context, options)
    result = context.client.mutation(
        SEED_ACTIVATE_FUNCTION,
        {
            **_run_request(context),
            "previousReleaseId": previous_release_id,
            "confirm": True,
        },
    )
    context.checkpoint["activeReleaseId"] = result["activeReleaseId"]
    _write_checkpoint(context)
    return write_activation_report(context, result)


def rollback_seed_manifest(
    manifest_path: Path,
    repo_root: Path,
    options: SeedRunOptions,
) -> Path:
    context = _load_context(manifest_path, repo_root, options)
    _assert_write_allowed(options, "rollback")
    if not options.confirm_activation:
        msg = "rollback requires --confirm-activation"
        raise RuntimeError(msg)
    if not options.target_release_id:
        msg = "rollback requires --target-release-id"
        raise RuntimeError(msg)
    result = context.client.mutation(
        SEED_ROLLBACK_FUNCTION,
        {
            **_run_request(context),
            "targetReleaseId": options.target_release_id,
            "confirm": True,
        },
    )
    context.checkpoint["activeReleaseId"] = result["activeReleaseId"]
    _write_checkpoint(context)
    return write_activation_report(context, result, rollback=True)


def cleanup_seed_manifest(
    manifest_path: Path,
    repo_root: Path,
    options: SeedRunOptions,
) -> Path:
    context = _load_context(manifest_path, repo_root, options)
    _assert_write_allowed(options, "cleanup")
    if not options.dry_run and not options.yes:
        msg = "cleanup requires --yes so abandoned storage removal is explicit"
        raise RuntimeError(msg)
    storage_ids = list(context.checkpoint.get("uploadedStorageIds") or [])
    cleaned: list[str] = []
    missing: list[str] = []
    skipped: list[str] = []
    if not options.dry_run:
        if storage_ids:
            _register_uploaded_storage_ids(context, storage_ids)
        for chunk in _chunks(storage_ids, CLEANUP_STORAGE_BATCH_SIZE):
            result = context.client.action(
                SEED_CLEANUP_FUNCTION,
                {**_run_request(context), "storageIds": chunk},
            )
            cleaned.extend(result.get("cleanedStorageIds", []))
            missing.extend(result.get("missingStorageIds", []))
            skipped.extend(result.get("skippedStorageIds", []))
        terminal = {*cleaned, *missing, *skipped}
        context.checkpoint["uploadedStorageIds"] = [
            item for item in storage_ids if item not in terminal
        ]
        _write_checkpoint(context)
    return write_cleanup_report(context, storage_ids, cleaned, missing, skipped, options.dry_run)


def run_seed_manifest(
    manifest_path: Path,
    repo_root: Path,
    options: SeedRunOptions,
) -> Path:
    context = _load_context(manifest_path, repo_root, options)
    state = _resolve_state(context, options)
    diff = build_seed_diff(context.compiled, state)
    write_diff_report(context, state, diff, options.env_name)
    if options.dry_run:
        return write_run_report(context, ["dry-run preflight complete"])

    _assert_write_allowed(options, "run")
    _begin_seed_run(context)
    # persist the activation guard before long upload/apply work starts
    context.checkpoint["previousActiveReleaseId"] = state.get("activeReleaseId")
    assets = _assets_requiring_upload(context.compiled, state)
    _assert_upload_budget(assets, options.max_upload_bytes)
    if assets:
        uploaded_assets = _upload_assets(context, assets)
        finalized, rejected = _finalize_uploaded_assets(context, uploaded_assets)
        if rejected:
            report_path = write_upload_report(context, assets, finalized, rejected)
            msg = f"seed upload rejected {len(rejected)} variant(s); report: {report_path}"
            raise RuntimeError(msg)
    _upsert_templates(context)
    _upsert_criteria(context)
    _upsert_items(context)
    verification = context.client.mutation(
        SEED_VERIFY_FUNCTION,
        {
            **_run_request(context),
            "expectedTotals": context.compiled["totals"],
        },
    )
    if not verification.get("verified"):
        write_verify_report(context, verification)
        msg = "seed verification failed; activation skipped"
        raise RuntimeError(msg)
    write_verify_report(context, verification)
    steps = ["upload complete", "apply complete", "verification complete"]
    if options.confirm_activation:
        activation_path = activate_seed_manifest(manifest_path, repo_root, options)
        steps.append(f"activation report: {activation_path}")
    else:
        steps.append("activation skipped; pass --confirm-activation to publish")
    return write_run_report(context, steps)


def build_template_upserts(compiled: JsonObject) -> list[JsonObject]:
    upserts: list[JsonObject] = []
    for template in _templates(compiled):
        cover = template.get("coverImage")
        # Convex resolves media by tile hash; preview/editor variants follow asset ID
        upserts.append(
            {
                "externalId": template["externalId"],
                "title": template["title"],
                "category": template["category"],
                "description": template.get("description"),
                "tags": template.get("tags", []),
                "visibility": template["visibility"],
                "coverMediaContentHash": _asset_tile_hash(cover),
                "coverFraming": _cover_framing(template),
                "suggestedTiers": template.get("suggestedTiers")
                or DEFAULT_SUGGESTED_TIERS,
                "itemAspectRatio": template["itemAspectRatio"],
                "itemCount": len(as_list(template.get("items"))),
            }
        )
    return upserts


def build_item_upserts(compiled: JsonObject) -> list[JsonObject]:
    upserts: list[JsonObject] = []
    for template in _templates(compiled):
        for item in as_list(template.get("items")):
            if not isinstance(item, dict):
                continue
            # item identity is stable external ID; order is just mutable placement
            upserts.append(
                {
                    "templateExternalId": template["externalId"],
                    "itemExternalId": item["externalId"],
                    "order": item["order"],
                    "label": item.get("label"),
                    "mediaContentHash": _asset_tile_hash(item["asset"]),
                    "aspectRatio": item.get("aspectRatio"),
                    "transform": item.get("transform"),
                }
            )
    return upserts


def build_criterion_upserts(compiled: JsonObject) -> list[JsonObject]:
    upserts: list[JsonObject] = []
    for template in _templates(compiled):
        for criterion in as_list(template.get("criteria")):
            if not isinstance(criterion, dict):
                continue
            # criteria are embedded on templates, but apply still treats them as IDs
            upserts.append(
                {
                    "templateExternalId": template["externalId"],
                    "criterionExternalId": criterion["externalId"],
                    "name": criterion["name"],
                    "shortName": criterion.get("shortName"),
                    "prompt": criterion["prompt"],
                    "axisTop": criterion.get("axisTop"),
                    "axisBottom": criterion.get("axisBottom"),
                    "order": criterion["order"],
                    "isPrimary": criterion["isPrimary"],
                    "status": criterion["status"],
                }
            )
    return upserts


def _load_context(
    manifest_path: Path,
    repo_root: Path,
    options: SeedRunOptions,
) -> SeedRunContext:
    compiled_path, compiled = build_compiled_manifest_with_data(
        manifest_path, repo_root, fail_on_warning=options.fail_on_warning
    )
    settings = read_seed_settings(
        repo_root, options.env_name, options.convex_url, options.seed_secret
    )
    checkpoint_path = compiled_path.parent / "run.json"
    checkpoint = _load_checkpoint(checkpoint_path)
    if not _checkpoint_matches(checkpoint, compiled, options.env_name):
        checkpoint = {}
    # reuse runId by default so interrupted commands resume the same server row
    checkpoint.setdefault("datasetKey", compiled["datasetKey"])
    checkpoint.setdefault("releaseId", compiled["releaseId"])
    checkpoint.setdefault("env", options.env_name)
    checkpoint["runId"] = options.run_id or checkpoint.get("runId") or _new_run_id(compiled)
    checkpoint.setdefault("uploadedStorageIds", [])
    return SeedRunContext(
        compiled_path=compiled_path,
        compiled=compiled,
        client=ConvexSeedClient(settings),
        checkpoint_path=checkpoint_path,
        checkpoint=checkpoint,
    )


def _begin_seed_run(context: SeedRunContext) -> None:
    totals = context.compiled["totals"]
    result = context.client.mutation(
        SEED_BEGIN_FUNCTION,
        {
            **_run_request(context),
            "templateCount": totals["templateCount"],
            "itemCount": totals["itemCount"],
            "imageVariantCount": totals["variantCount"],
        },
    )
    context.checkpoint["run"] = result["run"]
    _write_checkpoint(context)


def _resolve_state(context: SeedRunContext, options: SeedRunOptions) -> JsonObject:
    if options.state_json is not None:
        return read_json(options.state_json)
    return context.client.query(
        SEED_STATE_FUNCTION,
        build_state_request(context.compiled),
    )


def _resolve_previous_release_id(
    context: SeedRunContext,
    options: SeedRunOptions,
) -> str | None:
    if options.previous_release_id is not None:
        return options.previous_release_id
    previous = context.checkpoint.get("previousActiveReleaseId")
    if previous is None or isinstance(previous, str):
        return previous
    return None


def _upload_assets(
    context: SeedRunContext,
    assets: list[JsonObject],
) -> list[JsonObject]:
    uploaded: list[JsonObject] = []
    for asset_chunk in _chunks(assets, FINALIZE_ASSET_BATCH_SIZE):
        # duplicate hashes still need distinct storage objects until finalize runs
        variants = [
            variant
            for asset in asset_chunk
            for variant in _asset_variants(asset["asset"])
        ]
        upload_rows = _generate_upload_urls(context, variants)
        def upload_one(args: tuple[JsonObject, JsonObject]) -> str:
            variant, upload_row = args
            return context.client.upload_file(
                upload_row["uploadUrl"],
                Path(variant["path"]),
                variant["mimeType"],
            )

        errors: list[Exception] = []
        storage_ids: list[str] = []
        with ThreadPoolExecutor(max_workers=UPLOAD_WORKERS) as pool:
            future_to_variant = {
                pool.submit(upload_one, pair): pair[0]
                for pair in zip(variants, upload_rows, strict=True)
            }
            for future in as_completed(future_to_variant):
                variant = future_to_variant[future]
                try:
                    storage_id = future.result()
                except Exception as error:
                    errors.append(error)
                    continue
                variant["storageId"] = storage_id
                storage_ids.append(storage_id)
        for storage_id in storage_ids:
            context.checkpoint.setdefault("uploadedStorageIds", []).append(storage_id)
        _write_checkpoint(context)
        if storage_ids:
            _register_uploaded_storage_ids(context, storage_ids)
        if errors:
            details = "; ".join(f"{type(error).__name__}: {error}" for error in errors)
            msg = (
                f"{len(errors)} seed upload(s) failed; "
                f"uploaded IDs were checkpointed. errors: {details}"
            )
            raise RuntimeError(msg) from errors[0]
        uploaded.extend(asset_chunk)
    return uploaded


def _generate_upload_urls(
    context: SeedRunContext, variants: list[JsonObject]
) -> list[JsonObject]:
    upload_rows: list[JsonObject] = []
    for chunk in _chunks(variants, UPLOAD_URL_BATCH_SIZE):
        result = context.client.mutation(
            SEED_UPLOAD_URLS_FUNCTION,
            {
                **_run_request(context),
                "variants": [
                    {
                        "contentHash": variant["contentHash"],
                        "kind": variant["kind"],
                        "mimeType": variant["mimeType"],
                        "byteSize": variant["byteSize"],
                    }
                    for variant in chunk
                ],
            },
        )
        upload_rows.extend(result["urls"])
    return upload_rows


def _register_uploaded_storage_ids(
    context: SeedRunContext, storage_ids: list[str]
) -> None:
    for chunk in _chunks(storage_ids, CLEANUP_STORAGE_BATCH_SIZE):
        context.client.mutation(
            SEED_REGISTER_UPLOADS_FUNCTION,
            {**_run_request(context), "storageIds": chunk},
        )


def _finalize_uploaded_assets(
    context: SeedRunContext,
    assets: list[JsonObject],
) -> tuple[list[JsonObject], list[JsonObject]]:
    finalized: list[JsonObject] = []
    rejected: list[JsonObject] = []
    for chunk in _chunks(assets, FINALIZE_ASSET_BATCH_SIZE):
        # server reopens blobs, verifies metadata, then owns or deletes storage IDs
        result = context.client.action(
            SEED_FINALIZE_MEDIA_FUNCTION,
            {
                **_run_request(context),
                "authorEmail": context.compiled["authorEmail"],
                "assets": [_finalize_asset_payload(asset) for asset in chunk],
            },
        )
        finalized.extend(result.get("finalized", []))
        rejected.extend(result.get("rejected", []))
        _drop_finalized_storage_ids(context, chunk, result.get("rejected", []))
    return finalized, rejected


def _drop_finalized_storage_ids(
    context: SeedRunContext,
    assets: list[JsonObject],
    rejected: list[JsonObject],
) -> None:
    # finalized storage may now back mediaVariants, so never clean it later
    rejected_cleaned = {
        row["storageId"] for row in rejected if row.get("cleaned") and row.get("storageId")
    }
    completed = {
        variant["storageId"]
        for asset in assets
        for variant in _asset_variants(asset["asset"])
        if variant.get("storageId")
    }
    pending = context.checkpoint.get("uploadedStorageIds") or []
    context.checkpoint["uploadedStorageIds"] = [
        item for item in pending if item not in completed and item not in rejected_cleaned
    ]
    _write_checkpoint(context)


def _upsert_templates(context: SeedRunContext) -> list[JsonObject]:
    results: list[JsonObject] = []
    for chunk in _chunks(build_template_upserts(context.compiled), TEMPLATE_BATCH_SIZE):
        results.append(
            context.client.mutation(
                SEED_UPSERT_TEMPLATES_FUNCTION,
                {
                    **_run_request(context),
                    "authorEmail": context.compiled["authorEmail"],
                    "templates": chunk,
                },
            )
        )
    return results


def _upsert_items(context: SeedRunContext) -> list[JsonObject]:
    results: list[JsonObject] = []
    for chunk in _child_upsert_batches(
        build_item_upserts(context.compiled), ITEM_BATCH_SIZE, "items"
    ):
        results.append(
            context.client.mutation(
                SEED_UPSERT_ITEMS_FUNCTION,
                {**_run_request(context), "items": chunk},
            )
        )
    return results


def _upsert_criteria(context: SeedRunContext) -> list[JsonObject]:
    results: list[JsonObject] = []
    for chunk in _child_upsert_batches(
        build_criterion_upserts(context.compiled), CRITERION_BATCH_SIZE, "criteria"
    ):
        results.append(
            context.client.mutation(
                SEED_UPSERT_CRITERIA_FUNCTION,
                {**_run_request(context), "criteria": chunk},
            )
        )
    return results


def _child_upsert_batches(
    rows: list[JsonObject], limit: int, label: str
) -> list[list[JsonObject]]:
    groups: dict[str, list[JsonObject]] = {}
    for row in rows:
        # server upserts prune missing children per template, so never split one template
        template_external_id = str(row["templateExternalId"])
        groups.setdefault(template_external_id, []).append(row)
    batches = []
    for template_external_id, group in groups.items():
        if len(group) > limit:
            msg = (
                f"{template_external_id} has {len(group)} seed {label}, "
                f"exceeding per-call limit {limit}"
            )
            raise RuntimeError(msg)
        batches.append(group)
    return batches


def _assets_requiring_upload(compiled: JsonObject, state: JsonObject) -> list[JsonObject]:
    present = {
        str(media["contentHash"])
        for media in as_list(state.get("media"))
        if isinstance(media, dict)
    }
    needed: list[JsonObject] = []
    for entry in _compiled_asset_entries(compiled):
        variants = list(_asset_variants(entry["asset"]))
        if any(variant["contentHash"] not in present for variant in variants):
            needed.append(entry)
    return needed


def _compiled_asset_entries(compiled: JsonObject) -> Iterable[JsonObject]:
    for template in _templates(compiled):
        cover = template.get("coverImage")
        if isinstance(cover, dict):
            yield {
                "assetKey": f"{template['externalId']}:cover",
                "asset": cover,
            }
        for item in as_list(template.get("items")):
            if isinstance(item, dict) and isinstance(item.get("asset"), dict):
                yield {
                    "assetKey": f"{template['externalId']}:{item['externalId']}",
                    "asset": item["asset"],
                }


def _finalize_asset_payload(entry: JsonObject) -> JsonObject:
    return {
        "assetKey": entry["assetKey"],
        "variants": [
            {
                "contentHash": variant["contentHash"],
                "storageId": variant["storageId"],
                "kind": variant["kind"],
                "expectedMimeType": variant["mimeType"],
                "expectedByteSize": variant["byteSize"],
                "expectedWidth": variant["width"],
                "expectedHeight": variant["height"],
            }
            for variant in _asset_variants(entry["asset"])
        ],
    }


def _cover_framing(template: JsonObject) -> JsonObject | None:
    cover = template.get("coverImage")
    zoom = template.get("coverZoom") or 1
    if not isinstance(cover, dict) or zoom <= 1:
        return None
    return {
        surface: _zoomed_cover_frame(
            cover["sourceWidth"],
            cover["sourceHeight"],
            aspect,
            zoom,
        )
        for surface, aspect in SURFACE_ASPECT_RATIOS.items()
    }


def _zoomed_cover_frame(
    source_width: float,
    source_height: float,
    surface_aspect: float,
    zoom: float,
) -> JsonObject:
    source_aspect = source_width / source_height
    if surface_aspect >= source_aspect:
        base_width = 1
        base_height = source_aspect / surface_aspect
    else:
        base_width = surface_aspect / source_aspect
        base_height = 1
    width = base_width * zoom
    height = base_height * zoom
    return {
        "x": (1 - width) / 2,
        "y": (1 - height) / 2,
        "width": width,
        "height": height,
    }


def _run_request(context: SeedRunContext) -> JsonObject:
    return {
        "datasetKey": context.compiled["datasetKey"],
        "releaseId": context.compiled["releaseId"],
        "runId": context.checkpoint["runId"],
    }


def _assert_write_allowed(options: SeedRunOptions, command: str) -> None:
    if options.dry_run:
        return
    if options.env_name.lower() in {"prod", "production"} and not options.yes:
        msg = f"{command} against production requires --yes"
        raise RuntimeError(msg)


def _assert_upload_budget(
    assets: list[JsonObject], max_upload_bytes: int | None
) -> None:
    if max_upload_bytes is None:
        return
    total = sum(
        variant["byteSize"] for asset in assets for variant in _asset_variants(asset["asset"])
    )
    if total > max_upload_bytes:
        msg = f"upload requires {total} bytes, exceeding --max-upload-bytes={max_upload_bytes}"
        raise RuntimeError(msg)


def _load_checkpoint(path: Path) -> JsonObject:
    if not path.is_file():
        return {}
    return read_json(path)


def _checkpoint_matches(
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


def _write_checkpoint(context: SeedRunContext) -> None:
    write_json(context.checkpoint_path, context.checkpoint)


def _new_run_id(compiled: JsonObject) -> str:
    timestamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    return f"{compiled['releaseId']}-{timestamp}"


def _templates(compiled: JsonObject) -> Iterable[JsonObject]:
    for template in as_list(compiled.get("templates")):
        if isinstance(template, dict):
            yield template


def _asset_variants(asset: JsonObject) -> Iterable[JsonObject]:
    variants = asset.get("variants")
    if not isinstance(variants, dict):
        return
    for kind in ("tile", "preview"):
        variant = variants.get(kind)
        if isinstance(variant, dict):
            yield variant


def _asset_tile_hash(asset: object) -> str | None:
    if not isinstance(asset, dict):
        return None
    variants = asset.get("variants")
    if not isinstance(variants, dict):
        return None
    tile = variants.get("tile")
    if not isinstance(tile, dict):
        return None
    return str(tile["contentHash"])


def _chunks(items: list[JsonObject] | list[str], size: int) -> Iterable[list]:
    for index in range(0, len(items), size):
        yield items[index : index + size]
