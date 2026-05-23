# Python Seed Pipeline

Local usage from the repo root (uv manages the env from `uv.lock`):

```bash
uv run --project scripts/seed_pipeline python -m seed_pipeline validate data/seeds/marketplace-core.json
uv run --project scripts/seed_pipeline python -m seed_pipeline build data/seeds/marketplace-core.json
uv run --project scripts/seed_pipeline python -m seed_pipeline preflight data/seeds/marketplace-core.json
uv run --project scripts/seed_pipeline python -m seed_pipeline run data/seeds/marketplace-core.json --env local
```

The npm wrappers in `package.json` go through `scripts/seed-pipeline.mjs`,
which shells out to `uv run --project scripts/seed_pipeline` so dependencies
sync automatically. Set `SEED_PIPELINE_PYTHON=/path/to/python` (or `PYTHON`)
to bypass uv and use a specific interpreter — that interpreter must already
have `jsonschema` and `Pillow` installed.

```bash
npm run seed:marketplace:validate
npm run seed:marketplace:build
npm run seed:marketplace:preflight
npm run seed:marketplace
npm run seed:rankings:preflight
npm run seed:rankings
npm run seed:featured
npm run seed:all
```

`npm run seed:all` runs the marketplace, ranking, and featured-trio seed steps
in sequence. There is no seed `--reset` flag; for a clean local/dev deployment,
wipe data first with `npm run db:reset -- --yes`, then run the seed command.
For disposable local-only state, `npm run db:reset:local-fast -- --yes` moves
`.convex/local/default` aside, bootstraps local Convex, and restores local auth.

The package can also be installed into an existing env for development:

```bash
uv pip install -e scripts/seed_pipeline   # or: python -m pip install -e scripts/seed_pipeline
python -m seed_pipeline validate data/seeds/marketplace-core.json
```

`build` writes generated artifacts to:

```txt
.seed-cache/<datasetKey>/<releaseId>/
```

That cache is disposable and ignored by Git.

All seed source data lives on disk locally and is gitignored. The canonical
source spans:

- `data/seeds/marketplace-core.json` — thin index: `schemaVersion`, `datasetKey`,
  `releaseId`, `authorEmail`, `templateOrder[]`.
- `data/seeds/templates/<category>/<slug>.json` — one per template; carries
  `externalId`, `folder` (relative path to assets), `title`, `description`,
  `tags`, `category`, `visibility`, `labelPolicy`, `criteria`, `items`, and
  optional `coverZoom`, `labels`, `suggestedTiers`.
- `examples/<category>/<slug>/_cover.{jpg,jpeg,png,webp}` (optional) — hero
  image, auto-detected by the build. Exactly one per folder.
- `examples/<category>/<slug>/*.{jpg,png,webp,...}` — item images referenced
  by `_template.json` items[].image.
- `data/seeds/ranking-profiles.json` (optional) — extracted ranking seed config.

`examples/` and `data/seeds/{marketplace-core.json,ranking-profiles.json,templates/}`
are all gitignored. Schemas, the pipeline code, and tests live inside this
package (`scripts/seed_pipeline/seed_pipeline/schemas/` and `tests/fixtures/`)
so they travel with the pipeline rather than being checked in alongside data.

The composition layer at `seed_pipeline.source.compose_dataset` reads and
validates each split file, auto-detects covers, and hands a legacy in-memory
shape to `build.py`. Adding a template requires writing
`data/seeds/templates/<cat>/<slug>.json` and adding its `externalId` to
`templateOrder[]`; an unreferenced template file or orphan order entry is a
hard error.

## Read Commands

`diff` and `preflight` call Convex read APIs unless `--state-json` points at a
fixture response:

```bash
python -m seed_pipeline diff data/seeds/marketplace-core.json --env local
python -m seed_pipeline preflight data/seeds/marketplace-core.json --env local
```

Use `--convex-url` and `--seed-secret` to target a deployment explicitly. The
URL may be either the Convex client URL or site URL; seed HTTP actions post to
the site host (`:3211` locally, `*.convex.site` in cloud). The secret is sent as
an HTTP bearer authorization header to `/api/seed/*`, not in the Convex function
body. When omitted, the pipeline reads the target from local environment files
and process environment.

`npm run seed:featured` uses the same bearer-header transport and posts to
`/api/seed/featured-trio`; it does not pass `CONVEX_SEED_SECRET` in a Convex
function argument.

## Write Commands

Convex write commands require `CONVEX_SEED_ENABLED=true` and the matching
`CONVEX_SEED_SECRET` for the target deployment:

```bash
python -m seed_pipeline upload data/seeds/marketplace-core.json --env local
python -m seed_pipeline apply data/seeds/marketplace-core.json --env local
python -m seed_pipeline verify data/seeds/marketplace-core.json --env local
python -m seed_pipeline activate data/seeds/marketplace-core.json --env local --confirm-activation
python -m seed_pipeline run data/seeds/marketplace-core.json --env local --confirm-activation
python -m seed_pipeline rollback data/seeds/marketplace-core.json --env local --target-release-id <release-id> --confirm-activation
```

`--dry-run` performs local validation/build plus the server read precheck and
then stops before writes. Upload size can be capped with `--max-upload-bytes`.

## Environments

Local:

```bash
python -m seed_pipeline run data/seeds/marketplace-core.json --env local --confirm-activation
```

Staging:

```bash
python -m seed_pipeline preflight data/seeds/marketplace-core.json --env staging --convex-url <url> --seed-secret <secret>
python -m seed_pipeline run data/seeds/marketplace-core.json --env staging --convex-url <url> --seed-secret <secret> --confirm-activation
```

Production:

```bash
python -m seed_pipeline preflight data/seeds/marketplace-core.json --env prod --convex-url <url> --seed-secret <secret>
python -m seed_pipeline run data/seeds/marketplace-core.json --env prod --convex-url <url> --seed-secret <secret> --yes --confirm-activation
```

Production writes require `--yes`. Activation and rollback require
`--confirm-activation` in every environment. The local checkpoint lives at
`.seed-cache/<datasetKey>/<releaseId>/run.json`; cleanup uses that checkpoint to
remove abandoned upload storage IDs and requires `--yes` unless it is a dry run.
Successfully uploaded storage IDs are registered server-side before finalize, so
an interrupted upload can be retried or cleaned without losing already uploaded
blob IDs from the local checkpoint.

## Ranking Seeds

Ranking seeds are release-aware but separate from image upload. Run the template
pipeline first so Convex has hidden template, item, and criterion rows for the
target `releaseId`; then run the ranking commands against the same manifest:

```bash
python -m seed_pipeline rankings:preflight data/seeds/marketplace-core.json --env local
python -m seed_pipeline rankings:apply data/seeds/marketplace-core.json --env local
python -m seed_pipeline rankings:verify data/seeds/marketplace-core.json --env local
python -m seed_pipeline rankings:activate data/seeds/marketplace-core.json --env local --confirm-activation
```

The combined command performs preflight, apply, verify, and optional activation:

```bash
python -m seed_pipeline rankings:run data/seeds/marketplace-core.json --env local --confirm-activation
```

Npm wrappers are available for the common path:

```bash
npm run seed:rankings:preflight
npm run seed:rankings:apply
npm run seed:rankings:verify
npm run seed:rankings:activate
npm run seed:rankings
```

Ranking writes use Convex Auth-backed synthetic authors in the
`seed+rankings-*@tierlistbuilder.local` namespace, write hidden source boards
and published ranking rows, and activate them only after verification. Curated
rankings are authored seed data; sample rankings are deterministic algorithmic
placements from the manifest profiles and lane config.
