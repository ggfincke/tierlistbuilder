# Python Seed Pipeline

Local usage from the repo root:

```bash
PYTHONPATH=scripts/seed_pipeline python -m seed_pipeline validate data/seeds/marketplace-core.json
PYTHONPATH=scripts/seed_pipeline python -m seed_pipeline build data/seeds/marketplace-core.json
PYTHONPATH=scripts/seed_pipeline python -m seed_pipeline preflight data/seeds/marketplace-core.json
PYTHONPATH=scripts/seed_pipeline python -m seed_pipeline run data/seeds/marketplace-core.json --env local
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

Convex read/write commands are intentionally not implemented until the seed
ingest API is available and `CONVEX_SEED_ENABLED=true` with
`CONVEX_SEED_SECRET` set for the target deployment.

Write commands:

```bash
python -m seed_pipeline upload data/seeds/marketplace-core.json --env local
python -m seed_pipeline apply data/seeds/marketplace-core.json --env local
python -m seed_pipeline verify data/seeds/marketplace-core.json --env local
python -m seed_pipeline run data/seeds/marketplace-core.json --env local --confirm-activation
python -m seed_pipeline rollback data/seeds/marketplace-core.json --env local --target-release-id <release-id> --confirm-activation
```

Production writes require `--yes`. Activation and rollback require
`--confirm-activation` even outside production. The local checkpoint lives at
`.seed-cache/<datasetKey>/<releaseId>/run.json`; cleanup uses that checkpoint to
remove abandoned upload storage IDs.
