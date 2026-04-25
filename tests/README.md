# Tests

This directory contains the Vitest suite for the tier list builder.

## Philosophy

**Only major, important tests — not exhaustive coverage.**

We focus on critical pure-function and local persistence behavior:

- **Drag & Keyboard Logic**: snapshot transforms, rendered-row grouping, drag-end decisions, pointer math, and keyboard navigation
- **Board Data**: snapshot normalization, board operations, tier colors, presets, local board sessions, and localStorage envelopes
- **Import / Export / Sharing**: JSON parsing, multi-board envelopes, hash-share compression, and image byte preservation for JSON export
- **Images**: content-addressed image store, blob cache lifecycle, and manual crop/transform math
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

```
tests/
├── fixtures.ts                      — shared snapshot/tier builders & constants
├── typeHelpers.ts                   — asInvalid<T> for intentionally malformed inputs
├── setup.ts                         — global vitest setup
├── board/                           — board snapshot, ops, tier colors, presets
├── data/                            — board storage, export JSON, image cache/store
├── dnd/                             — drag snapshot, DOM capture, pointer, keyboard, layout
├── interaction/                     — tab stops, selection navigation, selection state
├── model/                           — local board session behavior
├── overlay/                         — nested menus, popup/progress/toolbar helpers
├── settings/                        — aspect-ratio prompt snapshots & mismatch grouping
├── sharing/                         — hash-fragment snapshot codec
└── shared-lib/                      — color, IDs, image transforms, memory storage, async helpers
```

## Fixtures

Shared test data defined in `fixtures.ts`:

| Export                              | Description                                                     |
| ----------------------------------- | --------------------------------------------------------------- |
| `TIER_IDS`                          | Stable tier ID constants                                        |
| `ITEM_IDS`                          | Stable item ID constants                                        |
| `makeContainerSnapshot(overrides?)` | Builds a `ContainerSnapshot` w/ 3 tiers & 8 items               |
| `makeBoardSnapshot(overrides?)`     | Builds an empty `BoardSnapshot` for focused overrides           |
| `makeBoardMeta(overrides?)`         | Builds a registry `BoardMeta` row for local board/session tests |
| `makeTier(overrides?)`              | Builds a `Tier` w/ palette colorSpec defaults                   |
| `makeItem(overrides?)`              | Builds a `TierItem` w/ a default item ID                        |
| `makeRect(overrides?)`              | Builds a `DOMRect` for layout/popup tests                       |

`tests/typeHelpers.ts` provides `asInvalid<T>(value)` for tests that intentionally pass malformed input. Prefer it over a bare `as never` cast so the intent is explicit.
