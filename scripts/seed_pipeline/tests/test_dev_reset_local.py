# scripts/seed_pipeline/tests/test_dev_reset_local.py
# local fast reset safety coverage

from __future__ import annotations

from io import StringIO
import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from scripts import dev_reset_local


class LocalFastResetTests(unittest.TestCase):
    def test_replace_local_state_moves_existing_state_and_preserves_config(
        self,
    ) -> None:
        with TemporaryDirectory() as temp_dir:
            state_dir = os.path.join(temp_dir, "default")
            os.makedirs(state_dir)
            with open(
                os.path.join(state_dir, dev_reset_local.CONFIG_FILENAME),
                "w",
                encoding="utf-8",
            ) as file:
                file.write('{"instance":"local"}')
            with open(
                os.path.join(state_dir, "old.sqlite3"), "w", encoding="utf-8"
            ) as file:
                file.write("old-db")

            reset_state_dir = Path(state_dir)
            backup_dir = dev_reset_local.replace_local_state(reset_state_dir)

            self.assertIsNotNone(backup_dir)
            assert backup_dir is not None
            self.assertTrue(backup_dir.is_dir())
            self.assertTrue((backup_dir / "old.sqlite3").is_file())
            self.assertFalse((reset_state_dir / "old.sqlite3").exists())
            self.assertEqual(
                (reset_state_dir / "config.json").read_text(encoding="utf-8"),
                '{"instance":"local"}',
            )

    def test_main_refuses_non_local_deployment(self) -> None:
        with (
            patch.dict(os.environ, {"CONVEX_DEPLOYMENT": "dev:remote"}, clear=True),
            patch.object(sys, "argv", ["dev_reset_local.py", "--yes"]),
            patch("scripts.dev_reset_local.load_dotenv", return_value={}),
            patch("sys.stderr", new_callable=StringIO) as stderr,
        ):
            self.assertEqual(dev_reset_local.main(), 2)

        self.assertIn("must start with 'local:'", stderr.getvalue())

    def test_main_refuses_without_yes_before_port_check(self) -> None:
        with (
            patch.dict(os.environ, {"CONVEX_DEPLOYMENT": "local:test"}, clear=True),
            patch.object(sys, "argv", ["dev_reset_local.py"]),
            patch("scripts.dev_reset_local.load_dotenv", return_value={}),
            patch("scripts.dev_reset_local.active_local_ports") as active_ports,
            patch("sys.stdout", new_callable=StringIO),
            patch("sys.stderr", new_callable=StringIO),
        ):
            self.assertEqual(dev_reset_local.main(), 2)

        active_ports.assert_not_called()

    def test_main_refuses_when_local_convex_ports_are_active(self) -> None:
        with (
            patch.dict(os.environ, {"CONVEX_DEPLOYMENT": "local:test"}, clear=True),
            patch.object(sys, "argv", ["dev_reset_local.py", "--yes"]),
            patch("scripts.dev_reset_local.load_dotenv", return_value={}),
            patch("scripts.dev_reset_local.active_local_ports", return_value=[3210]),
            patch("scripts.dev_reset_local.replace_local_state") as replace_state,
            patch("sys.stdout", new_callable=StringIO),
            patch("sys.stderr", new_callable=StringIO) as stderr,
        ):
            self.assertEqual(dev_reset_local.main(), 2)

        replace_state.assert_not_called()
        self.assertIn("local Convex ports are active", stderr.getvalue())

    def test_main_refuses_without_seed_secret_before_replacing_state(self) -> None:
        with (
            patch.dict(os.environ, {"CONVEX_DEPLOYMENT": "local:test"}, clear=True),
            patch.object(sys, "argv", ["dev_reset_local.py", "--yes"]),
            patch("scripts.dev_reset_local.load_dotenv", return_value={}),
            patch("scripts.dev_reset_local.active_local_ports", return_value=[]),
            patch("scripts.dev_reset_local.replace_local_state") as replace_state,
            patch("sys.stdout", new_callable=StringIO),
            patch("sys.stderr", new_callable=StringIO) as stderr,
        ):
            self.assertEqual(dev_reset_local.main(), 2)

        replace_state.assert_not_called()
        self.assertIn("CONVEX_SEED_SECRET is required", stderr.getvalue())

    def test_main_replaces_state_then_bootstraps_auth_and_seed_env(self) -> None:
        with TemporaryDirectory() as temp_dir:
            state_dir = Path(temp_dir) / "default"
            os.makedirs(state_dir)
            (state_dir / dev_reset_local.CONFIG_FILENAME).write_text(
                "{}", encoding="utf-8"
            )
            calls: list[list[str]] = []
            seed_env_files: list[str] = []

            def run_fake(
                command: list[str],
                cwd: Path,
                check: bool,
            ) -> object:
                calls.append(command)
                if "--from-file" in command:
                    file_arg = command[command.index("--from-file") + 1]
                    seed_env_files.append(Path(file_arg).read_text(encoding="utf-8"))
                self.assertEqual(cwd, dev_reset_local.REPO_ROOT)
                self.assertTrue(check)
                return object()

            with (
                patch.dict(
                    os.environ, {"CONVEX_DEPLOYMENT": "local:test"}, clear=True
                ),
                patch.object(
                    sys,
                    "argv",
                    ["dev_reset_local.py", "--yes", "--site-url=http://localhost:5174"],
                ),
                patch("scripts.dev_reset_local.LOCAL_STATE_DIR", state_dir),
                patch(
                    "scripts.dev_reset_local.load_dotenv",
                    return_value={"CONVEX_SEED_SECRET": "super-secret"},
                ),
                patch("scripts.dev_reset_local.active_local_ports", return_value=[]),
                patch("scripts.dev_reset_local.subprocess.run", side_effect=run_fake),
                patch("sys.stdout", new_callable=StringIO),
            ):
                self.assertEqual(dev_reset_local.main(), 0)

        self.assertEqual(calls[0], [
            "npx",
            "convex",
            "dev",
            "--local",
            "--once",
            "--typecheck",
            "disable",
        ])
        self.assertEqual(calls[1], [
            "node",
            "scripts/setup-local-convex-auth.mjs",
            "--site-url=http://localhost:5174",
        ])
        self.assertEqual(calls[2][:6], [
            "npx",
            "convex",
            "env",
            "set",
            "--deployment",
            "local",
        ])
        self.assertEqual(calls[2][6], "--from-file")
        self.assertEqual(calls[2][8], "--force")
        seed_env = seed_env_files[0]
        self.assertIn("CONVEX_SEED_ENABLED=true", seed_env)
        self.assertIn("CONVEX_DEV_RESET_ALLOWED=true", seed_env)
        self.assertIn("CONVEX_SEED_SECRET=super-secret", seed_env)


if __name__ == "__main__":
    unittest.main()
