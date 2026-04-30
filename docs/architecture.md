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

The codebase is organized into three top-level layers: `app/` (bootstrap & routing), `features/{workspace,platform,marketplace,library,embed}/*` (per-slice feature code), and `shared/*` (cross-feature primitives). Cross-runtime wire types live in the top-level `packages/contracts/` workspace package. See `dev-docs/archive/directory-restructure-proposal.mdx` for the long-form rationale.

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
│   │   ├── AppRouter.tsx            # React Router route tree
│   │   ├── WorkspaceRoute.tsx       # workspace entry
│   │   ├── EmbedRoute.tsx           # embed entry
│   │   ├── MyListsRoute.tsx         # library entry
│   │   ├── NotFoundRoute.tsx        # 404 fallback
│   │   └── AppChromeLayout.tsx      # chrome wrapper for app routes
│   └── shells/
│       ├── WorkspaceShell.tsx       # full editable workspace shell
│       ├── WorkspaceModalLayer.tsx  # workspace modal/conflict/progress composition
│       ├── useWorkspaceExportActions.ts # export preview + annotation actions
│       ├── useModalStack.ts         # keyed modal state helper
│       ├── workspaceModals.ts       # workspace modal payload map
│       └── EmbedShell.tsx           # read-only embed shell
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
│   │   └── ui/                      # TierList, TierRow, TierItem, BoardHeader, BoardActionBar, etc.
│   ├── export/{lib,model,ui}        # PNG/JPEG/WebP/PDF/JSON export + preview + progress
│   ├── settings/
│   │   ├── data/{local,cloud}       # settings storage key + Convex sync
│   │   ├── lib/                     # image upload constants & helpers
│   │   ├── model/                   # settings store, palette selector, aspect ratio, image import
│   │   └── ui/                      # BoardSettingsModal & tabbed content
│   ├── sharing/ui                   # ShareModal, RecentSharesModal
│   ├── shortcuts/{lib,model,ui}     # keyboard shortcut registry, panel, list
│   ├── sync/                        # workspace-owned sync session, adapters, pending sidecar recovery
│   ├── stats/{model,ui}             # board statistics & distribution chart
│   └── tier-presets/                # reusable tier structures (local + cloud storage, independent of boards)
│       ├── data/{local,cloud}       # preset storage key; Convex preset sync
│       ├── model/                   # tier preset store, built-in presets
│       └── ui/                      # PresetPickerModal, SavePresetModal
├── features/platform/
│   ├── auth/{model,ui}              # SignInModal, account UI, Convex auth wiring
│   ├── media/                       # imageFetcher, imageUploader, Convex upload repository
│   ├── share/                       # short-link repository, URL builders, inbound share resolver
│   └── sync/
│       ├── lib/                     # cloudSyncConfig, concurrency, convexClient, crossTabSyncLock, errors
│       ├── orchestration/           # createSyncSession, firstLoginSyncLifecycle, useCloudSync, auth epoch
│       ├── state/                   # syncStatusStore, syncStatusVisuals, useBoardSyncStatus
│       └── transport/               # connectivity detection
├── features/marketplace/            # template gallery, publish, use-template flows
├── features/library/                # signed-in My Lists surface
├── features/embed/ui                # read-only EmbedView primitives
└── shared/
    ├── a11y/                        # announce() module, LiveRegion component
    ├── board-data/                  # default board, snapshot normalizer, JSON/wire parsers
    ├── board-ui/                    # BoardPrimitives, ItemContent, ItemOverlayButton, StaticBoard, boardTestIds, constants
    ├── catalog/                     # compact count/date/estimate formatters
    ├── hooks/                       # useClipboardCopy, useInlineEdit, useImageUrl, useViewportWidth
    ├── images/                      # imageStore, imageBlobCache, imagePersistence, imageLoad
    ├── layout/                      # toolbarPosition (cross-feature menu chrome math)
    ├── lib/                         # color, colorName, math, fileName, className, pluralize, downloadBlob,
    │                                # browserStorage, storageMetering, logger, urls, typeGuards,
    │                                # asyncMapLimit, binaryCodec, boardSnapshotItems, errors,
    │                                # localSidecar, scheduleIdle, sha256, sync/ (debouncedSyncRunner,
    │                                # ownedSyncMeta, backoff, proceedGuard)
    ├── notifications/               # ToastContainer, useToastStore
    ├── overlay/                     # BaseModal, ConfirmDialog, progress, focus/inert dialog wiring,
    │                                # dismissible layers, anchored popups, menu overflow, nested menus
    ├── routes/                      # base-path-aware route constants/path builders
    ├── selection/                   # useRovingSelection, selectionNavigation, selectionState
    ├── sharing/                     # hash-fragment compression & short-link snapshot codecs
    ├── theme/                       # tokens, palettes, textStyles, runtime, tierColors, zIndex
    └── ui/                          # ActionButton, Button, buttonBase, PrimaryButton, SecondaryButton,
                                     # ColorInput, ErrorBoundary, PickerGrid, SettingsSection,
                                     # TextArea, TextInput, UploadDropzone

packages/contracts/                  # @tierlistbuilder/contracts — cross-runtime wire types
├── lib/                             # ids, theme, themeDefinition
├── marketplace/                     # public template marketplace contracts + category taxonomy
├── workspace/                       # board, boardEnvelope, boardSync, cloudBoard, cloudPreset, settings, tierPreset
└── platform/                        # errors, media, shortLink, uploadEnvelope, user
```

## State Management

Four Zustand stores form the workspace data layer:

**`useActiveBoardStore`** (`features/workspace/boards/model/useActiveBoardStore.ts`) — the single active board. Holds a `BoardSnapshot` (title, tiers, unrankedItemIds, items map, deletedItems) and runtime-only fields (`activeItemId`, `dragPreview`, `keyboardMode`, `keyboardFocusItemId`, `selection`, `runtimeError`, undo/redo stacks). It is an in-memory store with no persist middleware — persistence is orchestrated by `features/workspace/boards/model/boardSession.ts` and its `model/session/*` helpers. The store manages undo/redo history, selection, and the drag preview lifecycle.

**`useWorkspaceBoardRegistryStore`** (`features/workspace/boards/model/useWorkspaceBoardRegistryStore.ts`) — multi-board registry. Uses Zustand `persist` middleware with `partialize` to persist `boards` and `activeBoardId`. Handles create, switch, delete, duplicate, and rename. Active-board autosave is registered by `features/workspace/boards/model/boardSession.ts`, which keeps registry coordination and local persistence behind the model facade.

**`useSettingsStore`** (`features/workspace/settings/model/useSettingsStore.ts`) — global user preferences (item size, shape, label visibility, compact mode, label width, theme, palette, text style, reduced motion, toolbar position, etc.). Persisted independently.

**`useTierPresetStore`** (`features/workspace/tier-presets/model/useTierPresetStore.ts`) — user-saved tier structure presets. Persisted independently. Built-in presets (Classic, Top 10, Yes/No/Maybe, etc.) are defined in `tierPresets.ts` and merged at runtime.

### Local persistence layer

Persistence is split across features instead of living in a single monolithic `storage.ts`:

- `features/workspace/boards/model/boardSession.ts` — model facade for session bootstrap, autosave subscription, CRUD, registry coordination, event listeners, and persistence wrappers
- `features/workspace/boards/model/session/*` — board-session internals split by autosave, bootstrap, CRUD, events, persistence, registry, and storage warning reporting
- `features/workspace/boards/data/local/boardStorage.ts` — per-board localStorage I/O, versioned envelopes, typed `ok`/`missing`/`corrupted` load outcomes, quota error messaging
- `features/workspace/settings/data/local/settingsStorage.ts` — settings storage key & schema version
- `features/workspace/tier-presets/data/local/tierPresetStorage.ts` — preset storage key & schema version
- `shared/lib/browserStorage.ts` — generic localStorage wrapper, Zustand persist adapter
- `shared/lib/storageMetering.ts` — quota estimation, near-full warnings
- `shared/lib/sync/ownedSyncMeta.ts` — shared owner-scoped pending/synced timestamp helpers for settings and preset sidecars

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

Cloud sync is split between platform lifecycle and workspace adapters:

- `features/platform/sync/orchestration/createSyncSession.ts` owns platform startup: online/offline connectivity wiring, auth-epoch lifetime, and board sync status reporting.
- `features/workspace/sync/workspaceSyncSession.ts` owns workspace sync adapters for boards, settings, tier presets, board deletes, pending sidecar recovery, first-login workspace merges, and conflict queueing.
- `features/workspace/sync/useWorkspaceBoardSyncSubscriber.ts` observes active board edits and forwards `PendingBoardSync` work into the workspace session after the first-login board merge gate opens.
- Per-slice cloud transport remains under `features/workspace/*/data/cloud/`; platform orchestration does not import those modules directly.
- `shared/lib/sync/debouncedSyncRunner.ts` is the shared debounce/retry kernel. Settings and presets use it directly; board sync wraps it through `cloudSyncScheduler.ts` for peer-tab locks, conflict pauses, pending marker persistence, and permanent-error cleanup.

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
- `/boards` -> `MyListsRoute` -> signed-in library
- `/embed` -> `EmbedRoute` -> `EmbedShell` -> `EmbedView`
- anything else -> `NotFoundRoute`

Base-path-aware route constants and URL builders live in `shared/routes/pathname.ts` so feature slices can link without importing the app router.

Two share-link carriers land on these routes:

- **Short-link query (`?s=<slug>`, primary).** `createBoardShortLink` strips deleted items, converts live image refs into inline JSON wire bytes, rejects payloads above `MAX_SNAPSHOT_COMPRESSED_BYTES` before upload, then uploads the compressed snapshot to Convex storage & mints a slug. `getShareUrlFromSlug` and `getEmbedUrlFromSlug` live in `features/platform/share/shortLinkShare.ts`.
- **Hash fragment (`#share=<base64url>`, fallback).** The snapshot strips image refs and deleted items, then compresses directly into a base64url URL fragment via `encodeBoardToShareFragment` in `shared/sharing/hashShare.ts`.

`features/platform/share/inboundShare.ts` resolves the current URL into a `BoardSnapshot`. Workspace bootstrap imports the result into the active board session; embed normalizes it and renders through `shared/board-ui/*` without mounting the editable active-board store.

## Component Hierarchy

```
App (app/App.tsx → AppRouter)
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
│   ├── AccountSection             — sign-in / sign-out + sync status
│   ├── SignInModal                — Convex auth entry (email + password)
│   ├── SyncStatusIndicator        — global cloud sync state indicator
│   ├── DragOverlay → DragOverlayItem — ghost item (uses ItemContent for rendering)
│   ├── ConfirmDialog              — shared modal for destructive confirmations
│   ├── ProgressOverlay            — shared blocking overlay (export-all, cloud pull)
│   ├── BulkActionBar              — floating bar for multi-select operations
│   ├── ShortcutsPanel → ShortcutsList — help panel listing keyboard shortcuts
│   ├── ToastContainer             — auto-dismissing notifications
│   └── LiveRegion                 — screen reader announcement target
└── EmbedRoute → EmbedShell → EmbedView — read-only iframe view
```

## Overlay System

`shared/overlay/` is split by responsibility so modal surfaces, focus
management, popups, and menu behavior can change independently:

- **Dialog surfaces:** `BaseModal.tsx`, `ConfirmDialog.tsx`, `ProgressOverlay.tsx`, `LazyModalSlot.tsx`, `ModalHeader.tsx`, `DialogActions.tsx`, `OverlaySurface.tsx`, and `progress.ts`.
- **Modal behavior:** `modalDialog.ts`, `focusTrap.ts`, and `modalLayer.ts` own Escape handling, focus containment, app-shell inert state, and scroll locking. The keyed modal stack lives in `app/shells/useModalStack.ts`.
- **Popup/menu behavior:** `dismissibleLayer.ts`, `anchoredPopup.ts`, `popupPosition.ts`, `uiMeasurements.ts`, `menuOverflow.ts`, and `nestedMenus.ts` own outside interaction, positioning, overflow flipping, and submenu state.

Tier-row popups (`ColorPicker`, `TierRowSettingsMenu`) compute their position via `popupPosition.ts` at open time. `BoardManager` and `ExportMenu` keep their own anchored layouts but reuse dismissal and overflow helpers. `BoardSettingsModal`, `PresetPickerModal`, `ShareModal`, `RecentSharesModal`, `RecentlyDeletedModal`, `AspectRatioIssueModal`, `ConflictResolverModal`, and `SignInModal` all build on `BaseModal`.

Toolbar-position-aware submenu class sets live in `shared/layout/toolbarPosition.ts`, consumed by `BoardActionBar`, `ExportMenu`, `TierList`, `useGlobalShortcuts`, and the workspace shell.

## Theming

8 color themes + 5 text styles, controlled via CSS custom properties (`--t-*` for colors, `--ts-*` for typography). Theme definitions live in `src/shared/theme/`:

- `tokens.ts` — `--t-*` color tokens applied at `:root`
- `palettes.ts` — tier-color palettes
- `textStyles.ts` — font-family & weight tokens
- `runtime.ts` — `applyThemeTokens` / `applyTextStyleTokens` DOM writers
- `tierColors.ts` — `TierColorSpec` resolution against the active palette
- `zIndex.ts` — centralized `Z` stacking layers for overlays, drag preview, offscreen export host

The `useThemeSync` hook (called in `WorkspaceShell` from `src/app/bootstrap/useThemeSync.ts`) syncs `themeId` and `textStyleId` from `useSettingsStore` to `:root`. `EmbedShell` calls `useLockedTheme('classic', 'default')` so embed iframes render a stable theme regardless of the host's preference. Non-system fonts are loaded dynamically from Google Fonts.

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
- UI (`ui/`) → model (`model/`) → data (`data/{local,cloud}/`). Components don't call localStorage or Convex directly — they go through `model/` selectors or `data/*` helpers.
- Platform sync orchestration owns auth/connectivity/status only and starts `features/workspace/sync/`; it does not import workspace `data/*` modules directly.
- Per-slice cloud transport (Convex args, mappers) lives in the owning slice. Platform media and share repositories own storage upload URLs, media finalization, and short-link lookups.

## Types

Types are split between `packages/contracts/` (stable, serializable, cross-runtime) and slice-local `runtime.ts` files (implementation-private, never persisted or sent across boundaries). There is no barrel file — every import points directly at the module that defines the type.

**Contracts (`@tierlistbuilder/contracts`, `packages/contracts/`):**

Anything that crosses a process boundary — localStorage, JSON exports, share links, Convex function arguments/results — lives here:

- `lib/ids.ts` — `BoardId`, `TierId`, `PresetId`, `UserPresetId`, `BuiltinPresetId` template-literal brands; `ItemId` is a nominal brand w/ `asItemId()` cast at trust boundaries. `generate*` ID factories shared across frontend & Convex.
- `lib/theme.ts`, `lib/themeDefinition.ts` — `ThemeId`, `PaletteId`, `TextStyleId`.
- `marketplace/category.ts` — template category taxonomy shared by contracts, Convex validators, and UI filters.
- `marketplace/template.ts` — public template summary/detail/draft/use contracts.
- `workspace/board.ts` — `BoardSnapshot`, `Tier`, `TierItem`, `TierColorSpec` (+ palette/custom variants), `NewTierItem`, `BoardMeta`, `BoardSnapshotWire`.
- `workspace/settings.ts` — `AppSettings`, `ItemSize`, `ItemShape`, `LabelWidth`, `TierLabelFontSize`, `ToolbarPosition`.
- `workspace/tierPreset.ts` — `TierPreset`, `TierPresetTier`.
- `workspace/cloudBoard.ts`, `workspace/cloudPreset.ts`, `workspace/boardSync.ts`, `workspace/boardEnvelope.ts` — cloud-sync & envelope wire types.
- `platform/errors.ts`, `platform/media.ts`, `platform/shortLink.ts`, `platform/user.ts` — platform-level shared contracts.
- `platform/uploadEnvelope.ts` — prefixed header binding an upload blob to its purpose, owner, & signed token so intercepted `(storageId, token)` pairs can't cross-account finalize.

**Runtime (slice-local `runtime.ts`):**

Types that only live in memory stay in the frontend tree, collocated w/ the stores that use them:

- `features/workspace/boards/model/runtime.ts` — `ContainerSnapshot`, `ContainerSnapshotTier`, `KeyboardMode`, `ActiveBoardRuntimeState`, `freshRuntimeState`, `ItemRecord`.
- `features/workspace/export/model/runtime.ts` — `ImageFormat`, `ExportAppearance`.

`BoardSnapshot` is the canonical serializable board shape. `ContainerSnapshot` is the runtime-only lightweight ordering used during drag preview — it mirrors tier/unranked item ID arrays without carrying full tier metadata.

## Backend

The Convex backend lives in `convex/` and is namespaced into `workspace/{boards,settings,sync,tierPresets}`, `platform/{media,shortLinks}`, and `marketplace/templates`. Schema, auth wiring (`@convex-dev/auth`), rate-limiter registration (`@convex-dev/rate-limiter`), scheduled GC (`crons.ts`), and shared handler helpers (`convex/lib/*`) all live alongside. See **[`convex/README.md`](../convex/README.md)** for first-time setup, env vars, function-namespace conventions, and schema-versioning policy.

Key boundary: **UI components never call Convex directly**. Every query & mutation flows through a per-feature adapter, platform repository, or auth hook. This keeps wire types, error surfaces, and retry policy out of the UI layer.

Schema (`convex/schema.ts`) defines the app-owned tables alongside `@convex-dev/auth`'s `authTables`:

- `users` — extends auth-managed fields w/ app-owned `displayName`, `avatarStorageId`, `tier`, timestamps.
- `userSettings` — per-user mirror of `AppSettings`.
- `boards` — owner-scoped boards w/ revision, source-template link, soft-delete tombstone, aspect-ratio fields, and per-board style overrides.
- `boardTiers` / `boardItems` — ordered rows keyed by fractional `order` numbers. `boardItems` carry `aspectRatio` & `imageFit` overrides.
- `mediaAssets` — uploaded image metadata, content-hash deduplicated, indexed by owner + hash.
- `tierPresets` — reusable tier structures owned by a user.
- `shortLinks` — share-link slug indirection backed by compressed snapshot blobs in `_storage`, TTL-swept via cron.
- `templates` / `templateItems` / `templateTags` — public/unlisted marketplace templates, denormalized cover rows, tag rows, category counters, and fork tracking.
- `marketplaceStats` — singleton marketplace aggregate counters used by gallery category chips.

Marketplace seed actions are public only for script access, but they fail closed unless `CONVEX_SEED_ENABLED=true` and the caller passes the deployment's `CONVEX_SEED_SECRET` value.

## Testing

Unit & integration tests live under `tests/` and run via Vitest. End-to-end Playwright tests live under `e2e/` and are excluded from the Vitest run. See **[`tests/README.md`](../tests/README.md)** for the full test inventory, fixtures, and the "major & important only" philosophy that gates new tests.

- `npm test` — Vitest single pass
- `npm run test:watch` — Vitest watch mode
- `npm run test:e2e` — Playwright smoke + guardrails (requires `npx playwright install chromium` once)
- `npm run test:e2e:ui` — Playwright headed runner
  ├── routes/ # base-path-aware route constants/path builders
  ├── sharing/ # hash-fragment compression & short-link snapshot codecs
