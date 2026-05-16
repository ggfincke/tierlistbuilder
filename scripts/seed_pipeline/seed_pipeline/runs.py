# scripts/seed_pipeline/seed_pipeline/runs.py
# orchestrate Convex seed uploads, applies, verification, & activation

from __future__ import annotations

import hashlib
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Callable, Iterable

from .assets import asset_dedupe_hash, asset_variants
from .diff import build_seed_diff, resolve_seed_state
from .manifest import (
    JsonObject,
    as_list,
    chunk_templates_by_items,
    chunks,
    compiled_templates,
    read_json,
)
from .progress import progress_interval
from .run_context import (
    SeedRunContext,
    SeedRunOptions,
    assert_write_allowed,
    begin_seed_run,
    load_context,
    run_request,
    write_checkpoint,
)
from .reports import (
    write_activation_report,
    write_apply_report,
    write_cleanup_report,
    write_diff_report,
    write_run_report,
    write_upload_report,
    write_verify_report,
)


SEED_ENSURE_AUTHOR_FUNCTION = "marketplace/seedRuns:ensureSeedAuthor"
SEED_UPLOAD_URLS_FUNCTION = "marketplace/seedRuns:generateSeedUploadUrls"
SEED_REGISTER_UPLOADS_FUNCTION = (
    "marketplace/seedPipeline/storageUploads:registerSeedUploadedStorageIds"
)
SEED_FINALIZE_MEDIA_FUNCTION = "marketplace/seedRuns:finalizeSeedUploadedMedia"
SEED_CLEANUP_FUNCTION = (
    "marketplace/seedPipeline/storageUploads:cleanupAbandonedSeedRun"
)
SEED_UPSERT_TEMPLATES_FUNCTION = "marketplace/seedRuns:upsertSeedTemplates"
SEED_SYNC_TEMPLATE_ITEMS_FUNCTION = "marketplace/seedRuns:syncSeedTemplateItems"
SEED_UPSERT_CRITERIA_FUNCTION = "marketplace/seedRuns:upsertSeedCriteria"
SEED_VERIFY_CHUNK_FUNCTION = "marketplace/seedRuns:verifySeedReleaseChunk"
SEED_COMPLETE_VERIFICATION_FUNCTION = (
    "marketplace/seedRuns:completeSeedReleaseVerification"
)
SEED_ACTIVATE_FUNCTION = "marketplace/seedRuns:activateSeedRelease"
SEED_ROLLBACK_FUNCTION = "marketplace/seedRuns:rollbackSeedRelease"

TEMPLATE_BATCH_SIZE = 128
ITEM_BATCH_SIZE = 4096
CRITERION_BATCH_SIZE = 512
UPLOAD_URL_BATCH_SIZE = 128
FINALIZE_ASSET_BATCH_SIZE = 64
CLEANUP_STORAGE_BATCH_SIZE = 256
VERIFY_ITEM_READ_BATCH_SIZE = 1500
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
    "browseHero": 16 / 9,
    "detailHero": 4 / 3,
    "card": 16 / 10,
}


# mirrors packages/contracts/marketplace/seedPipeline.ts. both sides serialize
# {kind, payload} as canonical JSON (sorted keys, no whitespace) then take the
# leading SEED_CONTENT_HASH_HEX_LENGTH hex chars of sha256, prefixed with the
# version. drift between the two implementations silently breaks dedup.
SEED_CONTENT_HASH_VERSION = "v1"
SEED_CONTENT_HASH_HEX_LENGTH = 32


def _seed_content_hash(kind: str, payload: object) -> str:
    serialized = json.dumps(
        {"kind": kind, "payload": payload},
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    digest = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
    return f"{SEED_CONTENT_HASH_VERSION}:{digest[:SEED_CONTENT_HASH_HEX_LENGTH]}"


def upload_seed_manifest(
    manifest_path: Path,
    repo_root: Path,
    options: SeedRunOptions,
) -> Path:
    context = load_context(manifest_path, repo_root, options, "upload")
    state = _resolve_state(context, options)
    diff = build_seed_diff(context.compiled, state)
    write_diff_report(context, state, diff, options.env_name)
    # upload a whole asset when any variant is missing so media dedupe stays exact
    assets = assets_requiring_upload(context.compiled, state)
    context.progress.log(f"{len(assets)} media assets require upload")
    assert_write_allowed(options, "upload")
    _assert_upload_budget(assets, options.max_upload_bytes)
    if options.dry_run:
        context.progress.log("dry run complete; no upload writes performed")
        return write_upload_report(context, assets, [], [], dry_run=True)

    begin_seed_run(context)
    uploaded_assets = _upload_assets(context, assets)
    finalized, rejected = _finalize_uploaded_assets(context, uploaded_assets)
    write_checkpoint(context)
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
    context = load_context(manifest_path, repo_root, options, "apply")
    assert_write_allowed(options, "apply")
    if options.dry_run:
        context.progress.log("dry run complete; no apply writes performed")
        return write_apply_report(context, [], [], [], dry_run=True)

    begin_seed_run(context)
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
    context = load_context(manifest_path, repo_root, options, "verify")
    assert_write_allowed(options, "verify")
    if options.dry_run:
        context.progress.log("dry run complete; no verification writes performed")
        return write_verify_report(context, {"verified": False, "diagnostics": []}, True)

    # verification mutates run status, so register/resume the run first
    begin_seed_run(context)
    result = _verify_seed_release(context)
    return write_verify_report(context, result)


def activate_seed_manifest(
    manifest_path: Path,
    repo_root: Path,
    options: SeedRunOptions,
) -> Path:
    context = load_context(manifest_path, repo_root, options, "activate")
    assert_write_allowed(options, "activate")
    return _activate_seed_context(context, options)


def _activate_seed_context(context: SeedRunContext, options: SeedRunOptions) -> Path:
    if not options.confirm_activation:
        msg = "activation requires --confirm-activation"
        raise RuntimeError(msg)
    # default to the active release captured during preflight/run resume
    previous_release_id = _resolve_previous_release_id(context, options)
    context.progress.log(
        f"activating release {context.compiled['releaseId']} "
        f"(previous: {previous_release_id or 'none'})"
    )
    result = context.client.mutation(
        SEED_ACTIVATE_FUNCTION,
        {
            **run_request(context),
            "previousReleaseId": previous_release_id,
            "confirm": True,
        },
    )
    context.checkpoint["activeReleaseId"] = result["activeReleaseId"]
    write_checkpoint(context)
    return write_activation_report(context, result)


def rollback_seed_manifest(
    manifest_path: Path,
    repo_root: Path,
    options: SeedRunOptions,
) -> Path:
    context = load_context(manifest_path, repo_root, options, "rollback")
    assert_write_allowed(options, "rollback")
    if not options.confirm_activation:
        msg = "rollback requires --confirm-activation"
        raise RuntimeError(msg)
    if not options.target_release_id:
        msg = "rollback requires --target-release-id"
        raise RuntimeError(msg)
    result = context.client.mutation(
        SEED_ROLLBACK_FUNCTION,
        {
            **run_request(context),
            "targetReleaseId": options.target_release_id,
            "confirm": True,
        },
    )
    context.checkpoint["activeReleaseId"] = result["activeReleaseId"]
    write_checkpoint(context)
    return write_activation_report(context, result, rollback=True)


def cleanup_seed_manifest(
    manifest_path: Path,
    repo_root: Path,
    options: SeedRunOptions,
) -> Path:
    context = load_context(manifest_path, repo_root, options, "cleanup")
    assert_write_allowed(options, "cleanup")
    if not options.dry_run and not options.yes:
        msg = "cleanup requires --yes so abandoned storage removal is explicit"
        raise RuntimeError(msg)
    storage_ids = list(context.checkpoint.get("uploadedStorageIds") or [])
    cleaned: list[str] = []
    missing: list[str] = []
    skipped: list[str] = []
    if not options.dry_run:
        if storage_ids:
            context.progress.log(f"registering {len(storage_ids)} uploaded storage IDs")
            _register_uploaded_storage_ids(context, storage_ids)
        batches = list(chunks(storage_ids, CLEANUP_STORAGE_BATCH_SIZE))
        for index, chunk in enumerate(batches, start=1):
            context.progress.count("cleanup batches", index, len(batches))
            result = context.client.action(
                SEED_CLEANUP_FUNCTION,
                {**run_request(context), "storageIds": chunk},
            )
            cleaned.extend(result.get("cleanedStorageIds", []))
            missing.extend(result.get("missingStorageIds", []))
            skipped.extend(result.get("skippedStorageIds", []))
        terminal = {*cleaned, *missing, *skipped}
        context.checkpoint["uploadedStorageIds"] = [
            item for item in storage_ids if item not in terminal
        ]
        write_checkpoint(context)
    return write_cleanup_report(context, storage_ids, cleaned, missing, skipped, options.dry_run)


def run_seed_manifest(
    manifest_path: Path,
    repo_root: Path,
    options: SeedRunOptions,
) -> Path:
    context = load_context(manifest_path, repo_root, options, "run")
    state = _resolve_state(context, options)
    diff = build_seed_diff(context.compiled, state)
    write_diff_report(context, state, diff, options.env_name)
    if options.dry_run:
        context.progress.log("dry run complete; no writes performed")
        return write_run_report(context, ["dry-run preflight complete"])

    assert_write_allowed(options, "run")
    if _active_release_matches_compiled_manifest(context, state, diff):
        context.progress.log(
            "active release already matches compiled manifest; skipping writes"
        )
        return write_run_report(
            context,
            ["active release already matches compiled manifest; no writes performed"],
        )
    _ensure_seed_author(context)
    begin_seed_run(context)
    # persist the activation guard before long upload/apply work starts
    context.checkpoint["previousActiveReleaseId"] = state.get("activeReleaseId")
    write_checkpoint(context)
    assets = assets_requiring_upload(context.compiled, state)
    context.progress.log(f"{len(assets)} media assets require upload")
    _assert_upload_budget(assets, options.max_upload_bytes)
    if assets:
        uploaded_assets = _upload_assets(context, assets)
        finalized, rejected = _finalize_uploaded_assets(context, uploaded_assets)
        if rejected:
            report_path = write_upload_report(context, assets, finalized, rejected)
            msg = f"seed upload rejected {len(rejected)} variant(s); report: {report_path}"
            raise RuntimeError(msg)
    _upsert_templates(context)
    _upsert_criteria(context, diff)
    _upsert_items(context, diff)
    verification = _verify_seed_release(context)
    if not verification.get("verified"):
        write_verify_report(context, verification)
        msg = "seed verification failed; activation skipped"
        raise RuntimeError(msg)
    write_verify_report(context, verification)
    steps = ["upload complete", "apply complete", "verification complete"]
    if options.confirm_activation:
        activation_path = _activate_seed_context(context, options)
        steps.append(f"activation report: {activation_path}")
    else:
        steps.append("activation skipped; pass --confirm-activation to publish")
    return write_run_report(context, steps)


def _cached_payload(
    context: SeedRunContext, key: str, build: Callable[[JsonObject], list[JsonObject]]
) -> list[JsonObject]:
    cached = context.payload_cache.get(key)
    if cached is None:
        cached = build(context.compiled)
        context.payload_cache[key] = cached
    return cached


def cached_template_upserts(context: SeedRunContext) -> list[JsonObject]:
    return _cached_payload(context, "templates", build_template_upserts)


def cached_item_upserts(context: SeedRunContext) -> list[JsonObject]:
    return _cached_payload(context, "items", build_item_upserts)


def cached_criterion_upserts(context: SeedRunContext) -> list[JsonObject]:
    return _cached_payload(context, "criteria", build_criterion_upserts)


def build_template_upserts(compiled: JsonObject) -> list[JsonObject]:
    upserts: list[JsonObject] = []
    for template in compiled_templates(compiled):
        cover = template.get("coverImage")
        upsert = {
            "externalId": template["externalId"],
            "title": template["title"],
            "category": template["category"],
            "description": template.get("description"),
            "tags": template.get("tags", []),
            "visibility": template["visibility"],
            "coverMediaDedupeHash": asset_dedupe_hash(cover),
            "coverFraming": _cover_framing(template),
            "suggestedTiers": template.get("suggestedTiers")
            or DEFAULT_SUGGESTED_TIERS,
            "itemAspectRatio": template["itemAspectRatio"],
            "itemCount": len(as_list(template.get("items"))),
        }
        if "labels" in template:
            upsert["labels"] = template["labels"]
        upserts.append(
            {
                **upsert,
                "metadataContentHash": _seed_content_hash(
                    "template-metadata", upsert
                ),
            }
        )
    return upserts


def build_item_upserts(compiled: JsonObject) -> list[JsonObject]:
    upserts: list[JsonObject] = []
    for template in compiled_templates(compiled):
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
                    "mediaDedupeHash": asset_dedupe_hash(item["asset"]),
                    "aspectRatio": item.get("aspectRatio"),
                    "transform": item.get("transform"),
                }
            )
    return upserts


def build_criterion_upserts(compiled: JsonObject) -> list[JsonObject]:
    upserts: list[JsonObject] = []
    for template in compiled_templates(compiled):
        template_criteria: list[JsonObject] = []
        for criterion in as_list(template.get("criteria")):
            if not isinstance(criterion, dict):
                continue
            # criteria are embedded on templates, but apply still treats them as IDs
            template_criteria.append(
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
        criteria_content_hash = _criteria_content_hash(
            str(template["externalId"]), template_criteria
        )
        upserts.extend(
            {
                **criterion,
                "criteriaContentHash": criteria_content_hash,
            }
            for criterion in template_criteria
        )
    return upserts


def _items_content_hash(template_external_id: str, items: list[JsonObject]) -> str:
    return _seed_content_hash(
        "template-items",
        {"templateExternalId": template_external_id, "items": items},
    )


def _criteria_content_hash(
    template_external_id: str, criteria: list[JsonObject]
) -> str:
    return _seed_content_hash(
        "template-criteria",
        {"templateExternalId": template_external_id, "criteria": criteria},
    )


def _compiled_template_hashes(context: SeedRunContext) -> dict[str, JsonObject]:
    hashes: dict[str, JsonObject] = {
        str(template["externalId"]): {
            "metadataContentHash": template["metadataContentHash"]
        }
        for template in cached_template_upserts(context)
    }
    item_rows_by_template = _rows_by_template_external_id(
        cached_item_upserts(context)
    )
    for template_external_id, rows in item_rows_by_template.items():
        items = [
            {key: value for key, value in row.items() if key != "templateExternalId"}
            for row in rows
        ]
        hashes.setdefault(template_external_id, {})[
            "itemsContentHash"
        ] = _items_content_hash(template_external_id, items)
    criteria_rows_by_template = _rows_by_template_external_id(
        cached_criterion_upserts(context)
    )
    for template_external_id, rows in criteria_rows_by_template.items():
        content_hash = rows[0].get("criteriaContentHash") if rows else None
        hashes.setdefault(template_external_id, {})[
            "criteriaContentHash"
        ] = content_hash
    # fill defaults for templates that have no items or no criteria so the
    # equality check below sees the same shape on both sides
    for template in compiled_templates(context.compiled):
        template_external_id = str(template["externalId"])
        bucket = hashes.setdefault(template_external_id, {})
        bucket.setdefault(
            "itemsContentHash", _items_content_hash(template_external_id, [])
        )
        bucket.setdefault(
            "criteriaContentHash", _criteria_content_hash(template_external_id, [])
        )
    return hashes


def _rows_by_template_external_id(
    rows: list[JsonObject],
) -> dict[str, list[JsonObject]]:
    grouped: dict[str, list[JsonObject]] = {}
    for row in rows:
        template_external_id = str(row["templateExternalId"])
        grouped.setdefault(template_external_id, []).append(row)
    return grouped


def _active_release_matches_compiled_manifest(
    context: SeedRunContext, state: JsonObject, diff: JsonObject
) -> bool:
    if state.get("activeReleaseId") != context.compiled["releaseId"]:
        return False
    if as_list(diff["media"].get("missing")):
        return False
    if (
        as_list(diff["templates"].get("create"))
        or as_list(diff["templates"].get("update"))
        or as_list(diff["items"].get("create"))
        or as_list(diff["items"].get("update"))
        or as_list(diff["items"].get("reorder"))
        or as_list(diff["criteria"].get("create"))
        or as_list(diff["criteria"].get("update"))
    ):
        return False

    state_templates = {
        str(template["externalId"]): template
        for template in as_list(state.get("templates"))
        if isinstance(template, dict) and isinstance(template.get("externalId"), str)
    }
    for template_external_id, hashes in _compiled_template_hashes(context).items():
        current = state_templates.get(template_external_id)
        if current is None:
            return False
        if any(current.get(key) != value for key, value in hashes.items()):
            return False
    return True


def _item_diff_template_external_ids(diff: JsonObject) -> set[str]:
    return _diff_template_external_ids(
        diff.get("items"),
        ("create", "update", "reorder"),
    )


def _criteria_diff_template_external_ids(diff: JsonObject) -> set[str]:
    return _diff_template_external_ids(diff.get("criteria"), ("create", "update"))


def _diff_template_external_ids(section: object, keys: tuple[str, ...]) -> set[str]:
    if not isinstance(section, dict):
        return set()
    template_external_ids: set[str] = set()
    for key in keys:
        for entry in as_list(section.get(key)):
            if isinstance(entry, dict) and isinstance(
                entry.get("templateExternalId"), str
            ):
                template_external_ids.add(str(entry["templateExternalId"]))
    return template_external_ids


def _ensure_seed_author(context: SeedRunContext) -> None:
    author_password = context.client.settings.author_password
    if not author_password:
        msg = "CONVEX_SEED_AUTHOR_PASSWORD is not set"
        raise RuntimeError(msg)
    context.progress.log(
        f"ensuring seed author exists: {context.compiled['authorEmail']}"
    )
    context.client.action(
        SEED_ENSURE_AUTHOR_FUNCTION,
        {
            "email": context.compiled["authorEmail"],
            "password": author_password,
        },
    )


def _resolve_state(context: SeedRunContext, options: SeedRunOptions) -> JsonObject:
    if options.state_json is not None:
        context.progress.log(f"loading fixture state: {options.state_json}")
        return read_json(options.state_json)
    context.progress.log(f"reading current seed state from {options.env_name}")
    return resolve_seed_state(context.client, context.compiled, context.progress)


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


def _verify_seed_release(context: SeedRunContext) -> JsonObject:
    context.progress.log("verifying release totals and seeded data")
    template_chunks = chunk_templates_by_items(
        compiled_templates(context.compiled), VERIFY_ITEM_READ_BATCH_SIZE
    )
    diagnostics: list[JsonObject] = []
    actual_totals = {"templateCount": 0, "itemCount": 0, "criterionCount": 0}
    for index, chunk in enumerate(template_chunks, start=1):
        context.progress.count(
            "verification template batches",
            index,
            len(template_chunks),
            suffix=f"{len(chunk)} templates",
        )
        result = context.client.mutation(
            SEED_VERIFY_CHUNK_FUNCTION,
            {
                **run_request(context),
                "templateExternalIds": [
                    template["externalId"] for template in chunk
                ],
            },
        )
        diagnostics.extend(
            item
            for item in as_list(result.get("diagnostics"))
            if isinstance(item, dict)
        )
        totals = result.get("totals")
        if isinstance(totals, dict):
            for key in actual_totals:
                value = totals.get(key)
                if isinstance(value, (int, float)):
                    actual_totals[key] += int(value)
    context.progress.log(
        "verification totals: "
        f"{actual_totals['templateCount']} templates, "
        f"{actual_totals['itemCount']} items, "
        f"{actual_totals['criterionCount']} criteria, "
        f"{len(diagnostics)} diagnostics"
    )
    return context.client.mutation(
        SEED_COMPLETE_VERIFICATION_FUNCTION,
        {
            **run_request(context),
            "expectedTotals": context.compiled["totals"],
            "actualTotals": actual_totals,
            "diagnostics": diagnostics,
        },
    )


def _upload_assets(
    context: SeedRunContext,
    assets: list[JsonObject],
) -> list[JsonObject]:
    uploaded: list[JsonObject] = []
    asset_chunks = list(chunks(assets, FINALIZE_ASSET_BATCH_SIZE))
    total_variants = sum(
        1 for asset in assets for _variant in asset_variants(asset["asset"])
    )
    uploaded_variants = 0
    variant_log_every = progress_interval(total_variants)
    for asset_chunk_index, asset_chunk in enumerate(asset_chunks, start=1):
        # duplicate hashes still need distinct storage objects until finalize runs
        variants = [
            variant
            for asset in asset_chunk
            for variant in asset_variants(asset["asset"])
        ]
        context.progress.log(
            f"upload asset batch {asset_chunk_index}/{len(asset_chunks)}: "
            f"{len(asset_chunk)} assets, {len(variants)} variants"
        )
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
                uploaded_variants += 1
                context.progress.count(
                    "uploaded variants",
                    uploaded_variants,
                    total_variants,
                    every=variant_log_every,
                )
        for storage_id in storage_ids:
            context.checkpoint.setdefault("uploadedStorageIds", []).append(storage_id)
        write_checkpoint(context)
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
    batches = list(chunks(variants, UPLOAD_URL_BATCH_SIZE))
    for index, chunk in enumerate(batches, start=1):
        context.progress.count("upload URL batches", index, len(batches))
        result = context.client.mutation(
            SEED_UPLOAD_URLS_FUNCTION,
            {
                **run_request(context),
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
    batches = list(chunks(storage_ids, CLEANUP_STORAGE_BATCH_SIZE))
    for index, chunk in enumerate(batches, start=1):
        context.progress.count("register upload batches", index, len(batches))
        context.client.mutation(
            SEED_REGISTER_UPLOADS_FUNCTION,
            {**run_request(context), "storageIds": chunk},
        )


def _finalize_uploaded_assets(
    context: SeedRunContext,
    assets: list[JsonObject],
) -> tuple[list[JsonObject], list[JsonObject]]:
    finalized: list[JsonObject] = []
    rejected: list[JsonObject] = []
    batches = list(chunks(assets, FINALIZE_ASSET_BATCH_SIZE))
    for index, chunk in enumerate(batches, start=1):
        context.progress.count("finalize asset batches", index, len(batches))
        # server reopens blobs, verifies metadata, then owns or deletes storage IDs
        result = context.client.action(
            SEED_FINALIZE_MEDIA_FUNCTION,
            {
                **run_request(context),
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
        for variant in asset_variants(asset["asset"])
        if variant.get("storageId")
    }
    pending = context.checkpoint.get("uploadedStorageIds") or []
    context.checkpoint["uploadedStorageIds"] = [
        item for item in pending if item not in completed and item not in rejected_cleaned
    ]
    write_checkpoint(context)


def _upsert_templates(context: SeedRunContext) -> list[JsonObject]:
    results: list[JsonObject] = []
    batches = list(chunks(cached_template_upserts(context), TEMPLATE_BATCH_SIZE))
    for index, chunk in enumerate(batches, start=1):
        context.progress.count(
            "template upsert batches",
            index,
            len(batches),
            suffix=f"({len(chunk)} templates)",
        )
        results.append(
            context.client.mutation(
                SEED_UPSERT_TEMPLATES_FUNCTION,
                {
                    **run_request(context),
                    "authorEmail": context.compiled["authorEmail"],
                    "templates": chunk,
                },
            )
        )
    return results


def _upsert_items(
    context: SeedRunContext, diff: JsonObject | None = None
) -> list[JsonObject]:
    results: list[JsonObject] = []
    batches = child_upsert_batches(
        cached_item_upserts(context), ITEM_BATCH_SIZE, "items"
    )
    force_template_external_ids = (
        _item_diff_template_external_ids(diff) if diff is not None else set()
    )
    for index, chunk in enumerate(batches, start=1):
        context.progress.count(
            "item sync batches",
            index,
            len(batches),
            every=progress_interval(len(batches)),
            suffix=f"({chunk[0]['templateExternalId']}, {len(chunk)} items)",
        )
        template_external_id = str(chunk[0]["templateExternalId"])
        items = [
            {key: value for key, value in item.items() if key != "templateExternalId"}
            for item in chunk
        ]
        results.append(
            context.client.mutation(
                SEED_SYNC_TEMPLATE_ITEMS_FUNCTION,
                {
                    **run_request(context),
                    "templateExternalId": template_external_id,
                    "itemsContentHash": _items_content_hash(
                        template_external_id, items
                    ),
                    "allowContentHashSkip": diff is not None
                    and template_external_id not in force_template_external_ids,
                    "items": items,
                },
            )
        )
    return results


def _upsert_criteria(
    context: SeedRunContext, diff: JsonObject | None = None
) -> list[JsonObject]:
    results: list[JsonObject] = []
    batches = packed_child_upsert_batches(
        cached_criterion_upserts(context), CRITERION_BATCH_SIZE, "criteria"
    )
    force_template_external_ids = (
        sorted(_criteria_diff_template_external_ids(diff))
        if diff is not None
        else [
            str(template["externalId"])
            for template in compiled_templates(context.compiled)
        ]
    )
    for index, chunk in enumerate(batches, start=1):
        context.progress.count(
            "criterion upsert batches",
            index,
            len(batches),
            every=progress_interval(len(batches)),
            suffix=f"({len(chunk)} criteria)",
        )
        results.append(
            context.client.mutation(
                SEED_UPSERT_CRITERIA_FUNCTION,
                {
                    **run_request(context),
                    "forceTemplateExternalIds": force_template_external_ids,
                    "criteria": chunk,
                },
            )
        )
    return results


def packed_child_upsert_batches(
    rows: list[JsonObject], limit: int, label: str
) -> list[list[JsonObject]]:
    groups = child_upsert_batches(rows, limit, label)
    batches: list[list[JsonObject]] = []
    current: list[JsonObject] = []
    for group in groups:
        if current and len(current) + len(group) > limit:
            batches.append(current)
            current = []
        current.extend(group)
    if current:
        batches.append(current)
    return batches


def child_upsert_batches(
    rows: list[JsonObject], limit: int, label: str
) -> list[list[JsonObject]]:
    groups: dict[str, list[JsonObject]] = {}
    for row in rows:
        # server sync prunes missing children per template, so never split a template
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


def assets_requiring_upload(compiled: JsonObject, state: JsonObject) -> list[JsonObject]:
    present = {
        str(media["mediaDedupeHash"])
        for media in as_list(state.get("media"))
        if isinstance(media, dict) and isinstance(media.get("mediaDedupeHash"), str)
    }
    needed: list[JsonObject] = []
    queued: set[str] = set()
    for entry in _compiled_asset_entries(compiled):
        dedupe_hash = asset_dedupe_hash(entry["asset"])
        if dedupe_hash is None:
            needed.append(entry)
            continue
        if dedupe_hash in present or dedupe_hash in queued:
            continue
        queued.add(dedupe_hash)
        needed.append(entry)
    return needed


def _compiled_asset_entries(compiled: JsonObject) -> Iterable[JsonObject]:
    for template in compiled_templates(compiled):
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
            for variant in asset_variants(entry["asset"])
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


def _assert_upload_budget(
    assets: list[JsonObject], max_upload_bytes: int | None
) -> None:
    if max_upload_bytes is None:
        return
    total = sum(
        variant["byteSize"] for asset in assets for variant in asset_variants(asset["asset"])
    )
    if total > max_upload_bytes:
        msg = f"upload requires {total} bytes, exceeding --max-upload-bytes={max_upload_bytes}"
        raise RuntimeError(msg)
