#!/usr/bin/env python3
# scripts/seed_pipeline/seed_pipeline/dev_reset.py
# wipe every user table + every _storage blob on a dev convex deployment.
# preserves schema. use this between seed iterations when you want a clean slate.
#
# safety stack (all required to run):
#   1. CONVEX_SEED_ENABLED=true on the deployment (existing seed-route gate)
#   2. CONVEX_DEV_RESET_ALLOWED=true on the deployment (dev-reset specific)
#   3. CONVEX_DEPLOYMENT in .env.local must NOT start with "prod:"
#   4. confirm token RESET-<deployment-host> matches server-derived marker
#   5. caller must pass --yes
#
# usage:
#   npm run db:reset -- --yes
#   uv run --project scripts/seed_pipeline python -m seed_pipeline.dev_reset --yes

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from .convex_client import (
	CONVEX_SEED_SECRET_ENV,
	ConvexClientError,
	ConvexSeedClient,
	ConvexSeedSettings,
	load_dotenv,
	resolve_convex_site_url,
	resolve_seed_secret,
)
from .manifest import find_repo_root

REPO_ROOT = find_repo_root(Path(__file__))
DOTENV_PATH = REPO_ROOT / ".env.local"
RESET_ROUTE = "/api/dev/reset"
PROD_DEPLOYMENT_PREFIXES = ("prod:",)


def parse_args() -> argparse.Namespace:
	parser = argparse.ArgumentParser(
		description="wipe all data + storage blobs on a dev convex deployment"
	)
	parser.add_argument(
		"--yes",
		action="store_true",
		help="required confirmation flag - without it the script aborts before sending anything",
	)
	parser.add_argument(
		"--convex-url",
		default=None,
		help="override CONVEX_SITE_URL / VITE_CONVEX_SITE_URL (the HTTP-actions URL - :3211 locally, *.convex.site on cloud)",
	)
	parser.add_argument(
		"--seed-secret",
		default=None,
		help="override CONVEX_SEED_SECRET",
	)
	return parser.parse_args()


def derive_marker(convex_url: str) -> str:
	# mirrors convex/dev/reset.ts -> resolveDeploymentMarker()
	marker = convex_url
	for scheme in ("https://", "http://"):
		if marker.startswith(scheme):
			marker = marker[len(scheme) :]
			break
	return marker.rstrip("/")


def main() -> int:
	args = parse_args()
	env = load_dotenv(DOTENV_PATH)
	deployment = os.environ.get("CONVEX_DEPLOYMENT") or env.get("CONVEX_DEPLOYMENT", "")
	if deployment.startswith(PROD_DEPLOYMENT_PREFIXES):
		print(
			f"refusing to reset: CONVEX_DEPLOYMENT='{deployment}' looks like prod",
			file=sys.stderr,
		)
		return 2

	convex_url = resolve_convex_site_url(REPO_ROOT, args.convex_url)
	seed_secret = resolve_seed_secret(env, args.seed_secret)
	if not convex_url:
		print(
			"CONVEX_SITE_URL / VITE_CONVEX_SITE_URL is not set",
			file=sys.stderr,
		)
		return 2
	if not seed_secret:
		print(f"{CONVEX_SEED_SECRET_ENV} is not set", file=sys.stderr)
		return 2

	marker = derive_marker(convex_url)
	confirm = f"RESET-{marker}"

	print("about to wipe ALL data on this deployment:")
	print(f"  CONVEX_DEPLOYMENT = {deployment or '<unset>'}")
	print(f"  site url          = {convex_url}")
	print(f"  confirm token     = {confirm}")

	if not args.yes:
		print(
			"\nrefusing to run without --yes. re-run as: npm run db:reset -- --yes",
			file=sys.stderr,
		)
		return 2

	client = ConvexSeedClient(
		ConvexSeedSettings(
			site_url=convex_url,
			seed_secret=seed_secret,
			env_name=deployment or "dev-reset",
		)
	)
	try:
		value = client.action(RESET_ROUTE, {"confirm": confirm})
	except ConvexClientError as error:
		print(f"\nreset failed: {error}", file=sys.stderr)
		return 1

	deleted_counts = value.get("deletedCounts", {})
	deleted_blobs = value.get("deletedStorageBlobs", 0)
	canceled_scheduled = value.get("canceledScheduledFunctions", 0)
	total_rows = sum(int(count) for count in deleted_counts.values())

	print(f"\nreset complete on {value.get('deploymentMarker', marker)}:")
	print(f"  scheduled fns canceled: {canceled_scheduled}")
	print(f"  storage blobs deleted:  {deleted_blobs}")
	print(f"  table rows deleted:     {total_rows}")
	for table_name in sorted(deleted_counts):
		count = int(deleted_counts[table_name])
		if count:
			print(f"    {table_name}: {count}")
	return 0


if __name__ == "__main__":
	sys.exit(main())
