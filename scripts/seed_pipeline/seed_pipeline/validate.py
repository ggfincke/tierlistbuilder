# scripts/seed_pipeline/seed_pipeline/validate.py
# validate source manifests before cache builds or network work

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

from .manifest import JsonObject, read_json
from .settings import SOURCE_SCHEMA_RELATIVE_PATH, SUPPORTED_SOURCE_SUFFIXES


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
    templates = _as_list(manifest.get("templates"))
    seen_templates: set[str] = set()
    for template_index, template in enumerate(templates):
        template_path = f"$.templates[{template_index}]"
        if not isinstance(template, dict):
            continue
        external_id = _as_str(template.get("externalId"))
        if external_id in seen_templates:
            diagnostics.append(
                _error("duplicateTemplateExternalId", template_path, external_id)
            )
        seen_templates.add(external_id)
        folder = repo_root / _as_str(template.get("folder"))
        if not folder.is_dir():
            diagnostics.append(_error("missingTemplateFolder", template_path, str(folder)))
            continue
        cover_image = template.get("coverImage")
        if isinstance(cover_image, str):
            _check_source_image(
                repo_root / cover_image,
                f"{template_path}.coverImage",
                diagnostics,
            )
        _check_criteria(template, template_path, diagnostics)
        _check_items(template, folder, template_path, diagnostics)
    return diagnostics


def _check_criteria(
    template: dict[str, Any],
    template_path: str,
    diagnostics: list[ValidationDiagnostic],
) -> None:
    seen: set[str] = set()
    primary_count = 0
    orders: set[int] = set()
    for index, criterion in enumerate(_as_list(template.get("criteria"))):
        path = f"{template_path}.criteria[{index}]"
        if not isinstance(criterion, dict):
            continue
        external_id = _as_str(criterion.get("externalId"))
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
        diagnostics.append(
            _error("invalidPrimaryCriterionCount", f"{template_path}.criteria", str(primary_count))
        )


def _check_items(
    template: dict[str, Any],
    folder: Path,
    template_path: str,
    diagnostics: list[ValidationDiagnostic],
) -> None:
    seen: set[str] = set()
    label_policy = template.get("labelPolicy")
    for index, item in enumerate(_as_list(template.get("items"))):
        path = f"{template_path}.items[{index}]"
        if not isinstance(item, dict):
            continue
        external_id = _as_str(item.get("externalId"))
        if external_id in seen:
            diagnostics.append(_error("duplicateItemExternalId", path, external_id))
        seen.add(external_id)
        if label_policy == "explicit-required" and not _as_str(item.get("label")).strip():
            diagnostics.append(_error("missingExplicitLabel", path, external_id))
        image = _as_str(item.get("image"))
        _check_source_image(folder / image, f"{path}.image", diagnostics)


def _check_source_image(
    path: Path, pointer: str, diagnostics: list[ValidationDiagnostic]
) -> None:
    # validate extension separately so missing files still get useful format errors
    if path.suffix.lower() not in SUPPORTED_SOURCE_SUFFIXES:
        diagnostics.append(_error("unsupportedImageFormat", pointer, path.name))
    if not path.is_file():
        diagnostics.append(_error("missingImageFile", pointer, str(path)))


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _as_str(value: Any) -> str:
    return value if isinstance(value, str) else ""


def _error(code: str, path: str, message: str) -> ValidationDiagnostic:
    return ValidationDiagnostic(code=code, message=message, path=path, severity="error")
