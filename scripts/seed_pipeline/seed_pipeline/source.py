# scripts/seed_pipeline/seed_pipeline/source.py
# compose the legacy in-memory source-manifest shape from the split layout:
#   data/seeds/marketplace-core.json (thin index)
# + examples/<cat>/<folder>/_template.json (curated)
# + examples/<cat>/<folder>/_cover.{jpg,jpeg,png,webp} (auto-detected)
# + data/seeds/ranking-profiles.json (optional)
# this keeps build.py, the compiled-manifest contract, and downstream Convex code
# unchanged while letting authors edit small per-folder files instead of one giant blob.

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from jsonschema import Draft202012Validator

from .manifest import JsonObject, read_json
from .settings import (
	COVER_FILE_EXTENSIONS,
	LEGACY_IN_MEMORY_SCHEMA_VERSION,
	MARKETPLACE_CORE_SCHEMA_PATH,
	RANKING_PROFILES_FILE_NAME,
	RANKING_PROFILES_SCHEMA_PATH,
	TEMPLATE_FILE_GLOB,
	TEMPLATE_SCHEMA_PATH,
)


# Curated template fields copied straight into the in-memory legacy shape.
# 'externalId' + 'folder' are required and handled separately; cover is auto-detected.
_TEMPLATE_PASSTHROUGH_FIELDS = (
	"title",
	"category",
	"description",
	"tags",
	"visibility",
	"labelPolicy",
	"labels",
	"autoPlate",
	"coverZoom",
	"suggestedTiers",
	"criteria",
	"items",
)


@dataclass(frozen=True)
class CompositionError:
	code: str
	message: str
	path: str

	def to_json(self) -> JsonObject:
		return {"code": self.code, "message": self.message, "path": self.path}


class DatasetCompositionError(Exception):
	def __init__(self, errors: tuple[CompositionError, ...]) -> None:
		super().__init__("dataset composition failed")
		self.errors = errors


def compose_dataset(core_path: Path, repo_root: Path) -> JsonObject:
	"""Load split source files and return the legacy in-memory manifest shape.

	Raises DatasetCompositionError if any per-file schema check fails or templateOrder
	diverges from the on-disk _template.json files.
	"""
	errors: list[CompositionError] = []
	if not core_path.is_file():
		errors.append(
			CompositionError(
				code="missingMarketplaceCore",
				message=str(core_path),
				path="$",
			)
		)
		raise DatasetCompositionError(tuple(errors))

	core = read_json(core_path)
	core_errors = _validate_against_schema(
		core,
		MARKETPLACE_CORE_SCHEMA_PATH,
		"$",
	)
	if core_errors:
		raise DatasetCompositionError(tuple(core_errors))

	templates_by_id = _load_templates(repo_root, errors)
	if errors:
		raise DatasetCompositionError(tuple(errors))

	template_order = list(core["templateOrder"])
	missing = [ext_id for ext_id in template_order if ext_id not in templates_by_id]
	extra = sorted(set(templates_by_id.keys()) - set(template_order))
	if missing:
		errors.append(
			CompositionError(
				code="missingTemplateForOrder",
				message=", ".join(missing),
				path="$.templateOrder",
			)
		)
	if extra:
		# an unreferenced _template.json silently disappearing from a build would be
		# a really unpleasant surprise; surface it as an error so the author fixes
		# templateOrder explicitly
		errors.append(
			CompositionError(
				code="orphanTemplate",
				message=", ".join(extra),
				path="examples/*/*/_template.json",
			)
		)
	if errors:
		raise DatasetCompositionError(tuple(errors))

	composed_templates: list[JsonObject] = []
	for ext_id in template_order:
		template_path, template = templates_by_id[ext_id]
		legacy = _legacy_template(template, template_path, repo_root)
		composed_templates.append(legacy)

	composed: JsonObject = {
		"schemaVersion": LEGACY_IN_MEMORY_SCHEMA_VERSION,
		"datasetKey": core["datasetKey"],
		"releaseId": core["releaseId"],
		"authorEmail": core["authorEmail"],
		"templates": composed_templates,
	}

	rankings_path = core_path.parent / RANKING_PROFILES_FILE_NAME
	if rankings_path.is_file():
		rankings = read_json(rankings_path)
		rankings_errors = _validate_against_schema(
			rankings,
			RANKING_PROFILES_SCHEMA_PATH,
			"$",
		)
		if rankings_errors:
			raise DatasetCompositionError(tuple(rankings_errors))
		# legacy in-memory shape never carried schemaVersion on the rankings block;
		# strip it so downstream rankings code keeps seeing the shape it expects
		composed["rankingSeeds"] = {
			key: value for key, value in rankings.items() if key != "schemaVersion"
		}

	return composed


def list_source_files(core_path: Path, repo_root: Path) -> list[Path]:
	"""Return every source file the composed manifest depends on, in stable order.

	Used by the compile fingerprint so source-file edits invalidate the build cache.
	"""
	files: list[Path] = [core_path]
	rankings_path = core_path.parent / RANKING_PROFILES_FILE_NAME
	if rankings_path.is_file():
		files.append(rankings_path)
	files.extend(sorted(repo_root.glob(TEMPLATE_FILE_GLOB)))
	return files


def list_source_schema_paths() -> list[Path]:
	"""Return every source schema the compile fingerprint should track.

	Schemas changing alone (e.g., a tighter pattern) can invalidate cached compiled
	output without any data file changing. Schemas now live inside the pipeline
	package, so the paths are package-relative and don't depend on repo_root.
	"""
	return [
		MARKETPLACE_CORE_SCHEMA_PATH,
		TEMPLATE_SCHEMA_PATH,
		RANKING_PROFILES_SCHEMA_PATH,
	]


def _load_templates(
	repo_root: Path, errors: list[CompositionError]
) -> dict[str, tuple[Path, JsonObject]]:
	templates: dict[str, tuple[Path, JsonObject]] = {}
	template_schema = read_json(TEMPLATE_SCHEMA_PATH)
	validator = Draft202012Validator(template_schema)
	for template_path in sorted(repo_root.glob(TEMPLATE_FILE_GLOB)):
		relative = template_path.relative_to(repo_root).as_posix()
		try:
			template = read_json(template_path)
		except (ValueError, OSError) as exc:
			errors.append(
				CompositionError(
					code="unreadableTemplate",
					message=str(exc),
					path=relative,
				)
			)
			continue
		schema_errors = sorted(validator.iter_errors(template), key=lambda item: item.json_path)
		if schema_errors:
			for error in schema_errors:
				errors.append(
					CompositionError(
						code="templateSchema",
						message=error.message,
						path=f"{relative}{_strip_root_pointer(error.json_path)}",
					)
				)
			continue
		external_id = template["externalId"]
		if external_id in templates:
			existing_path = templates[external_id][0].relative_to(repo_root).as_posix()
			errors.append(
				CompositionError(
					code="duplicateTemplateExternalId",
					message=f"{external_id} appears in {existing_path} and {relative}",
					path=relative,
				)
			)
			continue
		templates[external_id] = (template_path, template)
	return templates


def _legacy_template(template: JsonObject, template_path: Path, repo_root: Path) -> JsonObject:
	folder_rel = template["folder"]
	folder_path = repo_root / folder_rel
	legacy: JsonObject = {
		"externalId": template["externalId"],
		"folder": folder_rel,
	}
	for key in _TEMPLATE_PASSTHROUGH_FIELDS:
		if key in template:
			legacy[key] = template[key]
	cover = _detect_cover(folder_path)
	if cover is not None:
		legacy["coverImage"] = cover.relative_to(repo_root).as_posix()
	return legacy


def _detect_cover(folder: Path) -> Path | None:
	matches = [
		folder / f"_cover{extension}"
		for extension in COVER_FILE_EXTENSIONS
		if (folder / f"_cover{extension}").is_file()
	]
	if len(matches) > 1:
		names = ", ".join(match.name for match in matches)
		raise ValueError(f"multiple cover files in {folder}: {names}")
	return matches[0] if matches else None


def _validate_against_schema(
	value: JsonObject, schema_path: Path, base_pointer: str
) -> list[CompositionError]:
	schema = read_json(schema_path)
	validator = Draft202012Validator(schema)
	errors = sorted(validator.iter_errors(value), key=lambda item: item.json_path)
	return [
		CompositionError(
			code="schema",
			message=error.message,
			path=f"{base_pointer}{_strip_root_pointer(error.json_path)}",
		)
		for error in errors
	]


def _strip_root_pointer(json_path: str) -> str:
	# jsonschema returns "$" for root; for a per-file caller we want "" so we can
	# cleanly concatenate with a file-relative prefix
	return "" if json_path == "$" else json_path.removeprefix("$")
