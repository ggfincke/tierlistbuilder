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
| Deployment   | Cloudflare Workers                          |
| Testing      | Vitest                                      |

## Directory Structure

```
src/
├── App.tsx                        # root layout, export orchestration, error banner
├── main.tsx                       # React mount, legacy key migration
├── types/
│   └── index.ts                   # TierItem, Tier, ContainerSnapshot, TierListData, AppSettings
├── store/
│   ├── useTierListStore.ts        # single active board state, drag preview, undo/redo
│   ├── useBoardManagerStore.ts    # multi-board registry, per-board localStorage persistence
│   └── useSettingsStore.ts        # global user preferences (sizes, shapes, labels, etc.)
├── components/
│   ├── ui/
│   │   ├── Toolbar.tsx            # editable board title
│   │   ├── BoardActionBar.tsx     # add tier, settings, export, undo/redo, reset
│   │   ├── BoardManager.tsx       # floating panel for board list management
│   │   └── ConfirmDialog.tsx      # reusable confirmation modal
│   ├── settings/
│   │   ├── TierSettings.tsx       # tabbed modal (items, preferences)
│   │   └── ImageUploader.tsx      # image resize + base64 encoding
│   └── board/
│       ├── TierList.tsx           # DndContext wrapper, tier rows, unranked pool, drag overlay
│       ├── TierRow.tsx            # tier label + sortable item grid + row controls
│       ├── TierLabel.tsx          # colored label cell (editable name)
│       ├── TierItem.tsx           # draggable item with delete button
│       ├── DragOverlayItem.tsx    # ghost item during drag
│       ├── ColorPicker.tsx        # fixed-position color swatch popup
│       ├── UnrankedPool.tsx       # droppable pool for unassigned items
│       └── TrashZone.tsx          # drag-to-trash zone
├── hooks/
│   ├── useDragAndDrop.ts          # dnd-kit sensors, collision detection, move logic
│   ├── useBoardTransition.ts      # fade animation on board switch
│   ├── useUndoRedo.ts             # Ctrl+Z / Ctrl+Shift+Z keyboard wiring
│   └── usePopupClose.ts           # outside-click, Escape, scroll repositioning
└── utils/
    ├── dragInsertion.ts           # pure functions: snapshot moves, index resolution
    ├── dragInsertion.test.ts      # unit tests for drag insertion
    ├── exportImage.ts             # PNG/JPEG/WebP/clipboard export
    ├── exportPdf.ts               # PDF generation via jsPDF
    ├── exportJson.ts              # JSON board serialization/deserialization
    ├── imageResize.ts             # canvas-based image resizing (120px max)
    ├── color.ts                   # hex parsing, contrast detection
    ├── sampleItems.ts             # 12 bundled sample items + state builder
    └── constants.ts               # storage keys, defaults, tier presets, size/shape options
```

## State Management

Three Zustand stores form the data layer:

**`useTierListStore`** — the single active board. Holds `TierListData` (title, tiers, unrankedItemIds, items map) and runtime-only fields (`activeItemId`, `dragPreview`, `runtimeError`). Runtime fields are excluded from persistence via `partialize`. The store also manages undo/redo history and the drag preview lifecycle.

**`useBoardManagerStore`** — multi-board registry. Each board gets its own localStorage key. Handles create, switch, delete, duplicate, rename, and auto-save (debounced subscribe-based, not Zustand `persist` middleware). Compares `PERSISTED_FIELDS` to detect changes worth saving.

**`useSettingsStore`** — global user preferences (item size, shape, label visibility, compact mode, label width, etc.). Persisted independently to localStorage.

All stores use a `safeStorage` wrapper that catches localStorage quota errors and surfaces them as `runtimeError` on the tier list store.

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

**Insertion logic** (`src/utils/dragInsertion.ts`) is entirely pure functions — no side effects, no store access. This keeps the logic unit-testable and independent of dnd-kit. Key functions:

- `applyMoveToSnapshot()` — moves an item between containers in the snapshot
- `resolveInsertionIndex()` — computes where to insert based on pointer position and neighbor layout
- `overlaySnapshot()` — merges a snapshot back onto persisted tier data for rendering

**dnd-kit wiring** (`src/hooks/useDragAndDrop.ts`) configures sensors (pointer, touch, keyboard), collision detection, and maps dnd-kit lifecycle events (`onDragStart`, `onDragOver`, `onDragEnd`, `onDragCancel`) to store actions.

## Component Hierarchy

```
App
├── Toolbar                # editable title
├── BoardActionBar         # add tier, settings, export, reset, undo/redo
├── TierList               # DndContext wrapper, export capture ref
│   ├── TierRow[]          # tier label + sortable item grid + row controls
│   │   ├── TierLabel      # colored label (editable name)
│   │   ├── TierItem[]     # sortable draggable items
│   │   └── ColorPicker    # fixed-position color swatch popup
│   ├── UnrankedPool       # droppable pool for unassigned items
│   └── TrashZone          # drag-to-trash (visible during drag)
├── TierSettings           # tabbed modal (items upload, preferences)
├── BoardManager           # floating panel (bottom-right) for board switching
├── DragOverlay            # ghost item shown during drag
└── ConfirmDialog          # modal for delete confirmations
```

## Popup Positioning

Popups (ColorPicker, settings dropdown) use `fixed` positioning computed from `getBoundingClientRect()` at open time. This avoids clipping from `overflow-x-auto` on the tier list wrapper.

The `usePopupClose` hook handles:

- Outside-click dismissal (excluding both popup and trigger from the check)
- Escape key to close
- Scroll and resize-based repositioning

## Export Pipeline

**Raster formats** (PNG, JPEG, WebP) — `html-to-image` renders the tier list capture ref to a canvas, then converts to the target format. A configurable background color is applied. `triggerDownload()` creates a temporary `<a>` element for file download.

**Clipboard** — renders to PNG blob via `html-to-image`, then writes to the clipboard API.

**PDF** — `jsPDF` creates a document sized to match the rendered image dimensions, embeds the rasterized image, and triggers download.

**JSON** — `exportJson.ts` serializes the full board state (`TierListData`) to a downloadable `.json` file. Import validates the schema before restoring.
