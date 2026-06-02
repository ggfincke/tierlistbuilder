# scripts/seed_pipeline/seed_pipeline/template_payloads.py
# seed template metadata payloads shared by diff & apply

from __future__ import annotations

from .assets import asset_dedupe_hash
from .content_hash import seed_content_hash
from .manifest import JsonObject, as_list, compiled_templates


# mirror Convex defaults when a manifest omits curated template tiers
DEFAULT_SUGGESTED_TIERS = [
	{"name": "S", "colorSpec": {"kind": "palette", "index": 0}},
	{"name": "A", "colorSpec": {"kind": "palette", "index": 1}},
	{"name": "B", "colorSpec": {"kind": "palette", "index": 2}},
	{"name": "C", "colorSpec": {"kind": "palette", "index": 3}},
	{"name": "D", "colorSpec": {"kind": "palette", "index": 4}},
	{"name": "E", "colorSpec": {"kind": "palette", "index": 5}},
]


# mirrors packages/contracts/marketplace/template.ts:SURFACE_ASPECT_RATIOS
SURFACE_ASPECT_RATIOS = {
	"browseHero": 16 / 9,
	"detailHero": 4 / 3,
	"card": 16 / 10,
}


def build_template_upserts(compiled: JsonObject) -> list[JsonObject]:
	upserts: list[JsonObject] = []
	for template in compiled_templates(compiled):
		upsert = build_template_metadata_payload(template)
		upserts.append(
			{
				**upsert,
				"metadataContentHash": seed_content_hash("template-metadata", upsert),
			}
		)
	return upserts


def items_content_hash(template_external_id: str, items: list[JsonObject]) -> str:
	return _child_content_hash("items", template_external_id, items)


def criteria_content_hash(template_external_id: str, criteria: list[JsonObject]) -> str:
	return _child_content_hash("criteria", template_external_id, criteria)


def style_items_content_hash(
	template_external_id: str,
	style_external_id: str,
	items: list[JsonObject],
) -> str:
	return seed_content_hash(
		"template-style-items",
		{
			"templateExternalId": template_external_id,
			"styleExternalId": style_external_id,
			"items": sorted(items, key=lambda item: str(item["itemExternalId"])),
		},
	)


def template_style_items_content_hash(
	template_external_id: str,
	style_hashes: list[JsonObject],
) -> str:
	return seed_content_hash(
		"template-style-items-index",
		{
			"templateExternalId": template_external_id,
			"styles": sorted(
				style_hashes,
				key=lambda item: str(item["styleExternalId"]),
			),
		},
	)


def _child_content_hash(
	child_key: str,
	template_external_id: str,
	rows: list[JsonObject],
) -> str:
	return seed_content_hash(
		f"template-{child_key}",
		{"templateExternalId": template_external_id, child_key: rows},
	)


def build_template_metadata_payload(template: JsonObject) -> JsonObject:
	cover = template.get("coverImage")
	upsert = {
		"externalId": template["externalId"],
		"title": template["title"],
		"category": template["category"],
		"description": template.get("description"),
		"tags": template.get("tags", []),
		"visibility": template["visibility"],
		"coverMediaDedupeHash": asset_dedupe_hash(cover),
		"coverFraming": cover_framing(template),
		"suggestedTiers": template.get("suggestedTiers") or DEFAULT_SUGGESTED_TIERS,
		"itemAspectRatio": template["itemAspectRatio"],
		"defaultItemImagePadding": template.get("defaultItemImagePadding"),
		"itemCount": len(as_list(template.get("items"))),
	}
	if "labels" in template:
		upsert["labels"] = template["labels"]
	if "autoPlate" in template:
		upsert["autoPlate"] = template["autoPlate"]
	styles = _build_template_styles(template)
	if styles is not None:
		upsert["styles"] = styles
		upsert["defaultStyleId"] = _default_style_id(template)
	return upsert


# per-template image-style metadata rows (templateStyles). all styles get a row;
# per-item assets for non-default styles are synced separately
def _build_template_styles(template: JsonObject) -> list[JsonObject] | None:
	styles = template.get("styles")
	if not isinstance(styles, list) or not styles:
		return None
	rows: list[JsonObject] = []
	for style in styles:
		if not isinstance(style, dict):
			continue
		cover = style.get("coverImage")
		row = {
			"externalId": style["id"],
			"label": style.get("label") or style["id"],
			"order": style.get("order", 0),
			"isDefault": bool(style.get("isDefault", False)),
			"coverMediaDedupeHash": asset_dedupe_hash(cover),
			"itemAspectRatio": style.get("itemAspectRatio"),
			"defaultItemImagePadding": template.get("defaultItemImagePadding"),
		}
		if "labels" in template:
			row["labels"] = template["labels"]
		if "autoPlate" in template:
			row["autoPlate"] = template["autoPlate"]
		rows.append(row)
	return rows


def _default_style_id(template: JsonObject) -> str | None:
	for style in as_list(template.get("styles")):
		if isinstance(style, dict) and style.get("isDefault"):
			return str(style["id"])
	return None


# per-(style, item) image asset upserts (templateItemStyleAssets). default-style
# items keep their images on the template items, so only non-default styles emit
def build_style_item_upserts(compiled: JsonObject) -> list[JsonObject]:
	upserts: list[JsonObject] = []
	for template in compiled_templates(compiled):
		template_external_id = str(template["externalId"])
		for style in as_list(template.get("styles")):
			if not isinstance(style, dict) or style.get("isDefault"):
				continue
			style_external_id = str(style.get("id", ""))
			item_assets = style.get("itemAssets")
			if not isinstance(item_assets, dict):
				continue
			for item_external_id, entry in item_assets.items():
				if not isinstance(entry, dict):
					continue
				upserts.append(
					{
						"templateExternalId": template_external_id,
						"styleExternalId": style_external_id,
						"itemExternalId": item_external_id,
						"mediaDedupeHash": asset_dedupe_hash(entry.get("asset")),
						"aspectRatio": entry.get("aspectRatio"),
						"transform": entry.get("transform"),
						"mediaPlate": entry.get("mediaPlate"),
						"imagePadding": entry.get("imagePadding"),
					}
				)
	return upserts


def cover_framing(template: JsonObject) -> JsonObject | None:
	cover = template.get("coverImage")
	zoom = template.get("coverZoom") or 1
	if not isinstance(cover, dict) or zoom <= 1:
		return None
	return {
		surface: zoomed_cover_frame(
			cover["sourceWidth"],
			cover["sourceHeight"],
			aspect,
			zoom,
		)
		for surface, aspect in SURFACE_ASPECT_RATIOS.items()
	}


def zoomed_cover_frame(
	source_width: float,
	source_height: float,
	surface_aspect: float,
	zoom: float,
) -> JsonObject:
	# mirrors scripts/preview-cover.ts::zoomedFrameForSurface
	source_aspect = source_width / source_height
	if surface_aspect >= source_aspect:
		base_width = 1
		base_height = source_aspect / surface_aspect
	else:
		base_width = surface_aspect / source_aspect
		base_height = 1
	width = base_width * zoom
	height = base_height * zoom
	return {
		"x": (1 - width) / 2,
		"y": (1 - height) / 2,
		"width": width,
		"height": height,
	}
