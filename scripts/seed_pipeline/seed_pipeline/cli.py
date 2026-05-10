# scripts/seed_pipeline/seed_pipeline/cli.py
# command-line interface for local seed validation & builds

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .build import build_compiled_manifest
from .diff import write_diff_report_for_manifest
from .manifest import find_repo_root
from .runs import (
    SeedRunOptions,
    activate_seed_manifest,
    apply_seed_manifest,
    cleanup_seed_manifest,
    rollback_seed_manifest,
    run_seed_manifest,
    upload_seed_manifest,
    verify_seed_manifest,
)
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
        if args.command == "upload":
            return _write_command(
                "seed upload report", upload_seed_manifest, manifest_path, repo_root, args
            )
        if args.command == "apply":
            return _write_command(
                "seed apply report", apply_seed_manifest, manifest_path, repo_root, args
            )
        if args.command == "verify":
            return _write_command(
                "seed verify report", verify_seed_manifest, manifest_path, repo_root, args
            )
        if args.command == "cleanup":
            return _write_command(
                "seed cleanup report",
                cleanup_seed_manifest,
                manifest_path,
                repo_root,
                args,
            )
        if args.command == "activate":
            return _write_command(
                "seed activation report",
                activate_seed_manifest,
                manifest_path,
                repo_root,
                args,
            )
        if args.command == "rollback":
            return _write_command(
                "seed rollback report",
                rollback_seed_manifest,
                manifest_path,
                repo_root,
                args,
            )
        if args.command == "run":
            return _write_command(
                "seed run report", run_seed_manifest, manifest_path, repo_root, args
            )
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

    for command in ("upload", "apply", "verify", "cleanup", "activate", "run"):
        command_parser = subparsers.add_parser(command)
        command_parser.add_argument("manifest", type=Path)
        _add_seed_run_args(command_parser)
    rollback_parser = subparsers.add_parser("rollback")
    rollback_parser.add_argument("manifest", type=Path)
    _add_seed_run_args(rollback_parser)
    rollback_parser.add_argument("--target-release-id", required=True)
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


def _write_command(
    label: str,
    command: object,
    manifest_path: Path,
    repo_root: Path,
    args: object,
) -> int:
    options = _seed_run_options(args)
    report_path = command(manifest_path, repo_root, options)
    print(f"wrote {label}: {report_path}")
    return 0


def _add_seed_run_args(parser: argparse.ArgumentParser) -> None:
    # server-write commands share run identity, safety, & checkpoint settings
    parser.add_argument("--env", default="local")
    parser.add_argument("--convex-url")
    parser.add_argument("--seed-secret")
    parser.add_argument("--run-id")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--yes", action="store_true")
    parser.add_argument("--fail-on-warning", action="store_true")
    parser.add_argument("--state-json", type=Path)
    parser.add_argument("--max-upload-bytes", type=int)
    parser.add_argument("--confirm-activation", action="store_true")
    parser.add_argument("--previous-release-id")


def _seed_run_options(args: object) -> SeedRunOptions:
    return SeedRunOptions(
        env_name=getattr(args, "env"),
        convex_url=getattr(args, "convex_url"),
        seed_secret=getattr(args, "seed_secret"),
        run_id=getattr(args, "run_id"),
        dry_run=getattr(args, "dry_run"),
        yes=getattr(args, "yes"),
        fail_on_warning=getattr(args, "fail_on_warning"),
        max_upload_bytes=getattr(args, "max_upload_bytes"),
        confirm_activation=getattr(args, "confirm_activation"),
        previous_release_id=getattr(args, "previous_release_id"),
        target_release_id=getattr(args, "target_release_id", None),
        state_json=getattr(args, "state_json"),
    )


def _print_diagnostics(diagnostics: tuple[object, ...]) -> None:
    for diagnostic in diagnostics:
        code = getattr(diagnostic, "code")
        path = getattr(diagnostic, "path")
        message = getattr(diagnostic, "message")
        print(f"{code} {path}: {message}", file=sys.stderr)
