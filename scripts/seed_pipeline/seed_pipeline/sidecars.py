# scripts/seed_pipeline/seed_pipeline/sidecars.py
# atomic JSON sidecar cache helpers

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

from .manifest import JsonObject


def read_sidecar_json(path: Path) -> JsonObject | None:
    try:
        with path.open("r", encoding="utf-8") as file:
            value = json.load(file)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None
    return value if isinstance(value, dict) else None


def write_sidecar_json(path: Path, payload: JsonObject) -> None:
    # write atomically so a crashed run can never poison the cache w/ partial JSON
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f"{path.name}.", dir=str(path.parent))
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as file:
            json.dump(payload, file)
        os.replace(tmp_path, path)
    except BaseException:
        tmp_path.unlink(missing_ok=True)
        raise
