# scripts/seed_pipeline/seed_pipeline/assets.py
# inspect source images & build local tile/preview variants

from __future__ import annotations

import hashlib
import shutil
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

from .manifest import JsonObject
from .settings import (
    PREVIEW_JPEG_QUALITY,
    PREVIEW_MAX_SIZE,
    TILE_MAX_SIZE,
    TILE_WEBP_QUALITY,
    VARIANT_SPEC_VERSION,
)


@dataclass(frozen=True)
class SourceAsset:
    path: Path
    repo_relative_path: str
    sha256: str
    mime_type: str
    byte_size: int
    width: int
    height: int

    @property
    def aspect_ratio(self) -> float:
        return self.width / self.height


def compile_asset(source_path: Path, repo_root: Path, variants_dir: Path) -> JsonObject:
    source = inspect_source(source_path, repo_root)
    tile = build_variant(source.path, source.sha256, "tile", variants_dir)
    preview = build_variant(source.path, source.sha256, "preview", variants_dir)
    return {
        "sourcePath": str(source.path.resolve()),
        "sourcePathRelative": source.repo_relative_path,
        "sourceSha256": source.sha256,
        "sourceMimeType": source.mime_type,
        "sourceByteSize": source.byte_size,
        "sourceWidth": source.width,
        "sourceHeight": source.height,
        "sourceAspectRatio": source.aspect_ratio,
        "crop": None,
        "variants": {
            "tile": tile,
            "preview": preview,
        },
    }


def inspect_source(source_path: Path, repo_root: Path) -> SourceAsset:
    resolved = source_path.resolve()
    with Image.open(resolved) as image:
        mime_type = Image.MIME.get(image.format or "")
        if mime_type is None:
            msg = f"unsupported image format: {resolved}"
            raise ValueError(msg)
        width, height = image.size
    return SourceAsset(
        path=resolved,
        repo_relative_path=resolved.relative_to(repo_root.resolve()).as_posix(),
        sha256=sha256_file(resolved),
        mime_type=mime_type,
        byte_size=resolved.stat().st_size,
        width=width,
        height=height,
    )


def build_variant(
    source_path: Path, source_sha256: str, kind: str, variants_dir: Path
) -> JsonObject:
    variants_dir.mkdir(parents=True, exist_ok=True)
    suffix = "webp" if kind == "tile" else "jpg"
    output_path = variants_dir / f"{source_sha256}-{kind}.{suffix}"
    cache_key = _cache_key(source_sha256, kind)
    # reuse content-addressed output; Phase 2 will add stricter cache metadata
    if not output_path.is_file():
        _write_variant(source_path, output_path, kind)
    with Image.open(output_path) as image:
        width, height = image.size
        mime_type = Image.MIME.get(image.format or "")
    return {
        "kind": kind,
        "path": output_path.as_posix(),
        "contentHash": sha256_file(output_path),
        "mimeType": mime_type,
        "byteSize": output_path.stat().st_size,
        "width": width,
        "height": height,
        "cacheKey": cache_key,
    }


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _cache_key(source_sha256: str, kind: str) -> str:
    if kind == "tile":
        settings = f"{TILE_MAX_SIZE}:webp-q{TILE_WEBP_QUALITY}"
    else:
        settings = f"{PREVIEW_MAX_SIZE}:jpeg-q{PREVIEW_JPEG_QUALITY}"
    return f"{source_sha256}:{VARIANT_SPEC_VERSION}:{kind}:{settings}"


def _write_variant(source_path: Path, output_path: Path, kind: str) -> None:
    try:
        with Image.open(source_path) as image:
            if kind == "tile":
                _write_tile(image, output_path)
            else:
                _write_preview(image, output_path)
    except Exception:
        # remove partial files so the next retry cannot treat them as cache hits
        if output_path.exists():
            output_path.unlink()
        raise


def _write_tile(image: Image.Image, output_path: Path) -> None:
    variant = image.copy()
    variant.thumbnail((TILE_MAX_SIZE, TILE_MAX_SIZE), Image.Resampling.LANCZOS)
    variant.save(output_path, "WEBP", quality=TILE_WEBP_QUALITY, method=6)


def _write_preview(image: Image.Image, output_path: Path) -> None:
    variant = image.copy()
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
