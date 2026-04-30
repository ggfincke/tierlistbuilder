# Tests

This directory contains the test suite for the tier list builder.

## Philosophy

**Only major, important tests — not exhaustive coverage.**

We focus on testing critical pure-function logic that, if broken, would cause significant user impact:

- **Drag Snapshot Logic**: Container snapshot transforms, item moves, consistency checks
- **Drag Layout Logic**: Rendered-row grouping, scoped DOM capture, column-preserving row moves, & drag-end decisions
- **Keyboard Navigation**: Arrow-key item movement & focus resolution
- **Pointer Math**: Drag target index calculation & insertion positioning
- **Color Parsing**: Hex/RGB normalization, contrast calculation
- **Tier Colors**: Palette/custom color spec creation, resolution, & equality
- **Board Snapshot**: Board creation, reset, tier factory, colorSpec & rowColorSpec normalization
- **Board Rendering**: Label display resolution and render-selector projections
- **Board Statistics**: Tier distribution, empty-board summaries, and most/least populated tier tie behavior
- **Board Operations**: Pure tier sorting & item shuffling logic
- **Tier Presets**: Preset-to-board conversion, board-to-preset extraction, row-color & round-trip integrity
- **JSON Import**: Single & multi-board parsing, envelope detection, validation, & error reporting
- **Share Codecs**: Hash-share image stripping, short-link image preservation, size guards, & abort behavior
- **Selection Primitives**: Shared radio/tab semantics behind roving selection
- **Nested Menus**: Shared tree state for root/submenu orchestration
- **ID Helpers**: Generated ID prefix contract & short-link slug shape
- **Popup/Menu Geometry**: Shared fixed-popup placement, submenu flip rules, &
  progress normalization
- **Image Crop Math**: Manual-crop sizing & pan-offset CSS positioning
- **Backend Selectors & Contracts**: Short-link listing, upload envelopes,
  image upload validation, public templates, and Convex query/mutation limit edges
- **Sync Runner Contracts**: Shared debounce/retry hooks, conflict pauses, and
  workspace scheduler adapter behavior
- **Catalog Filters**: Marketplace/library URL filter parse, serialize, and default-pruning behavior
- **User Contracts**: Profile shape, identity display, and account deletion cascades

We intentionally do not test:

- Every edge case or configuration combination
- React components or hooks
- Broad DOM-dependent utilities that require live layout capture
- Utility functions with obvious behavior (single ternary, field projection)
- Export rendering (PNG/PDF image capture)
- Zustand store wiring

## Running Tests

```bash
# run all unit/integration tests (single pass)
npm test

# run in watch mode
npm run test:watch

# run a specific test file
npx vitest run tests/dnd/dragSnapshot.test.ts

# run the Playwright E2E smoke suite (requires `npx playwright install chromium` once)
npm run test:e2e
npm run test:e2e:ui
```

E2E tests live in `e2e/` at the repo root and are excluded from the Vitest run via `vitest.config.ts`. Keep them to a small smoke/guardrail set for workflows that need real React, routing, focus, or browser wiring.
Current guardrails cover app boot, keyboard drag/focus restoration, pointer
drag plus Undo, bulk delete/Undo, nested modal Escape, mobile mixed-ratio prompt
layout, and hash-share embed rendering.
The suite also checks that the mixed-ratio prompt opens the split image editor.

## Structure

```
tests/
├── fixtures.ts                      — shared snapshot/tier builders & constants
├── typeHelpers.ts                   — asInvalid<T> for intentionally malformed inputs
├── setup.ts                         — global vitest setup (localStorage stub + resetAllMocks)
├── board/
│   ├── boardSnapshot.test.ts        — board creation, tier factory, colorSpec & rowColorSpec normalization
│   ├── boardStats.test.ts           — tier distribution and population summary labels
│   ├── boardOps.test.ts             — pure sorting & shuffling helpers
│   ├── labelDisplay.test.ts         — per-item/board caption display resolution
│   ├── tierColors.test.ts           — tier color spec creation, resolution, & equality
│   └── tierPresets.test.ts          — preset-to-board & board-to-preset conversion w/ row-color round-trip
├── contracts/
│   ├── uploadEnvelope.test.ts       — upload envelope owner/token validation & tamper rejection
│   └── userProfile.test.ts          — public user profile contract derivation
├── convex/
│   ├── boardReconciler.test.ts      — cloud-vs-local board reconciliation
│   ├── boardUpsertLimits.test.ts    — real Convex board sync caps, media refs, & tombstones
│   ├── convexTestHelpers.ts         — Convex test module harness
│   ├── imageValidation.test.ts      — Convex image validation helpers
│   ├── marketplaceTemplates.test.ts — public template publish/list/use & draft progress
│   ├── shortLinksIntegration.test.ts — real Convex owner+expiry listing query
│   ├── shortLinksListing.test.ts    — live short-link listing selection
│   └── userCascade.test.ts          — account deletion cascade coverage
├── data/
│   ├── boardStorage.test.ts         — per-board localStorage envelope & load outcomes
│   ├── cloudBoardMapper.test.ts     — Convex board wire <-> BoardSnapshot mapping
│   ├── exportJson.test.ts           — JSON import parsing, validation, multi-board envelope detection
│   ├── imageBlobCache.test.ts       — shared image blob cache lifecycle
│   ├── imageStore.test.ts           — persistent image-store GC planning
│   └── imageUploader.test.ts        — image upload planning & blob-cache reconciliation
├── dnd/
│   ├── dragSnapshot.test.ts         — snapshot transforms & container queries
│   ├── dragDomCapture.test.ts       — scoped rendered container capture
│   ├── dragEndDecision.test.ts      — pointer drag-end decision classification
│   ├── dragKeyboard.test.ts         — keyboard drag target helpers
│   ├── dragLayoutRows.test.ts       — rendered row grouping & column targeting
│   ├── dragPointerMath.test.ts      — pointer insertion math
│   ├── keyboardNavigation.test.ts   — pure browse/drag keyboard navigation
│   └── keyboardDragController.test.ts — keyboard drag state machine
├── interaction/
│   ├── keyboardTabStop.test.ts      — roving tab-stop selector cache
│   ├── selectionNavigation.test.ts  — selection arrow-key navigation
│   └── selectionState.test.ts       — shared radio/tab semantics for roving selection
├── model/
│   ├── boardRenderSelectors.test.ts — active-board render projection selectors
│   ├── boardConflictResolution.test.ts — conflict resolution sync identity
│   ├── boardSession.test.ts         — session bootstrap, autosave, registry orchestration
│   └── urlFilters.test.ts           — marketplace/library URL filter behavior
├── overlay/
│   ├── nestedMenus.test.ts          — nested root/submenu open-close tree rules
│   ├── popupPosition.test.ts        — fixed popup placement & viewport clamping
│   ├── progressOverlay.test.ts      — blocking overlay progress normalization
│   └── toolbarPosition.test.ts      — submenu direction & responsive toolbar helpers
├── platform/
│   ├── boardSyncStatus.test.ts      — per-board sync status derivation
│   ├── cloudMerge.test.ts           — cloud/local board merge strategy
│   ├── cloudSyncScheduler.test.ts   — debounced sync scheduler semantics
│   ├── firstLoginBoardMerge.test.ts — first-login board merge resolution
│   ├── firstLoginSyncLifecycle.test.ts — first-login orchestration
│   ├── settingsCloudMerge.test.ts   — settings cloud merge
│   ├── tierPresetCloudMerge.test.ts — preset cloud merge
│   └── userIdentity.test.ts         — stable user display identity helpers
├── sharing/
│   ├── hashShare.test.ts            — hash-fragment snapshot codec & image stripping
│   ├── shortLinkCodec.test.ts       — short-link snapshot image policy & size guard
│   └── shortLinkShare.test.ts       — short-link fetch/decode abort behavior
├── settings/
│   └── aspectRatioSettings.test.ts  — aspect-ratio prompt snapshots & mismatch grouping
└── shared-lib/
    ├── asyncMapLimit.test.ts        — bounded concurrency helper
    ├── autoCrop.test.ts             — auto-crop transform resolution
    ├── async.ts                     — queued Promise flushing helper
    ├── boardSnapshotItems.test.ts   — snapshot image-hash collection helpers
    ├── color.test.ts                — hex/rgb parsing & contrast
    ├── debouncedSyncRunner.test.ts  — shared sync runner extension hooks
    ├── id.test.ts                   — ID factory prefix contract & short-link slug shape
    ├── imageTransform.test.ts       — manual-crop sizing & pan-offset CSS
    └── memoryStorage.ts             — in-memory localStorage stub for tests
```

## Fixtures

Shared test data defined in `fixtures.ts`:

| Export                              | Description                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `TIER_IDS`                          | Stable tier ID constants (`'tier-s'`, `'tier-a'`, `'tier-b'`)                                          |
| `ITEM_IDS`                          | Stable item ID constants (`'item-1'` through `'item-8'`)                                               |
| `makeContainerSnapshot(overrides?)` | Builds a `ContainerSnapshot` w/ 3 tiers & 8 items                                                      |
| `makeBoardSnapshot(overrides?)`     | Builds an empty `BoardSnapshot` — compose tiers/items via overrides                                    |
| `makeBoardMeta(overrides?)`         | Builds a registry `BoardMeta` row for local board/session tests                                        |
| `makeBoardListItem(overrides?)`     | Builds a cloud `BoardListItem` row for sync and Convex list tests                                      |
| `makeTier(overrides?)`              | Builds a `Tier` w/ palette colorSpec defaults                                                          |
| `makeItem(overrides?)`              | Builds a `TierItem` w/ a default item ID                                                               |
| `makeRect(overrides?)`              | Builds a `DOMRect` for layout/popup tests; derives `right`/`bottom` from `left`/`top`/`width`/`height` |

`tests/typeHelpers.ts` provides `asInvalid<T>(value)` for tests that intentionally pass malformed input. Prefer it over a bare `as never` cast so the intent is explicit.

`tests/shared-lib/async.ts` provides `flushPromises()` for tests that need
queued Promise continuations to settle under fake timers.

## Adding Tests

Before adding a new test, ask:

1. Does this test a critical path that would break core functionality if it failed?
2. Is this behavior not already covered by existing tests?
3. Can this be tested as a pure function without DOM or mocking?
4. Would breakage cause significant user impact (data loss, broken drag, unreadable UI)?

If yes to all four, add the test. Otherwise, consider whether it's truly necessary.
