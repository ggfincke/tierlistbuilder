# Python Seed Pipeline

Local usage from the repo root:

```bash
PYTHONPATH=scripts/seed_pipeline python -m seed_pipeline validate data/seeds/marketplace-core.json
PYTHONPATH=scripts/seed_pipeline python -m seed_pipeline build data/seeds/marketplace-core.json
PYTHONPATH=scripts/seed_pipeline python -m seed_pipeline preflight data/seeds/marketplace-core.json
PYTHONPATH=scripts/seed_pipeline python -m seed_pipeline run data/seeds/marketplace-core.json --env local
```

The npm wrappers in `package.json` use `scripts/seed-pipeline.mjs`, which sets
the same `PYTHONPATH` and prefers `.venv/bin/python` when the local venv exists.
Set `SEED_PIPELINE_PYTHON=/path/to/python` to override the interpreter.

```bash
npm run seed:marketplace:validate
npm run seed:marketplace:build
npm run seed:marketplace:preflight
npm run seed:marketplace
npm run seed:rankings:preflight
npm run seed:rankings
```

The package can also be installed for development:

```bash
python -m pip install -e scripts/seed_pipeline
python -m seed_pipeline validate data/seeds/marketplace-core.json
```

`build` writes generated artifacts to:

```txt
.seed-cache/<datasetKey>/<releaseId>/
```

That cache is disposable and ignored by Git. The source manifest under
`data/seeds/` is the canonical artifact.

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
