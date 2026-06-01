# scripts/seed_pipeline/seed_pipeline/diff.py
# compare compiled seed manifests against Convex seed state

from __future__ import annotations

from pathlib import Path

from .assets import asset_dedupe_hash, asset_tile_hash
from .build import build_compiled_manifest_with_data
from .concurrency import run_in_parallel
from .convex_client import ConvexSeedClient, read_seed_settings
from .manifest import (
	JsonObject,
	as_list,
	chunk_templates_by_items,
	chunks,
	compiled_templates,
	iter_compiled_assets,
	read_json,
)
from .progress import ProgressLogger
from .report_layout import append_section, compiled_report_header
from .template_payloads import (
	build_style_item_upserts,
	build_template_upserts,
	style_items_content_hash,
	template_style_items_content_hash,
)


SEED_STATE_ROUTE = "/api/seed/state"
SEED_MEDIA_BY_HASHES_ROUTE = "/api/seed/media-by-hashes"
SEED_STATE_VARIANT_HASH_BATCH_SIZE = 1000
SEED_STATE_ITEM_BATCH_SIZE = 1500
SEED_STATE_MEDIA_WORKERS = 4


def write_diff_report_for_manifest(
	manifest_path: Path,
	repo_root: Path,
	env_name: str,
	fail_on_warning: bool = False,
	convex_url: str | None = None,
	seed_secret: str | None = None,
	state_json: Path | None = None,
) -> Path:
	progress = ProgressLogger("diff")
	compiled_path, compiled = build_compiled_manifest_with_data(
		manifest_path,
		repo_root,
		fail_on_warning=fail_on_warning,
		progress=progress,
	)
	if state_json is not None:
		# fixture state keeps diff coverage network-free & deterministic
		progress.log(f"loading fixture state: {state_json}")
		state = read_json(state_json)
	else:
		progress.log(f"reading seed state from {env_name}")
		settings = read_seed_settings(repo_root, env_name, convex_url, seed_secret)
		state = resolve_seed_state(ConvexSeedClient(settings), compiled, progress)
	progress.log("building diff report")
	diff = build_seed_diff(compiled, state)
	from .reports import write_diff_report_file

	report_path = write_diff_report_file(compiled_path, compiled, state, diff, env_name)
	progress.log(f"diff report written: {report_path}")
	return report_path


def resolve_seed_state(
	client: ConvexSeedClient,
	compiled: JsonObject,
	progress: ProgressLogger | None = None,
) -> JsonObject:
	state = client.query(
		SEED_STATE_ROUTE,
		build_state_headline_request(compiled),
	)
	state["items"] = _resolve_seed_items(client, compiled, progress)
	state["media"] = _resolve_seed_media(client, compiled, progress)
	return state


def _resolve_seed_items(
	client: ConvexSeedClient,
	compiled: JsonObject,
	progress: ProgressLogger | None,
) -> list[JsonObject]:
	template_chunks = chunk_templates_by_items(
		compiled_templates(compiled), SEED_STATE_ITEM_BATCH_SIZE
	)
	if progress is not None and template_chunks:
		total_items = sum(
			len(as_list(template.get("items"))) for chunk in template_chunks for template in chunk
		)
		progress.log(
			f"reading item state in {len(template_chunks)} batch(es): {total_items} item ids"
		)
	items: list[JsonObject] = []
	for index, chunk in enumerate(template_chunks, start=1):
		if progress is not None:
			chunk_items = sum(len(as_list(template.get("items"))) for template in chunk)
			progress.count(
				"item state batches",
				index,
				len(template_chunks),
				suffix=f"{chunk_items} item ids",
			)
		response = client.query(
			SEED_STATE_ROUTE,
			build_state_items_request(compiled, [template["externalId"] for template in chunk]),
		)
		items.extend(item for item in as_list(response.get("items")) if isinstance(item, dict))
	return items


def _resolve_seed_media(
	client: ConvexSeedClient,
	compiled: JsonObject,
	progress: ProgressLogger | None,
) -> list[JsonObject]:
	variant_hashes = sorted(_compiled_variant_hashes(compiled))
	if not variant_hashes:
		return []
	hash_chunks = list(chunks(variant_hashes, SEED_STATE_VARIANT_HASH_BATCH_SIZE))
	if progress is not None:
		progress.log(
			f"reading media state in {len(hash_chunks)} batch(es): "
			f"{len(variant_hashes)} variant hashes"
		)

	def query_media_chunk(chunk: list[str]) -> list[JsonObject]:
		response = client.query(
			SEED_MEDIA_BY_HASHES_ROUTE,
			{"authorEmail": compiled["authorEmail"], "variantHashes": chunk},
		)
		return [item for item in as_list(response.get("media")) if isinstance(item, dict)]

	on_complete = None
	if progress is not None:

		def on_complete(completed: int, total: int, chunk: list[str]) -> None:
			progress.count(
				"media state batches",
				completed,
				total,
				suffix=f"{len(chunk)} hashes",
			)

	batches = run_in_parallel(
		hash_chunks,
		query_media_chunk,
		SEED_STATE_MEDIA_WORKERS,
		on_complete=on_complete,
	)
	return [item for batch in batches for item in batch]


def build_state_headline_request(compiled: JsonObject) -> JsonObject:
	# fetch templates + criteria identities. items and media come from chunked
	# follow-up calls so each request stays under Convex's per-function budget.
	return {
		"datasetKey": compiled["datasetKey"],
		"releaseId": compiled["releaseId"],
		"authorEmail": compiled["authorEmail"],
		"templateExternalIds": [
			template["externalId"] for template in compiled_templates(compiled)
		],
		"itemExternalIds": [],
		"criterionExternalIds": [
			{
				"templateExternalId": template["externalId"],
				"criterionExternalId": criterion["externalId"],
			}
			for template in compiled_templates(compiled)
			for criterion in as_list(template.get("criteria"))
			if isinstance(criterion, dict)
		],
		"variantHashes": [],
	}


def build_state_items_request(compiled: JsonObject, template_external_ids: list[str]) -> JsonObject:
	selected_ids = set(template_external_ids)
	selected_templates = [
		template
		for template in compiled_templates(compiled)
		if template["externalId"] in selected_ids
	]
	return {
		"datasetKey": compiled["datasetKey"],
		"releaseId": compiled["releaseId"],
		"authorEmail": compiled["authorEmail"],
		"templateExternalIds": [template["externalId"] for template in selected_templates],
		"itemExternalIds": [
			{
				"templateExternalId": template["externalId"],
				"itemExternalId": item["externalId"],
			}
			for template in selected_templates
			for item in as_list(template.get("items"))
			if isinstance(item, dict)
		],
		"criterionExternalIds": [],
		"variantHashes": [],
	}


def build_seed_diff(compiled: JsonObject, state: JsonObject) -> JsonObject:
	# split by apply surface so reports map cleanly to later ingest phases
	return {
		"templates": _diff_templates(compiled, state),
		"items": _diff_items(compiled, state),
		"styleItems": _diff_style_items(compiled, state),
		"criteria": _diff_criteria(compiled, state),
		"media": _diff_media(compiled, state),
		"activation": {
			"activeReleaseId": state.get("activeReleaseId"),
			"targetReleaseId": compiled["releaseId"],
			"alreadyActive": state.get("activeReleaseId") == compiled["releaseId"],
		},
	}


def render_diff_report(
	compiled: JsonObject,
	state: JsonObject,
	diff: JsonObject,
	env_name: str,
) -> str:
	totals = compiled["totals"]
	media = diff["media"]
	active_release = state.get("activeReleaseId") or "none"
	lines = compiled_report_header(
		compiled,
		"Seed Diff Report",
		before=[f"- Environment: `{env_name}`"],
		after=[
			f"- Active release: `{active_release}`",
			f"- Templates: {totals['templateCount']}",
			f"- Items: {totals['itemCount']}",
			f"- Media assets present: {len(media['present'])}",
			f"- Media assets needing upload: {len(media['missing'])}",
		],
	)
	_append_diff_section(lines, "Templates To Create", diff["templates"]["create"])
	_append_diff_section(lines, "Templates To Update", diff["templates"]["update"])
	_append_diff_section(lines, "Templates Unchanged", diff["templates"]["unchanged"])
	_append_diff_section(lines, "Items To Create", diff["items"]["create"])
	_append_diff_section(lines, "Items To Update", diff["items"]["update"])
	_append_diff_section(lines, "Items To Reorder", diff["items"]["reorder"])
	_append_diff_section(lines, "Items Unchanged", diff["items"]["unchanged"])
	_append_diff_section(lines, "Style Items To Update", diff["styleItems"]["update"])
	_append_diff_section(lines, "Style Items Unchanged", diff["styleItems"]["unchanged"])
	_append_diff_section(lines, "Criteria To Create", diff["criteria"]["create"])
	_append_diff_section(lines, "Criteria To Update", diff["criteria"]["update"])
	_append_diff_section(lines, "Criteria Unchanged", diff["criteria"]["unchanged"])
	_append_diff_section(lines, "Media Assets Present", media["present"])
	_append_diff_section(lines, "Media Assets Needing Upload", media["missing"])
	lines.extend(
		[
			"## Activation Impact",
			"",
			"- Target release is already active."
			if diff["activation"]["alreadyActive"]
			else "- Activation would replace the active release pointer.",
			"",
		]
	)
	return "\n".join(lines)


def _diff_templates(compiled: JsonObject, state: JsonObject) -> JsonObject:
	# compare the same metadata hash Convex uses to gate template upserts
	existing = {
		template["externalId"]: template
		for template in as_list(state.get("templates"))
		if isinstance(template, dict)
	}
	upserts = {template["externalId"]: template for template in build_template_upserts(compiled)}
	create: list[str] = []
	update: list[JsonObject] = []
	unchanged: list[str] = []
	for template in as_list(compiled.get("templates")):
		if not isinstance(template, dict):
			continue
		current = existing.get(template["externalId"])
		if current is None:
			create.append(template["externalId"])
			continue
		upsert = upserts.get(template["externalId"])
		reasons: list[str] = []
		if upsert and current.get("metadataContentHash") != upsert["metadataContentHash"]:
			reasons.append("metadataContentHash")
		if current.get("releaseId") != compiled["releaseId"]:
			reasons.append("releaseId")
		if reasons:
			update.append({"externalId": template["externalId"], "reasons": reasons})
		else:
			unchanged.append(template["externalId"])
	return {"create": create, "update": update, "unchanged": unchanged}


def _diff_items(compiled: JsonObject, state: JsonObject) -> JsonObject:
	# split reorder from content updates so apply can stay targeted
	existing = {
		_pair_key(item["templateExternalId"], item["itemExternalId"]): item
		for item in as_list(state.get("items"))
		if isinstance(item, dict)
	}
	create: list[JsonObject] = []
	update: list[JsonObject] = []
	reorder: list[JsonObject] = []
	unchanged: list[JsonObject] = []
	for template in as_list(compiled.get("templates")):
		if not isinstance(template, dict):
			continue
		template_external_id = template["externalId"]
		for item in as_list(template.get("items")):
			if not isinstance(item, dict):
				continue
			key = _pair_key(template_external_id, item["externalId"])
			current = existing.get(key)
			entry = {
				"templateExternalId": template_external_id,
				"itemExternalId": item["externalId"],
			}
			if current is None:
				create.append(entry)
				continue
			item_for_diff = {
				**item,
				"mediaContentHash": asset_tile_hash(item.get("asset")),
				"mediaDedupeHash": asset_dedupe_hash(item.get("asset")),
			}
			reasons = _changed_fields(
				item_for_diff,
				current,
				[
					"label",
					"aspectRatio",
					"transform",
					"mediaDedupeHash",
					"mediaPlate",
					"imagePadding",
					"backgroundColor",
				],
			)
			changed = False
			if reasons:
				update.append({**entry, "reasons": reasons})
				changed = True
			if current.get("order") != item.get("order"):
				reorder.append({**entry, "from": current.get("order"), "to": item.get("order")})
				changed = True
			if not changed:
				unchanged.append(entry)
	return {
		"create": create,
		"update": update,
		"reorder": reorder,
		"unchanged": unchanged,
	}


def _diff_style_items(compiled: JsonObject, state: JsonObject) -> JsonObject:
	existing = {
		template["externalId"]: template
		for template in as_list(state.get("templates"))
		if isinstance(template, dict)
	}
	update: list[JsonObject] = []
	unchanged: list[JsonObject] = []
	for template_external_id, content_hash in _compiled_style_item_hashes(compiled).items():
		current = existing.get(template_external_id)
		entry = {"templateExternalId": template_external_id}
		if current is None:
			update.append({**entry, "reasons": ["template"]})
			continue
		if current.get("styleItemsContentHash") != content_hash:
			update.append({**entry, "reasons": ["styleItemsContentHash"]})
		else:
			unchanged.append(entry)
	return {"update": update, "unchanged": unchanged}


def _diff_criteria(compiled: JsonObject, state: JsonObject) -> JsonObject:
	# criteria diffs drive ranking-question upserts, separate from item media
	existing = {
		_pair_key(item["templateExternalId"], item["criterionExternalId"]): item
		for item in as_list(state.get("criteria"))
		if isinstance(item, dict)
	}
	create: list[JsonObject] = []
	update: list[JsonObject] = []
	unchanged: list[JsonObject] = []
	for template in as_list(compiled.get("templates")):
		if not isinstance(template, dict):
			continue
		template_external_id = template["externalId"]
		for criterion in as_list(template.get("criteria")):
			if not isinstance(criterion, dict):
				continue
			key = _pair_key(template_external_id, criterion["externalId"])
			current = existing.get(key)
			entry = {
				"templateExternalId": template_external_id,
				"criterionExternalId": criterion["externalId"],
			}
			if current is None:
				create.append(entry)
				continue
			reasons = _changed_fields(
				criterion,
				current,
				[
					"name",
					"shortName",
					"prompt",
					"axisTop",
					"axisBottom",
					"order",
					"isPrimary",
					"status",
				],
			)
			if reasons:
				update.append({**entry, "reasons": reasons})
			else:
				unchanged.append(entry)
	return {"create": create, "update": update, "unchanged": unchanged}


def _diff_media(compiled: JsonObject, state: JsonObject) -> JsonObject:
	present = {
		media["mediaDedupeHash"]
		for media in as_list(state.get("media"))
		if isinstance(media, dict) and isinstance(media.get("mediaDedupeHash"), str)
	}
	hashes = sorted(_compiled_asset_dedupe_hashes(compiled))
	return {
		"present": [dedupe_hash for dedupe_hash in hashes if dedupe_hash in present],
		"missing": [dedupe_hash for dedupe_hash in hashes if dedupe_hash not in present],
	}


def _compiled_asset_dedupe_hashes(compiled: JsonObject) -> set[str]:
	hashes: set[str] = set()
	for asset in iter_compiled_assets(compiled):
		dedupe_hash = asset_dedupe_hash(asset)
		if dedupe_hash is not None:
			hashes.add(dedupe_hash)
	return hashes


def _compiled_style_item_hashes(compiled: JsonObject) -> dict[str, str]:
	rows_by_template_style: dict[tuple[str, str], list[JsonObject]] = {}
	for row in build_style_item_upserts(compiled):
		template_external_id = str(row["templateExternalId"])
		style_external_id = str(row["styleExternalId"])
		items = rows_by_template_style.setdefault(
			(template_external_id, style_external_id),
			[],
		)
		items.append(
			{
				key: value
				for key, value in row.items()
				if key not in ("templateExternalId", "styleExternalId")
			}
		)

	style_hashes_by_template: dict[str, list[JsonObject]] = {}
	for (template_external_id, style_external_id), items in rows_by_template_style.items():
		style_hashes_by_template.setdefault(template_external_id, []).append(
			{
				"styleExternalId": style_external_id,
				"styleItemsContentHash": style_items_content_hash(
					template_external_id,
					style_external_id,
					items,
				),
			}
		)
	return {
		template_external_id: template_style_items_content_hash(
			template_external_id,
			style_hashes,
		)
		for template_external_id, style_hashes in style_hashes_by_template.items()
	}


def _compiled_variant_hashes(compiled: JsonObject) -> set[str]:
	hashes: set[str] = set()
	for asset in iter_compiled_assets(compiled):
		variants = asset.get("variants")
		if not isinstance(variants, dict):
			continue
		for variant in variants.values():
			if isinstance(variant, dict):
				hashes.add(str(variant["contentHash"]))
	return hashes


def _append_diff_section(lines: list[str], title: str, entries: list[object]) -> None:
	append_section(lines, title, entries, lambda entry: f"- `{_format_entry(entry)}`")


def _changed_fields(left: JsonObject, right: JsonObject, fields: list[str]) -> list[str]:
	return [field for field in fields if left.get(field) != right.get(field)]


def _format_entry(entry: object) -> str:
	if isinstance(entry, str):
		return entry
	if not isinstance(entry, dict):
		return str(entry)
	if "externalId" in entry:
		base = str(entry["externalId"])
	else:
		base = f"{entry.get('templateExternalId')} / {entry.get('itemExternalId') or entry.get('criterionExternalId')}"
	if "reasons" in entry:
		return f"{base} ({', '.join(entry['reasons'])})"
	if "from" in entry and "to" in entry:
		return f"{base} ({entry['from']} -> {entry['to']})"
	return base


def _pair_key(template_external_id: str, child_external_id: str) -> str:
	return f"{template_external_id}\0{child_external_id}"
