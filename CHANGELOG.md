# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.4] - 2026-03-17

### Added

- Trailing last-row space detection — drops in the empty area after the last item on the final row now append to the end instead of inserting mid-row (`a4d03dc`)
- Unit tests and audit scenario for trailing-space drop logic (`a4d03dc`)
- Lists management section in TierSettings for board count and quick creation (`006e2f6`)

### Changed

- Tier label font sizes reduced to `text-sm` at medium/large presets, switched to `font-normal` weight (`006e2f6`)
- Board manager repositioned with CSS-based positioning, safe-area insets, and responsive breakpoints (`006e2f6`)

### Removed

- Empty board banner removed from App (`006e2f6`)

---

## [0.1.3] - 2026-03-17

### Added

- Prettier configuration and formatting scripts (`ba367d3`)
- `eslint-config-prettier` integration (`82d56db`)

### Changed

- Code formatting normalized across the entire codebase — 40 files reformatted for consistent style (`0b6d2d4`)
- CSS globals wrapped in `@layer base` to prevent specificity conflicts (`ba367d3`)

### Fixed

- Stable ref sync in `useBoardTransition` — replaced direct assignment with `useEffect` to avoid render-during-render warnings (`ba367d3`)
- `ConfirmDialog` ref sync updated for consistency (`ba367d3`)

---

## [0.1.2] - 2026-03-16

### Added

- Tabbed Preferences panel with display, layout, export, data, and behavior sections — replaces the previous two-button settings modal (`4df76fe`)
- JSON export and import options wired into the action bar export menu (`64e9df3`)
- Board components now read `itemSize`, `itemShape`, `showLabels`, `compactMode`, `labelWidth`, and `hideRowControls` from the settings store (`547b4bc`)
- `DragOverlayItem` reflects current item size and shape settings during drag (`547b4bc`)
- `UnrankedPool` adapts grid layout and item sizing based on settings (`547b4bc`)

### Changed

- `TierRow` layout dynamically adjusts padding, gaps, and label column width based on settings (`547b4bc`)
- `TierItem` rendering updated to support square, rounded, and circle shapes at small/medium/large sizes (`547b4bc`)
- `TierLabel` width now controlled by the `labelWidth` setting (narrow/default/wide) (`547b4bc`)

---

## [0.1.1] - 2026-03-16

### Added

- `AppSettings` type definitions and display/layout constants — item size presets (64/104/140px), shape options, label width presets (`5973d0e`)
- `useSettingsStore` — global user preferences store persisted to localStorage with Zustand (`994b119`)
- JSON export utility — serializes full board state to a downloadable `.json` file (`0d2e750`)
- JSON import utility — validates and restores a board from a `.json` file with schema checking (`0d2e750`)
- `triggerDownload` helper exported from `exportImage` for reuse across export formats (`0d2e750`)
- `bgColor` parameter for PNG/JPEG/WebP and PDF exports — allows custom export background color (`0d2e750`)
- `clearAllItems` action on `TierListStore` — removes all items without resetting tier structure (`4980dc3`)
- `importBoard` action on `BoardManagerStore` — imports a board from JSON data, creating a new board entry (`4980dc3`)

---

## [0.1.0] - 2026-03-12

Phase 1 (Core Polish) complete — the app feels complete as a standalone local tool.

### Added

- Fade transition animation on board switch with timer cleanup via `useBoardTransition` hook (`a8e9cec`)
- `PERSISTED_FIELDS` array in board manager store for cleaner auto-save comparison (`b1e38ad`)

### Changed

- Memoized `useDroppable` data objects in `TierRow` and `UnrankedPool` to eliminate object identity churn on every render (`b1e38ad`)
- Replaced manual field-by-field auto-save comparison with `PERSISTED_FIELDS`-driven check (`b1e38ad`)
- Simplified `useBoardTransition` internal state management (`b1e38ad`)

### Fixed

- Stabilized `onClose`/`onCancel` callbacks via refs in `TierSettings` and `ConfirmDialog` to prevent listener re-registration churn (`ff35166`)
- Wrapped `TierItem`, `TierLabel`, `ColorPicker`, and `DragOverlayItem` with `React.memo` to reduce unnecessary re-renders (`ff35166`)
- Validated hex input in `getTextColor` to prevent `NaN` propagation from malformed color strings (`ff35166`)
- Deduplicated `clampIndex` — now imported from `constants` instead of redefined in `dragInsertion` (`ff35166`)
- Consistent unranked ordering on `deleteTier` — items prepended to match `clearTierItems` behavior (`ff35166`)
- Replaced `text-slate-200` with `text-[#ddd]` per project style rules (`ff35166`)
- Made `getFileLabel` private — removed unused export from `imageResize` (`ff35166`)
- Added resize listener to `usePopupClose` for popup repositioning on window resize (`ff35166`)

---

## [0.0.7] - 2026-03-10

### Added

- Multi-board registry with per-board localStorage persistence via `useBoardManagerStore` — supports create, switch, delete, duplicate, and rename operations (`1bf5ba9`)
- Legacy migration from single-board localStorage schema to multi-board format (`1bf5ba9`)
- Board title deduplication on create and duplicate (`1bf5ba9`)
- Debounced subscribe-based auto-save — replaces Zustand `persist` middleware for finer control (`1bf5ba9`)
- `extractBoardData` and `freshRuntimeState` helpers for clean board data serialization (`1bf5ba9`)
- Board manager floating panel (bottom-right) with create, switch, rename, duplicate, and delete controls (`4e73179`)
- `syncTitle` effect in App to keep board manager registry in sync with toolbar title edits (`4e73179`)
- Capture-phase Escape key handler on `ConfirmDialog` with `stopPropagation` — pressing Escape now only closes the innermost dialog, not the parent behind it (`d92ae71`)
- Escape-to-close for `TierSettings` modal (`d92ae71`)
- Shared `processImageFiles` utility extracted to `imageResize.ts` — deduplicates image processing pipeline between `ImageUploader` and `UnrankedPool` (`58031ba`)
- Click-to-upload empty state on `UnrankedPool` — empty pool is now clickable to open file picker and supports file drag-and-drop (`58031ba`)

### Changed

- Persist middleware stripped from `useTierListStore` — persistence now fully managed by `useBoardManagerStore` (`1bf5ba9`)
- `snapshotData` consolidated into `extractBoardData` helper (`1bf5ba9`)
- Items selector in App narrowed to boolean `isEmpty` check to reduce unnecessary re-renders (`4e73179`)
- Redundant "New List" button removed from action bar (`4e73179`)
- Redundant "Add Tier" button removed from `TierSettings` (`d92ae71`)

### Fixed

- Escape key in `ConfirmDialog` no longer bubbles to dismiss parent modals (`d92ae71`)

---

## [0.0.6] - 2026-03-10

### Added

- Drag-to-trash zone — droppable area at the bottom of the board during drag for item deletion (`a27dca1`)
- `TrashZone` component with visual feedback on drag-over (`a27dca1`)
- Trash drop handling wired into `useDragAndDrop` hook (`a27dca1`)
- `TRASH_ID` constant for trash droppable identification (`a27dca1`)
- Per-item permanent delete button in `TierSettings` recently deleted list (`10fadb8`)
- `permanentlyDeleteItem` action on store — removes item from deleted list entirely (`10fadb8`)
- Confirm dialog before clearing all items (`10fadb8`)

---

## [0.0.5] - 2026-03-07

### Added

- Text-only items — items with just a label and colored background, no image required (`3f7a6e2`)
- `NewTierItem` type for creating items with optional image (`3f7a6e2`)
- Item deletion with restore — deleted items move to a "recently deleted" list in settings, recoverable until permanently removed (`3f7a6e2`)
- `deletedItems` array and `restoreItem`/`removeItem` actions on store (`3f7a6e2`)
- Undo/redo system — `useUndoRedo` hook with action history stack, Ctrl+Z / Ctrl+Shift+Z support (`3f7a6e2`, `43f77e1`)
- `pushHistory`/`undo`/`redo` actions on store with snapshot-based state restoration (`3f7a6e2`)
- JPEG and WebP export formats with configurable quality (`ee38ce3`)
- Clipboard copy for exported images — "Copy to clipboard" writes the rendered tier list as a PNG blob to the clipboard (`ee38ce3`)
- Export format dropdown menu in action bar with PNG, JPEG, WebP, PDF, and clipboard options (`43f77e1`)
- Empty state banner when the board has no items (`43f77e1`)

### Changed

- `getTextColor` utility extracted to shared `src/utils/color.ts` module — removed inline implementation from `TierLabel` (`4251122`)
- `TierItem` updated to render text-only items with colored backgrounds when no image is present (`3f7a6e2`)
- `DragOverlayItem` updated to support text-only item rendering during drag (`3f7a6e2`)
- `UnrankedPool` passes through new item properties (`3f7a6e2`)
- Export menu in `BoardActionBar` expanded from single PNG button to full format dropdown (`43f77e1`)

---

## [0.0.4] - 2026-03-06

### Changed

- Items sized to fill tier row height for a more compact, polished layout (`512f4e5`)
- Grid outlines added to tier rows for visual structure (`512f4e5`)
- `DragOverlayItem` and `TierItem` dimensions updated to match new sizing (`512f4e5`)
- `TierLabel` height adjusted to align with resized items (`512f4e5`)

---

## [0.0.3] - 2026-03-06

### Added

- Unit tests for Zustand store drag lifecycle — covers `beginDragPreview`, `updateDragPreview`, `commitDragPreview`, and `discardDragPreview` flows (`0382529`)
- Unit tests for drag insertion logic — covers snapshot move operations, index resolution, and neighbor-swap stability (`0382529`)
- Headless CDP audit script (`scripts/drag-audit.mjs`) for end-to-end drag parity checks (`0382529`)

---

## [0.0.2] - 2026-03-06

### Added

- Domain types: `TierItem`, `Tier`, `ContainerSnapshot`, `TierListData` (`01dad64`)
- Preset tier colors and storage key constants (`01dad64`)
- `useTierListStore` — Zustand store with localStorage persistence, versioned schema migration, and `safeStorage` wrapper for quota error handling (`5865ef0`)
- Drag preview lifecycle: `beginDragPreview`, `updateDragPreview`, `commitDragPreview`, `discardDragPreview` (`5865ef0`)
- `dragInsertion.ts` — pure functions for snapshot-based move operations, index resolution, and insertion logic (`5865ef0`)
- `imageResize.ts` — client-side image resizing utility for uploaded item images (`5865ef0`)
- Bundled sample image pack (12 items) for first-load experience (`5865ef0`)
- `TierRow` component with inline label editing, reorder controls, and color picker trigger (`ed1fae8`)
- `TierLabel` with editable name, background color, and auto-contrasting text color (`ed1fae8`)
- `TierItem` — draggable item cell with image thumbnail and label (`ed1fae8`)
- `TierList` — DndContext wrapper with tier rows and export capture ref (`ed1fae8`)
- `ColorPicker` — fixed-position color swatch popup for tier label backgrounds (`ed1fae8`)
- `DragOverlayItem` — ghost item shown during drag (`ed1fae8`)
- `UnrankedPool` — droppable pool for unassigned items (`ed1fae8`)
- `ImageUploader` — file picker with drag-and-drop support for adding image items (`ed1fae8`)
- `TierSettings` — modal with image import and add-tier controls (`ed1fae8`)
- `BoardActionBar` — action bar with add tier, settings, export, and reset buttons (`ed1fae8`)
- `ConfirmDialog` — reusable confirmation modal component (`ed1fae8`)
- `Toolbar` — top bar with editable board title (`ed1fae8`)
- Root `App` component with error banner and export orchestration (`68f79a3`)
- `useDragAndDrop` hook — DndContext configuration with pointer sensor, collision detection, and drag lifecycle wiring (`68f79a3`)
- `usePopupClose` hook — outside-click dismissal for fixed-position popups, with Escape key and scroll repositioning support (`68f79a3`)
- PNG export via `html-to-image` (`68f79a3`)
- PDF export via `jsPDF` with automatic page sizing (`68f79a3`)
- Global CSS styles and CSS reset (`68f79a3`)

---

## [0.0.1] - 2026-03-06

### Added

- Project scaffold — Vite 7 + React 19 + TypeScript with strict mode (`a5c328c`)
- Tailwind CSS 4 via `@tailwindcss/vite` plugin (`a5c328c`)
- ESLint flat config with TypeScript and React Hooks rules (`a5c328c`)
- Base `tsconfig` with path aliases and strict checks (`a5c328c`)
