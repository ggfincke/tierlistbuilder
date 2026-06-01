# Tests

This directory contains the Vitest suite for the tier list builder.

## Philosophy

**Only major, important tests — not exhaustive coverage.**

We focus on critical pure-function and local persistence behavior:

- **Drag & Keyboard Logic**: snapshot transforms, rendered-row grouping, drag-end decisions, pointer math, and keyboard navigation
- **Board Data**: snapshot normalization, board operations, tier colors, presets, local board sessions, and localStorage envelopes
- **Import / Export / Sharing**: JSON export parsing, multi-board envelopes, hash-share compression, and image byte preservation for JSON export
- **Images**: content-addressed image store, blob cache lifecycle, uploads, and manual crop/transform math
- **Convex Marketplace**: template publish/use, owner management, trending metrics, ranking publish/remix, and cascade cleanup
- **Cloud Sync & Merge**: cloud board mapper, scheduler retry/dedupe/rate-limit, first-login push semantics, & per-feature first-login merge invariants (boards, preferences, tier presets)
- **Contracts**: upload envelope wrap/unwrap binding kind+userId+token (tamper defense)
- **Shared UI Primitives**: roving selection, nested menus, popup geometry, toolbar placement, and progress normalization

We intentionally do not test every configuration combination, React component rendering, broad DOM-dependent utilities, export rasterization, or routine Zustand wiring.

## Running Tests

```bash
npm test
npm run test:watch
npx vitest run tests/dnd/dragSnapshot.test.ts
npm run test:e2e
npm run test:e2e:ui
```

E2E tests live in `e2e/` and are excluded from Vitest. Keep them to a small smoke/guardrail set for workflows that need real React, routing, focus, or browser wiring.

## Structure

Top-level folders are behavior domains, not source-layer names. Keep `data/`,
`model/`, and real feature-slice names like `platform/` out of the top level
unless they describe the behavior under test.

```
tests/
├── fixtures.ts                      — shared snapshot/tier builders & constants
├── typeHelpers.ts                   — asInvalid<T> for intentionally malformed inputs
├── setup.ts                         — global vitest setup
├── auth/                            — auth error mapping and account auth guardrails
├── board/                           — board snapshot, ops, tier colors, presets
│                                      local board session/storage/fork/publishable-board helpers
├── cloud-sync/                      — cloud board mapper, activation, scheduler, first-login merge invariants
│                                      for boards, preferences, and tier presets
├── contracts/                       — wire-format guardrails (upload envelope tamper defense)
├── convex/                          — Convex backend flows for marketplace, media, sync, auth, and cascades
├── dnd/                             — drag snapshot, drag-end decisions, pointer, keyboard, layout
├── export/                          — JSON export/import envelopes and embedded image bytes
├── image-editor/                    — image editor transform draft behavior
├── images/                          — image blob cache/store and upload helpers
├── interaction/                     — tab stops, selection navigation, selection state
├── library/                         — My Boards click routing and local library adapters
├── marketplace/                     — gallery rails, account templates, compare lanes, publish defaults
├── overlay/                         — nested menus, popup/progress/toolbar helpers
├── routing/                         — basename-aware route and link helpers
├── settings/                        — aspect-ratio prompt snapshots & mismatch grouping
├── showcase/                        — profile-showcase editor, session, and save scheduler
├── shared-hooks/                    — session/UTC-day storage gates for once-per-X actions
├── shared-lib/                      — color, image transforms, snapshot item collection, auto-crop math
└── sharing/                         — hash-fragment & short-link snapshot codecs
```

## Fixtures

Shared test data defined in `fixtures.ts`:

| Export                              | Description                                           |
| ----------------------------------- | ----------------------------------------------------- |
| `makeContainerSnapshot(overrides?)` | Builds a `ContainerSnapshot` w/ 3 tiers & 8 items     |
| `makeBoardSnapshot(overrides?)`     | Builds an empty `BoardSnapshot` for focused overrides |
| `makeTier(overrides?)`              | Builds a `Tier` w/ palette colorSpec defaults         |
| `makeItem(overrides?)`              | Builds a `TierItem` w/ a default item ID              |
| `makeRect(overrides?)`              | Builds a `DOMRect` for layout/popup tests             |

`tests/typeHelpers.ts` provides `asInvalid<T>(value)` for tests that intentionally pass malformed input. Prefer it over a bare `as never` cast so the intent is explicit.
