# scripts/seed_pipeline/seed_pipeline/validate.py
# validate source manifests before cache builds or network work

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

from .manifest import JsonObject, as_list, as_str, read_json
from .settings import SOURCE_SCHEMA_RELATIVE_PATH, SUPPORTED_SOURCE_SUFFIXES


# diagnostics stay serializable so CLI output, tests, & future reports share shape
@dataclass(frozen=True)
class ValidationDiagnostic:
    code: str
    message: str
    path: str
    severity: str

    def to_json(self) -> JsonObject:
        return {
            "code": self.code,
            "message": self.message,
            "path": self.path,
            "severity": self.severity,
        }


@dataclass(frozen=True)
class ValidationResult:
    manifest: JsonObject
    warnings: tuple[ValidationDiagnostic, ...]
    errors: tuple[ValidationDiagnostic, ...]

    @property
    def ok(self) -> bool:
        return len(self.errors) == 0


class ManifestValidationError(Exception):
    def __init__(self, errors: tuple[ValidationDiagnostic, ...]) -> None:
        super().__init__("manifest validation failed")
        self.errors = errors


def validate_source_manifest(manifest_path: Path, repo_root: Path) -> ValidationResult:
    if not manifest_path.is_file():
        # return a diagnostic instead of throwing so CLI output stays uniform
        error = _error("missingManifest", "$", str(manifest_path))
        return ValidationResult(manifest={}, warnings=(), errors=(error,))
    manifest = read_json(manifest_path)
    schema = read_json(repo_root / SOURCE_SCHEMA_RELATIVE_PATH)
    diagnostics: list[ValidationDiagnostic] = []
    diagnostics.extend(_schema_diagnostics(manifest, schema))
    # run semantic checks only after shape is known enough for predictable paths
    if not diagnostics:
        diagnostics.extend(_semantic_diagnostics(manifest, manifest_path, repo_root))
    errors = tuple(item for item in diagnostics if item.severity == "error")
    warnings = tuple(item for item in diagnostics if item.severity == "warning")
    return ValidationResult(manifest=manifest, warnings=warnings, errors=errors)


def assert_valid_source_manifest(manifest_path: Path, repo_root: Path) -> JsonObject:
    result = validate_source_manifest(manifest_path, repo_root)
    if result.errors:
        raise ManifestValidationError(result.errors)
    return result.manifest


def _schema_diagnostics(value: JsonObject, schema: JsonObject) -> list[ValidationDiagnostic]:
    validator = Draft202012Validator(schema)
    diagnostics: list[ValidationDiagnostic] = []
    for error in sorted(validator.iter_errors(value), key=lambda item: item.json_path):
        diagnostics.append(
            ValidationDiagnostic(
                code="schema",
                message=error.message,
                path=error.json_path,
                severity="error",
            )
        )
    return diagnostics


def _semantic_diagnostics(
    manifest: JsonObject, manifest_path: Path, repo_root: Path
) -> list[ValidationDiagnostic]:
    diagnostics: list[ValidationDiagnostic] = []
    templates = as_list(manifest.get("templates"))
    seen_templates: set[str] = set()
    # validate cross-field rules after schema checks have stabilized key paths
    for template_index, template in enumerate(templates):
        template_path = f"$.templates[{template_index}]"
        if not isinstance(template, dict):
            continue
        external_id = as_str(template.get("externalId"))
        if external_id in seen_templates:
            diagnostics.append(
                _error("duplicateTemplateExternalId", template_path, external_id)
            )
        seen_templates.add(external_id)
        folder = _repo_local_path(repo_root / as_str(template.get("folder")), repo_root)
        if folder is None:
            diagnostics.append(_error("pathEscapesRepo", template_path, external_id))
            continue
        if not folder.is_dir():
            diagnostics.append(_error("missingTemplateFolder", template_path, str(folder)))
            continue
        cover_image = template.get("coverImage")
        if isinstance(cover_image, str):
            _check_source_image(
                repo_root / cover_image,
                f"{template_path}.coverImage",
                diagnostics,
                repo_root,
            )
        # criteria/items each own template-scoped identity rules
        _check_criteria(template, template_path, diagnostics)
        _check_items(template, folder, repo_root, template_path, diagnostics)
    _check_ranking_seeds(manifest, templates, diagnostics)
    return diagnostics


def _check_ranking_seeds(
    manifest: JsonObject,
    templates: list[Any],
    diagnostics: list[ValidationDiagnostic],
) -> None:
    ranking_seeds = manifest.get("rankingSeeds")
    if not isinstance(ranking_seeds, dict):
        return
    profiles = as_list(ranking_seeds.get("profiles"))
    profile_keys = _check_unique_dict_values(
        profiles,
        "$.rankingSeeds.profiles",
        "key",
        "duplicateRankingProfileKey",
        diagnostics,
    )
    template_by_external_id = {
        as_str(template.get("externalId")): template
        for template in templates
        if isinstance(template, dict)
    }
    targets = as_list(ranking_seeds.get("targets"))
    _check_unique_dict_values(
        targets,
        "$.rankingSeeds.targets",
        "templateExternalId",
        "duplicateRankingTarget",
        diagnostics,
    )
    curated_ids: set[str] = set()
    for target_index, target in enumerate(targets):
        target_path = f"$.rankingSeeds.targets[{target_index}]"
        if not isinstance(target, dict):
            continue
        template_external_id = as_str(target.get("templateExternalId"))
        template = template_by_external_id.get(template_external_id)
        if template is None:
            diagnostics.append(
                _error("unknownRankingTargetTemplate", target_path, template_external_id)
            )
            continue
        criteria = {
            as_str(criterion.get("externalId"))
            for criterion in as_list(template.get("criteria"))
            if isinstance(criterion, dict)
        }
        lane_ids = _check_unique_dict_values(
            as_list(target.get("lanes")),
            f"{target_path}.lanes",
            "criterionExternalId",
            "duplicateRankingLaneCriterion",
            diagnostics,
        )
        for lane_id in lane_ids:
            if lane_id not in criteria:
                diagnostics.append(
                    _error("unknownRankingLaneCriterion", f"{target_path}.lanes", lane_id)
                )
        featured_slots: set[str] = set()
        for curated_index, curated in enumerate(as_list(target.get("curatedRankings"))):
            curated_path = f"{target_path}.curatedRankings[{curated_index}]"
            if not isinstance(curated, dict):
                continue
            external_id = as_str(curated.get("externalId"))
            if external_id in curated_ids:
                diagnostics.append(
                    _error("duplicateCuratedRankingExternalId", curated_path, external_id)
                )
            curated_ids.add(external_id)
            criterion_id = as_str(curated.get("criterionExternalId"))
            if criterion_id not in criteria:
                diagnostics.append(
                    _error(
                        "unknownCuratedRankingCriterion",
                        f"{curated_path}.criterionExternalId",
                        criterion_id,
                    )
                )
            featured_rank = curated.get("featuredRank")
            if isinstance(featured_rank, int):
                slot = f"{criterion_id}:{featured_rank}"
                if slot in featured_slots:
                    diagnostics.append(
                        _error("duplicateCuratedFeaturedRank", curated_path, slot)
                    )
                featured_slots.add(slot)
                if curated.get("featuredBadge") is None:
                    diagnostics.append(
                        _error("missingCuratedFeaturedBadge", curated_path, external_id)
                    )
        for lane_index, lane in enumerate(as_list(target.get("lanes"))):
            lane_path = f"{target_path}.lanes[{lane_index}]"
            if not isinstance(lane, dict):
                continue
            for featured in as_list(lane.get("featuredProfiles")):
                if not isinstance(featured, dict):
                    continue
                profile_key = as_str(featured.get("profileKey"))
                if profile_key not in profile_keys:
                    diagnostics.append(
                        _error("unknownFeaturedProfileKey", lane_path, profile_key)
                    )


def _check_unique_dict_values(
    rows: list[Any],
    path: str,
    key: str,
    code: str,
    diagnostics: list[ValidationDiagnostic],
) -> set[str]:
    seen: set[str] = set()
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            continue
        value = as_str(row.get(key))
        if value in seen:
            diagnostics.append(_error(code, f"{path}[{index}].{key}", value))
        seen.add(value)
    return seen


def _check_criteria(
    template: dict[str, Any],
    template_path: str,
    diagnostics: list[ValidationDiagnostic],
) -> None:
    seen: set[str] = set()
    primary_count = 0
    orders: set[int] = set()
    for index, criterion in enumerate(as_list(template.get("criteria"))):
        path = f"{template_path}.criteria[{index}]"
        if not isinstance(criterion, dict):
            continue
        external_id = as_str(criterion.get("externalId"))
        # criterion external IDs scope to the template, matching Convex upserts
        if external_id in seen:
            diagnostics.append(_error("duplicateCriterionExternalId", path, external_id))
        seen.add(external_id)
        order = criterion.get("order")
        if isinstance(order, int):
            if order in orders:
                diagnostics.append(_error("duplicateCriterionOrder", path, str(order)))
            orders.add(order)
        if criterion.get("isPrimary") is True:
            primary_count += 1
    if primary_count != 1:
        # each template needs one canonical ranking lane for cards/detail views
        diagnostics.append(
            _error("invalidPrimaryCriterionCount", f"{template_path}.criteria", str(primary_count))
        )


def _check_items(
    template: dict[str, Any],
    folder: Path,
    repo_root: Path,
    template_path: str,
    diagnostics: list[ValidationDiagnostic],
) -> None:
    seen: set[str] = set()
    label_policy = template.get("labelPolicy")
    for index, item in enumerate(as_list(template.get("items"))):
        path = f"{template_path}.items[{index}]"
        if not isinstance(item, dict):
            continue
        external_id = as_str(item.get("externalId"))
        # item external IDs scope to the template, not the full dataset
        if external_id in seen:
            diagnostics.append(_error("duplicateItemExternalId", path, external_id))
        seen.add(external_id)
        # production manifests should carry curated labels, not filename fallback
        if label_policy == "explicit-required" and not as_str(item.get("label")).strip():
            diagnostics.append(_error("missingExplicitLabel", path, external_id))
        image = as_str(item.get("image"))
        _check_source_image(folder / image, f"{path}.image", diagnostics, repo_root)


def _check_source_image(
    path: Path, pointer: str, diagnostics: list[ValidationDiagnostic], repo_root: Path
) -> None:
    resolved = _repo_local_path(path, repo_root)
    if resolved is None:
        diagnostics.append(_error("pathEscapesRepo", pointer, str(path)))
        return
    path = resolved
    # validate extension separately so missing files still get useful format errors
    if path.suffix.lower() not in SUPPORTED_SOURCE_SUFFIXES:
        diagnostics.append(_error("unsupportedImageFormat", pointer, path.name))
    # leave image decode, dimensions, & crop checks to the build step
    if not path.is_file():
        diagnostics.append(_error("missingImageFile", pointer, str(path)))


def _repo_local_path(path: Path, repo_root: Path) -> Path | None:
    resolved = path.resolve()
    try:
        resolved.relative_to(repo_root.resolve())
    except ValueError:
        return None
    return resolved


def _error(code: str, path: str, message: str) -> ValidationDiagnostic:
    return ValidationDiagnostic(code=code, message=message, path=path, severity="error")
