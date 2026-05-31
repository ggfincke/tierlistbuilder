# scripts/seed_pipeline/seed_pipeline/manifest.py
# JSON file helpers & repo-root discovery for seed commands

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable


JsonObject = dict[str, Any]


def as_list(value: Any) -> list[Any]:
	return value if isinstance(value, list) else []


def as_str(value: Any) -> str:
	return value if isinstance(value, str) else ""


def compiled_templates(compiled: JsonObject) -> Iterable[JsonObject]:
	for template in as_list(compiled.get("templates")):
		if isinstance(template, dict):
			yield template


def iter_compiled_assets(compiled: JsonObject) -> Iterable[JsonObject]:
	for template in compiled_templates(compiled):
		cover = template.get("coverImage")
		if isinstance(cover, dict):
			yield cover
		for item in as_list(template.get("items")):
			if not isinstance(item, dict) or not isinstance(item.get("asset"), dict):
				continue
			yield item["asset"]


def iter_compiled_asset_entries(compiled: JsonObject) -> Iterable[JsonObject]:
	for template in compiled_templates(compiled):
		template_external_id = str(template["externalId"])
		cover = template.get("coverImage")
		if isinstance(cover, dict):
			yield {"assetKey": f"{template_external_id}:cover", "asset": cover}
		for item in as_list(template.get("items")):
			if not isinstance(item, dict) or not isinstance(item.get("asset"), dict):
				continue
			yield {
				"assetKey": f"{template_external_id}:{item['externalId']}",
				"asset": item["asset"],
			}


def chunks(items: list[Any], size: int) -> Iterable[list[Any]]:
	for index in range(0, len(items), size):
		yield items[index : index + size]


def chunk_templates_by_items(
	templates: Iterable[JsonObject], max_items: int
) -> list[list[JsonObject]]:
	# pack template groups so a single chunk's item count fits under server budget
	batches: list[list[JsonObject]] = []
	current: list[JsonObject] = []
	current_items = 0
	for template in templates:
		item_count = len(as_list(template.get("items")))
		if current and current_items + item_count > max_items:
			batches.append(current)
			current = []
			current_items = 0
		current.append(template)
		current_items += item_count
	if current:
		batches.append(current)
	return batches


def find_repo_root(start: Path | None = None) -> Path:
	current = (start or Path.cwd()).resolve()
	for candidate in (current, *current.parents):
		# require both app metadata & the pipeline package so a stray package.json
		# elsewhere in the tree never wins; the pipeline package is the closest
		# always-tracked sibling now that data/seeds/ contents are local-only
		if (candidate / "package.json").is_file() and (
			candidate / "scripts" / "seed_pipeline"
		).is_dir():
			return candidate
	msg = f"could not find repo root from {current}"
	raise FileNotFoundError(msg)


def repo_relative(path: Path, repo_root: Path) -> str:
	# store manifest paths relative to repo root so cache artifacts move cleanly
	return path.resolve().relative_to(repo_root.resolve()).as_posix()


def read_json(path: Path) -> JsonObject:
	# seed contracts are object-shaped; arrays/scalars are always caller mistakes
	with path.open("r", encoding="utf-8") as file:
		value = json.load(file)
	if not isinstance(value, dict):
		msg = f"{path} must contain a JSON object"
		raise ValueError(msg)
	return value


def write_json(path: Path, value: JsonObject) -> None:
	# write deterministic, reviewable JSON for compiled manifests & fixtures
	path.parent.mkdir(parents=True, exist_ok=True)
	with path.open("w", encoding="utf-8") as file:
		json.dump(value, file, indent=2, sort_keys=False)
		file.write("\n")
