# Tests

This directory contains the test suite for the tier list builder.

## Philosophy

**Only major, important tests — not exhaustive coverage.**

We focus on testing critical pure-function logic that, if broken, would cause significant user impact:

- **Drag Snapshot Logic**: Container snapshot transforms, item moves, consistency checks
- **Keyboard Navigation**: Arrow-key item movement & focus resolution
- **Pointer Math**: Drag target index calculation & insertion positioning
- **Color Parsing**: Hex/RGB normalization, contrast calculation
- **Tier Colors**: Palette/custom color spec creation & resolution
- **Board Snapshot**: Board creation, reset, tier factory, color spec normalization, & legacy data migration
- **Board Operations**: Pure tier sorting & item shuffling logic
- **Tier Presets**: Preset-to-board conversion, board-to-preset extraction, & round-trip integrity
- **JSON Import**: Single & multi-board parsing, envelope detection, validation, & error reporting
- **Selection Primitives**: Shared radio/tab semantics behind roving selection
- **Nested Menus**: Shared tree state for root/submenu orchestration
- **ID Helpers**: Generated ID prefix contracts & guard helpers
- **Popup/Menu Geometry**: Shared fixed-popup placement & submenu flip rules

We intentionally do not test:

- Every edge case or configuration combination
- React components or hooks
- DOM-dependent utilities that require live layout capture
- Utility functions with obvious behavior (single ternary, field projection)
- Export rendering (PNG/PDF image capture)
- Zustand store wiring

## Running Tests

```bash
# run all tests (single pass)
npm test

# run in watch mode
npm run test:watch

# run a specific test file
npx vitest run tests/dragSnapshot.test.ts
```

## Structure

```
tests/
├── fixtures.ts                    — shared snapshot/tier builders & constants
├── board/
│   ├── constants.test.ts          — toFileBase, clamp, buildDefaultTiers
│   ├── boardSnapshot.test.ts      — board creation, tier factory, color spec normalization, & legacy migration
│   ├── boardOps.test.ts           — pure sorting & shuffling helpers
│   ├── tierColors.test.ts         — tier color spec creation & resolution
│   └── tierPresets.test.ts        — preset-to-board & board-to-preset conversion
├── data/
│   └── exportJson.test.ts         — JSON import parsing, validation, & multi-board envelope detection
├── dnd/
│   ├── dragSnapshot.test.ts       — snapshot transforms & container queries
│   ├── dragKeyboard.test.ts       — keyboard navigation resolution
│   ├── dragPointerMath.test.ts    — pointer insertion math
│   └── keyboardDragController.test.ts — keyboard drag state machine
├── interaction/
│   ├── keyboardTabStop.test.ts    — roving tab-stop selector cache
│   ├── selectionNavigation.test.ts — selection arrow-key navigation
│   └── selectionState.test.ts     — shared radio/tab semantics for roving selection
├── overlay/
│   ├── nestedMenus.test.ts        — nested root/submenu open-close tree rules
│   ├── popupPosition.test.ts      — fixed popup placement & viewport clamping
│   └── toolbarPosition.test.ts    — submenu direction & responsive toolbar helpers
├── store/
│   ├── undoLabels.test.ts         — labeled undo/redo stack semantics
│   └── tierRowColor.test.ts       — per-tier row background actions & round-trip
└── utils/
    ├── color.test.ts              — hex/rgb parsing & contrast
    └── id.test.ts                 — ID factory prefixes & guard helpers
```

## Fixtures

Shared test data defined in `fixtures.ts`:

| Export                          | Description                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `TIER_IDS`                      | Stable tier ID constants (`'tier-s'`, `'tier-a'`, `'tier-b'`)                                          |
| `ITEM_IDS`                      | Stable item ID constants (`'item-1'` through `'item-8'`)                                               |
| `makeSnapshot(overrides?)`      | Builds a `ContainerSnapshot` w/ 3 tiers & 8 items                                                      |
| `makeBoardSnapshot(overrides?)` | Builds an empty `BoardSnapshot` — compose tiers/items via overrides                                    |
| `makeTier(overrides?)`          | Builds a `Tier` w/ palette colorSpec defaults                                                          |
| `makeItem(overrides?)`          | Builds a `TierItem` w/ a default item ID                                                               |
| `makeRect(overrides?)`          | Builds a `DOMRect` for layout/popup tests; derives `right`/`bottom` from `left`/`top`/`width`/`height` |

`tests/typeHelpers.ts` provides `asInvalid<T>(value)` for tests that intentionally pass malformed input. Prefer it over a bare `as never` cast so the intent is explicit.

## Adding Tests

Before adding a new test, ask:

1. Does this test a critical path that would break core functionality if it failed?
2. Is this behavior not already covered by existing tests?
3. Can this be tested as a pure function without DOM or mocking?
4. Would breakage cause significant user impact (data loss, broken drag, unreadable UI)?

If yes to all four, add the test. Otherwise, consider whether it's truly necessary.
