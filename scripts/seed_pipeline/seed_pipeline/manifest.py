# scripts/seed_pipeline/seed_pipeline/manifest.py
# JSON file helpers & repo-root discovery for seed commands

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


JsonObject = dict[str, Any]


def find_repo_root(start: Path | None = None) -> Path:
    current = (start or Path.cwd()).resolve()
    for candidate in (current, *current.parents):
        # require both app metadata & seed schemas so temp fixtures behave like the repo
        if (candidate / "package.json").is_file() and (
            candidate / "data" / "seeds" / "schemas"
        ).is_dir():
            return candidate
    msg = f"could not find repo root from {current}"
    raise FileNotFoundError(msg)


def repo_relative(path: Path, repo_root: Path) -> str:
    # store manifest paths relative to repo root so cache artifacts move cleanly
    return path.resolve().relative_to(repo_root.resolve()).as_posix()


def read_json(path: Path) -> JsonObject:
    # seed contracts are object-shaped; arrays/scalars are always caller mistakes
    with path.open("r", encoding="utf-8") as file:
        value = json.load(file)
    if not isinstance(value, dict):
        msg = f"{path} must contain a JSON object"
        raise ValueError(msg)
    return value


def write_json(path: Path, value: JsonObject) -> None:
    # write deterministic, reviewable JSON for compiled manifests & fixtures
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        json.dump(value, file, indent=2, sort_keys=False)
        file.write("\n")
