# scripts/seed_pipeline/tests/test_report_layout.py
# shared markdown report section helpers

from __future__ import annotations

import unittest

from seed_pipeline.report_layout import append_section, compiled_report_header


class ReportLayoutTests(unittest.TestCase):
	def test_compiled_report_header_supports_extra_lines(self) -> None:
		lines = compiled_report_header(
			{
				"datasetKey": "marketplace",
				"releaseId": "2026-05",
				"authorEmail": "seed@example.com",
			},
			"Seed Diff Report",
			before=["- Environment: `local`"],
			after=["- Active release: `none`"],
		)

		self.assertEqual(
			lines,
			[
				"# Seed Diff Report",
				"",
				"- Environment: `local`",
				"- Dataset: `marketplace`",
				"- Release: `2026-05`",
				"- Author: `seed@example.com`",
				"- Active release: `none`",
				"",
			],
		)

	def test_append_section_renders_none_for_empty_rows(self) -> None:
		lines: list[str] = []

		append_section(lines, "Diagnostics", [], lambda row: f"- {row}")

		self.assertEqual(lines, ["## Diagnostics", "", "- None", ""])

	def test_append_section_skips_unrendered_rows(self) -> None:
		lines: list[str] = []

		append_section(
			lines,
			"Rows",
			["visible", "hidden"],
			lambda row: f"- {row}" if row == "visible" else None,
		)

		self.assertEqual(lines, ["## Rows", "", "- visible", ""])


if __name__ == "__main__":
	unittest.main()
