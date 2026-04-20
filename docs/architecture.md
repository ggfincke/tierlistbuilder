# Architecture

## Stack

| Layer        | Technology                                  |
| ------------ | ------------------------------------------- |
| UI           | React 19 + TypeScript 5.9                   |
| Build        | Vite 7                                      |
| Styling      | Tailwind CSS 4 (`@tailwindcss/vite` plugin) |
| State        | Zustand 5 (persisted to localStorage)       |
| Drag & drop  | @dnd-kit/core + @dnd-kit/sortable           |
| Icons        | lucide-react                                |
| Image export | html-to-image (PNG/JPEG/WebP)               |
| PDF export   | jsPDF                                       |
| Testing      | Vitest                                      |
| Deployment   | Cloudflare Workers                          |

## Directory Structure

The codebase is organized into three top-level layers: `app/` (bootstrap & routing), `features/{workspace,platform,embed}/*` (per-slice feature code), and `shared/*` (cross-feature primitives). Cross-runtime wire types live in the top-level `packages/contracts/` workspace package. See `dev-docs/directory-restructure-proposal.mdx` for the long-form rationale.

```
src/
├── app/
│   ├── App.tsx                      # root component — delegates to AppRouter
│   ├── main.tsx                     # React mount
│   ├── index.css                    # Tailwind entry
│   ├── bootstrap/
│   │   ├── useAppBootstrap.ts       # hydrate stores, bootstrap session, register autosave
│   │   └── useThemeSync.ts          # sync theme/text-style tokens to :root (+ useLockedTheme)
│   ├── routes/
│   │   ├── AppRouter.tsx            # popstate-driven route selection
│   │   ├── WorkspaceRoute.tsx       # workspace entry
│   │   ├── EmbedRoute.tsx           # embed entry
│   │   ├── NotFoundRoute.tsx        # 404 fallback
│   │   └── pathname.ts              # resolveAppRoute + workspace/embed path builders
│   └── shells/
│       ├── WorkspaceShell.tsx       # full editable workspace shell
│       └── EmbedShell.tsx           # read-only embed shell
├── features/workspace/
│   ├── annotation/{model,ui}        # draw-over annotation editor
│   ├── boards/
│   │   ├── data/
│   │   │   ├── local/               # per-board & registry localStorage I/O, session bootstrap
│   │   │   └── cloud/               # Convex board repo/mapper, pull/flush/restore/merge, scheduler, conflict UI
│   │   ├── dnd/                     # dnd-kit wiring, sensors, pointer math, snapshot transforms
│   │   ├── interaction/             # keyboard drag controller, focus restore, useKeyboardDrag
│   │   ├── lib/                     # boardDefaults, dndIds, containerLabel (pure helpers)
│   │   ├── model/                   # active board store (sliced), registry store, snapshot ops, runtime.ts
│   │   └── ui/                      # TierList, TierRow, TierItem, BoardHeader, BoardActionBar, etc.
│   ├── export/{lib,model,ui}        # PNG/JPEG/WebP/PDF/JSON export + preview + progress
│   ├── settings/
│   │   ├── data/{local,cloud}       # settings storage key + versioned migration; Convex sync
│   │   ├── lib/                     # image upload constants & helpers
│   │   ├── model/                   # settings store, palette selector, image import hook
│   │   └── ui/                      # BoardSettingsModal & tabbed content
│   ├── sharing/{lib,ui}             # hash-share encoding, social share, share/embed modals, EmbedView
│   ├── shortcuts/{lib,model,ui}     # keyboard shortcut registry, panel, list
│   ├── stats/{model,ui}             # board statistics & distribution chart
│   └── tier-presets/                # reusable tier structures (local + cloud storage, independent of boards)
│       ├── data/{local,cloud}       # preset storage key; Convex preset sync
│       ├── model/                   # tier preset store, built-in presets
│       └── ui/                      # PresetPickerModal, SavePresetModal
├── features/platform/
│   ├── auth/{model,ui}              # SignInModal, AccountSection, Convex auth wiring
│   ├── media/                       # imageFetcher, imageUploader (Convex storage transport)
│   └── sync/
│       ├── lib/                     # cloudSyncConfig, concurrency, convexClient, crossTabSyncLock, errors
│       ├── orchestration/           # createSyncSession, firstLoginSyncLifecycle, useCloudSync, subscribers
│       ├── state/                   # syncStatusStore, syncStatusVisuals, useBoardSyncStatus
│       └── transport/               # connectivity detection
├── features/embed/ui                # read-only EmbedView primitives
└── shared/
    ├── a11y/                        # announce() module, LiveRegion component
    ├── board-ui/                    # BoardPrimitives, ItemContent, ItemOverlayButton, StaticBoard, boardTestIds, constants
    ├── hooks/                       # useClipboardCopy, useInlineEdit, useImageUrl, useViewportWidth
    ├── layout/                      # toolbarPosition (cross-feature menu chrome math)
    ├── lib/                         # color, math, fileName, browserStorage, storageMetering,
    │                                # logger, urls, typeGuards, sync (debouncedSyncRunner), asyncMapLimit,
    │                                # binaryCodec, boardSnapshotItems, errors, localSidecar, scheduleIdle, sha256
    ├── notifications/               # ToastContainer, useToastStore
    ├── overlay/                     # BaseModal, ConfirmDialog, OverlayPrimitives, menuClasses,
    │                                # popupPosition, uiMeasurements, useAnchoredPopup,
    │                                # useAnchoredPosition, useDismissibleLayer, useFocusTrap,
    │                                # useMenuOverflowFlip, useModalBackgroundInert, useModalDialog,
    │                                # useNestedMenus, usePopupClose
    ├── selection/                   # useRovingSelection, selectionNavigation, selectionState
    ├── theme/                       # tokens, palettes, textStyles, runtime, tierColors, zIndex
    └── ui/                          # ActionButton, Button, ErrorBoundary, PrimaryButton, SecondaryButton,
                                     # ColorInput, PickerGrid, SettingsSection, TextArea, TextInput, UploadDropzone

packages/contracts/                  # @tierlistbuilder/contracts — cross-runtime wire types
├── lib/                             # ids, theme, themeDefinition
├── workspace/                       # board, boardEnvelope, boardSync, cloudBoard, cloudPreset, settings, tierPreset
└── platform/                        # errors, media, shortLink, user
```

## State Management

Four Zustand stores form the workspace data layer:

**`useActiveBoardStore`** (`features/workspace/boards/model/useActiveBoardStore.ts`) — the single active board. Holds a `BoardSnapshot` (title, tiers, unrankedItemIds, items map, deletedItems) and runtime-only fields (`activeItemId`, `dragPreview`, `keyboardMode`, `keyboardFocusItemId`, `selection`, `runtimeError`, undo/redo stacks). It is an in-memory store with no persist middleware — persistence is orchestrated by `localBoardSession.ts`. The store manages undo/redo history, selection, and the drag preview lifecycle.

**`useWorkspaceBoardRegistryStore`** (`features/workspace/boards/model/useWorkspaceBoardRegistryStore.ts`) — multi-board registry. Uses Zustand `persist` middleware with `partialize` to persist `boards` and `activeBoardId`. Handles create, switch, delete, duplicate, and rename. A debounced subscriber on `useActiveBoardStore` auto-saves the active board's data via the local data layer.

**`useSettingsStore`** (`features/workspace/settings/model/useSettingsStore.ts`) — global user preferences (item size, shape, label visibility, compact mode, label width, theme, palette, text style, reduced motion, toolbar position, etc.). Persisted independently with its own versioned migration.

**`useTierPresetStore`** (`features/workspace/tier-presets/model/useTierPresetStore.ts`) — user-saved tier structure presets. Persisted with versioned migration. Built-in presets (Classic, Top 10, Yes/No/Maybe, etc.) are defined in `tierPresets.ts` and merged at runtime.

### Local persistence layer

Persistence is split across features instead of living in a single monolithic `storage.ts`:

- `features/workspace/boards/data/local/boardStorage.ts` — per-board localStorage I/O, versioned envelopes, typed `ok`/`missing`/`corrupted` load outcomes, quota error messaging
- `features/workspace/boards/data/local/localBoardSession.ts` — session bootstrap, autosave subscription, orchestration between registry & active board
- `features/workspace/settings/data/local/settingsStorage.ts` — settings storage key & schema version
- `features/workspace/tier-presets/data/local/tierPresetStorage.ts` — preset storage key & schema version
- `shared/lib/browserStorage.ts` — generic localStorage wrapper, Zustand persist adapter
- `shared/lib/storageMetering.ts` — quota estimation, near-full warnings

## Drag and Drop

Drag-and-drop uses a **snapshot-based preview** pattern that separates visual feedback from persisted state:

```
1. beginDragPreview()    → captures ContainerSnapshot (tier itemId arrays + unranked itemIds)
2. updateDragPreview()   → applies moves to the snapshot, persisted state untouched
3. getEffectiveTiers()   → overlays snapshot onto persisted tiers for rendering
   getEffectiveUnrankedItemIds()
4a. commitDragPreview()  → writes snapshot into persisted state (on drop)
4b. discardDragPreview() → throws snapshot away (on cancel)
```

**Drag logic** lives under `features/workspace/boards/dnd/`:

- `dragSnapshot.ts` — pure snapshot transforms, container queries, & item movement (`moveItemInSnapshot`, `findContainer`, `getEffectiveTiers`, etc.)
- `dragPointerMath.ts` — pointer/mouse insertion math (`resolveDragTargetIndex`, `resolveNextDragPreview`, etc.)
- `dragKeyboard.ts` — keyboard navigation (`resolveNextKeyboardDragPreview`, `resolveNextKeyboardFocusItem`)
- `dragDomCapture.ts` — DOM reading for rendered layout & positions (`captureRenderedContainerSnapshot`, `resolveIntraContainerRowMove`, etc.)
- `dragCollision.ts`, `dragPreviewController.ts`, `dragDropAnimation.ts`, `dragHelpers.ts`, `dragSensors.ts`, `useDragAndDrop.ts` — dnd-kit wiring, sensors, collision resolution, drop animation, & lifecycle

**Keyboard interaction** lives under `features/workspace/boards/interaction/`:

- `useKeyboardDrag.ts` — item-facing hook consumed by `TierItem`
- `keyboardDragController.ts` — 3-state machine (idle → browse → dragging), arrow key navigation with intra-row and column-aware cross-tier logic
- `keyboardFocus.ts` — RAF-debounced focus restoration helpers

The separation ensures board-input orchestration (selection, focus persistence, board re-entry, drag cancellation) lives in `interaction/` while pure drag helpers live in `dnd/`. Interaction may call into dnd helpers; the reverse is not allowed.

## Routing

`app/routes/AppRouter.tsx` subscribes to `popstate` via `useSyncExternalStore` and selects a route from `resolveAppRoute(pathname)`:

- `/` → `WorkspaceRoute` → `WorkspaceShell` (full editable shell)
- `/embed` → `EmbedRoute` → `EmbedShell` → `EmbedView` (reads `#share=…` fragment, renders read-only board)
- anything else → `NotFoundRoute`

Share links point at the workspace route with a hash fragment; embed iframe URLs point at `/embed#share=…`. The embed route parses the fragment, decodes the serialized board, and renders through `shared/board-ui/` primitives without mounting the editable active-board store.

## Component Hierarchy

```
App (app/App.tsx → AppRouter)
├── WorkspaceRoute → WorkspaceShell
│   ├── BoardHeader                — click-to-edit board title
│   ├── BoardActionBar             — undo/redo, add tier, settings, export, reset
│   │   ├── ActionButton[]         — reusable circular icon buttons
│   │   └── ExportMenu             — export dropdown w/ nested hover submenus
│   ├── TierList                   — DndContext wrapper, tier rows, unranked pool, drag overlay
│   │   ├── TierRow[]              — tier label + sortable item grid + color picker popups
│   │   │   ├── TierLabel          — colored label (editable name)
│   │   │   ├── TierItem[]         — sortable items (delegates keyboard to useKeyboardDrag)
│   │   │   ├── TierRowSettingsMenu — gear button + row settings popup
│   │   │   └── ColorPicker        — fixed-position color swatch popup
│   │   ├── UnrankedPool           — droppable pool for unassigned items
│   │   └── TrashZone              — drag-to-trash (visible during drag)
│   ├── BoardSettingsModal         — tabbed modal shell w/ per-tab subcomponents
│   │   ├── ItemsTab               — import, text items, deleted items
│   │   ├── AppearanceTab          — theme, text style, tier-color sync
│   │   ├── LayoutTab              — item sizing & tier-label layout
│   │   └── MoreTab                — export prefs, storage, shortcuts
│   ├── BoardManager               — floating panel (bottom-right) for board switching
│   ├── PresetPickerModal          — modal for selecting built-in & user tier presets
│   ├── PalettePicker              — palette selector in appearance settings
│   ├── AccountSection             — sign-in / sign-out + sync status
│   ├── SignInModal                — Convex auth entry
│   ├── DragOverlay                — ghost item (uses ItemContent for rendering)
│   ├── ConfirmDialog              — modal for delete confirmations
│   ├── ProgressOverlay            — shared blocking overlay (used for export-all & cloud pull)
│   ├── BulkActionBar              — floating bar for multi-select operations
│   ├── ShortcutsPanel             — help panel listing keyboard shortcuts
│   ├── ToastContainer             — auto-dismissing notifications
│   └── LiveRegion                 — screen reader announcement target
└── EmbedRoute → EmbedShell → EmbedView — read-only iframe view
```

## Popup Positioning

Tier-row popups (`ColorPicker`, `TierRowSettingsMenu`) use `fixed` positioning computed from `getBoundingClientRect()` at open time. This avoids clipping from `overflow-x-auto` on the tier list wrapper. Pure positioning functions live in `shared/overlay/popupPosition.ts`.

Shared overlay behavior lives under `shared/overlay/`: `useDismissibleLayer`, `useAnchoredPosition`, `useFocusTrap`, `useMenuOverflowFlip`, `useModalBackgroundInert`, `useModalDialog`, `useNestedMenus`, `menuClasses`, `uiMeasurements`. `usePopupClose` remains a popup-focused wrapper over the shared dismissal mechanics for tier-row popups.

The shared dismissal layer covers:

- Outside-click dismissal (excluding both popup and trigger from the check)
- Escape key to close
- Scroll and resize-based repositioning

`BoardManager` and `ExportMenu` keep their own anchored layout markup while reusing the shared plumbing.

Toolbar-position-aware submenu class sets live in `shared/layout/toolbarPosition.ts`, consumed by `BoardActionBar`, `ExportMenu`, `TierList`, `useGlobalShortcuts`, and the workspace shell.

## Export Pipeline

**Raster formats** (PNG, JPEG, WebP) — exports render a hidden store-free `StaticExportBoard` in an off-screen React root, then `html-to-image` captures that isolated DOM. Single-board and export-all use the same render session so exports never mutate the live active-board store. A configurable background color is applied. `triggerDownload()` creates a temporary `<a>` element for file download.

**Clipboard** — uses the same isolated export renderer, then writes a PNG blob to the clipboard API.

**PDF** — uses the same isolated export renderer, captures a PNG, then `jsPDF` creates a document sized to match the rendered image dimensions and embeds the rasterized image.

**JSON** — `exportJson.ts` serializes the full `BoardSnapshot` to a downloadable `.json` file. Import accepts both single-board and multi-board JSON envelopes — `parseBoardsJson()` auto-detects the format and validates each board before restoring.

All export lib code lives in `features/workspace/export/lib/`; the UI (`ExportMenu`, `ExportPreviewModal`, `StaticExportBoard`) lives in `features/workspace/export/ui/`; the controller hook is `features/workspace/export/model/useExportController.ts`. Blocking export-all progress uses the shared `ProgressOverlay` at `shared/overlay/`.

## Boundary Rules

- `shared/*` must not import from `features/*`. Shared code is framework-only and feature-agnostic.
- Inside `features/workspace/*`, cross-slice imports are allowed in the direction of structural dependency. `tier-presets` may import board contract types because presets produce boards.
- The embed shell renders through `shared/board-ui/*` primitives only and never mounts the editable active-board store.
- UI (`ui/`) → model (`model/`) → data (`data/{local,cloud}/`). Components don't call localStorage or Convex directly — they go through `model/` selectors or `data/*` helpers.
- Cloud sync orchestration lives in `features/platform/sync/`. Per-slice cloud transport (Convex args, mappers) lives in each slice's `data/cloud/`.

## Types

Types are split between `packages/contracts/` (stable, serializable, cross-runtime) and slice-local `runtime.ts` files (implementation-private, never persisted or sent across boundaries). There is no barrel file — every import points directly at the module that defines the type.

**Contracts (`@tierlistbuilder/contracts`, `packages/contracts/`):**

Anything that crosses a process boundary — localStorage, JSON exports, share links, Convex function arguments/results — lives here:

- `lib/ids.ts` — `BoardId`, `TierId`, `PresetId`, `UserPresetId`, `BuiltinPresetId` template-literal brands; `ItemId` is a nominal brand w/ `asItemId()` cast at trust boundaries. `generate*` ID factories shared across frontend & Convex.
- `lib/theme.ts`, `lib/themeDefinition.ts` — `ThemeId`, `PaletteId`, `TextStyleId`.
- `workspace/board.ts` — `BoardSnapshot`, `Tier`, `TierItem`, `TierColorSpec` (+ palette/custom variants), `NewTierItem`, `BoardMeta`, `BoardSnapshotWire`.
- `workspace/settings.ts` — `AppSettings`, `ItemSize`, `ItemShape`, `LabelWidth`, `TierLabelFontSize`, `ToolbarPosition`.
- `workspace/tierPreset.ts` — `TierPreset`, `TierPresetTier`.
- `workspace/cloudBoard.ts`, `workspace/cloudPreset.ts`, `workspace/boardSync.ts`, `workspace/boardEnvelope.ts` — cloud-sync & envelope wire types.
- `platform/*` — platform-level shared contracts (`errors`, `media`, `shortLink`, `user`).

**Runtime (slice-local `runtime.ts`):**

Types that only live in memory stay in the frontend tree, collocated w/ the stores that use them:

- `features/workspace/boards/model/runtime.ts` — `ContainerSnapshot`, `ContainerSnapshotTier`, `KeyboardMode`, `ActiveBoardRuntimeState`, `freshRuntimeState`, `ItemRecord`.
- `features/workspace/export/model/runtime.ts` — `ImageFormat`, `ExportAppearance`.

`BoardSnapshot` is the canonical serializable board shape. `ContainerSnapshot` is the runtime-only lightweight ordering used during drag preview — it mirrors tier/unranked item ID arrays without carrying full tier metadata.
