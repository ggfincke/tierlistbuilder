# Tests

Test suite for the tier list builder.

## Philosophy

**Minimal tests, load-bearing only.** The suite stays small so it doesn't slow refactors. We test pure-function logic where breakage would cause silent data loss, broken drag, or unreadable UI. New tests are welcome when they fit this shape — the rules below describe what fits, not a ban on adding tests.

### Patterns to follow

1. **Group cases by behavior, not by case.** Multiple `expect()` calls inside one `it()` beat splitting "throws on missing version / missing data / bad version" across many blocks. They're the same behavior — one test.
2. **Skip React component tests.** UI correctness is verified manually or via the e2e smoke suite. No `@testing-library/react`.
3. **Skip DOM-dependent layout capture beyond the existing pure helpers** (`dragDomCapture`, `popupPosition`).
4. **Skip tests for behavior the type system already enforces** — field projections, constant wrappers, "passes through unchanged".
5. **Skip trivia** like ID prefix shape or default titles unless it's part of a load-bearing round-trip (e.g. JSON export round-trip).
6. **Watch for mock-heavy tests.** If the mock setup is longer than the assertion, the test is probably testing implementation, not behavior — rethink the boundary.
7. **Tiny new files are usually a smell.** A test file's overhead (imports, fixtures, README mention) should be justified by the assertion's value. Extend an existing file when possible.

### What we test

The following areas are load-bearing — failure here causes real user harm. Everything else is out of scope.

- **Drag** — snapshot transforms, container queries, keyboard nav, drag-end classification, pointer math, scoped DOM capture, the keyboard drag state machine.
- **Board snapshot persistence** — JSON import/export validation, wire mapper round-trip, image strip-for-share, board storage corruption handling, cloud board mapper.
- **Cloud sync** — scheduler retry/dedupe/conflict/error/rate-limit, first-login merge, preferences/preset cloud merges.
- **Convex backend** — board upsert caps, library summary, image validation (security boundary), seed authorization, marketplace template publish/clone/draft, user cascade cleanup, short-link listing.
- **Image editor** — transform commit/rotate/zoom math, modal apply-to-all plans, item ordering/filtering, draft sync.
- **Share codecs** — hash share & short-link snapshot codec, abort behavior.
- **Pure helpers w/ subtle math** — auto-crop bbox math, color contrast, async map limit, debounced sync runner, manual-crop CSS.
- **Selection / overlay primitives** — roving tab-stop cache, nested menu state, popup placement, progress overlay clamping.
- **Account profile + URL filter parsing** — handle normalization round-trips, filter parse/serialize.

### What we do NOT test

- React components or hooks (UI correctness is checked manually + via the e2e smoke suite)
- Zustand store wiring, action plumbing, selector wiring beyond the few render-isolation tests
- Trivial helpers (single ternary, field projection, constant export)
- Every error message string verbatim
- Every parser edge case — keep one happy path, one failure path, sometimes one edge case
- Performance / benchmark assertions (no perf tests today; if added, they live in a separate file)
- Cross-browser / accessibility behavior (those belong to e2e or manual review)

## Adding a test

Use the four-question gate to decide if the test is worth adding:

1. Would this break silently if the helper regressed? (If a runtime error or type error already catches it, the test is redundant.)
2. Would the breakage cause data loss, broken drag, or unreadable UI?
3. Can it be tested as a pure function w/o DOM, React, or extensive mocking?
4. Is this behavior not already covered by an existing test?

Four "yes" answers → add the test. Anything less → likely redundant or out-of-scope.

When you do add one, prefer extending an existing `it()` with another `expect()` over creating a new `it()` block, and prefer extending an existing file over creating a new one.

## Running

```bash
# unit/integration tests
npm test
npm run test:watch
npx vitest run tests/<path>.test.ts

# Playwright e2e (requires `npx playwright install chromium` once)
npm run test:e2e
npm run test:e2e:ui
```

E2E lives in `e2e/` at the repo root and is excluded from the Vitest run. Keep it to a small smoke/guardrail set for cross-layer flows that need real React, routing, focus, or browser wiring. Current guardrails cover app boot, keyboard drag/focus restoration, pointer drag plus Undo, tall-board drag measuring, bulk delete/Undo, nested modal Escape, mobile mixed-ratio prompt, hash-share embed rendering, account profile edits, account deletion confirmation, image-editor autosave, marketplace URL filters, and the signed-in publish/use-template flow.

## Structure

```
e2e/
├── account.spec.ts                  — account profile edit & delete-confirmation
├── helpers.ts                       — workspace/auth/catalog helpers
├── guardrails.spec.ts               — drag, modal, embed, marketplace filter, library auth
├── image-editor.spec.ts             — image-editor autosave & persisted transform
├── marketplace-library.spec.ts      — signed-in publish/use-template + My Lists
└── smoke.spec.ts                    — app boot

tests/
├── fixtures.ts                      — shared snapshot/tier builders
├── typeHelpers.ts                   — asInvalid<T> for malformed-input tests
├── setup.ts                         — global vitest setup
├── board/                           — snapshot, presets, tier colors, ops, stats
├── contracts/                       — uploadEnvelope kind/userId/token binding
├── convex/                          — board upsert caps, image validation, marketplace, user cascade, short-link listing
├── data/                            — JSON import, board storage, cloud mapper, image uploader & store
├── dnd/                             — drag snapshot, layout, pointer/keyboard, controller
├── interaction/                     — selection roving tab-stop, navigation, ARIA
├── model/                           — board session/conflict, render selectors, image editor, URL filters
├── overlay/                         — nested menus, popup placement, progress, toolbar
├── platform/                        — cloud sync scheduler, first-login merge, preferences/preset merge, account profile
├── settings/                        — aspect-ratio prompt
├── sharing/                         — hash share, short-link codec, share fetch abort
└── shared-lib/                      — async map limit, autoCrop math, color, debounced runner, ID, image transform, snapshot items
```

## Fixtures

Shared test data in `fixtures.ts`:

| Export                              | Description                                               |
| ----------------------------------- | --------------------------------------------------------- |
| `makeContainerSnapshot(overrides?)` | `ContainerSnapshot` w/ 3 tiers & 8 items                  |
| `makeBoardSnapshot(overrides?)`     | Empty `BoardSnapshot` — compose tiers/items via overrides |
| `makeBoardMeta(overrides?)`         | Registry `BoardMeta` row for local board/session tests    |
| `makeBoardListItem(overrides?)`     | Cloud `BoardListItem` row for sync & Convex list tests    |
| `makeTier(overrides?)`              | `Tier` w/ palette colorSpec defaults                      |
| `makeItem(overrides?)`              | `TierItem` w/ a default item ID                           |
| `makeRect(overrides?)`              | `DOMRect` for layout/popup tests; derives right/bottom    |

`tests/typeHelpers.ts` provides `asInvalid<T>(value)` for malformed-input tests.

`tests/shared-lib/async.ts` provides `flushPromises()` for queued Promise continuations under fake timers.
