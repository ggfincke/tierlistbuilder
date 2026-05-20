# scripts/seed_pipeline/seed_pipeline/ranking_config.py
# compile source ranking seed config into deployment-agnostic request data

from __future__ import annotations

from .manifest import JsonObject, as_list


GENERIC_SAMPLE_DESCRIPTION = "Seeded sample ranking for community feature testing."
GENERIC_SAMPLE_ITEM_BUDGET = 6000


def compile_ranking_seeds(
	manifest: JsonObject,
	compiled_templates: list[JsonObject],
) -> JsonObject | None:
	raw = manifest.get("rankingSeeds")
	if not isinstance(raw, dict):
		return None
	default_profile_count = int(raw["defaultProfileCount"])
	targets = [
		_compile_target(target, default_profile_count) for target in as_list(raw.get("targets"))
	]
	target_ids = {
		target["templateExternalId"]
		for target in targets
		if isinstance(target.get("templateExternalId"), str)
	}
	include_all = bool(raw.get("includeAllTemplates"))
	if include_all:
		for template in compiled_templates:
			external_id = str(template["externalId"])
			if external_id in target_ids:
				continue
			target = _generic_target_for_template(
				template,
				default_profile_count,
			)
			targets.append(target)
			target_ids.add(external_id)
	return {
		"profileSet": raw["profileSet"],
		"defaultProfileCount": default_profile_count,
		"includeAllTemplates": include_all,
		"profiles": [_compile_profile(profile) for profile in as_list(raw.get("profiles"))],
		"targets": targets,
	}


def _compile_profile(profile: object) -> JsonObject:
	if not isinstance(profile, dict):
		return {}
	return {
		"key": profile["key"],
		"displayName": profile["displayName"],
		"chaos": float(profile["chaos"]),
		"contrarian": float(profile["contrarian"]),
		"boostTermsByTarget": dict(profile.get("boostTermsByTarget") or {}),
		"dropTermsByTarget": dict(profile.get("dropTermsByTarget") or {}),
	}


def _compile_target(target: object, default_profile_count: int) -> JsonObject:
	if not isinstance(target, dict):
		return {}
	return {
		"templateExternalId": target["templateExternalId"],
		"sampleProfileCount": int(target.get("sampleProfileCount", default_profile_count)),
		"countAsTemplateUse": bool(target.get("countAsTemplateUse", False)),
		"lanes": [_compile_lane(lane) for lane in as_list(target.get("lanes"))],
		"curatedRankings": [
			_compile_curated_ranking(curated) for curated in as_list(target.get("curatedRankings"))
		],
	}


def _compile_lane(lane: object) -> JsonObject:
	if not isinstance(lane, dict):
		return {}
	criterion = str(lane["criterionExternalId"])
	title_suffix = lane.get("titleSuffix") or f"{criterion} ranking"
	return {
		"criterionExternalId": criterion,
		"titleSuffix": title_suffix,
		"description": lane.get("description") or GENERIC_SAMPLE_DESCRIPTION,
		"boostTerms": list(lane.get("boostTerms") or []),
		"dropTerms": list(lane.get("dropTerms") or []),
		"profileBoostOverrides": dict(lane.get("profileBoostOverrides") or {}),
		"profileDropOverrides": dict(lane.get("profileDropOverrides") or {}),
		"chaosMultiplier": float(lane.get("chaosMultiplier", 1)),
		"contrarianMultiplier": float(lane.get("contrarianMultiplier", 1)),
		"featuredProfiles": list(lane.get("featuredProfiles") or []),
	}


def _compile_curated_ranking(curated: object) -> JsonObject:
	if not isinstance(curated, dict):
		return {}
	return {
		"externalId": curated["externalId"],
		"authorKey": curated["authorKey"],
		"authorDisplayName": curated["authorDisplayName"],
		"criterionExternalId": curated["criterionExternalId"],
		"title": curated["title"],
		"description": curated["description"],
		"featuredRank": curated.get("featuredRank"),
		"featuredBadge": curated.get("featuredBadge"),
		"coverage": curated.get("coverage") or "full-template",
		"parentLabelByLabel": dict(curated.get("parentLabelByLabel") or {}),
		"tiers": list(curated["tiers"]),
		"tierGroups": list(curated["tierGroups"]),
	}


def _generic_target_for_template(
	template: JsonObject,
	default_profile_count: int,
) -> JsonObject:
	criterion = _primary_active_criterion(template)
	return {
		"templateExternalId": template["externalId"],
		"sampleProfileCount": _generic_sample_profile_count(
			template,
			default_profile_count,
		),
		"countAsTemplateUse": False,
		"lanes": [
			{
				"criterionExternalId": criterion["externalId"],
				"titleSuffix": f"{template['title']} ranking",
				"description": GENERIC_SAMPLE_DESCRIPTION,
				"boostTerms": [],
				"dropTerms": [],
				"profileBoostOverrides": {},
				"profileDropOverrides": {},
				"chaosMultiplier": 1,
				"contrarianMultiplier": 1,
				"featuredProfiles": [],
			}
		],
		"curatedRankings": [],
	}


def _generic_sample_profile_count(
	template: JsonObject,
	default_profile_count: int,
) -> int:
	items = template.get("items")
	item_count = len(items) if isinstance(items, list) else 0
	if item_count <= 0:
		return default_profile_count
	budgeted_count = GENERIC_SAMPLE_ITEM_BUDGET // item_count
	return max(1, min(default_profile_count, budgeted_count))


def _primary_active_criterion(template: JsonObject) -> JsonObject:
	active = [
		criterion
		for criterion in as_list(template.get("criteria"))
		if isinstance(criterion, dict) and criterion.get("status") == "active"
	]
	for criterion in active:
		if criterion.get("isPrimary") is True:
			return criterion
	if active:
		return active[0]
	msg = f"{template['externalId']} has no active ranking criterion"
	raise ValueError(msg)
