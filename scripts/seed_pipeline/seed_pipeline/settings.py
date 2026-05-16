# scripts/seed_pipeline/seed_pipeline/settings.py
# shared paths & variant defaults for local seed builds

from pathlib import Path

# keep schema/cache paths repo-relative so CLI output is portable
SOURCE_SCHEMA_RELATIVE_PATH = Path("data/seeds/schemas/source-manifest.schema.json")
COMPILED_SCHEMA_RELATIVE_PATH = Path(
    "data/seeds/schemas/compiled-manifest.schema.json"
)
CACHE_ROOT_RELATIVE_PATH = Path(".seed-cache")
# inspect sidecars live above per-release dirs so re-runs share decode/hash work
INSPECT_CACHE_RELATIVE_PATH = CACHE_ROOT_RELATIVE_PATH / "inspect"

# keep generated manifests stable across repeated local builds
VARIANT_SPEC_VERSION = "seed-variants-v1"
DETERMINISTIC_GENERATED_AT = "1970-01-01T00:00:00.000Z"
# bump these when sidecar JSON shape changes so stale caches self-invalidate
INSPECT_CACHE_SCHEMA_VERSION = 1
VARIANT_META_SCHEMA_VERSION = 1
# top-level compile cache lets warm runs skip validation + per-source work entirely.
# bump when the compile pipeline changes shape in ways the per-source caches miss
COMPILE_FINGERPRINT_SCHEMA_VERSION = 3
COMPILE_FINGERPRINT_FILENAME = "compile-fingerprint.json"

# gate source files before variant generation does heavier image work
SUPPORTED_SOURCE_SUFFIXES = {".gif", ".jpeg", ".jpg", ".png", ".webp"}
TILE_MAX_SIZE = 120
TILE_WEBP_QUALITY = 82
TILE_MAX_BYTES = 250_000
PREVIEW_MAX_SIZE = 4000
PREVIEW_JPEG_QUALITY = 86
PREVIEW_MAX_BYTES = 5_000_000
MAX_SOURCE_IMAGE_BYTE_SIZE = 20 * 1024 * 1024
MAX_SOURCE_IMAGE_DIMENSION = 10_000
MIXED_TEMPLATE_ITEM_ASPECT_RATIO = 1
