# scripts/seed_pipeline/seed_pipeline/convex_client.py
# tiny Convex HTTP client for seed precheck queries

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from .manifest import JsonObject


@dataclass(frozen=True)
class ConvexSeedSettings:
    convex_url: str
    seed_secret: str
    env_name: str


class ConvexClientError(RuntimeError):
    pass


class ConvexSeedClient:
    def __init__(self, settings: ConvexSeedSettings) -> None:
        self.settings = settings

    def query(self, function_path: str, args: JsonObject) -> JsonObject:
        return self._call("query", function_path, args)

    def mutation(self, function_path: str, args: JsonObject) -> JsonObject:
        return self._call("mutation", function_path, args)

    def action(self, function_path: str, args: JsonObject) -> JsonObject:
        return self._call("action", function_path, args)

    def upload_file(self, upload_url: str, path: Path, mime_type: str) -> str:
        # upload URLs are single-use, so read bytes immediately before POST
        request = Request(
            upload_url,
            data=path.read_bytes(),
            headers={"Content-Type": mime_type},
            method="POST",
        )
        try:
            with urlopen(request, timeout=120) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            detail = error.read().decode("utf-8")
            raise ConvexClientError(detail) from error
        storage_id = payload.get("storageId")
        if not isinstance(storage_id, str):
            raise ConvexClientError("Convex upload did not return storageId")
        return storage_id

    def _call(self, kind: str, function_path: str, args: JsonObject) -> JsonObject:
        # Convex HTTP API expects args wrapped as encoded JSON
        body = json.dumps(
            {
                "path": function_path,
                "format": "convex_encoded_json",
                "args": [args],
            }
        ).encode("utf-8")
        request = Request(
            f"{self.settings.convex_url.rstrip('/')}/api/{kind}",
            data=body,
            headers={
                "Content-Type": "application/json",
                "Convex-Client": "python-seed-pipeline",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=120) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            # surface server validation errors w/o losing Convex detail
            detail = error.read().decode("utf-8")
            raise ConvexClientError(detail) from error
        if payload.get("status") == "success":
            value = payload.get("value")
            if isinstance(value, dict):
                return value
            raise ConvexClientError("Convex returned a non-object response")
        message = payload.get("errorMessage") or payload
        raise ConvexClientError(str(message))


def read_seed_settings(
    repo_root: Path,
    env_name: str,
    convex_url: str | None = None,
    seed_secret: str | None = None,
) -> ConvexSeedSettings:
    # resolve explicit CLI args first, then shell env, then repo-local dotenv
    env = _load_dotenv(repo_root / ".env.local")
    resolved_url = (
        convex_url
        or os.environ.get("CONVEX_URL")
        or os.environ.get("VITE_CONVEX_URL")
        or env.get("CONVEX_URL")
        or env.get("VITE_CONVEX_URL")
    )
    resolved_secret = (
        seed_secret
        or os.environ.get("CONVEX_SEED_SECRET")
        or env.get("CONVEX_SEED_SECRET")
    )
    if not resolved_url:
        raise ConvexClientError("CONVEX_URL / VITE_CONVEX_URL is not set")
    if not resolved_secret:
        raise ConvexClientError("CONVEX_SEED_SECRET is not set")
    return ConvexSeedSettings(
        convex_url=resolved_url,
        seed_secret=resolved_secret,
        env_name=env_name,
    )


def _load_dotenv(path: Path) -> dict[str, str]:
    if not path.is_file():
        return {}
    values: dict[str, str] = {}
    # parse the tiny subset of dotenv syntax used by local Convex settings
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if value.startswith(("'", '"')) and value.endswith(("'", '"')):
            value = value[1:-1]
        values[key] = value
    return values
