# scripts/seed_pipeline/seed_pipeline/reports.py
# write local markdown reports for seed preflight/build commands

from __future__ import annotations

from pathlib import Path

from .manifest import JsonObject
from .settings import (
    PREVIEW_MAX_BYTES,
    PREVIEW_MAX_SIZE,
    TILE_MAX_BYTES,
    TILE_MAX_SIZE,
)


def write_preflight_report(
    path: Path,
    compiled_manifest: JsonObject,
    warning_count: int,
    error_count: int,
) -> None:
    totals = compiled_manifest["totals"]
    # report stays local markdown until server diff data exists in Phase 3
    lines = [
        "# Seed Preflight Report",
        "",
        f"- Dataset: `{compiled_manifest['datasetKey']}`",
        f"- Release: `{compiled_manifest['releaseId']}`",
        f"- Author: `{compiled_manifest['authorEmail']}`",
        f"- Templates: {totals['templateCount']}",
        f"- Items: {totals['itemCount']}",
        f"- Criteria: {totals['criterionCount']}",
        f"- Source images: {totals['sourceImageCount']}",
        f"- Variants: {totals['variantCount']}",
        f"- Estimated upload bytes: {totals['estimatedUploadBytes']}",
        f"- Estimated storage bytes: {totals['estimatedStorageBytes']}",
        f"- Warnings: {warning_count}",
        f"- Errors: {error_count}",
        "",
        "## Variant Policies",
        "",
        f"- Tile: <= {TILE_MAX_SIZE}px, <= {TILE_MAX_BYTES} bytes",
        f"- Preview: <= {PREVIEW_MAX_SIZE}px, <= {PREVIEW_MAX_BYTES} bytes",
        "",
        "## Template Ratios",
        "",
    ]
    for template in compiled_manifest["templates"]:
        # transformed count is the quickest sanity check for crop behavior drift
        transformed = sum(1 for item in template["items"] if item["transform"])
        lines.append(
            f"- `{template['externalId']}`: {template['ratioSource']} @ "
            f"{template['itemAspectRatio']:.6g}; transformed {transformed} item(s)"
        )
    lines.extend(
        [
            "",
            "## Server Diff",
            "",
            "Server diff checks are not available until Phase 3.",
            "",
        ]
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")
