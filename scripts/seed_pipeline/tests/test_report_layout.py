# scripts/seed_pipeline/tests/test_report_layout.py
# shared markdown report section helpers

from __future__ import annotations

import unittest

from seed_pipeline.report_layout import _append_section


class ReportLayoutTests(unittest.TestCase):
	def test_append_section_renders_none_for_empty_rows(self) -> None:
		lines: list[str] = []

		_append_section(lines, "Diagnostics", [], lambda row: f"- {row}")

		self.assertEqual(lines, ["## Diagnostics", "", "- None", ""])

	def test_append_section_skips_unrendered_rows(self) -> None:
		lines: list[str] = []

		_append_section(
			lines,
			"Rows",
			["visible", "hidden"],
			lambda row: f"- {row}" if row == "visible" else None,
		)

		self.assertEqual(lines, ["## Rows", "", "- visible", ""])


if __name__ == "__main__":
	unittest.main()
