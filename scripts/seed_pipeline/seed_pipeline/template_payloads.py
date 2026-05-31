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
	return upsert


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
