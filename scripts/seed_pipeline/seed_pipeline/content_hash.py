# scripts/seed_pipeline/seed_pipeline/content_hash.py
# canonical seed content-hash vectors shared by apply, diff, & tests

from __future__ import annotations

import hashlib
import json


# mirrors packages/contracts/marketplace/seedPipeline.ts. both sides serialize
# {kind, payload} as canonical JSON, then truncate sha256 under a version prefix.
SEED_CONTENT_HASH_VERSION = "v1"
SEED_CONTENT_HASH_HEX_LENGTH = 32


def seed_content_hash(kind: str, payload: object) -> str:
	serialized = json.dumps(
		{"kind": kind, "payload": payload},
		sort_keys=True,
		separators=(",", ":"),
		ensure_ascii=False,
	)
	digest = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
	return f"{SEED_CONTENT_HASH_VERSION}:{digest[:SEED_CONTENT_HASH_HEX_LENGTH]}"
