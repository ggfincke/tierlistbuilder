# Seed Data Contracts

This directory holds the canonical marketplace seed contract artifacts for the
Python production seed pipeline.

The source manifest is hand-authored JSON. The compiled manifest is generated
from the source manifest and is disposable, but the compiled fixture in
`examples/` documents the expected generated shape.

## Files

- `schemas/source-manifest.schema.json`: v1 source manifest contract.
- `schemas/compiled-manifest.schema.json`: v1 compiled manifest contract.
- `examples/marketplace-core.source.example.json`: small source fixture that
  references existing local example assets.
- `examples/compiled-manifest.example.json`: portable compiled fixture.

## Identity Rules

- `datasetKey` identifies the seed family, such as `marketplace-core`.
- `releaseId` identifies one immutable content release for that dataset.
- `runId` identifies one execution attempt and is never part of template or
  item identity.
- Template `externalId` is stable across releases and must not include display
  names that are expected to change.
- Item `externalId` is stable within its template across releases.
- Criterion `externalId` is stable within its template across releases.
- Media identity is content-derived from source and generated variant hashes.

Mutable presentation fields can change without identity churn: titles, labels,
descriptions, tags, criterion prompts, item order, and image references.

## Release Lifecycle

Initial lifecycle states:

- `building`: local compile or server run registration is in progress.
- `uploaded`: all required media variants are available or reused.
- `applied_hidden`: templates and items are written but not public.
- `verified`: Convex state matches the compiled manifest.
- `active`: the release is the public dataset view.
- `failed`: the run failed before activation; the previous active release stays
  public.
- `rolled_back`: the release was deactivated in favor of another release.

Only `verified` releases can become `active`. Activation and rollback are keyed
by `datasetKey` and `releaseId`.

## Removal Semantics

Missing templates or items are absent from the next active release after
activation. That hides them from public queries without hard deletion.

Hard deletion is a separate destructive operation. Production hard deletion must
require the seed secret, `--destroy-missing`, and explicit confirmation.

## Retry Behavior

- Retrying the same release and run should not duplicate templates, items,
  criteria, media assets, tags, featured ranks, or stats.
- Retrying with a new `runId` for the same `releaseId` should resume from
  existing server state and local cache.
- Reordering items patches order and does not change item identity.
- Changing a label patches the item label and does not replace media.
- Changing image content updates the item media reference and reuses existing
  media if the variant hashes already exist.
- A failed run must keep enough local and server state for cleanup and retry.

## Validation

The schemas are intentionally strict about shape. Cross-record checks that JSON
Schema cannot express well, such as duplicate external IDs and exactly one
primary criterion per template, belong in the Python validator.
