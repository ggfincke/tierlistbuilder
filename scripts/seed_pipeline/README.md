# Python Seed Pipeline

Local usage from the repo root:

```bash
PYTHONPATH=scripts/seed_pipeline python -m seed_pipeline validate data/seeds/marketplace-core.json
PYTHONPATH=scripts/seed_pipeline python -m seed_pipeline build data/seeds/marketplace-core.json
PYTHONPATH=scripts/seed_pipeline python -m seed_pipeline preflight data/seeds/marketplace-core.json
PYTHONPATH=scripts/seed_pipeline python -m seed_pipeline run data/seeds/marketplace-core.json --env local
```

The npm wrappers in `package.json` use the same `PYTHONPATH` setup:

```bash
npm run seed:marketplace:validate
npm run seed:marketplace:build
npm run seed:marketplace:preflight
npm run seed:marketplace
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
