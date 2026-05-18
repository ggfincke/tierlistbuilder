# Architecture

## Stack

| Layer        | Technology                                         |
| ------------ | -------------------------------------------------- |
| UI           | React 19 + TypeScript 5.9                          |
| Build        | Vite 7                                             |
| Styling      | Tailwind CSS 4 (`@tailwindcss/vite` plugin)        |
| State        | Zustand 5 (persisted to localStorage)              |
| Drag & drop  | @dnd-kit/core + @dnd-kit/sortable                  |
| Icons        | lucide-react                                       |
| Image export | html-to-image (PNG/JPEG/WebP)                      |
| PDF export   | jsPDF                                              |
| Compression  | pako (share-link payloads)                         |
| Unit testing | Vitest                                             |
| E2E testing  | Playwright                                         |
| Deployment   | Cloudflare Workers (via `@cloudflare/vite-plugin`) |

## Directory Structure

The codebase is organized into three top-level layers: `app/` (bootstrap, routing, and shells), `features/{workspace,library,embed,platform}/*` (per-slice feature code), and `shared/*` (cross-feature primitives). Shared serializable types live in the top-level `packages/contracts/` workspace package. See `dev-docs/archive/directory-restructure-proposal.mdx` for the long-form rationale.

```
src/
├── app/
│   ├── App.tsx                      # root component — delegates to AppRouter
│   ├── main.tsx                     # React mount
│   ├── index.css                    # Tailwind entry
│   ├── bootstrap/
│   │   ├── useAppBootstrap.ts       # hydrate stores, bootstrap session, register autosave
│   ├── routes/
│   │   ├── AppRouter.tsx            # BrowserRouter route table
│   │   ├── AppChromeLayout.tsx      # shared top chrome + Outlet for app routes
│   │   ├── WorkspaceRoute.tsx       # workspace entry
│   │   ├── MyBoardsRoute.tsx        # library route entry
│   │   ├── EmbedRoute.tsx           # embed entry
│   │   └── NotFoundRoute.tsx        # 404 fallback
│   └── shells/
│       ├── AppTopNav.tsx            # global top nav (brand pill, route pills, account menu)
│       ├── topNav/                  # top-nav chrome + preferences modal layer
│       ├── workspace/               # WorkspaceShell, WorkspaceModalLayer, export actions, modal payload map
│       └── useModalStack.ts         # keyed modal state helper
├── features/workspace/
│   ├── annotation/{model,ui}        # draw-over annotation editor
│   ├── boards/
│   │   ├── data/local/              # per-board localStorage I/O
│   │   ├── dnd/                     # dnd-kit wiring, sensors, pointer math, layout sessions
│   │   ├── interaction/             # keyboard drag controller, focus restore, useKeyboardDrag
│   │   ├── lib/                     # boardDefaults, dndIds, containerLabel, aspectRatio (pure helpers)
│   │   ├── model/                   # active board store, registry, session facade, snapshot ops
│   │   └── ui/                      # TierList, TierRow, TierItem, BoardHeader, BoardActionBar, etc.
│   ├── export/{lib,model,ui}        # PNG/JPEG/WebP/PDF/JSON export + preview + progress
│   ├── settings/
│   │   ├── data/local/              # settings storage key
│   │   ├── lib/                     # image upload constants & helpers
│   │   ├── model/                   # settings store, palette selector, aspect ratio, image import
│   │   └── ui/                      # BoardSettingsModal & tabbed content
│   ├── sharing/
│   │   ├── inbound/                 # detect & import share URLs into the active board
│   │   ├── snapshot-compression/    # hash fragment codec (pako deflate + base64url)
│   │   └── ui/                      # ShareModal
│   ├── shortcuts/{lib,model,ui}     # keyboard shortcut registry, panel, list
│   ├── stats/{model,ui}             # board statistics & distribution chart
│   └── tier-presets/                # reusable tier structures (local storage, independent of boards)
│       ├── data/local/              # preset storage key
│       ├── model/                   # tier preset store, built-in presets
│       └── ui/                      # PresetPickerModal, SavePresetModal
├── features/library/                # My Boards page, filters, cards, list rows, local projections
├── features/embed/ui                # read-only EmbedView primitives
├── features/platform/
│   ├── media/                       # cross-feature image-file validation
│   ├── preferences/                 # app preferences store, local storage, PreferencesModal, theme sync
│   └── share/                       # inbound share-fragment resolver
└── shared/
    ├── a11y/                        # announce() module, LiveRegion component
    ├── board-ui/                    # BoardPrimitives, ItemContent, ItemOverlayButton, StaticBoard, boardTestIds, constants
    ├── hooks/                       # useClipboardCopy, useInlineEdit, useImageUrl, useViewportWidth
    ├── images/                      # imageStore, imageBlobCache, imagePersistence (IndexedDB blobs + refs)
    ├── lib/                         # color, colorName, math, fileName, className, pluralize, downloadBlob,
    │                                # browserStorage, storageMetering, logger, urls, typeGuards,
    │                                # asyncMapLimit, binaryCodec, boardSnapshotItems, errors,
    │                                # localSidecar, scheduleIdle, sha256, proceedGuard
    ├── notifications/               # ToastContainer, useToastStore
    ├── overlay/                     # BaseModal, ConfirmDialog, progress, focus/inert dialog wiring,
    │                                # dismissible layers, anchored popups, toolbar positioning, nested menus
    ├── selection/                   # useRovingSelection, selectionNavigation, selectionState
    ├── routes/                      # base-path-aware route constants/path helpers
    ├── theme/                       # tokens, palettes, textStyles, runtime, tierColors
    └── ui/                          # ActionButton, Button, buttonBase, PrimaryButton, SecondaryButton,
                                     # ColorInput, ErrorBoundary, PickerGrid, SettingsSection,
                                     # SearchField, TextArea, TextInput, UploadDropzone

packages/contracts/                  # @tierlistbuilder/contracts — shared serializable types
├── lib/                             # ids, theme, themeDefinition
├── marketplace/                     # template, ranking, aggregate, and seed-pipeline contracts
├── platform/                        # upload, user, short-link, preferences, and error contracts
└── workspace/                       # board, boardEnvelope, sync, settings, tierPreset
```

## State Management

Four Zustand stores form the workspace data layer:

**`useActiveBoardStore`** (`features/workspace/boards/model/useActiveBoardStore.ts`) — the single active board. Holds a `BoardSnapshot` (title, tiers, unrankedItemIds, items map, deletedItems) and runtime-only fields (`activeItemId`, `dragPreview`, `keyboardMode`, `keyboardFocusItemId`, `selection`, `runtimeError`, undo/redo stacks). It is an in-memory store with no persist middleware — persistence is orchestrated by `features/workspace/boards/model/boardSession.ts` and its `model/session/*` helpers. The store manages undo/redo history, selection, and the drag preview lifecycle.

**`useWorkspaceBoardRegistryStore`** (`features/workspace/boards/model/useWorkspaceBoardRegistryStore.ts`) — multi-board registry. Uses Zustand `persist` middleware with `partialize` to persist `boards` and `activeBoardId`. Handles create, switch, delete, duplicate, and rename. Active-board autosave is registered by `features/workspace/boards/model/boardSession.ts`, which keeps registry coordination and local persistence behind the model facade.

**`usePreferencesStore`** (`features/platform/preferences/model/usePreferencesStore.ts`) — global user preferences (item size, shape, label visibility, compact mode, label width, theme, palette, text style, reduced motion, toolbar position, etc.). Persisted independently.

**`useTierPresetStore`** (`features/workspace/tier-presets/model/useTierPresetStore.ts`) — user-saved tier structure presets. Persisted independently. Built-in presets (Classic, Top 10, Yes/No/Maybe, etc.) are defined in `tierPresets.ts` and merged at runtime.

### Local persistence layer

Persistence is split across features instead of living in a single monolithic `storage.ts`:

- `features/workspace/boards/model/boardSession.ts` — model facade for session bootstrap, autosave subscription, CRUD, registry coordination, event listeners, and persistence wrappers
- `features/workspace/boards/model/session/*` — board-session internals split by autosave, bootstrap, CRUD, events, persistence, registry, and storage warning reporting
- `features/workspace/boards/data/local/boardStorage.ts` — per-board localStorage I/O, versioned envelopes, typed `ok`/`missing`/`corrupted` load outcomes, quota error messaging
- `features/platform/preferences/data/local/preferencesStorage.ts` — preferences storage key & schema version
- `features/workspace/tier-presets/data/local/tierPresetStorage.ts` — preset storage key & schema version
- `shared/lib/browserStorage.ts` — generic localStorage wrapper, Zustand persist adapter
- `shared/lib/storageMetering.ts` — quota estimation, near-full warnings
  Pre-1.0 storage changes are allowed to be breaking. Incompatible localStorage or
  IndexedDB payloads should be wiped by version reset/recreation instead of
  converted forward, while JSON/share import validation should continue rejecting
  malformed or unsupported files.

Local images live in `shared/images/imageStore.ts` as content-addressed blobs.
Imported items keep a small display blob plus an optional editor source blob.
Board saves update board-scoped blob refs; workspace bootstrap reconciles refs
from all local snapshots and prunes unreferenced blobs after the local image GC
grace window. IndexedDB schema changes use a reset, not old-blob migration.

## Drag and Drop

Drag-and-drop uses a **snapshot-based preview** pattern that separates visual feedback from persisted state:

```
1. beginDragPreview()    -> captures ContainerSnapshot (tier itemId arrays + unranked itemIds)
2. updateDragPreview()   -> applies moves to the snapshot, persisted state untouched
3. getEffectiveTiers()   -> overlays snapshot onto persisted tiers for rendering
   getEffectiveUnrankedItemIds()
4a. commitDragPreview()  -> writes snapshot into persisted state (on drop)
4b. discardDragPreview() -> throws snapshot away (on cancel)
```

**Drag logic** lives under `features/workspace/boards/dnd/`:

- `dragSnapshot.ts` — pure snapshot transforms, container queries, & item movement (`moveItemInSnapshot`, `findContainer`, `getEffectiveTiers`, etc.)
- `dragPointerMath.ts` — pointer/mouse insertion math (`resolveDragTargetIndex`, `resolveNextDragPreview`, etc.)
- `dragKeyboard.ts` — keyboard navigation (`resolveNextKeyboardDragPreview`, `resolveNextKeyboardFocusItem`)
- `dragLayoutRows.ts` — pure rendered-row grouping, pointer trailing-row, and column-targeting helpers.
- `dragLayoutSession.ts` — cached DOM-backed layout sessions for rendered containers.
- `dragDomCapture.ts` — scoped DOM snapshot rebuilding through layout sessions.
- `dragEndDecision.ts` — pure pointer drag-end classification for item/tier drops.
- `dragCollision.ts`, `dragPreviewController.ts`, `dragDropAnimation.ts`, `dragHelpers.ts`, `dragSensors.ts`, `useDragAndDrop.ts` — dnd-kit wiring, sensors, collision resolution, drop animation, & lifecycle

**Keyboard interaction** lives under `features/workspace/boards/interaction/`:

- `useKeyboardDrag.ts` — item-facing hook consumed by `TierItem`
- `keyboardDragController.ts` — 3-state machine (idle → browse → dragging), arrow key navigation with intra-row and column-aware cross-tier logic
- `keyboardNavigation.ts` — pure browse/drag navigation resolver shared by the controller.
- `keyboardFocus.ts` — RAF-debounced focus restoration helpers

The separation ensures board-input orchestration (selection, focus persistence, board re-entry, drag cancellation) lives in `interaction/` while pure drag helpers live in `dnd/`. Interaction may call into dnd helpers; the reverse is not allowed.

## Routing

`app/routes/AppRouter.tsx` uses `react-router-dom`'s `BrowserRouter` with `normalizeBasePath()` as the basename. Chrome-wrapped routes render through `AppChromeLayout`, which owns app bootstrap and top navigation before handing the active route to `<Outlet />`.

- `/` → `WorkspaceRoute` → `WorkspaceShell` (full editable shell)
- `/boards` → `MyBoardsRoute` → `MyBoardsPage` (local board library)
- `/embed` → `EmbedRoute` → `EmbedView` (read-only embed view)
- anything else → `NotFoundRoute`

Share links use the `#share=<base64url>` hash fragment. The snapshot strips private notes, image refs, and deleted items, then compresses directly into a base64url URL fragment via `encodeBoardToShareFragment`. `useAppBootstrap` and `EmbedView` detect the fragment through `features/platform/share/inboundShare.ts`; workspace bootstrap imports and clears the fragment, while embed reads it into local component state.

The embed route inflates via `shared/board-ui/` primitives and never mounts the editable active-board store.

## Component Hierarchy

```
App (app/App.tsx → AppRouter)
├── AppChromeLayout
│   ├── AppTopNav
│   │   ├── BrandPill
│   │   ├── NewBoardAction
│   │   ├── SurfaceNav
│   │   └── TopNavAccountControl → PreferencesModal
│   ├── WorkspaceRoute → WorkspaceShell
│   │   ├── BoardHeader                — click-to-edit board title
│   │   │   └── BoardPublishChip       — content-derived Draft/WIP/Live state
│   │   ├── BoardActionBar             — undo/redo, add tier, settings, export, reset, share
│   │   │   ├── ActionButton[]         — reusable circular icon buttons
│   │   │   └── ExportMenu             — export dropdown w/ nested hover submenus
│   │   ├── TierList                   — DndContext wrapper, tier rows, unranked pool, drag overlay
│   │   │   ├── TierRow[]              — tier label + sortable item grid + color picker popups
│   │   │   │   ├── TierLabel          — colored label (editable name)
│   │   │   │   ├── TierItem[]         — sortable items (delegates keyboard to useKeyboardDrag)
│   │   │   │   ├── TierRowSettingsMenu — gear button + row settings popup
│   │   │   │   └── ColorPicker        — fixed-position color swatch popup
│   │   │   ├── UnrankedPool           — droppable pool for unassigned items
│   │   │   └── TrashZone              — drag-to-trash (visible during drag)
│   │   ├── BoardSettingsModal         — tabbed modal shell w/ per-tab subcomponents
│   │   ├── PresetPickerModal          — modal for selecting built-in & user tier presets
│   │   ├── SavePresetModal            — save current tiers as a user preset
│   │   ├── AspectRatioIssueModal      — blocking mixed-ratio warning dialog
│   │   ├── ShareModal                 — generate hash share / embed URLs
│   │   ├── StatsModal                 — board statistics
│   │   │   └── TierDistributionChart  — per-tier item counts
│   │   ├── AnnotationEditor           — draw-over overlay editor
│   │   ├── ImageEditorModal           — per-item crop, label, alt-text, notes, background editor
│   │   ├── ItemPreviewModal           — read-only item zoom/preview surface
│   │   ├── ItemContextMenu            — item actions and edit entry points
│   │   ├── DragOverlay → DragOverlayItem — ghost item (uses ItemContent for rendering)
│   │   ├── ConfirmDialog              — shared modal for destructive confirmations
│   │   ├── ProgressOverlay            — shared blocking overlay (export-all)
│   │   ├── BulkActionBar              — floating bar for multi-select operations
│   │   ├── ShortcutsPanel → ShortcutsList — help panel listing keyboard shortcuts
│   │   ├── ToastContainer             — auto-dismissing notifications
│   │   └── LiveRegion                 — screen reader announcement target
│   └── MyBoardsRoute → MyBoardsPage
│       ├── LibrarySearchInput
│       ├── LibraryFilterBar
│       ├── NewBoardTile
│       ├── BoardCard[]                — grid view w/ mosaic covers and publish/sync chips
│       ├── BoardListTable             — dense list view
│       └── RenameBoardModal
└── EmbedRoute → EmbedView — read-only iframe view
```

## Overlay System

`shared/overlay/` is split by responsibility so modal surfaces, focus
management, popups, and menu behavior can change independently:

- **Dialog surfaces:** `BaseModal.tsx`, `ConfirmDialog.tsx`, `ProgressOverlay.tsx`, `LazyModalSlot.tsx`, `ModalHeader.tsx`, `DialogActions.tsx`, `OverlaySurface.tsx`, and `progress.ts`.
- **Modal behavior:** `modalDialog.ts`, `focusTrap.ts`, and `modalLayer.ts` own Escape handling, focus containment, app-shell inert state, and scroll locking. The keyed modal stack lives in `app/shells/useModalStack.ts`.
- **Popup/menu behavior:** `dismissibleLayer.ts`, `anchoredPopup.ts`, `popupPosition.ts`, `uiMeasurements.ts`, `menuOverflow.ts`, and `nestedMenus.ts` own outside interaction, positioning, overflow flipping, and submenu state.

Tier-row popups (`ColorPicker`, `TierRowSettingsMenu`) compute their position via `popupPosition.ts` at open time. `BoardManager` and `ExportMenu` keep their own anchored layouts but reuse dismissal and overflow helpers. `BoardSettingsModal`, `PresetPickerModal`, `ShareModal`, `StatsModal`, `ImageEditorModal`, `ItemPreviewModal`, and `AspectRatioIssueModal` all build on `BaseModal`.

Toolbar-position-aware submenu class sets live in `shared/overlay/toolbarPosition.ts`, consumed by `BoardActionBar`, `ExportMenu`, `TierList`, `useGlobalShortcuts`, and the workspace shell.

## Theming

8 color themes + 5 text styles, controlled via CSS custom properties (`--t-*` for colors, `--ts-*` for typography). Theme definitions live in `src/shared/theme/`:

- `tokens.ts` — `--t-*` color tokens applied at `:root`
- `palettes.ts` — tier-color palettes
- `textStyles.ts` — font-family & weight tokens
- `runtime.ts` — `applyThemeTokens` / `applyTextStyle` DOM writers
- `tierColors.ts` — `TierColorSpec` resolution against the active palette

The `useThemeSync` hook (called in `WorkspaceShell` from `src/features/platform/preferences/model/useThemeSync.ts`) syncs theme tokens from `usePreferencesStore` to `:root`; `WorkspaceShell` layers board-specific overrides on top. `EmbedRoute` calls `useLockedTheme('scoreboard', 'default')` so embed iframes render the Scoreboard theme regardless of the host's preference; `EmbedView` defaults `paletteId` to `'classic'` to keep tier colors neutral for embedders. Non-system fonts are loaded dynamically from Google Fonts.

## Export Pipeline

**Raster formats** (PNG, JPEG, WebP) — exports render a hidden store-free `StaticExportBoard` in an off-screen React root, then `html-to-image` captures that isolated DOM. Single-board and export-all use the same render session so exports never mutate the live active-board store. A configurable background color is applied. `triggerDownload()` creates a temporary `<a>` element for file download.

**Clipboard** — uses the same isolated export renderer, then writes a PNG blob to the clipboard API.

**PDF** — uses the same isolated export renderer, captures a PNG, then `jsPDF` creates a document sized to match the rendered image dimensions and embeds the rasterized image.

**JSON** — `exportJson.ts` serializes the full `BoardSnapshot` to a downloadable `.json` file, embedding live and deleted item image bytes so files are self-contained. Import accepts both single-board and multi-board JSON envelopes — `parseBoardsJson()` auto-detects the format and validates each board before restoring.

All export lib code lives in `features/workspace/export/lib/`; the UI (`ExportMenu`, `ExportPreviewModal`, `StaticExportBoard`) lives in `features/workspace/export/ui/`; the controller hook is `features/workspace/export/model/useExportController.ts`. Blocking export-all progress uses the shared `ProgressOverlay` at `shared/overlay/`.

Share/export image behavior is intentionally split by carrier:

- JSON export preserves live and deleted item images via inline bytes.
- Hash-fragment shares drop image refs and deleted items to keep URLs bounded.

## Boundary Rules

- `shared/*` must not import from `features/*`. Shared code is framework-only and feature-agnostic.
- Inside `features/workspace/*`, cross-slice imports are allowed in the direction of structural dependency. `tier-presets` may import board contract types because presets produce boards.
- The embed view renders through `shared/board-ui/*` primitives only and never mounts the editable active-board store.
- UI (`ui/`) → model (`model/`) → data (`data/local/`). Components don't call localStorage directly; they go through a `model/` selector or `data/*` helper.

## Types

Types are split between `packages/contracts/` (stable, serializable shapes) and slice-local `runtime.ts` files (implementation-private, never persisted or sent across boundaries). There is no barrel file — every import points directly at the module that defines the type.

**Contracts (`@tierlistbuilder/contracts`, `packages/contracts/`):**

Anything that crosses a process boundary — localStorage, JSON exports, and share links — lives here:

- `lib/ids.ts` — `BoardId`, `TierId`, `PresetId`, `UserPresetId`, `BuiltinPresetId` template-literal brands; `ItemId` is a nominal brand w/ `asItemId()` cast at trust boundaries.
- `lib/theme.ts`, `lib/themeDefinition.ts` — `ThemeId`, `PaletteId`, `TextStyleId`.
- `workspace/board.ts` — `BoardSnapshot`, `Tier`, `TierItem`, `TierColorSpec` (+ palette/custom variants), `NewTierItem`, `BoardMeta`, `BoardSnapshotWire`.
- `workspace/settings.ts` — `AppSettings`, `ItemSize`, `ItemShape`, `LabelWidth`, `TierLabelFontSize`, `ToolbarPosition`.
- `workspace/tierPreset.ts` — `TierPreset`, `TierPresetTier`.
- `workspace/boardEnvelope.ts` — version marker for per-board localStorage envelopes.

**Runtime (slice-local `runtime.ts`):**

Types that only live in memory stay in the frontend tree, collocated w/ the stores that use them:

- `features/workspace/boards/model/runtime.ts` — `ContainerSnapshot`, `ContainerSnapshotTier`, `KeyboardMode`, `ActiveBoardRuntimeState`, `freshRuntimeState`, `ItemRecord`.
- `features/workspace/export/model/runtime.ts` — `ImageFormat`, `ExportAppearance`.

`BoardSnapshot` is the canonical serializable board shape. `ContainerSnapshot` is the runtime-only lightweight ordering used during drag preview — it mirrors tier/unranked item ID arrays without carrying full tier metadata.

## Testing

Unit & integration tests live under `tests/` and run via Vitest. End-to-end Playwright tests live under `e2e/` and are excluded from the Vitest run. See **[`tests/README.md`](../tests/README.md)** for the full test inventory, fixtures, and the "major & important only" philosophy that gates new tests.

- `npm test` — Vitest single pass
- `npm run test:watch` — Vitest watch mode
- `npm run test:e2e` — Playwright smoke + guardrails (requires `npx playwright install chromium` once)
- `npm run test:e2e:ui` — Playwright headed runner
