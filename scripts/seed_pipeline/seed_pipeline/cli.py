# scripts/seed_pipeline/seed_pipeline/cli.py
# command-line interface for local seed validation & builds

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .build import build_compiled_manifest
from .diff import write_diff_report_for_manifest
from .manifest import find_repo_root
from .validate import ManifestValidationError, validate_source_manifest


def main(argv: list[str] | None = None) -> int:
    parser = _parser()
    args = parser.parse_args(argv)
    repo_root = find_repo_root()
    manifest_path = (repo_root / args.manifest).resolve()
    try:
        # keep command dispatch thin so phases can add workflows w/o parser churn
        if args.command == "validate":
            return _validate(manifest_path, repo_root, args.fail_on_warning)
        if args.command == "build":
            return _build(manifest_path, repo_root, args.fail_on_warning)
        if args.command in {"diff", "preflight"}:
            return _diff(manifest_path, repo_root, args)
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
    # Phase 1/2 commands never touch Convex or upload media
    for command in ("validate", "build"):
        command_parser = subparsers.add_parser(command)
        command_parser.add_argument("manifest", type=Path)
        command_parser.add_argument("--fail-on-warning", action="store_true")
    # Phase 3 precheck commands call Convex reads but never write state
    for command in ("diff", "preflight"):
        command_parser = subparsers.add_parser(command)
        command_parser.add_argument("manifest", type=Path)
        command_parser.add_argument("--env", default="local")
        command_parser.add_argument("--convex-url")
        command_parser.add_argument("--seed-secret")
        command_parser.add_argument("--state-json", type=Path)
        command_parser.add_argument("--fail-on-warning", action="store_true")
    # reserve Phase 3+ command names now, but keep them non-writing
    for command in ("upload", "apply", "verify", "cleanup", "run"):
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


def _diff(manifest_path: Path, repo_root: Path, args: object) -> int:
    report_path = write_diff_report_for_manifest(
        manifest_path,
        repo_root,
        env_name=getattr(args, "env"),
        fail_on_warning=getattr(args, "fail_on_warning"),
        convex_url=getattr(args, "convex_url"),
        seed_secret=getattr(args, "seed_secret"),
        state_json=getattr(args, "state_json"),
    )
    print(f"wrote seed diff report: {report_path}")
    return 0


def _print_diagnostics(diagnostics: tuple[object, ...]) -> None:
    for diagnostic in diagnostics:
        code = getattr(diagnostic, "code")
        path = getattr(diagnostic, "path")
        message = getattr(diagnostic, "message")
        print(f"{code} {path}: {message}", file=sys.stderr)
