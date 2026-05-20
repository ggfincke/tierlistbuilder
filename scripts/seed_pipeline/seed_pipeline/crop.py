# scripts/seed_pipeline/seed_pipeline/crop.py
# Python port of seed crop & aspect-ratio decisions

from __future__ import annotations

import math
from dataclasses import dataclass
from statistics import median
from typing import Iterable, Literal

from PIL import Image, ImageMath

from .manifest import JsonObject
from .settings import MIXED_TEMPLATE_ITEM_ASPECT_RATIO

# mirror SEED_RATIO_SOURCES in packages/contracts/marketplace/seedPipeline.ts
RatioSource = Literal["consistent", "mixed-dominant", "mixed-square"]

# mirror MediaPlate in packages/contracts/workspace/board.ts — a transparent
# logo that would nearly vanish on a solid backdrop gets a per-image plate so it
# stays readable on any surface (dark gallery matte or any tier color)
MediaPlate = Literal["light", "dark"]

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

# media plate decision: only a near-monochromatic logo needs a plate — one that
# would almost entirely vanish against one extreme (a white wordmark, a black
# silhouette). multi-tone art keeps its own silhouette on any backdrop, so it
# stays null. representative plate colors mirror src/app/index.css --t-media-matte
# & the light-plate fallback; per-theme shades only nudge these, so the tri-state
# stays render-invariant
PLATE_MATTE_RGB = (0x0A, 0x0A, 0x0C)
PLATE_LIGHT_RGB = (0xF5, 0xF5, 0xF5)
PLATE_INK_ALPHA_THRESHOLD = ALPHA_CONTENT_THRESHOLD
PLATE_MIN_CONTRAST = 3.0
# share of ink that must vanish against an extreme before a plate is warranted.
# high on purpose: below this the image keeps enough surviving ink to read on its
# own (eg a full-color render w/ dark outlines is still discernible on dark)
PLATE_INK_VANISH_FRACTION = 0.80
# sample every 4th pixel (RGBA stride 16) — plenty for a fraction estimate
PLATE_SAMPLE_STRIDE = 16

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

	@classmethod
	def from_json(cls, value: object) -> "CropBBox | None":
		if not isinstance(value, dict):
			return None
		try:
			return cls(
				left=float(value["left"]),
				top=float(value["top"]),
				right=float(value["right"]),
				bottom=float(value["bottom"]),
			)
		except (KeyError, TypeError, ValueError):
			return None


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


@dataclass(frozen=True)
class ImageAnalysis:
	content_bbox: CropBBox | None
	media_plate: MediaPlate | None


@dataclass(frozen=True)
class PlateAnalysis:
	# the raw signals behind the tri-state plate verdict, exposed for the audit
	# so reports can rank near-misses instead of only seeing the final decision
	media_plate: MediaPlate | None
	has_meaningful_alpha: bool
	# alpha-weighted ink sampled; 0 when the asset is opaque or fully clear
	ink_weight: float
	# share of ink that nearly vanishes on the dark matte -> argues for a light plate
	dark_share: float
	# share of ink that nearly vanishes on the light plate -> argues for a dark plate
	light_share: float
	# alpha-weighted mean luminance of the ink (0=black .. 1=white). lets the audit
	# tell a genuinely light/near-white logo (truly vanishes on white) apart from a
	# saturated mid-tone color that only trips the WCAG contrast bar
	ink_luminance: float


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


def _analysis_canvas(image: Image.Image) -> tuple[bytes, int, int]:
	# decode once into the same bounded RGBA analysis canvas used by TypeScript;
	# shared by the crop bbox scan & the media-plate decision
	target_width, target_height = get_auto_crop_analysis_dimensions(image.width, image.height)
	analysis = image.convert("RGBA").resize((target_width, target_height), Image.Resampling.LANCZOS)
	return analysis.tobytes(), target_width, target_height


def detect_content_bbox(image: Image.Image) -> CropBBox | None:
	data, width, height = _analysis_canvas(image)
	scan = scan_auto_crop_pixels(data, width, height)
	return pick_auto_crop_bbox(scan, True) if scan else None


def analyze_image(image: Image.Image) -> ImageAnalysis:
	data, width, height = _analysis_canvas(image)
	has_alpha = _has_meaningful_alpha(data, width, height)
	scan = scan_auto_crop_pixels(data, width, height, has_alpha)
	content_bbox = pick_auto_crop_bbox(scan, True) if scan else None
	return ImageAnalysis(
		content_bbox=content_bbox,
		media_plate=_scan_media_plate(data, has_alpha),
	)


def analyze_plate(image: Image.Image) -> PlateAnalysis:
	# standalone plate pass for the audit: same canvas + math as analyze_image,
	# but returns the vanish shares so reports can surface near-misses
	data, width, height = _analysis_canvas(image)
	has_alpha = _has_meaningful_alpha(data, width, height)
	return _plate_analysis(data, has_alpha)


def _scan_media_plate(data: bytes, has_meaningful_alpha: bool) -> MediaPlate | None:
	# opaque assets fill their frame, so only transparent logos need a plate
	return _plate_analysis(data, has_meaningful_alpha).media_plate


def _plate_analysis(data: bytes, has_meaningful_alpha: bool) -> PlateAnalysis:
	if not has_meaningful_alpha:
		return PlateAnalysis(None, False, 0.0, 0.0, 0.0, 0.0)
	total = 0.0
	low_on_dark = 0.0
	low_on_light = 0.0
	luminance_sum = 0.0
	for index in range(0, len(data), PLATE_SAMPLE_STRIDE):
		alpha = data[index + 3]
		if alpha < PLATE_INK_ALPHA_THRESHOLD:
			continue
		weight = alpha / 255
		lum = _relative_luminance(data[index], data[index + 1], data[index + 2])
		total += weight
		luminance_sum += weight * lum
		if _contrast_ratio(lum, _PLATE_MATTE_LUM) < PLATE_MIN_CONTRAST:
			low_on_dark += weight
		if _contrast_ratio(lum, _PLATE_LIGHT_LUM) < PLATE_MIN_CONTRAST:
			low_on_light += weight
	if total <= 0:
		return PlateAnalysis(None, True, 0.0, 0.0, 0.0, 0.0)
	dark_share = low_on_dark / total
	light_share = low_on_light / total
	return PlateAnalysis(
		media_plate=_classify_plate(dark_share, light_share),
		has_meaningful_alpha=True,
		ink_weight=total,
		dark_share=dark_share,
		light_share=light_share,
		ink_luminance=luminance_sum / total,
	)


def _classify_plate(dark_share: float, light_share: float) -> MediaPlate | None:
	# plate only when the ink nearly vanishes on one extreme: dark ink (gone on
	# dark) -> light plate; light ink -> dark plate. at this threshold the two
	# poles are mutually exclusive, so order is moot
	if dark_share >= PLATE_INK_VANISH_FRACTION:
		return "light"
	if light_share >= PLATE_INK_VANISH_FRACTION:
		return "dark"
	return None


def get_auto_crop_analysis_dimensions(
	width: int, height: int, max_size: int = AUTO_CROP_ANALYSIS_MAX_SIZE
) -> tuple[int, int]:
	# downscale only for analysis; output variants still start from source pixels
	if width <= max_size and height <= max_size:
		return width, height
	if width >= height:
		return max_size, max(1, round((height / width) * max_size))
	return max(1, round((width / height) * max_size)), max_size


def scan_auto_crop_pixels(
	data: bytes, width: int, height: int, has_meaningful_alpha: bool | None = None
) -> CropScan | None:
	# transparent assets use alpha; opaque assets fall back to corner-matte color
	has_alpha = (
		_has_meaningful_alpha(data, width, height)
		if has_meaningful_alpha is None
		else has_meaningful_alpha
	)
	return (
		_scan_alpha(data, width, height) if has_alpha else _scan_corner_color(data, width, height)
	)


def pick_auto_crop_bbox(scan: CropScan, trim_soft_shadows: bool) -> CropBBox | None:
	# trim long soft tails only when a solid content core is large enough
	pixel = (
		_trim_soft_shadow_bbox(scan.soft, scan.solid, scan.width, scan.height)
		if trim_soft_shadows and scan.solid and _should_trim_soft_shadows(scan.soft, scan.solid)
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
	alpha = Image.frombytes("RGBA", (width, height), data).getchannel("A")
	soft = _threshold_channel_bbox(alpha, ALPHA_CONTENT_THRESHOLD)
	if soft is None:
		return None
	solid = _threshold_channel_bbox(alpha, ALPHA_SOLID_THRESHOLD)
	return CropScan(
		soft=soft,
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
	red, green, blue, _alpha = Image.frombytes("RGBA", (width, height), data).split()
	red_distance = _channel_distance(red, background[0])
	green_distance = _channel_distance(green, background[1])
	blue_distance = _channel_distance(blue, background[2])
	mask = ImageMath.unsafe_eval(
		"convert((red + green + blue) > threshold, 'L')",
		red=red_distance,
		green=green_distance,
		blue=blue_distance,
		threshold=COLOR_CONTENT_DISTANCE_SQ,
	)
	bbox = _pillow_bbox_to_pixel_bbox(mask.getbbox())
	if bbox is None:
		return None
	return CropScan(
		soft=bbox,
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


def _threshold_channel_bbox(image: Image.Image, threshold: int) -> PixelBBox | None:
	mask = image.point([255 if value >= threshold else 0 for value in range(256)])
	return _pillow_bbox_to_pixel_bbox(mask.getbbox())


def _channel_distance(image: Image.Image, target: float) -> Image.Image:
	return image.point([(value - target) ** 2 for value in range(256)], mode="F")


def _pillow_bbox_to_pixel_bbox(bbox: tuple[int, int, int, int] | None) -> PixelBBox | None:
	if bbox is None:
		return None
	left, top, right, bottom = bbox
	return PixelBBox(left, top, right - 1, bottom - 1)


def _should_trim_soft_shadows(soft: PixelBBox, solid: PixelBBox) -> bool:
	# avoid trimming when the "solid" core is too small to represent subject bounds
	return _pixel_bbox_area(solid) / _pixel_bbox_area(soft) >= ALPHA_SOLID_AREA_MIN_RATIO


def _trim_soft_shadow_bbox(soft: PixelBBox, solid: PixelBBox, width: int, height: int) -> PixelBBox:
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


def _manual_crop_image_size(
	image_aspect_ratio: float, frame_aspect_ratio: float
) -> tuple[float, float]:
	# cover-fit geometry for unrotated seed transforms
	frame_width = frame_aspect_ratio if _is_positive_finite(frame_aspect_ratio) else 1
	image_width = image_aspect_ratio if _is_positive_finite(image_aspect_ratio) else frame_width
	scale = max(frame_width / image_width, 1)
	return (image_width * scale / frame_width) * 100, scale * 100


def _pixel_bbox_area(bbox: PixelBBox) -> int:
	return (bbox.max_x - bbox.min_x + 1) * (bbox.max_y - bbox.min_y + 1)


def _squared_distance(a: tuple[float, float, float], b: tuple[float, float, float]) -> float:
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


def _srgb_channel_to_linear(value: int) -> float:
	# mirror src/shared/lib/color.ts:getRelativeLuminance
	channel = value / 255
	return channel / 12.92 if channel <= 0.03928 else ((channel + 0.055) / 1.055) ** 2.4


# sRGB->linear lookup so the per-pixel plate scan stays cheap
_SRGB_TO_LINEAR = tuple(_srgb_channel_to_linear(value) for value in range(256))


def _relative_luminance(red: int, green: int, blue: int) -> float:
	return (
		0.2126 * _SRGB_TO_LINEAR[red]
		+ 0.7152 * _SRGB_TO_LINEAR[green]
		+ 0.0722 * _SRGB_TO_LINEAR[blue]
	)


def _contrast_ratio(a: float, b: float) -> float:
	# WCAG relative-luminance contrast; inputs are already-linear luminances
	lighter, darker = (a, b) if a >= b else (b, a)
	return (lighter + 0.05) / (darker + 0.05)


_PLATE_MATTE_LUM = _relative_luminance(*PLATE_MATTE_RGB)
_PLATE_LIGHT_LUM = _relative_luminance(*PLATE_LIGHT_RGB)
