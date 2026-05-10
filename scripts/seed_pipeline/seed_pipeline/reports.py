# scripts/seed_pipeline/seed_pipeline/reports.py
# write local markdown reports for seed preflight/build commands

from __future__ import annotations

from pathlib import Path

from .manifest import JsonObject


def write_preflight_report(
    path: Path,
    compiled_manifest: JsonObject,
    warning_count: int,
    error_count: int,
) -> None:
    totals = compiled_manifest["totals"]
    lines = [
        "# Seed Preflight Report",
        "",
        f"- Dataset: `{compiled_manifest['datasetKey']}`",
        f"- Release: `{compiled_manifest['releaseId']}`",
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
        "Server diff checks are not available until Phase 3.",
        "",
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")
