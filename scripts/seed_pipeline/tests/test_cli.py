# scripts/seed_pipeline/tests/test_cli.py
# command-dispatch coverage for the seed pipeline CLI parser

from __future__ import annotations

import functools
import io
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

from seed_pipeline import cli
from seed_pipeline.rankings import (
	activate_rankings_manifest,
	apply_rankings_manifest,
	preflight_rankings_manifest,
	rollback_rankings_manifest,
	run_rankings_manifest,
	verify_rankings_manifest,
)
from seed_pipeline.runs import (
	activate_seed_manifest,
	apply_seed_manifest,
	cleanup_seed_manifest,
	rollback_seed_manifest,
	run_seed_manifest,
	upload_seed_manifest,
	verify_seed_manifest,
)


class SeedPipelineCliTests(unittest.TestCase):
	def test_report_commands_register_labels_and_handlers(self) -> None:
		cases = [
			("upload", ["manifest.json"], "seed upload report", upload_seed_manifest),
			("apply", ["manifest.json"], "seed apply report", apply_seed_manifest),
			("verify", ["manifest.json"], "seed verify report", verify_seed_manifest),
			("cleanup", ["manifest.json"], "seed cleanup report", cleanup_seed_manifest),
			(
				"activate",
				["manifest.json"],
				"seed activation report",
				activate_seed_manifest,
			),
			(
				"rollback",
				["manifest.json", "--target-release-id", "release-old"],
				"seed rollback report",
				rollback_seed_manifest,
			),
			("run", ["manifest.json"], "seed run report", run_seed_manifest),
			(
				"rankings:preflight",
				["manifest.json"],
				"ranking seed preflight report",
				preflight_rankings_manifest,
			),
			(
				"rankings:apply",
				["manifest.json"],
				"ranking seed apply report",
				apply_rankings_manifest,
			),
			(
				"rankings:verify",
				["manifest.json"],
				"ranking seed verify report",
				verify_rankings_manifest,
			),
			(
				"rankings:activate",
				["manifest.json"],
				"ranking seed activation report",
				activate_rankings_manifest,
			),
			(
				"rankings:rollback",
				["manifest.json", "--target-release-id", "release-old"],
				"ranking seed rollback report",
				rollback_rankings_manifest,
			),
			(
				"rankings:run",
				["manifest.json"],
				"ranking seed run report",
				run_rankings_manifest,
			),
		]

		parser = cli._parser()
		for command, command_args, label, command_fn in cases:
			with self.subTest(command=command):
				args = parser.parse_args([command, *command_args])
				self.assertIsInstance(args.handler, functools.partial)
				self.assertIs(args.handler.func, cli._write_command)
				self.assertEqual(args.handler.args, (label, command_fn))

	def test_main_dispatches_report_command_from_subparser_defaults(self) -> None:
		calls: list[tuple[Path, Path, object]] = []

		def fake_upload(manifest_path: Path, repo_root: Path, options: object) -> Path:
			calls.append((manifest_path, repo_root, options))
			return repo_root / "upload-report.json"

		with (
			patch.object(cli, "find_repo_root", return_value=Path("/repo")),
			patch.object(cli, "upload_seed_manifest", fake_upload),
			redirect_stdout(io.StringIO()) as stdout,
		):
			result = cli.main(
				[
					"upload",
					"data/seeds/manifest.json",
					"--env",
					"cloud",
					"--dry-run",
				]
			)

		self.assertEqual(result, 0)
		self.assertEqual(stdout.getvalue(), "wrote seed upload report: /repo/upload-report.json\n")
		self.assertEqual(len(calls), 1)
		manifest_path, repo_root, options = calls[0]
		self.assertEqual(manifest_path, Path("/repo/data/seeds/manifest.json"))
		self.assertEqual(repo_root, Path("/repo"))
		self.assertEqual(getattr(options, "env_name"), "cloud")
		self.assertTrue(getattr(options, "dry_run"))


if __name__ == "__main__":
	unittest.main()
