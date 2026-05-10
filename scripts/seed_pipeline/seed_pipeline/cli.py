# scripts/seed_pipeline/seed_pipeline/cli.py
# command-line interface for local seed validation & builds

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .build import build_compiled_manifest
from .manifest import find_repo_root
from .validate import ManifestValidationError, validate_source_manifest


def main(argv: list[str] | None = None) -> int:
    parser = _parser()
    args = parser.parse_args(argv)
    repo_root = find_repo_root()
    manifest_path = (repo_root / args.manifest).resolve()
    try:
        if args.command == "validate":
            return _validate(manifest_path, repo_root, args.fail_on_warning)
        if args.command in {"build", "preflight"}:
            return _build(manifest_path, repo_root, args.fail_on_warning)
    except ManifestValidationError as error:
        _print_diagnostics(error.errors)
        return 1
    except Exception as error:
        print(f"seed pipeline failed: {error}", file=sys.stderr)
        return 1
    parser.error(f"unsupported command: {args.command}")
    return 2


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m seed_pipeline")
    subparsers = parser.add_subparsers(dest="command", required=True)
    for command in ("validate", "build", "preflight"):
        command_parser = subparsers.add_parser(command)
        command_parser.add_argument("manifest", type=Path)
        command_parser.add_argument("--fail-on-warning", action="store_true")
    # reserve Phase 3+ command names now, but keep them non-writing
    for command in ("diff", "upload", "apply", "verify", "cleanup", "run"):
        command_parser = subparsers.add_parser(command)
        command_parser.add_argument("manifest", type=Path)
        command_parser.set_defaults(command=command)
    return parser


def _validate(manifest_path: Path, repo_root: Path, fail_on_warning: bool) -> int:
    result = validate_source_manifest(manifest_path, repo_root)
    _print_diagnostics((*result.errors, *result.warnings))
    if result.errors or (fail_on_warning and result.warnings):
        return 1
    print(f"valid source manifest: {manifest_path}")
    return 0


def _build(manifest_path: Path, repo_root: Path, fail_on_warning: bool) -> int:
    compiled_path = build_compiled_manifest(manifest_path, repo_root, fail_on_warning)
    print(f"wrote compiled manifest: {compiled_path}")
    return 0


def _print_diagnostics(diagnostics: tuple[object, ...]) -> None:
    for diagnostic in diagnostics:
        code = getattr(diagnostic, "code")
        path = getattr(diagnostic, "path")
        message = getattr(diagnostic, "message")
        print(f"{code} {path}: {message}", file=sys.stderr)
