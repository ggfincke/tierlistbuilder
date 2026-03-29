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

```
src/
├── App.tsx                        # root layout, export orchestration, error banner
├── main.tsx                       # React mount, legacy key migration
├── types/
│   └── index.ts                   # TierItem, Tier, ContainerSnapshot, TierListData, AppSettings
├── store/
│   ├── useTierListStore.ts        # single active board state, drag preview, undo/redo
│   ├── useBoardManagerStore.ts    # multi-board registry, board lifecycle actions
│   └── useSettingsStore.ts        # global user preferences (sizes, shapes, labels, etc.)
├── components/
│   ├── ui/
│   │   ├── Toolbar.tsx            # display-only board title
│   │   ├── BoardActionBar.tsx     # action bar layout: undo/redo, add, settings, export, reset
│   │   ├── ExportMenu.tsx         # export dropdown w/ nested hover submenus
│   │   ├── ActionButton.tsx       # reusable circular icon button
│   │   ├── UploadDropzone.tsx     # shared image upload dropzone surface
│   │   ├── BoardManager.tsx       # floating panel for board list management
│   │   ├── ConfirmDialog.tsx      # reusable confirmation modal
│   │   └── ExportProgressOverlay.tsx  # blocking overlay during export-all
│   ├── settings/
│   │   ├── TierSettings.tsx       # tabbed modal shell & confirm flows
│   │   ├── TierSettingsItemsTab.tsx # items tab content
│   │   ├── TierSettingsAppearanceTab.tsx # appearance tab content
│   │   ├── TierSettingsLayoutTab.tsx # layout tab content
│   │   ├── TierSettingsMoreTab.tsx # export, storage, & shortcut tab content
│   │   ├── DeletedItemsSection.tsx # recently deleted items grid w/ restore/delete
│   │   └── ImageUploader.tsx      # image upload drop zone
│   └── board/
│       ├── TierList.tsx           # DndContext wrapper, tier rows, unranked pool, drag overlay
│       ├── TierRow.tsx            # tier label + sortable item grid + color picker popups
│       ├── TierRowSettingsMenu.tsx # gear button + row settings popup + delete confirm
│       ├── TierLabel.tsx          # colored label cell (editable name)
│       ├── TierItem.tsx           # sortable item tile (delegates keyboard to useKeyboardDrag)
│       ├── ItemContent.tsx        # shared image-vs-text item rendering
│       ├── DragOverlayItem.tsx    # ghost item during drag
│       ├── ColorPicker.tsx        # fixed-position color swatch popup
│       ├── UnrankedPool.tsx       # droppable pool for unassigned items
│       └── TrashZone.tsx          # drag-to-trash zone
├── components/export/
│   └── StaticExportBoard.tsx      # store-free off-screen export renderer
├── hooks/
│   ├── useDragAndDrop.ts          # dnd-kit sensors, collision detection, move logic
│   ├── useKeyboardDrag.ts         # keyboard hook facade for item handlers
│   ├── keyboardDragController.ts  # keyboard browse & drag state-machine helpers
│   ├── keyboardFocus.ts           # RAF focus-restore helpers
│   ├── useImageImport.ts          # shared image upload: drag state, resize, error feedback
│   ├── useBoardTransition.ts      # fade animation on board switch
│   ├── useUndoRedo.ts             # Ctrl+Z / Ctrl+Shift+Z keyboard wiring
│   ├── usePopupClose.ts           # popup wrapper over shared dismissal mechanics
│   ├── useDismissibleLayer.ts     # shared outside-click, Escape, & reposition listeners
│   └── useAnchoredPosition.ts     # shared anchored-position state for fixed overlays
└── utils/
    ├── dragSnapshot.ts            # pure snapshot transforms & container queries
    ├── dragPointerMath.ts         # pointer/mouse insertion math
    ├── dragKeyboard.ts            # keyboard navigation logic
    ├── dragDomCapture.ts          # DOM reading for rendered layout & positions
    ├── exportImage.ts             # PNG/JPEG/WebP/clipboard export
    ├── exportPdf.ts               # PDF generation via jsPDF
    ├── exportJson.ts              # JSON board serialization/deserialization
    ├── exportBoardRender.tsx      # hidden export-capture root & static render session
    ├── imageResize.ts             # canvas-based image resizing (120px max)
    ├── popupPosition.ts           # shared popup positioning pure functions
    ├── color.ts                   # hex parsing, contrast detection
    ├── constants.ts               # defaults, tier presets, size/shape options
    └── storage.ts                 # localStorage keys, board I/O, migrations, persist adapters
```

## State Management

Three Zustand stores form the data layer:

**`useTierListStore`** — the single active board. Holds `TierListData` (title, tiers, unrankedItemIds, items map) and runtime-only fields (`activeItemId`, `dragPreview`, `keyboardMode`, `runtimeError`). It is an in-memory store with no persist middleware — persistence is handled by the board manager. The store also manages undo/redo history and the drag preview lifecycle.

**`useBoardManagerStore`** — multi-board registry. Uses Zustand `persist` middleware with `partialize` to persist `boards` and `activeBoardId`. Handles create, switch, delete, duplicate, rename, and auto-save (a debounced subscriber on `useTierListStore` that compares `PERSISTED_FIELDS` to detect changes worth saving). Explicit board renames flow through `renameBoard()` (updates both the registry and the tier store), and `resetBoard()` preserves the current title.

**`useSettingsStore`** — global user preferences (item size, shape, label visibility, compact mode, label width, etc.). Persisted independently to localStorage.

**`storage.ts`** — centralized localStorage layer. Owns all storage keys, per-board I/O (`saveBoardToStorage`, `loadBoardFromStorage`, `removeBoardFromStorage`), the shared Zustand persist adapter, legacy key migration, legacy single-board migration, and storage metering. Quota errors are surfaced via an `onError` callback to avoid store imports.

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

**Drag logic** is split across four modules:

- `dragSnapshot.ts` — pure snapshot transforms, container queries, & item movement (`moveItemInSnapshot`, `findContainer`, `getEffectiveTiers`, etc.)
- `dragPointerMath.ts` — pointer/mouse insertion math (`resolveDragTargetIndex`, `resolveNextDragPreview`, etc.)
- `dragKeyboard.ts` — keyboard navigation (`resolveNextKeyboardDragPreview`, `resolveNextKeyboardFocusItem`)
- `dragDomCapture.ts` — DOM reading for rendered layout & positions (`captureRenderedContainerSnapshot`, `resolveIntraContainerRowMove`, etc.)

**dnd-kit wiring** (`src/hooks/useDragAndDrop.ts`) configures pointer and touch sensors, collision detection, and maps dnd-kit lifecycle events (`onDragStart`, `onDragOver`, `onDragEnd`, `onDragCancel`) to store actions.

**Keyboard controller** (`src/hooks/useKeyboardDrag.ts`) is the item-facing hook. The 3-state machine (idle → browse → dragging), arrow key navigation with intra-row and column-aware cross-tier logic, and RAF-debounced focus restoration now live in `keyboardDragController.ts` and `keyboardFocus.ts`. Each `TierItem` still calls `useKeyboardDrag()` and wires its returned `onKeyDown`/`onFocus` handlers into the DOM.

## Component Hierarchy

```
App
├── Toolbar                    # board title
├── BoardActionBar             # action bar layout: undo/redo, add, settings, export, reset
│   ├── ActionButton[]         # reusable circular icon buttons
│   └── ExportMenu             # export dropdown w/ nested hover submenus
├── TierList                   # DndContext wrapper, tier rows, unranked pool, drag overlay
│   ├── TierRow[]              # tier label + sortable item grid + color picker popups
│   │   ├── TierLabel          # colored label (editable name)
│   │   ├── TierItem[]         # sortable items (delegates keyboard to useKeyboardDrag)
│   │   ├── TierRowSettingsMenu # gear button + row settings popup
│   │   └── ColorPicker        # fixed-position color swatch popup
│   ├── UnrankedPool           # droppable pool for unassigned items
│   └── TrashZone              # drag-to-trash (visible during drag)
├── TierSettings               # tabbed modal shell w/ per-tab subcomponents
│   ├── TierSettingsItemsTab   # import, text items, deleted items
│   ├── TierSettingsAppearanceTab # theme, text style, tier-color sync
│   ├── TierSettingsLayoutTab  # item sizing & tier-label layout
│   └── TierSettingsMoreTab    # export prefs, storage, shortcuts
├── BoardManager               # floating panel (bottom-right) for board switching
├── DragOverlay                # ghost item (uses ItemContent for rendering)
├── ConfirmDialog              # modal for delete confirmations
└── ExportProgressOverlay      # blocking overlay during export-all
```

## Popup Positioning

Tier-row popups (`ColorPicker`, `TierRowSettingsMenu`) use `fixed` positioning computed from `getBoundingClientRect()` at open time. This avoids clipping from `overflow-x-auto` on the tier list wrapper. Positioning functions live in `src/utils/popupPosition.ts`.

Shared overlay behavior lives in `useDismissibleLayer.ts` and `useAnchoredPosition.ts`. `usePopupClose.ts` remains a popup-specific wrapper over that shared behavior for row popups.

The shared layer covers:

- Outside-click dismissal (excluding both popup and trigger from the check)
- Escape key to close
- Scroll and resize-based repositioning

`BoardManager` and `ExportMenu` keep their own anchored layout markup while reusing the shared dismissal plumbing.

## Export Pipeline

**Raster formats** (PNG, JPEG, WebP) — exports render a hidden store-free `StaticExportBoard` in an off-screen React root, then `html-to-image` captures that isolated DOM. Single-board and export-all use the same render session so exports never mutate the live active-board store. A configurable background color is applied. `triggerDownload()` creates a temporary `<a>` element for file download.

**Clipboard** — uses the same isolated export renderer, then writes a PNG blob to the clipboard API.

**PDF** — uses the same isolated export renderer, captures a PNG, then `jsPDF` creates a document sized to match the rendered image dimensions and embeds the rasterized image.

**JSON** — `exportJson.ts` serializes the full board state (`TierListData`) to a downloadable `.json` file. Import accepts both single-board and multi-board JSON envelopes — `parseBoardsJson()` auto-detects the format and validates each board before restoring.
