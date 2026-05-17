#!/usr/bin/env python3
# scripts/dev_reset_local.py
# fast local-only Convex reset by replacing .convex/local/default.

from __future__ import annotations

import argparse
from datetime import datetime
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
from tempfile import TemporaryDirectory

REPO_ROOT = Path(__file__).resolve().parent.parent
SEED_PIPELINE_SRC = REPO_ROOT / "scripts" / "seed_pipeline"
if str(SEED_PIPELINE_SRC) not in sys.path:
    sys.path.insert(0, str(SEED_PIPELINE_SRC))

from seed_pipeline.convex_client import load_dotenv  # noqa: E402

DOTENV_PATH = REPO_ROOT / ".env.local"
LOCAL_STATE_DIR = REPO_ROOT / ".convex" / "local" / "default"
LOCAL_CONVEX_PORTS = (3210, 3211)
CONFIG_FILENAME = "config.json"
LOCAL_DEPLOYMENT_PREFIX = "local:"
SEED_SECRET_ENV = "CONVEX_SEED_SECRET"
LOCAL_SEED_ENV_VALUES = {
    "CONVEX_SEED_ENABLED": "true",
    "CONVEX_DEV_RESET_ALLOWED": "true",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="fast reset the local Convex deployment by replacing local state"
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help=(
            "required confirmation flag - without it the script aborts "
            "before replacing local state"
        ),
    )
    parser.add_argument(
        "--site-url",
        default="http://localhost:5173",
        help="SITE_URL to restore for local Convex Auth after reset",
    )
    return parser.parse_args()


def active_local_ports() -> list[int]:
    return [
        port
        for port in LOCAL_CONVEX_PORTS
        if is_port_accepting_connections("127.0.0.1", port)
    ]


def is_port_accepting_connections(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.2)
        return sock.connect_ex((host, port)) == 0


def unique_backup_path(state_dir: Path) -> Path:
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    base = state_dir.with_name(f"{state_dir.name}-reset-{timestamp}")
    candidate = base
    suffix = 2
    while candidate.exists():
        candidate = state_dir.with_name(f"{base.name}-{suffix}")
        suffix += 1
    return candidate


def replace_local_state(state_dir: Path) -> Path | None:
    if not state_dir.exists():
        state_dir.mkdir(parents=True, exist_ok=True)
        return None

    backup_dir = unique_backup_path(state_dir)
    config_path = state_dir / CONFIG_FILENAME
    config_bytes = config_path.read_bytes() if config_path.is_file() else None

    shutil.move(str(state_dir), str(backup_dir))
    state_dir.mkdir(parents=True, exist_ok=False)
    if config_bytes is not None:
        (state_dir / CONFIG_FILENAME).write_bytes(config_bytes)
    return backup_dir


def dotenv_quote(value: str) -> str:
    if value and all(ch.isalnum() or ch in "_-./:@" for ch in value):
        return value
    escaped = value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
    return f'"{escaped}"'


def resolve_seed_secret(env: dict[str, str]) -> str | None:
    return os.environ.get(SEED_SECRET_ENV) or env.get(SEED_SECRET_ENV)


def write_seed_env_file(path: Path, seed_secret: str) -> None:
    lines = [
        *(f"{name}={value}" for name, value in LOCAL_SEED_ENV_VALUES.items()),
        f"{SEED_SECRET_ENV}={dotenv_quote(seed_secret)}",
    ]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def restore_local_seed_env(seed_secret: str) -> None:
    with TemporaryDirectory(prefix="tierlistbuilder-convex-seed-") as temp_dir:
        env_file = Path(temp_dir) / "local-seed.env"
        write_seed_env_file(env_file, seed_secret)
        run_checked(
            [
                "npx",
                "convex",
                "env",
                "set",
                "--deployment",
                "local",
                "--from-file",
                str(env_file),
                "--force",
            ],
            display_command=[
                "npx",
                "convex",
                "env",
                "set",
                "--deployment",
                "local",
                "--from-file",
                "<redacted-seed-env-file>",
                "--force",
            ],
        )


def run_checked(command: list[str], display_command: list[str] | None = None) -> None:
    shown = display_command or command
    print(f"running: {' '.join(shown)}")
    subprocess.run(command, cwd=REPO_ROOT, check=True)


def main() -> int:
    args = parse_args()
    env = load_dotenv(DOTENV_PATH)
    deployment = os.environ.get("CONVEX_DEPLOYMENT") or env.get(
        "CONVEX_DEPLOYMENT", ""
    )

    if not deployment.startswith(LOCAL_DEPLOYMENT_PREFIX):
        print(
            "refusing fast reset: CONVEX_DEPLOYMENT must start with 'local:'",
            file=sys.stderr,
        )
        return 2

    print("about to replace local Convex state:")
    print(f"  CONVEX_DEPLOYMENT = {deployment}")
    print(f"  state dir         = {LOCAL_STATE_DIR}")
    print(f"  auth SITE_URL     = {args.site_url}")
    sys.stdout.flush()

    if not args.yes:
        print(
            "\nrefusing to run without --yes. re-run as: "
            "npm run db:reset:local-fast -- --yes",
            file=sys.stderr,
        )
        return 2

    ports = active_local_ports()
    if ports:
        joined = ", ".join(str(port) for port in ports)
        print(
            f"\nrefusing fast reset: local Convex ports are active ({joined}). "
            "Stop npm run dev / npm run dev:convex first.",
            file=sys.stderr,
        )
        return 2

    seed_secret = resolve_seed_secret(env)
    if not seed_secret:
        print(
            f"\nrefusing fast reset: {SEED_SECRET_ENV} is required to restore "
            "local seed env after replacing Convex state.",
            file=sys.stderr,
        )
        return 2

    backup_dir = replace_local_state(LOCAL_STATE_DIR)
    if backup_dir is None:
        print("\nno existing local state directory found; created a fresh one")
    else:
        print(f"\nmoved existing local state to: {backup_dir}")
        if (LOCAL_STATE_DIR / CONFIG_FILENAME).is_file():
            print(f"preserved {CONFIG_FILENAME} in the fresh state directory")

    try:
        run_checked(
            ["npx", "convex", "dev", "--local", "--once", "--typecheck", "disable"]
        )
        run_checked(
            [
                "node",
                "scripts/setup-local-convex-auth.mjs",
                f"--site-url={args.site_url}",
            ]
        )
        restore_local_seed_env(seed_secret)
    except subprocess.CalledProcessError as error:
        print(
            f"\nlocal reset bootstrap failed with exit code {error.returncode}",
            file=sys.stderr,
        )
        if backup_dir is not None:
            print(f"previous local state is still at: {backup_dir}", file=sys.stderr)
        return error.returncode or 1

    print("\nlocal Convex reset complete")
    if backup_dir is not None:
        print(f"previous local state retained at: {backup_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
