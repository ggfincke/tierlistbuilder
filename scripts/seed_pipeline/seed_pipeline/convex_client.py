# scripts/seed_pipeline/seed_pipeline/convex_client.py
# tiny Convex HTTP client for seed precheck queries

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, urlunsplit
from urllib.request import Request, urlopen

from .manifest import JsonObject

# 409 is OCC conflict, not a transient failure; 408 is ambiguous for writes.
RETRYABLE_HTTP_STATUS = {429, 500, 502, 503, 504}
HTTP_ATTEMPTS = 4
HTTP_RETRY_BASE_SECONDS = 0.5
CONVEX_CLIENT_HEADER = "python-1.0.0"

SEED_HTTP_ROUTES = {
    ("query", "marketplace/seedRuns:resolveSeedState"): "/api/seed/state",
    (
        "query",
        "marketplace/seedRuns:resolveSeedMediaByHashes",
    ): "/api/seed/media-by-hashes",
    ("query", "marketplace/seedRuns:getSeedRunStatus"): "/api/seed/status",
    ("mutation", "marketplace/seedRuns:beginSeedRun"): "/api/seed/begin",
    (
        "mutation",
        "marketplace/seedRuns:generateSeedUploadUrls",
    ): "/api/seed/upload-urls",
    (
        "mutation",
        "marketplace/seedPipeline/storageUploads:registerSeedUploadedStorageIds",
    ): "/api/seed/register-uploads",
    ("mutation", "marketplace/seedRuns:upsertSeedTemplates"): "/api/seed/upsert-templates",
    (
        "mutation",
        "marketplace/seedRuns:syncSeedTemplateItems",
    ): "/api/seed/sync-template-items",
    ("mutation", "marketplace/seedRuns:upsertSeedCriteria"): "/api/seed/upsert-criteria",
    (
        "mutation",
        "marketplace/seedRuns:verifySeedReleaseChunk",
    ): "/api/seed/verify-chunk",
    (
        "mutation",
        "marketplace/seedRuns:completeSeedReleaseVerification",
    ): "/api/seed/complete-verification",
    ("mutation", "marketplace/seedRuns:activateSeedRelease"): "/api/seed/activate",
    ("mutation", "marketplace/seedRuns:rollbackSeedRelease"): "/api/seed/rollback",
    (
        "query",
        "marketplace/rankings/seed:preflightSeedRankings",
    ): "/api/seed/rankings/preflight",
    (
        "query",
        "marketplace/rankings/seed:verifySeedRankings",
    ): "/api/seed/rankings/verify",
    (
        "mutation",
        "marketplace/rankings/seedLifecycle:activateSeedRankings",
    ): "/api/seed/rankings/activate",
    (
        "mutation",
        "marketplace/rankings/seedLifecycle:rollbackSeedRankings",
    ): "/api/seed/rankings/rollback",
    (
        "action",
        "marketplace/rankings/seed:ensureSeedRankingAuthors",
    ): "/api/seed/rankings/ensure-authors",
    (
        "action",
        "marketplace/seedRuns:ensureSeedAuthor",
    ): "/api/seed/ensure-author",
    (
        "action",
        "marketplace/seedRuns:finalizeSeedUploadedMedia",
    ): "/api/seed/finalize-media",
    (
        "action",
        "marketplace/rankings/seed:applySeedRankings",
    ): "/api/seed/rankings/apply",
    (
        "action",
        "marketplace/seedPipeline/storageUploads:cleanupAbandonedSeedRun",
    ): "/api/seed/cleanup",
    ("action", "dev/reset:wipeDeployment"): "/api/dev/reset",
}


@dataclass(frozen=True)
class ConvexSeedSettings:
    site_url: str
    seed_secret: str
    env_name: str
    author_password: str | None = None


class ConvexClientError(RuntimeError):
    def __init__(
        self,
        message: str,
        error_code: str | None = None,
        http_status: int | None = None,
    ) -> None:
        super().__init__(message)
        self.error_code = error_code
        self.http_status = http_status


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
        body = path.read_bytes()
        payload = self._request_json(
            lambda: Request(
                upload_url,
                data=body,
                headers={"Content-Type": mime_type},
                method="POST",
            )
        )
        storage_id = payload.get("storageId")
        if not isinstance(storage_id, str):
            raise ConvexClientError("Convex upload did not return storageId")
        return storage_id

    def _call(self, kind: str, function_path: str, args: JsonObject) -> JsonObject:
        route = SEED_HTTP_ROUTES.get((kind, function_path))
        if route is None:
            raise ConvexClientError(f"unsupported seed Convex function: {function_path}")
        body = json.dumps(args).encode("utf-8")
        payload = self._request_json(
            lambda: Request(
                f"{self.settings.site_url.rstrip('/')}{route}",
                data=body,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {self.settings.seed_secret}",
                    "Convex-Client": CONVEX_CLIENT_HEADER,
                },
                method="POST",
            )
        )
        if payload.get("status") == "success":
            value = payload.get("value")
            if isinstance(value, dict):
                return value
            raise ConvexClientError("Convex returned a non-object response")
        raise self._error_from_payload(payload)

    def _request_json(self, request_factory: Callable[[], Request]) -> JsonObject:
        last_error: Exception | None = None
        for attempt in range(HTTP_ATTEMPTS):
            try:
                with urlopen(request_factory(), timeout=120) as response:
                    payload = json.loads(response.read().decode("utf-8"))
                    if isinstance(payload, dict):
                        return payload
                    raise ConvexClientError("Convex returned a non-object payload")
            except HTTPError as error:
                detail = error.read().decode("utf-8")
                last_error = self._error_from_http_detail(detail, error.code)
                if error.code not in RETRYABLE_HTTP_STATUS or attempt == HTTP_ATTEMPTS - 1:
                    raise last_error from error
            except (TimeoutError, URLError) as error:
                last_error = ConvexClientError(self._scrub_secret(str(error)))
                if attempt == HTTP_ATTEMPTS - 1:
                    raise last_error from error
            time.sleep(HTTP_RETRY_BASE_SECONDS * (2**attempt))
        raise last_error or ConvexClientError("Convex request failed")

    def _scrub_secret(self, message: str) -> str:
        return message.replace(self.settings.seed_secret, "[redacted-seed-secret]")

    def _error_from_http_detail(
        self, detail: str, http_status: int
    ) -> ConvexClientError:
        try:
            payload = json.loads(detail)
        except json.JSONDecodeError:
            return ConvexClientError(self._scrub_secret(detail), http_status=http_status)
        if isinstance(payload, dict):
            return self._error_from_payload(payload, http_status=http_status)
        return ConvexClientError(self._scrub_secret(detail), http_status=http_status)

    def _error_from_payload(
        self, payload: JsonObject, http_status: int | None = None
    ) -> ConvexClientError:
        message = payload.get("errorMessage") or payload
        error_code = payload.get("errorCode")
        return ConvexClientError(
            self._scrub_secret(str(message)),
            error_code=error_code if isinstance(error_code, str) else None,
            http_status=http_status,
        )


def read_seed_settings(
    repo_root: Path,
    env_name: str,
    convex_url: str | None = None,
    seed_secret: str | None = None,
) -> ConvexSeedSettings:
    # resolve explicit CLI args first, then shell env, then repo-local dotenv
    env = load_dotenv(repo_root / ".env.local")
    resolved_url = (
        convex_url
        or os.environ.get("CONVEX_SITE_URL")
        or os.environ.get("VITE_CONVEX_SITE_URL")
        or os.environ.get("CONVEX_URL")
        or os.environ.get("VITE_CONVEX_URL")
        or env.get("CONVEX_SITE_URL")
        or env.get("VITE_CONVEX_SITE_URL")
        or env.get("CONVEX_URL")
        or env.get("VITE_CONVEX_URL")
    )
    resolved_secret = (
        seed_secret
        or os.environ.get("CONVEX_SEED_SECRET")
        or env.get("CONVEX_SEED_SECRET")
    )
    resolved_author_password = (
        os.environ.get("CONVEX_SEED_AUTHOR_PASSWORD")
        or env.get("CONVEX_SEED_AUTHOR_PASSWORD")
    )
    if not resolved_url:
        raise ConvexClientError(
            "CONVEX_SITE_URL / VITE_CONVEX_SITE_URL / CONVEX_URL / VITE_CONVEX_URL is not set"
        )
    if not resolved_secret:
        raise ConvexClientError("CONVEX_SEED_SECRET is not set")
    if not resolved_author_password:
        raise ConvexClientError("CONVEX_SEED_AUTHOR_PASSWORD is not set")
    return ConvexSeedSettings(
        site_url=normalize_convex_site_url(resolved_url),
        seed_secret=resolved_secret,
        author_password=resolved_author_password,
        env_name=env_name,
    )


def normalize_convex_site_url(url: str) -> str:
    parsed = urlsplit(url.strip())
    hostname = parsed.hostname
    if not parsed.scheme or not hostname:
        return url.strip().rstrip("/")
    hostname = hostname.lower()
    if hostname.endswith(".convex.cloud"):
        netloc = parsed.netloc.replace(".convex.cloud", ".convex.site")
        return urlunsplit((parsed.scheme, netloc, parsed.path, "", "")).rstrip("/")
    try:
        port = parsed.port
    except ValueError:
        return url.strip().rstrip("/")
    if port == 3210:
        netloc = _replace_url_port(parsed.netloc, "3210", "3211")
        return urlunsplit((parsed.scheme, netloc, parsed.path, "", "")).rstrip("/")
    return url.strip().rstrip("/")


def _replace_url_port(netloc: str, old_port: str, new_port: str) -> str:
    suffix = f":{old_port}"
    if netloc.endswith(suffix):
        return f"{netloc[: -len(suffix)]}:{new_port}"
    return netloc


def load_dotenv(path: Path) -> dict[str, str]:
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
        else:
            # strip the unquoted trailing "  # comment" left by `npx convex dev`
            comment_idx = value.find(" #")
            if comment_idx >= 0:
                value = value[:comment_idx].rstrip()
        values[key] = value
    return values
