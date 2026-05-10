# scripts/seed_pipeline/seed_pipeline/settings.py
# shared paths & variant defaults for local seed builds

from pathlib import Path

# keep generated manifests stable across repeated local builds
SOURCE_SCHEMA_RELATIVE_PATH = Path("data/seeds/schemas/source-manifest.schema.json")
COMPILED_SCHEMA_RELATIVE_PATH = Path(
    "data/seeds/schemas/compiled-manifest.schema.json"
)
CACHE_ROOT_RELATIVE_PATH = Path(".seed-cache")
VARIANT_SPEC_VERSION = "seed-variants-v1"
DETERMINISTIC_GENERATED_AT = "1970-01-01T00:00:00.000Z"
SUPPORTED_SOURCE_SUFFIXES = {".gif", ".jpeg", ".jpg", ".png", ".webp"}
TILE_MAX_SIZE = 120
TILE_WEBP_QUALITY = 82
TILE_MAX_BYTES = 250_000
PREVIEW_MAX_SIZE = 1280
PREVIEW_JPEG_QUALITY = 86
PREVIEW_MAX_BYTES = 1_500_000
MAX_SOURCE_IMAGE_BYTE_SIZE = 20 * 1024 * 1024
MAX_SOURCE_IMAGE_DIMENSION = 10_000
MIXED_TEMPLATE_ITEM_ASPECT_RATIO = 1
