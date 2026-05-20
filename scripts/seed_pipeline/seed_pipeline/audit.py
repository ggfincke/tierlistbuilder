# scripts/seed_pipeline/seed_pipeline/audit.py
# read-only plate audit: per-template plate counts, sourceKind mix, & override
# candidates so autoPlate policy gets chosen from data instead of screenshots

from __future__ import annotations

import os
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

from .concurrency import run_in_parallel
from .crop import PLATE_INK_VANISH_FRACTION, PlateAnalysis, analyze_plate
from .manifest import JsonObject
from .progress import ProgressLogger, progress_interval
from .sidecars import read_sidecar_json
from .source import compose_dataset

# an item whose vanish share lands within this band below the plate cutoff is a
# coin-flip the detector could go either way on — the prime override candidate
NEAR_MISS_MARGIN = 0.10
# transparent-share that flips a board from "opaque cover/photo" (plates stay
# occluded) to "logo/cutout" (plates actually render)
MIN_TRANSPARENT_FRACTION = 0.5
# sourceKind=logo share that recommends a uniform wall over per-item auto
LOGO_KIND_FRACTION = 0.6
# mean ink luminance above which a logo is genuinely light/near-white and truly
# vanishes on a white uniform card. saturated brand colors (green/red/blue) sit
# well below this (~0.3-0.45) and read fine on white, so they are not exceptions
UNIFORM_VANISH_LUMINANCE = 0.55
# w/o a sourceKind manifest, lean on how many items would plate to guess logos
# (mostly-plates) vs self-discernible art (mostly-null)
MANIFESTLESS_LOGO_FRACTION = 0.5
# cap long candidate lists so a single board can't flood the report
MAX_LIST = 20

AUDIT_WORKERS = max(os.cpu_count() or 1, 1)
_EMPTY_PLATE = PlateAnalysis(None, False, 0.0, 0.0, 0.0, 0.0)


@dataclass(frozen=True)
class ItemAudit:
	external_id: str
	label: str
	image: str
	source_kind: str | None
	plate: PlateAnalysis
	error: str | None


@dataclass(frozen=True)
class TemplateAudit:
	external_id: str
	title: str
	category: str
	items: list[ItemAudit]


def run_plate_audit(
	core_path: Path,
	repo_root: Path,
	*,
	template_filter: str | None = None,
	progress: ProgressLogger | None = None,
) -> str:
	progress = progress or ProgressLogger("audit")
	manifest = compose_dataset(core_path, repo_root)
	templates = list(manifest["templates"])
	if template_filter is not None:
		templates = [t for t in templates if t["externalId"] == template_filter]
		if not templates:
			msg = f"no template matches externalId {template_filter!r}"
			raise ValueError(msg)
	progress.log(f"auditing {len(templates)} template(s)")
	audits = [_audit_template(template, repo_root, progress) for template in templates]
	report = _format_report(audits)
	# report is stdout; ProgressLogger writes stderr, so the two never interleave
	print(report)
	return report


def _audit_template(
	template: JsonObject, repo_root: Path, progress: ProgressLogger
) -> TemplateAudit:
	folder = repo_root / template["folder"]
	source_kinds = _load_source_kinds(folder)
	items = list(template["items"])
	log_every = progress_interval(len(items))

	def analyze(item: JsonObject) -> ItemAudit:
		return _analyze_item(item, folder, source_kinds)

	results = run_in_parallel(
		items,
		analyze,
		AUDIT_WORKERS,
		on_complete=lambda completed, total, _item: progress.count(
			template["externalId"], completed, total, every=log_every
		),
	)
	return TemplateAudit(
		external_id=template["externalId"],
		title=template["title"],
		category=template["category"],
		items=results,
	)


def _analyze_item(item: JsonObject, folder: Path, source_kinds: dict[str, str]) -> ItemAudit:
	image_rel = item["image"]
	name = Path(image_rel).name
	label = item.get("label") or Path(name).stem
	kind = source_kinds.get(name)
	try:
		with Image.open(folder / image_rel) as image:
			plate = analyze_plate(image)
	except Exception as exc:  # noqa: BLE001 - one bad asset must not abort the audit
		return ItemAudit(item["externalId"], label, name, kind, _EMPTY_PLATE, str(exc))
	return ItemAudit(item["externalId"], label, name, kind, plate, None)


def _load_source_kinds(folder: Path) -> dict[str, str]:
	# the scraper sidecar (examples/<cat>/<folder>/_manifest.json) is the only
	# place sourceKind lives; the build never reads it, so the audit does directly
	data = read_sidecar_json(folder / "_manifest.json")
	if data is None:
		return {}
	kinds: dict[str, str] = {}
	for source in data.get("sources", []):
		if not isinstance(source, dict):
			continue
		path = source.get("path")
		kind = source.get("sourceKind")
		if isinstance(path, str) and isinstance(kind, str):
			kinds[Path(path).name] = kind
	return kinds


def _recommend(items: list[ItemAudit]) -> tuple[str, str]:
	usable = [it for it in items if it.error is None]
	if not usable:
		return "?", "no decodable items"
	transparent = [it for it in usable if it.plate.has_meaningful_alpha]
	if len(transparent) / len(usable) < MIN_TRANSPARENT_FRACTION:
		opaque = len(usable) - len(transparent)
		return (
			"auto (default)",
			f"opaque-dominant ({opaque}/{len(usable)}); plates stay occluded — no action",
		)
	kinds = [it.source_kind for it in transparent if it.source_kind]
	if kinds:
		logo = sum(1 for kind in kinds if kind == "logo")
		if logo / len(kinds) >= LOGO_KIND_FRACTION:
			return "uniform", f"logo-dominant ({logo}/{len(kinds)} sourceKind=logo)"
		top_kind, top_count = Counter(kinds).most_common(1)[0]
		return (
			"off",
			f"transparent non-logo art (sourceKind {top_kind} {top_count}/{len(kinds)})",
		)
	# no manifest: a logo set mostly plates; self-discernible art mostly stays null
	plated = sum(1 for it in transparent if it.plate.media_plate is not None)
	if plated / len(transparent) >= MANIFESTLESS_LOGO_FRACTION:
		return (
			"uniform?",
			f"transparent, no manifest; {plated}/{len(transparent)} would plate "
			"-> likely logos, confirm",
		)
	return (
		"off?",
		f"transparent, no manifest; only {plated}/{len(transparent)} would plate "
		"-> likely self-discernible art, confirm",
	)


def _uniform_exceptions(items: list[ItemAudit]) -> list[ItemAudit]:
	# a genuinely light/near-white logo vanishes on a white uniform card & needs a
	# forced dark backgroundColor. key on actual ink luminance, NOT WCAG contrast:
	# a saturated mid-tone (green/red/blue) trips the contrast bar but still reads
	# on white, so luminance is what isolates the real exceptions
	matches = [
		it
		for it in items
		if it.plate.has_meaningful_alpha and it.plate.ink_luminance >= UNIFORM_VANISH_LUMINANCE
	]
	return sorted(matches, key=lambda it: it.plate.ink_luminance, reverse=True)


def _near_misses(items: list[ItemAudit]) -> list[ItemAudit]:
	# items the detector left null but that nearly vanish on one pole: the band
	# where a small threshold nudge would flip the verdict
	low = PLATE_INK_VANISH_FRACTION - NEAR_MISS_MARGIN
	matches = [
		it
		for it in items
		if it.plate.has_meaningful_alpha
		and it.plate.media_plate is None
		and low <= max(it.plate.dark_share, it.plate.light_share) < PLATE_INK_VANISH_FRACTION
	]
	return sorted(
		matches,
		key=lambda it: max(it.plate.dark_share, it.plate.light_share),
		reverse=True,
	)


def _kind_summary(items: list[ItemAudit]) -> str:
	kinds = Counter(it.source_kind for it in items if it.source_kind)
	if not kinds:
		return "(no manifest)"
	return ", ".join(f"{kind} {count}" for kind, count in kinds.most_common())


def _format_template(audit: TemplateAudit) -> tuple[list[str], str]:
	items = audit.items
	usable = [it for it in items if it.error is None]
	transparent = [it for it in usable if it.plate.has_meaningful_alpha]
	errors = [it for it in items if it.error is not None]
	light = sum(1 for it in usable if it.plate.media_plate == "light")
	dark = sum(1 for it in usable if it.plate.media_plate == "dark")
	null = sum(1 for it in usable if it.plate.media_plate is None)
	policy, reason = _recommend(items)
	lines = [
		f'{audit.external_id}  "{audit.title}"  [{audit.category}]',
		f"  items {len(items)} | transparent {len(transparent)}/{len(usable)}"
		f" | sourceKind: {_kind_summary(usable)}",
		f"  detector @{PLATE_INK_VANISH_FRACTION:.2f}: "
		f"light {light} · dark {dark} · none {null}"
		+ (f" · errors {len(errors)}" if errors else ""),
		f"  recommend: {policy.upper()}  —  {reason}",
	]
	if policy.startswith("uniform"):
		exceptions = _uniform_exceptions(transparent)
		if exceptions:
			lines.append("  uniform exceptions (light logo vanishes on white -> force dark bg):")
			for it in exceptions[:MAX_LIST]:
				lines.append(
					f"    - {it.label:<24} ink_lum {it.plate.ink_luminance:.2f}"
					f"  light_share {it.plate.light_share:.2f}"
				)
		else:
			lines.append("  uniform exceptions: none (every logo reads on a white card)")
	near = _near_misses(transparent)
	if near:
		lines.append("  near-misses (a threshold nudge would flip these):")
		for it in near[:MAX_LIST]:
			best = max(it.plate.dark_share, it.plate.light_share)
			pole = (
				"dark ink -> light plate"
				if it.plate.dark_share >= it.plate.light_share
				else "light ink -> dark plate"
			)
			lines.append(f"    - {it.label:<24} {best:.2f}  ({pole})")
	for it in errors[:MAX_LIST]:
		lines.append(f"    ! {it.label}: {it.error}")
	return lines, policy


def _format_report(audits: list[TemplateAudit]) -> str:
	lines = [
		"=" * 78,
		f"PLATE AUDIT  (plate threshold {PLATE_INK_VANISH_FRACTION:.2f}, "
		f"near-miss band {NEAR_MISS_MARGIN:.2f})",
		"=" * 78,
	]
	summary: Counter[str] = Counter()
	for audit in audits:
		block, policy = _format_template(audit)
		summary[policy] += 1
		lines.extend(block)
		lines.append("")
	lines.append("-" * 78)
	lines.append("RECOMMENDATIONS SUMMARY")
	for policy, count in summary.most_common():
		lines.append(f"  {policy.upper():<18} {count} board(s)")
	lines.append("-" * 78)
	return "\n".join(lines)
