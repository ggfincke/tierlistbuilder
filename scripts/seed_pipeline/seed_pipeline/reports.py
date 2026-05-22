# scripts/seed_pipeline/seed_pipeline/reports.py
# write local markdown reports for seed preflight, build, & run commands

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

from .manifest import JsonObject, as_list
from .settings import (
	PREVIEW_MAX_BYTES,
	PREVIEW_MAX_SIZE,
	TILE_MAX_BYTES,
	TILE_MAX_SIZE,
)

if TYPE_CHECKING:
	from .run_context import SeedRunContext

from .report_layout import _append_section, report_header, write_report


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
	lines.append("")
	path.parent.mkdir(parents=True, exist_ok=True)
	path.write_text("\n".join(lines), encoding="utf-8")


def write_diff_report_file(
	compiled_path: Path,
	compiled: JsonObject,
	state: JsonObject,
	diff: JsonObject,
	env_name: str,
) -> Path:
	# deferred import: build->reports->diff->build is a transitive cycle, but
	# diff is only needed inside this function, so import lazily here
	from .diff import render_diff_report

	report_path = compiled_path.parent / "reports" / "diff.md"
	report_path.parent.mkdir(parents=True, exist_ok=True)
	report_path.write_text(
		render_diff_report(compiled, state, diff, env_name),
		encoding="utf-8",
	)
	return report_path


def write_diff_report(
	context: SeedRunContext,
	state: JsonObject,
	diff: JsonObject,
	env_name: str,
) -> Path:
	return write_diff_report_file(context.compiled_path, context.compiled, state, diff, env_name)


def write_upload_report(
	context: SeedRunContext,
	requested: list[JsonObject],
	finalized: list[JsonObject],
	rejected: list[JsonObject],
	dry_run: bool = False,
) -> Path:
	lines = report_header(
		context,
		"Seed Upload Report",
		dry_run=dry_run,
		extra=[
			f"- Assets requiring upload: {len(requested)}",
			f"- Assets finalized: {len(finalized)}",
			f"- Uploads rejected: {len(rejected)}",
		],
	)
	_append_report_rows(lines, "Finalized Media", finalized, "assetKey")
	_append_report_rows(lines, "Rejected Uploads", rejected, "assetKey")
	return write_report(context, "upload.md", lines)


def write_apply_report(
	context: SeedRunContext,
	template_results: list[JsonObject],
	criterion_results: list[JsonObject],
	item_results: list[JsonObject],
	dry_run: bool = False,
) -> Path:
	lines = report_header(context, "Seed Apply Report", dry_run=dry_run)
	_append_result_summary(lines, "Templates", template_results)
	_append_result_summary(lines, "Criteria", criterion_results)
	_append_result_summary(lines, "Items", item_results)
	return write_report(context, "apply.md", lines)


def write_verify_report(
	context: SeedRunContext,
	result: JsonObject,
	dry_run: bool = False,
) -> Path:
	lines = report_header(
		context,
		"Seed Verify Report",
		dry_run=dry_run,
		extra=[f"- Verified: `{str(result.get('verified')).lower()}`"],
	)
	_append_report_rows(lines, "Diagnostics", result.get("diagnostics", []), "code")
	return write_report(context, "verify.md", lines)


def write_activation_report(
	context: SeedRunContext,
	result: JsonObject,
	rollback: bool = False,
) -> Path:
	transition = (
		f"- Rolled back release: `{result['rolledBackReleaseId']}`"
		if rollback
		else f"- Previous release: `{result['previousReleaseId']}`"
	)
	title = "Seed Rollback Report" if rollback else "Seed Activation Report"
	lines = report_header(
		context,
		title,
		extra=[transition, f"- Active release: `{result['activeReleaseId']}`"],
	)
	return write_report(context, "activation.md", lines)


def write_cleanup_report(
	context: SeedRunContext,
	requested: list[str],
	cleaned: list[str],
	missing: list[str],
	skipped: list[str],
	dry_run: bool,
) -> Path:
	lines = report_header(
		context,
		"Seed Cleanup Report",
		dry_run=dry_run,
		extra=[
			f"- Storage IDs requested: {len(requested)}",
			f"- Storage IDs cleaned: {len(cleaned)}",
			f"- Storage IDs missing: {len(missing)}",
			f"- Storage IDs skipped: {len(skipped)}",
		],
	)
	return write_report(context, "cleanup.md", lines)


def write_run_report(context: SeedRunContext, steps: list[str]) -> Path:
	lines = report_header(context, "Seed Run Report")
	lines.extend(["## Steps", ""])
	lines.extend(f"- {step}" for step in steps)
	lines.append("")
	return write_report(context, "run.md", lines)


def _append_result_summary(lines: list[str], title: str, results: list[JsonObject]) -> None:
	keys = sorted({key for result in results for key in result.keys()})
	_append_section(
		lines,
		title,
		keys,
		lambda key: f"- {key}: {sum(len(as_list(result.get(key))) for result in results)}",
	)


def _append_report_rows(lines: list[str], title: str, rows: object, label_key: str) -> None:
	def _format(row: object) -> str | None:
		if not isinstance(row, dict):
			return None
		label = row.get(label_key) or row
		return f"- `{label}`"

	_append_section(lines, title, as_list(rows), _format)
