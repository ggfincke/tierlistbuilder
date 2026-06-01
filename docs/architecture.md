# Architecture

## Stack

| Layer        | Technology                                           |
| ------------ | ---------------------------------------------------- |
| UI           | React 19 + TypeScript 5.9                            |
| Build        | Vite 7                                               |
| Styling      | Tailwind CSS 4 (`@tailwindcss/vite` plugin)          |
| State        | Zustand 5 (persisted to localStorage)                |
| Drag & drop  | @dnd-kit/core + @dnd-kit/sortable                    |
| Icons        | lucide-react                                         |
| Image export | html-to-image (PNG/JPEG/WebP)                        |
| PDF export   | jsPDF                                                |
| Compression  | pako (share-link payloads)                           |
| Backend      | Convex + @convex-dev/auth + @convex-dev/rate-limiter |
| Unit testing | Vitest                                               |
| E2E testing  | Playwright                                           |
| Deployment   | Cloudflare Workers (via `@cloudflare/vite-plugin`)   |

## Directory Structure

The codebase is organized into three top-level frontend layers: `app/`
(bootstrap & routing), `features/{workspace,platform,marketplace,library,embed}/*`
(per-slice feature code), and `shared/*` (cross-feature primitives).
Cross-runtime wire types live in the top-level `packages/contracts/` workspace
package.

```
src/
├── app/
│   ├── App.tsx                      # root component — delegates to AppRouter
│   ├── main.tsx                     # React mount
│   ├── index.css                    # Tailwind entry
│   ├── bootstrap/
│   │   └── useAppBootstrap.ts       # hydrate stores, bootstrap session, register autosave
│   ├── routes/
│   │   ├── AppRouter.tsx            # React Router route tree
│   │   ├── WorkspaceRoute.tsx       # workspace entry
│   │   ├── EmbedRoute.tsx           # embed entry
│   │   ├── MyBoardsRoute.tsx         # library entry
│   │   ├── NotFoundRoute.tsx        # 404 fallback
│   │   └── AppChromeLayout.tsx      # chrome wrapper for app routes
│   ├── shells/
│   │   ├── top-nav/                  # fixed global chrome composition, route pills, account menu
│   │   ├── workspace/               # editable workspace shell, modal layer, export actions
│   │   └── useModalStack.ts         # keyed modal state helper
│   └── sync/                        # app-level cloud sync orchestration and auth-epoch lifecycle
├── features/workspace/
│   ├── annotation/{model,ui}        # draw-over annotation editor
│   ├── boards/
│   │   ├── data/
│   │   │   ├── local/               # per-board localStorage I/O + sync/delete sidecars
│   │   │   └── cloud/               # Convex board repo/mapper, pull/flush/merge, scheduler
│   │   ├── dnd/                     # dnd-kit wiring, sensors, pointer math, layout sessions
│   │   ├── interaction/             # keyboard drag controller, focus restore, useKeyboardDrag
│   │   ├── lib/                     # dndIds, containerLabel
│   │   ├── model/                   # active board store, registry, session facade, conflicts, snapshot ops
│   │   └── ui/
│   │       ├── board-chrome/        # BoardHeader, BoardActionBar, BoardManager, badges, bulk actions
│   │       ├── tier-list/           # TierList, TierRow, TierLabel, UnrankedPool, TrashZone
│   │       ├── items/               # TierItem and item context menu
│   │       ├── menus/               # row/save/color popups
│   │       ├── modals/              # board conflict and recently deleted dialogs
│   │       └── drag-overlay/        # dnd-kit overlay renderers
│   ├── export/{lib,model,ui}        # PNG/JPEG/WebP/PDF/JSON export + preview + progress
│   ├── image-editor/
│   │   ├── lib/                     # crop geometry, label options, & measurement helpers
│   │   ├── model/
│   │   │   ├── transform/           # transform drafts, pan, wheel zoom, arrow nudge, selected-item handlers
│   │   │   ├── auto-crop/           # bulk and single-item auto-crop hooks
│   │   │   ├── labels/              # label drafts and label-aware aspect measurement
│   │   │   └── *.ts                 # open/filter store, item filtering, selection, modal actions
│   │   └── ui/                      # modal, pane, rail, preview canvas, footer, label controls
│   ├── preview/{model,ui}           # read-only board previews, cover assets, and preview shells
│   ├── settings/
│   │   ├── lib/                     # image upload constants & helpers
│   │   ├── model/
│   │   │   ├── aspect-ratio/        # prompt context/provider/state/import and ratio picker state
│   │   │   ├── auto-crop/           # prompt-level auto-crop controller and trim preference
│   │   │   └── *.ts                 # board overrides, palette selectors, image import
│   │   └── ui/
│   │       ├── aspect-ratio/        # prompt modal, ratio pickers, tiles, mismatch previews
│   │       ├── auto-crop/           # trim-shadow control shared by settings/editor
│   │       └── *.tsx                # BoardSettingsModal and remaining board-specific tab content
│   ├── sharing/ui                   # ShareModal, RecentSharesModal
│   ├── shortcuts/{lib,model,ui}     # keyboard shortcut registry, panel, list
│   ├── sync/                        # workspace-owned sync session, adapters, pending sidecar recovery
│   ├── stats/{model,ui}             # board statistics & distribution chart
│   └── tier-presets/                # reusable tier structures (local + cloud storage, independent of boards)
│       ├── data/{local,cloud}       # preset storage key; Convex preset sync
│       ├── model/                   # tier preset store, built-in presets
│       └── ui/                      # PresetPickerModal, SavePresetModal
├── features/platform/
│   ├── auth/{model,ui}              # SignInModal, account profile sections, profile draft helpers, Convex auth wiring
│   ├── media/                       # imageFetcher, imageUploader, Convex upload repository
│   ├── preferences/                 # global preferences store, sync, theme hooks, modal
│   ├── profile/{pages,ui}           # public profile route, header, authored templates, tlotl showcase
│   ├── settings/{model,pages,ui}    # signed-in account settings and account-management panels
│   ├── share/                       # short-link repository, URL builders, inbound share resolver
│   ├── showcase/{model,pages,ui}    # profile showcase editor, save scheduler, and snapshot transforms
│   └── sync/
│       ├── lib/                     # cloudSyncConfig, concurrency, convexClient, crossTabSyncLock, errors, first-login lifecycle
│       ├── state/                   # syncStatusStore, syncStatusVisuals, cloud pull progress
│       └── transport/               # connectivity detection
├── features/marketplace/            # templates, ranking publish/detail/remix, gallery flows
│   ├── data/                        # Convex repositories for gallery, detail, publish, and ranking reads/writes
│   ├── pages/                       # route-entry pages for gallery, detail, compare, publish, and account views
│   ├── ui/                          # account, cards, consensus, cover, discovery, layout, meta, publish, template
│   │   └── consensus/{views,rail,criterion,item,lib,compare}/
│   └── model/{gallery,detail,publish,remix,cover,analytics,actions}/
├── features/library/                # signed-in My Boards surface
│   ├── lib/                         # board-list grouping, filtering, and view helpers
│   ├── model/                       # local/cloud library adapters and board deletion hooks
│   ├── pages/                       # route-entry My Boards page
│   └── ui/{cards,list,chrome,chips,modals}/
├── features/embed/ui                # read-only EmbedView primitives
└── shared/
    ├── a11y/                        # announce() module, LiveRegion component
    ├── board-data/                  # default board, snapshot normalizer, JSON/wire parsers
    ├── board-ui/                    # BoardPrimitives, ItemContent, shared board rendering, cover framing, constants
    ├── catalog/                     # compact count/date/estimate formatters + URL filter helpers
    ├── hooks/                       # useClipboardCopy, useInlineEdit, useImageUrl
    ├── images/                      # imageStore, imageBlobCache, imagePersistence, imageLoad
    ├── lib/                         # color, math, fileName, className, pluralize, downloadBlob,
    │                                # browserStorage, logger, urls, typeGuards,
    │                                # asyncMapLimit, binaryCodec, boardSnapshotItems, errors,
    │                                # localSidecar, sha256, sync/ (debouncedSyncRunner,
    │                                # ownedSyncMeta, backoff, proceedGuard),
    │                                # auto-crop/ (pipeline, cache & transforms-runner hooks)
    ├── notifications/               # ToastContainer, useToastStore
    ├── overlay/                     # BaseModal, ConfirmDialog, toolbarPosition, progress, focus/inert dialog wiring,
    │                                # dismissible layers, anchored popups, menu overflow, nested menus
    ├── routes/                      # base-path-aware route constants/path builders
    ├── selection/                   # useRovingSelection, selectionNavigation, selectionState
    ├── sharing/                     # hash-fragment compression & short-link snapshot codecs
    ├── theme/                       # tokens, palettes, textStyles, runtime, tierColors
    └── ui/                          # ActionButton, Button, buttonBase, PrimaryButton, SecondaryButton,
                                     # ColorInput, ErrorBoundary, PickerGrid, SettingsSection,
                                     # settings controls, TextArea, TextInput, UploadDropzone

packages/contracts/                  # @tierlistbuilder/contracts — cross-runtime wire types
├── lib/                             # ids, theme, math, pagination, strings, sha256, type guards
├── marketplace/                     # templates, rankings, aggregates, seed pipeline, categories, criteria
├── workspace/                       # board, image math, envelopes, sync, cloud boards/presets, tier presets
└── platform/                        # errors, media, preferences, profile/showcase, short links, uploads, users
```

## Repo Root & Tooling

Root-level directories outside `src/` are also part of the architecture surface:

```
config/                              # shared build/test aliases and tool glue
docs/                                # shipped architecture and design-system docs
dev-docs/                            # local-only audits, plans, and scratch docs; gitignored
eslint-rules/                        # custom comment-style lint rules
scripts/                             # repo utilities, screenshots, cover previews, seed pipeline CLI
scripts/lib/                         # shared Node script helpers
scripts/seed_pipeline/               # Python seed-pipeline package and dev-reset tooling
tests/                               # Vitest unit/integration tests
e2e/                                 # Playwright browser smoke and guardrail tests
```

`docs/` is the committed, maintained documentation home. `dev-docs/` is for
local working notes and generated audits; it is excluded in `.gitignore` so
scratch planning files do not appear in fresh clones or CI. Tooling that spans
multiple runtimes should live under `config/`, `scripts/`, or `eslint-rules/`
rather than a feature slice.

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
- `features/workspace/boards/data/local/storageMetering.ts` — quota estimation, near-full warnings
- `features/platform/preferences/data/local/preferencesStorage.ts` — preference storage key & schema version
- `features/workspace/tier-presets/data/local/tierPresetStorage.ts` — preset storage key & schema version
- `shared/lib/browserStorage.ts` — generic localStorage wrapper, Zustand persist adapter
- `shared/lib/sync/ownedSyncMeta.ts` — shared owner-scoped pending/synced timestamp helpers for preference and preset sidecars

Pre-1.0 storage changes are allowed to be breaking. Incompatible localStorage or
IndexedDB payloads should be wiped by version reset/recreation instead of
converted forward, while JSON/share import validation should continue rejecting
malformed or unsupported files.

Local images live in `shared/images/imageStore.ts` as content-addressed blobs.
Imported items keep a small display blob plus an optional editor source blob.
Board saves update board-scoped blob refs; workspace bootstrap reconciles refs
from all local snapshots and prunes unreferenced blobs after the local image GC
grace window. IndexedDB schema changes use a reset, not old-blob migration.

## Cloud Sync

Cloud sync is split between app-level orchestration, platform infrastructure,
and workspace adapters:

- `app/sync/createAppSyncSession.ts` owns startup wiring: online/offline connectivity, auth-epoch lifetime, sync-status store setup, and the workspace sync session.
- `app/sync/useCloudSync.ts` mounts that session from the route chrome.
- `features/platform/sync/{lib,state,transport}/` stays foundational: Convex client access, concurrency constants, cross-tab locks, errors, sync status/progress state, and connectivity detection. It must not import workspace, marketplace, or library slices.
- `features/workspace/sync/workspaceSyncSession.ts` owns workspace sync adapters for boards, preferences, tier presets, board deletes, pending sidecar recovery, first-login workspace merges, and conflict queueing.
- `features/workspace/sync/useWorkspaceBoardSyncSubscriber.ts` observes active board edits and forwards `PendingBoardSync` work into the workspace session after the first-login board merge gate opens.
- `features/workspace/sync/useWorkspaceBoardSyncStatus.ts` is the board-aware status hook. It composes platform status state with workspace conflict state so platform sync remains product-slice agnostic.
- Per-slice cloud transport remains under `features/workspace/*/data/cloud/`; platform orchestration does not import those modules directly.
- `shared/lib/sync/debouncedSyncRunner.ts` is the shared debounce/retry kernel. Preferences and presets use it directly; board sync wraps it through `cloudSyncScheduler.ts` for peer-tab locks, conflict pauses, pending marker persistence, and permanent-error cleanup.

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

`app/routes/AppRouter.tsx` owns the React Router tree and lazy-loads marketplace, library, and embed route chunks:

- `/` -> `WorkspaceRoute` -> `WorkspaceShell` (full editable shell)
- `/templates` -> `MarketplaceLayout` -> template gallery
- `/templates/:slug` -> template detail
- `/boards` -> `MyBoardsRoute` -> signed-in library
- `/embed` -> `EmbedRoute` -> `EmbedView`
- anything else -> `NotFoundRoute`

Base-path-aware route constants and URL builders live in `shared/routes/pathname.ts` so feature slices can link without importing the app router.

Two share-link carriers land on these routes:

- **Short-link query (`?s=<slug>`, primary).** `createBoardShortLink` strips deleted items, converts live image refs into inline JSON wire bytes, rejects payloads above `MAX_SNAPSHOT_COMPRESSED_BYTES` before upload, then uploads the compressed snapshot to Convex storage & mints a slug. `getShareUrlFromSlug` and `getEmbedUrlFromSlug` live in `features/platform/share/shortLinkShare.ts`.
- **Hash fragment (`#share=<base64url>`, fallback).** The snapshot strips image refs and deleted items, then compresses directly into a base64url URL fragment via `encodeBoardToShareFragment` in `shared/sharing/hashShare.ts`.

`features/platform/share/inboundShare.ts` resolves the current URL into a `BoardSnapshot`. Workspace bootstrap imports the result into the active board session; embed normalizes it and renders through `shared/board-ui/*` without mounting the editable active-board store.

## Component Hierarchy

```
App (app/App.tsx → AppRouter)
├── AppTopNav                       — fixed global chrome shell
│   ├── SurfaceNav                  — Workspace/Templates route pills
│   ├── TopNavAccountControl        — avatar trigger, account menu, sign-out
│   └── TopNavModalLayer            — lazy SignIn/Account/Preferences launchers
├── WorkspaceRoute → WorkspaceShell
│   ├── BoardHeader                — click-to-edit board title
│   ├── BoardActionBar             — undo/redo, add tier, settings, export, reset, share
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
│   │   ├── ItemsTab               — import, text items, deleted items (+ DeletedItemsSection)
│   │   ├── AppearanceTab          — theme, text style, tier-color sync
│   │   │   ├── ThemePicker
│   │   │   ├── PalettePicker
│   │   │   └── TextStylePicker
│   │   ├── LayoutTab              — item sizing, tier-label layout, aspect ratio
│   │   │   ├── AspectRatioSection → AspectRatioPicker → AspectRatioTiles
│   │   │   ├── SegmentedControl
│   │   │   ├── Toggle, SettingRow
│   │   │   └── ImageUploader
│   │   └── MoreTab                — export prefs, storage, shortcuts
│   ├── BoardManager               — floating panel (bottom-right) for board switching
│   │   └── BoardSyncBadge         — per-board sync status badge
│   ├── PresetPickerModal          — modal for selecting built-in & user tier presets
│   ├── SavePresetModal            — save current tiers as a user preset
│   ├── RecentlyDeletedModal       — restore soft-deleted boards within retention window
│   ├── AspectRatioIssueModal      — blocking mixed-ratio warning dialog
│   ├── ConflictResolverModal      — board sync conflict resolution (cloud vs. local)
│   ├── ShareModal                 — generate short link, copy share / embed URLs
│   ├── RecentSharesModal          — list & revoke live snapshot shares
│   ├── StatsModal                 — board statistics
│   │   └── TierDistributionChart  — per-tier item counts
│   ├── AnnotationEditor           — draw-over overlay editor
│   │   ├── AnnotationCanvas
│   │   └── AnnotationToolbar
│   ├── ItemEditPopover            — inline item label & background editor
│   ├── SyncStatusIndicator        — global cloud sync state indicator
│   ├── DragOverlay → DragOverlayItem — ghost item (uses ItemContent for rendering)
│   ├── ConfirmDialog              — shared modal for destructive confirmations
│   ├── ProgressOverlay            — shared blocking overlay (export-all, cloud pull)
│   ├── BulkActionBar              — floating bar for multi-select operations
│   ├── ShortcutsPanel → ShortcutsList — help panel listing keyboard shortcuts
│   ├── ToastContainer             — auto-dismissing notifications
│   └── LiveRegion                 — screen reader announcement target
└── EmbedRoute → EmbedView — read-only iframe view
```

## Overlay System

`shared/overlay/` is split by responsibility so modal surfaces, focus
management, popups, and menu behavior can change independently:

- **Dialog surfaces:** `BaseModal.tsx`, `ConfirmDialog.tsx`, `ProgressOverlay.tsx`, `LazyModalSlot.tsx`, `ModalHeader.tsx`, `DialogActions.tsx`, `OverlaySurface.tsx`, and `progress.ts`.
- **Modal behavior:** `modalDialog.ts`, `focusTrap.ts`, and `modalLayer.ts` own Escape handling, focus containment, app-shell inert state, and scroll locking. The keyed modal stack lives in `app/shells/useModalStack.ts`.
- **Popup/menu behavior:** `dismissibleLayer.ts`, `anchoredPopup.ts`, `popupPosition.ts`, `uiMeasurements.ts`, `menuOverflow.ts`, and `nestedMenus.ts` own outside interaction, positioning, overflow flipping, and submenu state.

Tier-row popups (`ColorPicker`, `TierRowSettingsMenu`) compute their position via `popupPosition.ts` at open time. `BoardManager` and `ExportMenu` keep their own anchored layouts but reuse dismissal and overflow helpers. `BoardSettingsModal`, `PresetPickerModal`, `ShareModal`, `RecentSharesModal`, `RecentlyDeletedModal`, `AspectRatioIssueModal`, `ConflictResolverModal`, and `SignInModal` all build on `BaseModal`.

Toolbar-position-aware submenu class sets live in `shared/overlay/toolbarPosition.ts`, consumed by `BoardActionBar`, `ExportMenu`, `TierList`, `useGlobalShortcuts`, and the workspace shell.

## Theming

See **[`docs/design-system.mdx`](design-system.mdx)** for the runtime token contract, primitive picker, and overlay composition rules. 8 color themes + 5 text styles, controlled via CSS custom properties (`--t-*` for colors, `--ts-*` for typography). Theme definitions live in `src/shared/theme/`:

- `tokens.ts` — `--t-*` color tokens applied at `:root`
- `palettes.ts` — tier-color palettes
- `textStyles.ts` — font-family & weight tokens
- `runtime.ts` — `applyThemeTokens` / `applyTextStyleTokens` DOM writers
- `tierColors.ts` — `TierColorSpec` resolution against the active palette

The `useThemeSync` hook (`features/platform/preferences/model/useThemeSync.ts`) syncs `themeId` and `textStyleId` from `usePreferencesStore` to `:root`. `WorkspaceShell` layers board text-style overrides through `useBoardThemeOverrides()`. `EmbedRoute` calls `useLockedTheme('scoreboard', 'default')` so embed iframes render stable chrome tokens regardless of the host's preference, while `EmbedView` keeps the neutral `classic` tier palette. Non-system fonts are loaded dynamically from Google Fonts.

## Export Pipeline

**Raster formats** (PNG, JPEG, WebP) — exports render a hidden store-free `StaticExportBoard` in an off-screen React root, then `html-to-image` captures that isolated DOM. Single-board and export-all use the same render session so exports never mutate the live active-board store. A configurable background color is applied. `triggerDownload()` creates a temporary `<a>` element for file download.

**Clipboard** — uses the same isolated export renderer, then writes a PNG blob to the clipboard API.

**PDF** — uses the same isolated export renderer, captures a PNG, then `jsPDF` creates a document sized to match the rendered image dimensions and embeds the rasterized image.

**JSON** — `exportJson.ts` serializes the full `BoardSnapshot` to a downloadable `.json` file, embedding live and deleted item image bytes so files are self-contained. Import accepts both single-board and multi-board JSON envelopes — `parseBoardsJson()` auto-detects the format and validates each board before restoring.

All export lib code lives in `features/workspace/export/lib/`; the UI (`ExportMenu`, `ExportPreviewModal`, `StaticExportBoard`) lives in `features/workspace/export/ui/`; the controller hook is `features/workspace/export/model/useExportController.ts`. Blocking export-all progress uses the shared `ProgressOverlay` at `shared/overlay/`.

Share/export image behavior is intentionally split by carrier:

- JSON export preserves live and deleted item images via inline bytes.
- Short links preserve live item images via inline bytes, but drop deleted items.
- Hash-fragment shares drop image refs and deleted items to keep URLs bounded.
- Cloud sync preserves images through Convex media assets, not share snapshots.

## Boundary Rules

- `shared/*` must not import from `features/*`. Shared code is framework-only and feature-agnostic.
- `shared/board-data/*`, `shared/board-ui/*`, `shared/sharing/*`, and `shared/routes/*` are the neutral homes for current board snapshot, rendering, share-codec, and route-path helpers.
- The embed shell resolves shares through `features/platform/share/*`, renders through `shared/board-ui/*`, and never mounts the editable active-board store.
- Workspace owns activation of cloud-backed boards via `features/workspace/boards/model/cloudBoardActivation.ts`; marketplace/library callers do not reach through workspace persistence internals directly.
- Workspace exposes publishable-board scanning via `features/workspace/boards/model/usePublishableBoards.ts`; marketplace publish UI does not read board storage directly.
- UI (`ui/`) → model (`model/`) → data (`data/{local,cloud}/`). Components don't call localStorage or Convex directly — they go through `model/` selectors or `data/*` helpers.
- Platform sync owns auth/connectivity/status primitives only; app sync composes those primitives with workspace sessions.
- Per-slice cloud transport (Convex args, mappers) lives in the owning slice. Platform media and share repositories own storage upload URLs, media finalization, and short-link lookups.
- `app/sync/*` is the only place allowed to compose platform sync infrastructure with workspace sessions. Keep product-slice imports out of `features/platform/sync/*`.
- `SaveOrPublishMenu` may preload the marketplace publish modal to reduce perceived latency, but that edge is a lazy-loader hint only; workspace UI must not call marketplace runtime logic directly.
- Share code intentionally has three homes: `features/platform/share/*` for short-link data access, `features/workspace/sharing/ui/*` for workspace dialogs, and `shared/sharing/*` for pure codecs plus the compression worker.

## Types

Types are split between `packages/contracts/` (stable, serializable, cross-runtime) and slice-local `runtime.ts` files (implementation-private, never persisted or sent across boundaries). There is no barrel file — every import points directly at the module that defines the type.

**Contracts (`@tierlistbuilder/contracts`, `packages/contracts/`):**

Anything that crosses a process boundary — localStorage, JSON exports, share links, Convex function arguments/results — lives here:

- `lib/ids.ts` — `BoardId`, `TierId`, `PresetId`, `UserPresetId`, `BuiltinPresetId` template-literal brands; `ItemId` is a nominal brand w/ `asItemId()` cast at trust boundaries. `generate*` ID factories shared across frontend & Convex.
- `lib/theme.ts`, `lib/themeDefinition.ts`, `lib/hexColor.ts` — theme, palette, text-style, and hex-color primitives.
- `lib/math.ts`, `lib/pagination.ts`, `lib/publicTier.ts`, `lib/strings.ts`, `lib/typeGuards.ts`, `lib/sha256.ts` — shared runtime primitives used across domains and runtimes.
- `marketplace/category.ts` and `marketplace/templateCriterion.ts` — template category and criterion taxonomies shared by contracts, Convex validators, and UI filters.
- `marketplace/template.ts`, `marketplace/ranking.ts`, `marketplace/rankingAggregate.ts`, `marketplace/seedPipeline.ts` — public template/ranking read models, aggregate payloads, publish/remix contracts, and seed ingest wire types.
- `platform/preferences.ts` — `AppPreferences`, `ItemSize`, `ItemShape`, `LabelWidth`, `TierLabelFontSize`, `ToolbarPosition`.
- `platform/errors.ts`, `platform/media.ts`, `platform/profile.ts`, `platform/showcase.ts`, `platform/shortLink.ts`, `platform/user.ts` — platform-level shared contracts.
- `platform/uploadEnvelope.ts` — prefixed header binding an upload blob to its purpose, owner, & signed token so intercepted `(storageId, token)` pairs can't cross-account finalize.
- `workspace/board.ts` — `BoardSnapshot`, `Tier`, `TierItem`, `TierColorSpec` (+ palette/custom variants), `NewTierItem`, `BoardMeta`, `BoardSnapshotWire`, and library board read models.
- `workspace/imageMath.ts` — item transform, aspect-ratio, and auto-crop math mirrored by the Python seed pipeline.
- `workspace/tierPreset.ts` — `TierPreset`, `TierPresetTier`.
- `workspace/cloudBoard.ts`, `workspace/cloudPreset.ts`, `workspace/boardSync.ts`, `workspace/boardEnvelope.ts` — cloud-sync & envelope wire types.

**Runtime (slice-local `runtime.ts`):**

Types that only live in memory stay in the frontend tree, collocated w/ the stores that use them:

- `features/workspace/boards/model/runtime.ts` — `ContainerSnapshot`, `KeyboardMode`, `ActiveBoardRuntimeState`, and runtime-state factories.
- `features/workspace/export/model/runtime.ts` — `ImageFormat`, `ExportAppearance`.

`BoardSnapshot` is the canonical serializable board shape. `ContainerSnapshot` is the runtime-only lightweight ordering used during drag preview — it mirrors tier/unranked item ID arrays without carrying full tier metadata.

## Backend

The Convex backend lives in `convex/` and is namespaced into `workspace/{boards,sync,tierPresets}`, `platform/{media,preferences,shortLinks}`, and `marketplace/{templates,rankings}`. Schema, auth wiring (`@convex-dev/auth`), rate-limiter registration (`@convex-dev/rate-limiter`), scheduled GC (`crons.ts`), and shared handler helpers (`convex/lib/*`) all live alongside. See **[`convex/README.md`](../convex/README.md)** for first-time setup, env vars, function-namespace conventions, and schema-versioning policy.

Convex validators are exposed through domain entrypoints under
`convex/lib/validators/{common,workspace,platform,marketplace,seedPipeline}.ts`.
Each file owns the validator definitions and contract-mirror assertions for its
domain. `common.ts` is limited to cross-domain primitives such as theme IDs,
tier color specs, item transforms, tier preset rows, and label settings.

Marketplace ranking backend files are grouped by workflow:

- `marketplace/rankings/public/` — public queries and mutations.
- `marketplace/rankings/aggregate/` — aggregate computation helpers and scheduled jobs.
- `marketplace/rankings/seed/` — seed manifest validators, planning, scoring, lifecycle, cleanup, and seed actions.
- `marketplace/rankings/maintenance/` — owner/data cascade jobs.

Marketplace template helpers are split by responsibility under
`marketplace/templates/lib/`:

- `normalize.ts` — input normalization, validation, defaults.
- `trending.ts` — trending-score math, metric-day bucketing, projection cache.
- `state.ts` — publication/access-state predicates & state-field builders.
- `board.ts` — template-to-board tier/item materialization.
- `projections.ts` — read-side projections: media/author/item loaders, stats reads, & summary/detail/draft/card shaping.
- `writes.ts` — table writes & lifecycle: stats/cards/tags writes, publication-state mutations, deletes, & slug allocation.

Key boundary: **UI components never call Convex directly**. Every query & mutation flows through a per-feature adapter, platform repository, or auth hook. This keeps wire types, error surfaces, and retry policy out of the UI layer.

Schema (`convex/schema.ts`) defines the app-owned tables alongside `@convex-dev/auth`'s `authTables`:

- `users` — extends auth-managed fields w/ app-owned `displayName`, `avatarStorageId`, `tier`, timestamps.
- `userPreferences` — per-user mirror of `AppPreferences`.
- `boards` — owner-scoped boards w/ revision, source-template link, soft-delete tombstone, aspect-ratio fields, and per-board style overrides.
- `boardTiers` / `boardItems` — ordered rows keyed by fractional `order` numbers. `boardItems` carry `aspectRatio` & `imageFit` overrides.
- `mediaAssets` — uploaded image metadata, content-hash deduplicated, indexed by owner + hash.
- `tierPresets` — reusable tier structures owned by a user.
- `shortLinks` — share-link slug indirection backed by compressed snapshot blobs in `_storage`, TTL-swept via cron.
- `templates` / `templateItems` / `templateTags` — public/unlisted marketplace templates, item snapshots, tag rows, and fork tracking.
- `templateCards` / `templateStats` / `templateMetricDays` — denormalized gallery cards, all-time counts, and rolling daily metrics for trending sort/rails.
- `marketplaceStats` — singleton marketplace aggregate counters used by gallery category chips.
- `publishedRankings` / `publishedRankingTiers` / `publishedRankingItems` — immutable ranking snapshots published from completed template-backed boards and used by ranking detail/remix flows.

Marketplace seed ingest runs through dedicated HTTP endpoints under
`/api/seed/*`. They fail closed unless `CONVEX_SEED_ENABLED=true` and the
caller sends the deployment's `CONVEX_SEED_SECRET` as a bearer authorization
header.

`npm run db:reset -- --yes`
(`python -m seed_pipeline.dev_reset` under `scripts/seed_pipeline/` →
`/api/dev/reset` → `convex/dev/reset.ts`) wipes every user table and `_storage`
blob for fast dev iteration. Schema is preserved. Server-side it requires
`CONVEX_DEV_RESET_ALLOWED=true` plus a typed confirm token derived from the
deployment URL; the client refuses to call it when `CONVEX_DEPLOYMENT` starts
with `prod:`.

Account deletion and sign-out-everywhere cleanup schedule one paginated auth
cleanup step per Convex mutation, then continue through internal scheduled
functions. The client clears its local auth token after scheduling so browser
state updates immediately while backend-owned data cleanup finishes out of band.

## Testing

Unit & integration tests live under `tests/` and run via Vitest. End-to-end Playwright tests live under `e2e/` and are excluded from the Vitest run. See **[`tests/README.md`](../tests/README.md)** for the full test inventory, fixtures, and the "major & important only" philosophy that gates new tests.

- `npm test` — Vitest single pass
- `npm run test:watch` — Vitest watch mode
- `npm run test:e2e` — Playwright smoke + guardrails for workspace, image-editor persistence, account profile/delete, embed, marketplace filters, signed-in publish/use-template, and My Boards activation (requires `npx playwright install chromium` once; config prepares local Convex Auth)
- `npm run test:e2e:ui` — Playwright headed runner
- `npm run audit:dead-code` — Knip unused dependency/export/file audit

Docs are part of the maintenance surface: when a consolidation pass changes
slice ownership, public contracts, or test coverage, update this file and
`tests/README.md` in the same change.
