# scripts/seed_pipeline/seed_pipeline/convex_client.py
# tiny Convex HTTP client for seed precheck queries

from __future__ import annotations

import json
import os
import re
import time
from collections.abc import Iterable, Mapping
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
HTTP_TIMEOUT_SECONDS = 600
CONVEX_CLIENT_HEADER = "python-1.0.0"
CONVEX_SEED_SECRET_ENV = "CONVEX_SEED_SECRET"
CONVEX_SEED_AUTHOR_PASSWORD_ENV = "CONVEX_SEED_AUTHOR_PASSWORD"
CONVEX_SITE_URL_ENV_NAMES = (
	"CONVEX_SITE_URL",
	"VITE_CONVEX_SITE_URL",
	"CONVEX_URL",
	"VITE_CONVEX_URL",
)
# substrings Convex emits when per-deployment write-rate caps trip. mirror
# convex/lib/retry.ts isConvexWriteThrottleError when markers change
CONVEX_WRITE_RATE_ERROR_MARKERS: tuple[str, ...] = (
	"Too many writes per second",
	"Too many concurrent commits",
	"bytes written per 1 second",
)


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

	# query/mutation/action mirror the backing Convex function kind for call-site
	# readability; every seed endpoint is a POST to its /api/seed/* route
	def query(self, route: str, args: JsonObject) -> JsonObject:
		return self._call(route, args)

	def mutation(self, route: str, args: JsonObject) -> JsonObject:
		return self._call(route, args)

	def action(self, route: str, args: JsonObject) -> JsonObject:
		return self._call(route, args)

	def upload_file(
		self,
		upload_url: str,
		path: Path,
		mime_type: str,
		expected_byte_size: int | None = None,
	) -> str:
		# stat() before read_bytes() so a variant that changed on disk since build
		# (where it was validated & hashed) can't be slurped into memory or
		# uploaded with bytes that won't match its contentHash at finalize
		if expected_byte_size is not None:
			actual_byte_size = path.stat().st_size
			if actual_byte_size != expected_byte_size:
				raise ConvexClientError(
					f"upload aborted: {path} is {actual_byte_size} bytes, "
					f"expected {expected_byte_size} (cache file changed since build?)"
				)
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

	def _call(self, route: str, args: JsonObject) -> JsonObject:
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
				with urlopen(request_factory(), timeout=HTTP_TIMEOUT_SECONDS) as response:
					payload = json.loads(response.read().decode("utf-8"))
					if isinstance(payload, dict):
						return payload
					raise ConvexClientError("Convex returned a non-object payload")
			except HTTPError as error:
				detail = error.read().decode("utf-8")
				last_error = self._error_from_http_detail(detail, error.code)
				if error.code not in RETRYABLE_HTTP_STATUS or attempt == HTTP_ATTEMPTS - 1:
					raise last_error from error
			except TimeoutError as error:
				last_error = ConvexClientError(self._scrub_secret(str(error)))
				raise last_error from error
			except URLError as error:
				last_error = ConvexClientError(self._scrub_secret(str(error)))
				if attempt == HTTP_ATTEMPTS - 1:
					raise last_error from error
			time.sleep(HTTP_RETRY_BASE_SECONDS * (2**attempt))
		raise last_error or ConvexClientError("Convex request failed")

	def _scrub_secret(self, message: str) -> str:
		# both the seed secret and author_password ride in request bodies, so a
		# Convex error echo or traceback could leak them into CI logs. redact every
		# secret in a single pass so a placeholder inserted for one is never
		# rescanned for another (sequential str.replace could otherwise let one
		# secret's value corrupt an already-inserted marker).
		redactions = {
			secret: placeholder
			for secret, placeholder in (
				(self.settings.seed_secret, "[redacted-seed-secret]"),
				(self.settings.author_password, "[redacted-author-password]"),
			)
			if secret
		}
		if not redactions:
			return message
		# longest secrets first so a value that is a substring of another still
		# resolves to its own (more specific) placeholder
		ordered = sorted(redactions, key=len, reverse=True)
		pattern = re.compile("|".join(re.escape(secret) for secret in ordered))
		return pattern.sub(lambda match: redactions[match.group(0)], message)

	def _error_from_http_detail(self, detail: str, http_status: int) -> ConvexClientError:
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
	resolved_url = resolve_convex_site_url(repo_root, convex_url, env)
	resolved_secret = resolve_seed_secret(env, seed_secret)
	resolved_author_password = resolve_seed_author_password(env)
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


def resolve_seed_secret(env: Mapping[str, str], explicit: str | None = None) -> str | None:
	return explicit or os.environ.get(CONVEX_SEED_SECRET_ENV) or env.get(CONVEX_SEED_SECRET_ENV)


def resolve_seed_author_password(env: Mapping[str, str]) -> str | None:
	return os.environ.get(CONVEX_SEED_AUTHOR_PASSWORD_ENV) or env.get(
		CONVEX_SEED_AUTHOR_PASSWORD_ENV
	)


def resolve_convex_site_url(
	repo_root: Path,
	cli_override: str | None = None,
	env: Mapping[str, str] | None = None,
) -> str | None:
	dotenv_env = env if env is not None else load_dotenv(repo_root / ".env.local")
	value = _first_string(
		(
			cli_override,
			*(os.environ.get(name) for name in CONVEX_SITE_URL_ENV_NAMES),
			*(dotenv_env.get(name) for name in CONVEX_SITE_URL_ENV_NAMES),
		)
	)
	return normalize_convex_site_url(value) if value else None


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


def is_convex_write_rate_error(error: BaseException) -> bool:
	message = str(error)
	return any(marker in message for marker in CONVEX_WRITE_RATE_ERROR_MARKERS)


def _first_string(values: Iterable[str | None]) -> str | None:
	return next((value for value in values if value), None)


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
