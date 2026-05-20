# scripts/seed_pipeline/seed_pipeline/settings.py
# shared paths & variant defaults for local seed builds

from pathlib import Path

# schemas live inside the pipeline package so they travel with the code that
# validates against them and nothing seed-related needs to be tracked under data/
_PACKAGE_DIR = Path(__file__).resolve().parent
SCHEMA_DIR = _PACKAGE_DIR / "schemas"
MARKETPLACE_CORE_SCHEMA_PATH = SCHEMA_DIR / "marketplace-core.schema.json"
TEMPLATE_SCHEMA_PATH = SCHEMA_DIR / "template.schema.json"
RANKING_PROFILES_SCHEMA_PATH = SCHEMA_DIR / "ranking-profiles.schema.json"
COMPILED_SCHEMA_PATH = SCHEMA_DIR / "compiled-manifest.schema.json"
# split-source layout (all local-only): marketplace-core.json is the thin index;
# each template lives at data/seeds/templates/<cat>/<slug>.json and points to its
# asset folder via the `folder` field; rankings extract to ranking-profiles.json.
TEMPLATE_FILE_GLOB = "data/seeds/templates/*/*.json"
RANKING_PROFILES_FILE_NAME = "ranking-profiles.json"
COVER_FILE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp")
# composition layer translates source v2 → legacy v1 in-memory shape so build.py
# and the compiled-manifest contract stay byte-stable across the source-split refactor
LEGACY_IN_MEMORY_SCHEMA_VERSION = 1
CACHE_ROOT_RELATIVE_PATH = Path(".seed-cache")
# inspect sidecars live above per-release dirs so re-runs share decode/hash work
INSPECT_CACHE_RELATIVE_PATH = CACHE_ROOT_RELATIVE_PATH / "inspect"

# keep generated manifests stable across repeated local builds
VARIANT_SPEC_VERSION = "seed-variants-v1"
DETERMINISTIC_GENERATED_AT = "1970-01-01T00:00:00.000Z"
# bump when the sidecar JSON shape OR the analysis that fills it changes, so
# stale caches self-invalidate (v3: media-plate threshold retuned in crop.py)
INSPECT_CACHE_SCHEMA_VERSION = 3
VARIANT_META_SCHEMA_VERSION = 1
# top-level compile cache lets warm runs skip validation + per-source work entirely.
# bump when the compile pipeline changes shape in ways the per-source caches miss
# (v6: imagePadding output + zero source-bbox padding for transform parity)
COMPILE_FINGERPRINT_SCHEMA_VERSION = 6
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
