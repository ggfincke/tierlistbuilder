# scripts/seed_pipeline/seed_pipeline/assets.py
# inspect source images & build local tile/preview variants

from __future__ import annotations

import hashlib
import shutil
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Iterable, Literal, get_args

from PIL import Image

from .crop import CropBBox, MediaPlate, analyze_image
from .manifest import JsonObject
from .sidecars import read_sidecar_json, write_sidecar_json
from .settings import (
    INSPECT_CACHE_RELATIVE_PATH,
    INSPECT_CACHE_SCHEMA_VERSION,
    MAX_SOURCE_IMAGE_BYTE_SIZE,
    MAX_SOURCE_IMAGE_DIMENSION,
    PREVIEW_JPEG_QUALITY,
    PREVIEW_MAX_BYTES,
    PREVIEW_MAX_SIZE,
    TILE_MAX_BYTES,
    TILE_MAX_SIZE,
    TILE_WEBP_QUALITY,
    VARIANT_META_SCHEMA_VERSION,
    VARIANT_SPEC_VERSION,
)

# mirror Extract<MediaVariantKind, 'tile' | 'preview'> in seed contract
VariantKind = Literal["tile", "preview"]
MEDIA_PLATE_VALUES = get_args(MediaPlate)
_VARIANT_LOCKS: dict[str, Lock] = {}
_VARIANT_LOCKS_GUARD = Lock()


# source metadata feeds both compiled manifest output & crop decisions
@dataclass(frozen=True)
class SourceAsset:
    path: Path
    repo_relative_path: str
    sha256: str
    mime_type: str
    byte_size: int
    width: int
    height: int
    content_bbox: CropBBox | None
    # tri-state plate decision for transparent logos (None = opaque or balanced)
    media_plate: MediaPlate | None

    @property
    def aspect_ratio(self) -> float:
        return self.width / self.height


def compile_asset(
    source_path: Path,
    repo_root: Path,
    variants_dir: Path,
    source: SourceAsset | None = None,
) -> JsonObject:
    # caller can pass a probed SourceAsset to avoid decoding item images twice
    source = source or inspect_source(source_path, repo_root)
    # build both ingest variants now so upload/apply phases stay metadata-driven
    variants = _build_asset_variants(source, variants_dir)
    return {
        "sourcePath": str(source.path.resolve()),
        "sourcePathRelative": source.repo_relative_path,
        "sourceSha256": source.sha256,
        "sourceMimeType": source.mime_type,
        "sourceByteSize": source.byte_size,
        "sourceWidth": source.width,
        "sourceHeight": source.height,
        "sourceAspectRatio": source.aspect_ratio,
        "crop": source.content_bbox.to_json() if source.content_bbox else None,
        "dedupeHash": compute_variant_dedupe_hash(variants.values()),
        "variants": variants,
    }


def inspect_source(source_path: Path, repo_root: Path) -> SourceAsset:
    resolved = source_path.resolve()
    repo_resolved = repo_root.resolve()
    stat = resolved.stat()
    byte_size = stat.st_size
    # enforce local limits before spending CPU on crop detection
    if byte_size > MAX_SOURCE_IMAGE_BYTE_SIZE:
        msg = f"source image exceeds byte limit: {resolved}"
        raise ValueError(msg)
    repo_relative_path = resolved.relative_to(repo_resolved).as_posix()
    cache_path = _inspect_cache_path(repo_resolved, repo_relative_path)
    cached = _load_inspect_cache(cache_path, resolved, stat.st_mtime_ns, byte_size)
    if cached is not None:
        return cached
    with Image.open(resolved) as image:
        mime_type = _source_mime_type(image.format)
        if mime_type is None:
            msg = f"unsupported image format: {resolved}"
            raise ValueError(msg)
        width, height = image.size
        # keep source sanity checks aligned w/ Convex media validators
        if width > MAX_SOURCE_IMAGE_DIMENSION or height > MAX_SOURCE_IMAGE_DIMENSION:
            msg = f"source image exceeds dimension limit: {resolved}"
            raise ValueError(msg)
        analysis = analyze_image(image)
    asset = SourceAsset(
        path=resolved,
        repo_relative_path=repo_relative_path,
        sha256=sha256_file(resolved),
        mime_type=mime_type,
        byte_size=byte_size,
        width=width,
        height=height,
        content_bbox=analysis.content_bbox,
        media_plate=analysis.media_plate,
    )
    _save_inspect_cache(cache_path, asset, stat.st_mtime_ns)
    return asset


def _source_mime_type(format_name: str | None) -> str | None:
    if format_name == "MPO":
        return "image/jpeg"
    return Image.MIME.get(format_name or "")


def build_variant(
    source_path: Path,
    source_sha256: str,
    kind: VariantKind,
    variants_dir: Path,
    variant_spec_version: str = VARIANT_SPEC_VERSION,
    *,
    source_image: "Image.Image | None" = None,
) -> JsonObject:
    output_path = _variant_output_path(
        source_sha256, kind, variants_dir, variant_spec_version
    )
    with _variant_lock(output_path):
        return _build_variant_locked(
            source_path,
            source_sha256,
            kind,
            variant_spec_version,
            output_path=output_path,
            source_image=source_image,
        )


def _build_variant_locked(
    source_path: Path,
    source_sha256: str,
    kind: VariantKind,
    variant_spec_version: str = VARIANT_SPEC_VERSION,
    *,
    output_path: Path,
    source_image: "Image.Image | None" = None,
) -> JsonObject:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cache_key = _cache_key(source_sha256, kind, variant_spec_version)
    meta_path = _variant_meta_path(output_path)
    # reuse cache file when exact source + spec + kind + settings already exist.
    # interrupted runs can leave a zero-byte or partial file, so verify before
    # trusting a hit and regenerate once if Pillow cannot reopen it. the meta
    # sidecar lets us skip the per-hit Pillow open + sha256 reread entirely.
    if output_path.is_file():
        cached_meta = _load_variant_meta(meta_path, output_path)
        if cached_meta is not None:
            _assert_variant_policy(
                kind,
                cached_meta["byteSize"],
                cached_meta["width"],
                cached_meta["height"],
                output_path,
            )
            return {
                "kind": kind,
                "path": output_path.as_posix(),
                "contentHash": cached_meta["contentHash"],
                "mimeType": cached_meta["mimeType"],
                "byteSize": cached_meta["byteSize"],
                "width": cached_meta["width"],
                "height": cached_meta["height"],
                "cacheKey": cache_key,
            }
    if not output_path.is_file():
        _write_variant(source_path, output_path, kind, source_image=source_image)
        meta_path.unlink(missing_ok=True)
    try:
        width, height, mime_type = _inspect_variant(output_path)
    except OSError:
        output_path.unlink(missing_ok=True)
        meta_path.unlink(missing_ok=True)
        _write_variant(source_path, output_path, kind, source_image=source_image)
        width, height, mime_type = _inspect_variant(output_path)
    byte_size = output_path.stat().st_size
    _assert_variant_policy(kind, byte_size, width, height, output_path)
    content_hash = sha256_file(output_path)
    _save_variant_meta(
        meta_path,
        {
            "byteSize": byte_size,
            "contentHash": content_hash,
            "mimeType": mime_type,
            "width": width,
            "height": height,
        },
    )
    return {
        "kind": kind,
        "path": output_path.as_posix(),
        "contentHash": content_hash,
        "mimeType": mime_type,
        "byteSize": byte_size,
        "width": width,
        "height": height,
        "cacheKey": cache_key,
    }


def _variant_lock(output_path: Path):
    key = output_path.as_posix()
    with _VARIANT_LOCKS_GUARD:
        lock = _VARIANT_LOCKS.setdefault(key, Lock())
    return lock


def _inspect_variant(path: Path) -> tuple[int, int, str | None]:
    with Image.open(path) as image:
        width, height = image.size
        mime_type = Image.MIME.get(image.format or "")
    return width, height, mime_type


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        # stream large source images so preflight does not read everything at once
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def compute_variant_dedupe_hash(variants: Iterable[JsonObject]) -> str:
    return "|".join(
        sorted(f"{variant['kind']}:{variant['contentHash']}" for variant in variants)
    )


def variant_policy_fingerprint() -> JsonObject:
    return {
        "tile": {
            "format": "WEBP",
            "maxBytes": TILE_MAX_BYTES,
            "maxSize": TILE_MAX_SIZE,
            "quality": TILE_WEBP_QUALITY,
        },
        "preview": {
            "format": "JPEG",
            "maxBytes": PREVIEW_MAX_BYTES,
            "maxSize": PREVIEW_MAX_SIZE,
            "quality": PREVIEW_JPEG_QUALITY,
        },
    }


def asset_variants(asset: object) -> Iterable[JsonObject]:
    if not isinstance(asset, dict):
        return
    variants = asset.get("variants")
    if not isinstance(variants, dict):
        return
    for kind in ("tile", "preview"):
        variant = variants.get(kind)
        if isinstance(variant, dict):
            yield variant


def asset_tile_hash(asset: object) -> str | None:
    if not isinstance(asset, dict):
        return None
    variants = asset.get("variants")
    if not isinstance(variants, dict):
        return None
    tile = variants.get("tile")
    if not isinstance(tile, dict):
        return None
    return str(tile["contentHash"])


def asset_dedupe_hash(asset: object) -> str | None:
    if not isinstance(asset, dict):
        return None
    dedupe_hash = asset.get("dedupeHash")
    if isinstance(dedupe_hash, str):
        return dedupe_hash
    variants = asset.get("variants")
    if not isinstance(variants, dict):
        return None
    return compute_variant_dedupe_hash(
        variant for variant in variants.values() if isinstance(variant, dict)
    )


def _variant_output_path(
    source_sha256: str,
    kind: VariantKind,
    variants_dir: Path,
    variant_spec_version: str = VARIANT_SPEC_VERSION,
) -> Path:
    suffix = "webp" if kind == "tile" else "jpg"
    cache_key = _cache_key(source_sha256, kind, variant_spec_version)
    # fingerprint includes spec/settings so future policy changes miss old cache files
    cache_fingerprint = hashlib.sha256(cache_key.encode("utf-8")).hexdigest()[:16]
    return variants_dir / f"{source_sha256}-{cache_fingerprint}-{kind}.{suffix}"


def _cache_key(source_sha256: str, kind: VariantKind, variant_spec_version: str) -> str:
    if kind == "tile":
        settings = f"{TILE_MAX_SIZE}:webp-q{TILE_WEBP_QUALITY}"
    else:
        settings = f"{PREVIEW_MAX_SIZE}:jpeg-q{PREVIEW_JPEG_QUALITY}"
    return f"{source_sha256}:{variant_spec_version}:{kind}:{settings}"


def _assert_variant_policy(
    kind: VariantKind, byte_size: int, width: int, height: int, path: Path
) -> None:
    # fail during build, before Python can upload an oversize variant
    max_bytes = TILE_MAX_BYTES if kind == "tile" else PREVIEW_MAX_BYTES
    max_dimension = TILE_MAX_SIZE if kind == "tile" else PREVIEW_MAX_SIZE
    if byte_size > max_bytes:
        msg = f"{kind} variant exceeds byte limit: {path}"
        raise ValueError(msg)
    if width > max_dimension or height > max_dimension:
        msg = f"{kind} variant exceeds dimension limit: {path}"
        raise ValueError(msg)


def _write_variant(
    source_path: Path,
    output_path: Path,
    kind: VariantKind,
    source_image: "Image.Image | None" = None,
) -> None:
    success = False
    try:
        # branch by contract kind, not file extension, so cache names stay stable.
        # callers can pass a preopened source image to amortize decode across kinds
        if source_image is not None:
            _encode_variant(source_image, output_path, kind)
        else:
            with Image.open(source_path) as image:
                _encode_variant(image, output_path, kind)
        success = True
    finally:
        # try/finally also catches Ctrl-C (BaseException), so partial files
        # cannot survive into the next run as a poisoned cache hit
        if not success:
            output_path.unlink(missing_ok=True)


def _encode_variant(image: Image.Image, output_path: Path, kind: VariantKind) -> None:
    if kind == "tile":
        _write_tile(image, output_path)
    else:
        _write_preview(image, output_path)


def _build_asset_variants(
    source: SourceAsset, variants_dir: Path
) -> dict[str, JsonObject]:
    # opening the source image is the costly step (full pixel decode) so share one
    # open across both kinds when both miss the cache. when both hit, skip it
    # entirely; when one hits, the per-build Image.open is unavoidable anyway.
    tile_path = _variant_output_path(source.sha256, "tile", variants_dir)
    preview_path = _variant_output_path(source.sha256, "preview", variants_dir)
    if not tile_path.is_file() or not preview_path.is_file():
        with Image.open(source.path) as image:
            # force decode now so the per-kind copies inside _write_tile/_write_preview
            # share the work instead of triggering the lazy decode twice
            image.load()
            tile = build_variant(
                source.path,
                source.sha256,
                "tile",
                variants_dir,
                source_image=image,
            )
            preview = build_variant(
                source.path,
                source.sha256,
                "preview",
                variants_dir,
                source_image=image,
            )
    else:
        tile = build_variant(source.path, source.sha256, "tile", variants_dir)
        preview = build_variant(source.path, source.sha256, "preview", variants_dir)
    return {"tile": tile, "preview": preview}


def _write_tile(image: Image.Image, output_path: Path) -> None:
    variant = image.copy()
    # tiles favor cheap browse/card rendering over inspection detail
    variant.thumbnail((TILE_MAX_SIZE, TILE_MAX_SIZE), Image.Resampling.LANCZOS)
    variant.save(output_path, "WEBP", quality=TILE_WEBP_QUALITY, method=6)


def _write_preview(image: Image.Image, output_path: Path) -> None:
    variant = image.copy()
    # previews preserve inspection detail but stay bounded for direct upload
    variant.thumbnail((PREVIEW_MAX_SIZE, PREVIEW_MAX_SIZE), Image.Resampling.LANCZOS)
    rgb = _flatten_to_rgb(variant)
    rgb.save(output_path, "JPEG", quality=PREVIEW_JPEG_QUALITY, optimize=True)


def _flatten_to_rgb(image: Image.Image) -> Image.Image:
    if image.mode in ("RGB", "L"):
        return image.convert("RGB")
    if image.mode in ("RGBA", "LA") or (
        image.mode == "P" and "transparency" in image.info
    ):
        # flatten previews onto white because JPEG has no alpha channel
        rgba = image.convert("RGBA")
        background = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
        background.alpha_composite(rgba)
        return background.convert("RGB")
    return image.convert("RGB")


def reset_directory(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def _inspect_cache_path(repo_root: Path, repo_relative_path: str) -> Path:
    # mirror the source path under the cache root so files are easy to inspect
    return repo_root / INSPECT_CACHE_RELATIVE_PATH / f"{repo_relative_path}.json"


def _load_inspect_cache(
    cache_path: Path,
    source_path: Path,
    source_mtime_ns: int,
    source_byte_size: int,
) -> SourceAsset | None:
    payload = read_sidecar_json(cache_path)
    if payload is None:
        return None
    if payload.get("schemaVersion") != INSPECT_CACHE_SCHEMA_VERSION:
        return None
    # mtime+size is the invalidation signal; either change forces a fresh inspect
    if (
        payload.get("sourceMtimeNs") != source_mtime_ns
        or payload.get("sourceByteSize") != source_byte_size
    ):
        return None
    try:
        repo_relative_path = payload["sourceRelativePath"]
        sha256 = payload["sha256"]
        mime_type = payload["mimeType"]
        width = int(payload["width"])
        height = int(payload["height"])
    except (KeyError, TypeError, ValueError):
        return None
    if not isinstance(repo_relative_path, str) or not isinstance(sha256, str):
        return None
    if not isinstance(mime_type, str):
        return None
    content_bbox = (
        CropBBox.from_json(payload["contentBbox"])
        if payload.get("contentBbox") is not None
        else None
    )
    media_plate = payload.get("mediaPlate")
    if media_plate is not None and media_plate not in MEDIA_PLATE_VALUES:
        return None
    return SourceAsset(
        path=source_path,
        repo_relative_path=repo_relative_path,
        sha256=sha256,
        mime_type=mime_type,
        byte_size=source_byte_size,
        width=width,
        height=height,
        content_bbox=content_bbox,
        media_plate=media_plate,
    )


def _save_inspect_cache(
    cache_path: Path,
    asset: SourceAsset,
    source_mtime_ns: int,
) -> None:
    payload: JsonObject = {
        "schemaVersion": INSPECT_CACHE_SCHEMA_VERSION,
        "sourceRelativePath": asset.repo_relative_path,
        "sourceMtimeNs": source_mtime_ns,
        "sourceByteSize": asset.byte_size,
        "sha256": asset.sha256,
        "mimeType": asset.mime_type,
        "width": asset.width,
        "height": asset.height,
        "contentBbox": asset.content_bbox.to_json() if asset.content_bbox else None,
        "mediaPlate": asset.media_plate,
    }
    write_sidecar_json(cache_path, payload)


def _variant_meta_path(output_path: Path) -> Path:
    return output_path.with_name(f"{output_path.name}.meta.json")


def _load_variant_meta(meta_path: Path, output_path: Path) -> JsonObject | None:
    payload = read_sidecar_json(meta_path)
    if payload is None:
        return None
    if payload.get("schemaVersion") != VARIANT_META_SCHEMA_VERSION:
        return None
    try:
        byte_size = int(payload["byteSize"])
        width = int(payload["width"])
        height = int(payload["height"])
        content_hash = payload["contentHash"]
        mime_type = payload["mimeType"]
    except (KeyError, TypeError, ValueError):
        return None
    if not isinstance(content_hash, str) or not isinstance(mime_type, str):
        return None
    # disk byte_size is the only cheap consistency check we can run without re-hash
    try:
        actual_size = output_path.stat().st_size
    except OSError:
        return None
    if actual_size != byte_size:
        return None
    return {
        "byteSize": byte_size,
        "contentHash": content_hash,
        "mimeType": mime_type,
        "width": width,
        "height": height,
    }


def _save_variant_meta(meta_path: Path, meta: JsonObject) -> None:
    payload = {"schemaVersion": VARIANT_META_SCHEMA_VERSION, **meta}
    write_sidecar_json(meta_path, payload)
