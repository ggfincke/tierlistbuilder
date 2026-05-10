# scripts/seed_pipeline/seed_pipeline/crop.py
# Python port of seed crop & aspect-ratio decisions

from __future__ import annotations

import math
from dataclasses import dataclass
from statistics import median
from typing import Iterable, Literal

from PIL import Image

from .manifest import JsonObject
from .settings import MIXED_TEMPLATE_ITEM_ASPECT_RATIO

# mirror SEED_RATIO_SOURCES in packages/contracts/marketplace/seedPipeline.ts
RatioSource = Literal["consistent", "mixed-dominant", "mixed-square"]

# keep these constants aligned w/ packages/contracts/workspace/imageMath.ts
ASPECT_RATIO_TOLERANCE = 0.02
AUTO_CROP_ANALYSIS_MAX_SIZE = 256

# alpha mode: use transparent padding when images carry meaningful alpha
ALPHA_CONTENT_THRESHOLD = 16
ALPHA_SOLID_THRESHOLD = 192
ALPHA_SOFT_EDGE_MAX_FRACTION = 0.02
ALPHA_SOLID_AREA_MIN_RATIO = 0.5
ALPHA_PRESENCE_FRACTION = 0.005

# opaque mode: infer a matte color from image corners
CORNER_PATCH_SIZE = 5
COLOR_CONTENT_DISTANCE_SQ = 32 * 32
MIN_BBOX_AREA_FRACTION = 0.01

# transform output mirrors the TypeScript ItemTransform contract
DEFAULT_PADDING_FRACTION = 0.01
ITEM_TRANSFORM_ZOOM_MIN = 0.01
ITEM_TRANSFORM_ZOOM_MAX = 10
ITEM_TRANSFORM_OFFSET_MIN = -2
ITEM_TRANSFORM_OFFSET_MAX = 2


# normalized bbox in source-image coordinates
@dataclass(frozen=True)
class CropBBox:
    left: float
    top: float
    right: float
    bottom: float

    def to_json(self) -> JsonObject:
        return {
            "left": self.left,
            "top": self.top,
            "right": self.right,
            "bottom": self.bottom,
        }


# integer bbox in resized analysis-canvas pixels
@dataclass(frozen=True)
class PixelBBox:
    min_x: int
    min_y: int
    max_x: int
    max_y: int


@dataclass(frozen=True)
class CropScan:
    soft: PixelBBox
    solid: PixelBBox | None
    width: int
    height: int


@dataclass(frozen=True)
class RatioDecision:
    item_aspect_ratio: float
    ratio_source: RatioSource


def ratios_match(a: float, b: float, tolerance: float = ASPECT_RATIO_TOLERANCE) -> bool:
    # reject bools/NaN/inf before ratio math; Python bool is an int subclass
    if not _is_positive_finite(a) or not _is_positive_finite(b):
        return False
    return abs(a - b) / max(a, b) <= tolerance


# match the old seed policy: dominant ratio only wins by strict majority
def resolve_ratio_decision(aspect_ratios: Iterable[float]) -> RatioDecision:
    buckets = _bucket_ratios(list(aspect_ratios))
    dominant = buckets[0] if buckets else None
    ratio_source: RatioSource
    if len(buckets) <= 1:
        ratio_source = "consistent"
    elif dominant and dominant["count"] > sum(bucket["count"] for bucket in buckets) / 2:
        ratio_source = "mixed-dominant"
    else:
        ratio_source = "mixed-square"
    item_aspect_ratio = (
        MIXED_TEMPLATE_ITEM_ASPECT_RATIO
        if ratio_source == "mixed-square"
        else (dominant["representative"] if dominant else MIXED_TEMPLATE_ITEM_ASPECT_RATIO)
    )
    return RatioDecision(
        item_aspect_ratio=item_aspect_ratio,
        ratio_source=ratio_source,
    )


def resolve_item_transform(
    image_aspect_ratio: float,
    content_bbox: CropBBox | None,
    board_aspect_ratio: float,
    ratio_source: RatioSource,
) -> JsonObject | None:
    # consistent folders render at natural ratio, so no per-item transform is needed
    if ratio_source == "consistent" or content_bbox is None:
        return None
    # same-ratio images should not get a no-op transform just because bbox exists
    if ratios_match(image_aspect_ratio, board_aspect_ratio):
        return None
    return bbox_to_item_transform(content_bbox, image_aspect_ratio, board_aspect_ratio)


def detect_content_bbox(image: Image.Image) -> CropBBox | None:
    # decode once into the same bounded RGBA analysis canvas used by TypeScript
    target_width, target_height = get_auto_crop_analysis_dimensions(
        image.width, image.height
    )
    analysis = image.convert("RGBA").resize(
        (target_width, target_height), Image.Resampling.LANCZOS
    )
    data = analysis.tobytes()
    scan = scan_auto_crop_pixels(data, target_width, target_height)
    return pick_auto_crop_bbox(scan, True) if scan else None


def get_auto_crop_analysis_dimensions(
    width: int, height: int, max_size: int = AUTO_CROP_ANALYSIS_MAX_SIZE
) -> tuple[int, int]:
    # downscale only for analysis; output variants still start from source pixels
    if width <= max_size and height <= max_size:
        return width, height
    if width >= height:
        return max_size, max(1, round((height / width) * max_size))
    return max(1, round((width / height) * max_size)), max_size


def scan_auto_crop_pixels(data: bytes, width: int, height: int) -> CropScan | None:
    # transparent assets use alpha; opaque assets fall back to corner-matte color
    return (
        _scan_alpha(data, width, height)
        if _has_meaningful_alpha(data, width, height)
        else _scan_corner_color(data, width, height)
    )


def pick_auto_crop_bbox(
    scan: CropScan, trim_soft_shadows: bool
) -> CropBBox | None:
    # trim long soft tails only when a solid content core is large enough
    pixel = (
        _trim_soft_shadow_bbox(scan.soft, scan.solid, scan.width, scan.height)
        if trim_soft_shadows
        and scan.solid
        and _should_trim_soft_shadows(scan.soft, scan.solid)
        else scan.soft
    )
    bbox = _normalize_bbox(pixel, scan.width, scan.height)
    area = (bbox.right - bbox.left) * (bbox.bottom - bbox.top)
    # tiny detections produce absurd zoom; keep them as no-crop
    return bbox if area >= MIN_BBOX_AREA_FRACTION else None


def bbox_to_item_transform(
    bbox: CropBBox,
    image_aspect_ratio: float,
    board_aspect_ratio: float,
    padding_fraction: float = DEFAULT_PADDING_FRACTION,
) -> JsonObject:
    # pad before transform math so zoom leaves the same breathing room as TS
    padded = _pad_bbox(bbox, padding_fraction)
    bbox_center_x = (padded.left + padded.right) / 2
    bbox_center_y = (padded.top + padded.bottom) / 2
    bbox_width = padded.right - padded.left
    bbox_height = padded.bottom - padded.top
    frame_ratio = board_aspect_ratio if board_aspect_ratio > 0 else 1
    width_percent, height_percent = _manual_crop_image_size(image_aspect_ratio, frame_ratio)
    width_fraction = width_percent / 100
    height_fraction = height_percent / 100
    # bbox visual extent is measured in frame fractions at cover-fit zoom=1
    visual_width = bbox_width * width_fraction
    visual_height = bbox_height * height_fraction
    if visual_width <= 0 or visual_height <= 0:
        return {"rotation": 0, "zoom": 1, "offsetX": 0, "offsetY": 0}
    zoom = min(1 / visual_width, 1 / visual_height)
    # offset moves image opposite the bbox center so content lands in frame center
    center_x = (bbox_center_x - 0.5) * width_fraction
    center_y = (bbox_center_y - 0.5) * height_fraction
    return {
        "rotation": 0,
        "zoom": _clamp(zoom, ITEM_TRANSFORM_ZOOM_MIN, ITEM_TRANSFORM_ZOOM_MAX),
        "offsetX": _clamp(-center_x * zoom, ITEM_TRANSFORM_OFFSET_MIN, ITEM_TRANSFORM_OFFSET_MAX),
        "offsetY": _clamp(-center_y * zoom, ITEM_TRANSFORM_OFFSET_MIN, ITEM_TRANSFORM_OFFSET_MAX),
    }


def _bucket_ratios(ratios: list[float]) -> list[dict[str, object]]:
    buckets: list[dict[str, object]] = []
    for ratio in ratios:
        if not _is_positive_finite(ratio):
            continue
        placed = False
        for bucket in buckets:
            bucket_ratios = bucket["ratios"]
            # bucket membership follows the first ratio; representative is median
            if isinstance(bucket_ratios, list) and ratios_match(ratio, bucket_ratios[0]):
                bucket_ratios.append(ratio)
                bucket["count"] = len(bucket_ratios)
                bucket["representative"] = median(bucket_ratios)
                placed = True
                break
        if not placed:
            buckets.append({"ratios": [ratio], "count": 1, "representative": ratio})
    return sorted(buckets, key=lambda bucket: int(bucket["count"]), reverse=True)


def _has_meaningful_alpha(data: bytes, width: int, height: int) -> bool:
    total = width * height
    transparent = 0
    # sparse stride is enough; transparent padding covers broad regions
    for index in range(3, len(data), 16):
        if data[index] < ALPHA_CONTENT_THRESHOLD:
            transparent += 1
            if transparent / (total / 4) >= ALPHA_PRESENCE_FRACTION:
                return True
    return False


def _scan_alpha(data: bytes, width: int, height: int) -> CropScan | None:
    # soft bbox captures faint edges; solid bbox anchors optional trim
    soft_min_x = solid_min_x = width
    soft_min_y = solid_min_y = height
    soft_max_x = soft_max_y = -1
    solid_max_x = solid_max_y = -1
    for y in range(height):
        row = y * width * 4
        for x in range(width):
            alpha = data[row + x * 4 + 3]
            if alpha >= ALPHA_CONTENT_THRESHOLD:
                soft_min_x = min(soft_min_x, x)
                soft_max_x = max(soft_max_x, x)
                soft_min_y = min(soft_min_y, y)
                soft_max_y = max(soft_max_y, y)
                if alpha >= ALPHA_SOLID_THRESHOLD:
                    solid_min_x = min(solid_min_x, x)
                    solid_max_x = max(solid_max_x, x)
                    solid_min_y = min(solid_min_y, y)
                    solid_max_y = max(solid_max_y, y)
    if soft_max_x < 0:
        return None
    solid = (
        PixelBBox(solid_min_x, solid_min_y, solid_max_x, solid_max_y)
        if solid_max_x >= 0
        else None
    )
    return CropScan(
        soft=PixelBBox(soft_min_x, soft_min_y, soft_max_x, soft_max_y),
        solid=solid,
        width=width,
        height=height,
    )


def _scan_corner_color(data: bytes, width: int, height: int) -> CropScan | None:
    # four corners choose the matte for JPG/poster assets lacking alpha
    background = _pick_background_color(
        [
            _sample_corner(data, width, 0, 0),
            _sample_corner(data, width, max(0, width - CORNER_PATCH_SIZE), 0),
            _sample_corner(data, width, 0, max(0, height - CORNER_PATCH_SIZE)),
            _sample_corner(
                data,
                width,
                max(0, width - CORNER_PATCH_SIZE),
                max(0, height - CORNER_PATCH_SIZE),
            ),
        ]
    )
    min_x = width
    min_y = height
    max_x = -1
    max_y = -1
    for y in range(height):
        row = y * width * 4
        for x in range(width):
            index = row + x * 4
            distance = sum((data[index + channel] - background[channel]) ** 2 for channel in range(3))
            # any pixel far enough from the matte counts as visible content
            if distance > COLOR_CONTENT_DISTANCE_SQ:
                min_x = min(min_x, x)
                max_x = max(max_x, x)
                min_y = min(min_y, y)
                max_y = max(max_y, y)
    if max_x < 0:
        return None
    return CropScan(
        soft=PixelBBox(min_x, min_y, max_x, max_y),
        solid=None,
        width=width,
        height=height,
    )


def _sample_corner(data: bytes, width: int, x0: int, y0: int) -> tuple[float, float, float]:
    red = 0
    green = 0
    blue = 0
    count = 0
    height = len(data) // (width * 4)
    for y in range(y0, min(height, y0 + CORNER_PATCH_SIZE)):
        for x in range(x0, min(width, x0 + CORNER_PATCH_SIZE)):
            index = (y * width + x) * 4
            red += data[index]
            green += data[index + 1]
            blue += data[index + 2]
            count += 1
    return red / count, green / count, blue / count


def _pick_background_color(samples: list[tuple[float, float, float]]) -> tuple[float, float, float]:
    best: list[tuple[float, float, float]] = []
    # 3+ matching corners beat median; split corners use median fallback
    for anchor in samples:
        cluster = [
            sample
            for sample in samples
            if _squared_distance(sample, anchor) <= COLOR_CONTENT_DISTANCE_SQ
        ]
        if len(cluster) > len(best):
            best = cluster
    if len(best) < 3:
        return tuple(median(channel) for channel in zip(*samples))
    return tuple(sum(channel) / len(best) for channel in zip(*best))


def _should_trim_soft_shadows(soft: PixelBBox, solid: PixelBBox) -> bool:
    # avoid trimming when the "solid" core is too small to represent subject bounds
    return _pixel_bbox_area(solid) / _pixel_bbox_area(soft) >= ALPHA_SOLID_AREA_MIN_RATIO


def _trim_soft_shadow_bbox(
    soft: PixelBBox, solid: PixelBBox, width: int, height: int
) -> PixelBBox:
    # snap only sides w/ a meaningfully long soft tail
    max_soft_x = width * ALPHA_SOFT_EDGE_MAX_FRACTION
    max_soft_y = height * ALPHA_SOFT_EDGE_MAX_FRACTION
    return PixelBBox(
        min_x=solid.min_x if solid.min_x - soft.min_x > max_soft_x else soft.min_x,
        min_y=solid.min_y if solid.min_y - soft.min_y > max_soft_y else soft.min_y,
        max_x=solid.max_x if soft.max_x - solid.max_x > max_soft_x else soft.max_x,
        max_y=solid.max_y if soft.max_y - solid.max_y > max_soft_y else soft.max_y,
    )


def _normalize_bbox(bbox: PixelBBox, width: int, height: int) -> CropBBox:
    # max edges are inclusive in pixel space but exclusive in normalized space
    return CropBBox(
        left=bbox.min_x / width,
        top=bbox.min_y / height,
        right=(bbox.max_x + 1) / width,
        bottom=(bbox.max_y + 1) / height,
    )


def _pad_bbox(bbox: CropBBox, padding: float) -> CropBBox:
    if padding <= 0:
        return bbox
    return CropBBox(
        left=_clamp(bbox.left - padding, 0, 1),
        top=_clamp(bbox.top - padding, 0, 1),
        right=_clamp(bbox.right + padding, 0, 1),
        bottom=_clamp(bbox.bottom + padding, 0, 1),
    )


def _manual_crop_image_size(image_aspect_ratio: float, frame_aspect_ratio: float) -> tuple[float, float]:
    # cover-fit geometry for unrotated seed transforms
    frame_width = frame_aspect_ratio if _is_positive_finite(frame_aspect_ratio) else 1
    image_width = image_aspect_ratio if _is_positive_finite(image_aspect_ratio) else frame_width
    scale = max(frame_width / image_width, 1)
    return (image_width * scale / frame_width) * 100, scale * 100


def _pixel_bbox_area(bbox: PixelBBox) -> int:
    return (bbox.max_x - bbox.min_x + 1) * (bbox.max_y - bbox.min_y + 1)


def _squared_distance(
    a: tuple[float, float, float], b: tuple[float, float, float]
) -> float:
    return sum((a[index] - b[index]) ** 2 for index in range(3))


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return min(max(value, minimum), maximum)


def _is_positive_finite(value: float) -> bool:
    return (
        isinstance(value, (float, int))
        and not isinstance(value, bool)
        and math.isfinite(value)
        and value > 0
    )
