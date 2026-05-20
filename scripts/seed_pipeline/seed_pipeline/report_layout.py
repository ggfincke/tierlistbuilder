# scripts/seed_pipeline/seed_pipeline/report_layout.py
# shared markdown report framing for seed pipeline reports

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
	from .run_context import SeedRunContext


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
