# scripts/seed_pipeline/seed_pipeline/diff.py
# compare compiled seed manifests against Convex seed state

from __future__ import annotations

from pathlib import Path
from typing import Iterable

from .build import build_compiled_manifest
from .convex_client import ConvexSeedClient, read_seed_settings
from .manifest import JsonObject, read_json


SEED_STATE_FUNCTION = "marketplace/seedRuns:resolveSeedState"


def write_diff_report_for_manifest(
    manifest_path: Path,
    repo_root: Path,
    env_name: str,
    fail_on_warning: bool = False,
    convex_url: str | None = None,
    seed_secret: str | None = None,
    state_json: Path | None = None,
) -> Path:
    compiled_path = build_compiled_manifest(
        manifest_path, repo_root, fail_on_warning=fail_on_warning
    )
    compiled = read_json(compiled_path)
    if state_json is not None:
        state = read_json(state_json)
    else:
        settings = read_seed_settings(repo_root, env_name, convex_url, seed_secret)
        state = ConvexSeedClient(settings).query(
            SEED_STATE_FUNCTION,
            build_state_request(compiled, settings.seed_secret),
        )
    diff = build_seed_diff(compiled, state)
    report_path = compiled_path.parent / "reports" / "diff.md"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        render_diff_report(compiled, state, diff, env_name), encoding="utf-8"
    )
    return report_path


def build_state_request(compiled: JsonObject, seed_secret: str) -> JsonObject:
    templates = _as_list(compiled.get("templates"))
    return {
        "seedSecret": seed_secret,
        "datasetKey": compiled["datasetKey"],
        "releaseId": compiled["releaseId"],
        "authorEmail": compiled["authorEmail"],
        "templateExternalIds": [
            template["externalId"] for template in templates if isinstance(template, dict)
        ],
        "itemExternalIds": [
            {
                "templateExternalId": template["externalId"],
                "itemExternalId": item["externalId"],
            }
            for template in templates
            if isinstance(template, dict)
            for item in _as_list(template.get("items"))
            if isinstance(item, dict)
        ],
        "criterionExternalIds": [
            {
                "templateExternalId": template["externalId"],
                "criterionExternalId": criterion["externalId"],
            }
            for template in templates
            if isinstance(template, dict)
            for criterion in _as_list(template.get("criteria"))
            if isinstance(criterion, dict)
        ],
        "variantHashes": sorted(_compiled_variant_hashes(compiled)),
    }


def build_seed_diff(compiled: JsonObject, state: JsonObject) -> JsonObject:
    return {
        "templates": _diff_templates(compiled, state),
        "items": _diff_items(compiled, state),
        "criteria": _diff_criteria(compiled, state),
        "media": _diff_media(compiled, state),
        "absentFromManifest": _as_list(state.get("absentFromManifest")),
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
    lines = [
        "# Seed Diff Report",
        "",
        f"- Environment: `{env_name}`",
        f"- Dataset: `{compiled['datasetKey']}`",
        f"- Release: `{compiled['releaseId']}`",
        f"- Author: `{compiled['authorEmail']}`",
        f"- Active release: `{active_release}`",
        f"- Templates: {totals['templateCount']}",
        f"- Items: {totals['itemCount']}",
        f"- Variants present: {len(media['present'])}",
        f"- Variants needing upload: {len(media['missing'])}",
        "",
    ]
    _append_diff_section(lines, "Templates To Create", diff["templates"]["create"])
    _append_diff_section(lines, "Templates To Update", diff["templates"]["update"])
    _append_diff_section(lines, "Templates Unchanged", diff["templates"]["unchanged"])
    _append_diff_section(lines, "Items To Create", diff["items"]["create"])
    _append_diff_section(lines, "Items To Update", diff["items"]["update"])
    _append_diff_section(lines, "Items To Reorder", diff["items"]["reorder"])
    _append_diff_section(lines, "Items Unchanged", diff["items"]["unchanged"])
    _append_diff_section(lines, "Criteria To Create", diff["criteria"]["create"])
    _append_diff_section(lines, "Criteria To Update", diff["criteria"]["update"])
    _append_diff_section(lines, "Criteria Unchanged", diff["criteria"]["unchanged"])
    _append_diff_section(lines, "Media Present", media["present"])
    _append_diff_section(lines, "Media Needing Upload", media["missing"])
    _append_absent_section(lines, diff["absentFromManifest"])
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
    existing = {
        template["externalId"]: template
        for template in _as_list(state.get("templates"))
        if isinstance(template, dict)
    }
    create: list[str] = []
    update: list[JsonObject] = []
    unchanged: list[str] = []
    for template in _as_list(compiled.get("templates")):
        if not isinstance(template, dict):
            continue
        current = existing.get(template["externalId"])
        if current is None:
            create.append(template["externalId"])
            continue
        reasons = _changed_fields(
            template,
            current,
            ["title", "description", "category", "tags", "visibility"],
        )
        if current.get("itemAspectRatio") != template.get("itemAspectRatio"):
            reasons.append("itemAspectRatio")
        if current.get("releaseId") != compiled["releaseId"]:
            reasons.append("releaseId")
        if reasons:
            update.append({"externalId": template["externalId"], "reasons": reasons})
        else:
            unchanged.append(template["externalId"])
    return {"create": create, "update": update, "unchanged": unchanged}


def _diff_items(compiled: JsonObject, state: JsonObject) -> JsonObject:
    existing = {
        _pair_key(item["templateExternalId"], item["itemExternalId"]): item
        for item in _as_list(state.get("items"))
        if isinstance(item, dict)
    }
    create: list[JsonObject] = []
    update: list[JsonObject] = []
    reorder: list[JsonObject] = []
    unchanged: list[JsonObject] = []
    for template in _as_list(compiled.get("templates")):
        if not isinstance(template, dict):
            continue
        template_external_id = template["externalId"]
        for item in _as_list(template.get("items")):
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
            changed = False
            if current.get("label") != item.get("label"):
                update.append({**entry, "reasons": ["label"]})
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


def _diff_criteria(compiled: JsonObject, state: JsonObject) -> JsonObject:
    existing = {
        _pair_key(item["templateExternalId"], item["criterionExternalId"]): item
        for item in _as_list(state.get("criteria"))
        if isinstance(item, dict)
    }
    create: list[JsonObject] = []
    update: list[JsonObject] = []
    unchanged: list[JsonObject] = []
    for template in _as_list(compiled.get("templates")):
        if not isinstance(template, dict):
            continue
        template_external_id = template["externalId"]
        for criterion in _as_list(template.get("criteria")):
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
        media["contentHash"]
        for media in _as_list(state.get("media"))
        if isinstance(media, dict)
    }
    hashes = sorted(_compiled_variant_hashes(compiled))
    return {
        "present": [content_hash for content_hash in hashes if content_hash in present],
        "missing": [content_hash for content_hash in hashes if content_hash not in present],
    }


def _compiled_variant_hashes(compiled: JsonObject) -> set[str]:
    hashes: set[str] = set()
    for asset in _compiled_assets(compiled):
        variants = asset.get("variants")
        if not isinstance(variants, dict):
            continue
        for variant in variants.values():
            if isinstance(variant, dict):
                hashes.add(str(variant["contentHash"]))
    return hashes


def _compiled_assets(compiled: JsonObject) -> Iterable[JsonObject]:
    for template in _as_list(compiled.get("templates")):
        if not isinstance(template, dict):
            continue
        cover = template.get("coverImage")
        if isinstance(cover, dict):
            yield cover
        for item in _as_list(template.get("items")):
            if isinstance(item, dict) and isinstance(item.get("asset"), dict):
                yield item["asset"]


def _append_diff_section(lines: list[str], title: str, entries: list[object]) -> None:
    lines.extend([f"## {title}", ""])
    if not entries:
        lines.extend(["- None", ""])
        return
    for entry in entries:
        lines.append(f"- `{_format_entry(entry)}`")
    lines.append("")


def _append_absent_section(lines: list[str], entries: list[object]) -> None:
    lines.extend(["## Absent From Manifest", ""])
    if not entries:
        lines.extend(["- None", ""])
        return
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        label = entry["templateExternalId"]
        if entry.get("itemExternalId"):
            label = f"{label} / item {entry['itemExternalId']}"
        if entry.get("criterionExternalId"):
            label = f"{label} / criterion {entry['criterionExternalId']}"
        lines.append(f"- `{label}` -> {entry['action']}")
    lines.append("")


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


def _as_list(value: object) -> list[object]:
    if isinstance(value, list):
        return value
    return []
