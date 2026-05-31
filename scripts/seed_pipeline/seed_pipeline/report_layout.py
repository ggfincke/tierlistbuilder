# scripts/seed_pipeline/seed_pipeline/report_layout.py
# shared markdown report framing for seed pipeline reports

from __future__ import annotations

from collections.abc import Callable, Iterable, Mapping
from pathlib import Path
from typing import TYPE_CHECKING, TypeVar

if TYPE_CHECKING:
	from .run_context import SeedRunContext

T = TypeVar("T")


def compiled_report_header(
	compiled_manifest: Mapping[str, object],
	title: str,
	before: list[str] | None = None,
	after: list[str] | None = None,
) -> list[str]:
	lines = [f"# {title}", ""]
	if before:
		lines.extend(before)
	lines.extend(
		[
			f"- Dataset: `{compiled_manifest['datasetKey']}`",
			f"- Release: `{compiled_manifest['releaseId']}`",
		]
	)
	author = compiled_manifest.get("authorEmail")
	if isinstance(author, str):
		lines.append(f"- Author: `{author}`")
	if after:
		lines.extend(after)
	lines.append("")
	return lines


def report_header(
	context: SeedRunContext,
	title: str,
	dry_run: bool | None = None,
	extra: list[str] | None = None,
) -> list[str]:
	lines = [
		f"# {title}",
		"",
		f"- Dataset: `{context.compiled['datasetKey']}`",
		f"- Release: `{context.compiled['releaseId']}`",
		f"- Run: `{context.checkpoint['runId']}`",
	]
	if dry_run is not None:
		lines.append(f"- Dry run: `{str(dry_run).lower()}`")
	if extra:
		lines.extend(extra)
	lines.append("")
	return lines


def write_report(context: SeedRunContext, name: str, lines: list[str]) -> Path:
	report_path = context.compiled_path.parent / "reports" / name
	report_path.parent.mkdir(parents=True, exist_ok=True)
	report_path.write_text("\n".join(lines), encoding="utf-8")
	return report_path


def append_section(
	lines: list[str],
	title: str,
	rows: Iterable[T],
	format_row: Callable[[T], str | None],
) -> None:
	lines.extend([f"## {title}", ""])
	row_list = list(rows)
	if not row_list:
		lines.extend(["- None", ""])
		return
	for row in row_list:
		rendered = format_row(row)
		if rendered:
			lines.append(rendered)
	lines.append("")
