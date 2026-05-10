# scripts/seed_pipeline/seed_pipeline/assets.py
# inspect source images & build local tile/preview variants

from __future__ import annotations

import hashlib
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Literal

from PIL import Image

from .crop import CropBBox, detect_content_bbox
from .manifest import JsonObject
from .settings import (
    MAX_SOURCE_IMAGE_BYTE_SIZE,
    MAX_SOURCE_IMAGE_DIMENSION,
    PREVIEW_JPEG_QUALITY,
    PREVIEW_MAX_BYTES,
    PREVIEW_MAX_SIZE,
    TILE_MAX_BYTES,
    TILE_MAX_SIZE,
    TILE_WEBP_QUALITY,
    VARIANT_SPEC_VERSION,
)

# mirror Extract<MediaVariantKind, 'tile' | 'preview'> in seed contract
VariantKind = Literal["tile", "preview"]


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
    tile = build_variant(source.path, source.sha256, "tile", variants_dir)
    preview = build_variant(source.path, source.sha256, "preview", variants_dir)
    variants = {"tile": tile, "preview": preview}
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
    byte_size = resolved.stat().st_size
    # enforce local limits before spending CPU on crop detection
    if byte_size > MAX_SOURCE_IMAGE_BYTE_SIZE:
        msg = f"source image exceeds byte limit: {resolved}"
        raise ValueError(msg)
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
        content_bbox = detect_content_bbox(image)
    return SourceAsset(
        path=resolved,
        repo_relative_path=resolved.relative_to(repo_root.resolve()).as_posix(),
        sha256=sha256_file(resolved),
        mime_type=mime_type,
        byte_size=byte_size,
        width=width,
        height=height,
        content_bbox=content_bbox,
    )


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
) -> JsonObject:
    variants_dir.mkdir(parents=True, exist_ok=True)
    suffix = "webp" if kind == "tile" else "jpg"
    cache_key = _cache_key(source_sha256, kind, variant_spec_version)
    # fingerprint includes spec/settings so future policy changes miss old cache files
    cache_fingerprint = hashlib.sha256(cache_key.encode("utf-8")).hexdigest()[:16]
    output_path = variants_dir / f"{source_sha256}-{cache_fingerprint}-{kind}.{suffix}"
    # reuse cache file when exact source + spec + kind + settings already exist.
    # interrupted runs can leave a zero-byte or partial file, so verify before
    # trusting a hit and regenerate once if Pillow cannot reopen it.
    if not output_path.is_file():
        _write_variant(source_path, output_path, kind)
    try:
        width, height, mime_type = _inspect_variant(output_path)
    except OSError:
        output_path.unlink(missing_ok=True)
        _write_variant(source_path, output_path, kind)
        width, height, mime_type = _inspect_variant(output_path)
    byte_size = output_path.stat().st_size
    _assert_variant_policy(kind, byte_size, width, height, output_path)
    return {
        "kind": kind,
        "path": output_path.as_posix(),
        "contentHash": sha256_file(output_path),
        "mimeType": mime_type,
        "byteSize": byte_size,
        "width": width,
        "height": height,
        "cacheKey": cache_key,
    }


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


def _write_variant(source_path: Path, output_path: Path, kind: VariantKind) -> None:
    success = False
    try:
        with Image.open(source_path) as image:
            # branch by contract kind, not file extension, so cache names stay stable
            if kind == "tile":
                _write_tile(image, output_path)
            else:
                _write_preview(image, output_path)
        success = True
    finally:
        # try/finally also catches Ctrl-C (BaseException), so partial files
        # cannot survive into the next run as a poisoned cache hit
        if not success:
            output_path.unlink(missing_ok=True)


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
