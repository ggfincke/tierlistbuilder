# Python Seed Pipeline

Local usage from the repo root:

```bash
PYTHONPATH=scripts/seed_pipeline python -m seed_pipeline validate data/seeds/marketplace-core.json
PYTHONPATH=scripts/seed_pipeline python -m seed_pipeline build data/seeds/marketplace-core.json
PYTHONPATH=scripts/seed_pipeline python -m seed_pipeline preflight data/seeds/marketplace-core.json
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
ingest API lands.
