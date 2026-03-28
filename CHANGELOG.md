# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.5] - 2026-03-28

### Fixed

- **Drag & Drop**: Defensive guards for stale/deleted items during keyboard browse & drag
- **Drag & Drop**: Snapshot consistency validation before committing drag preview
- **Drag & Drop**: Scoped DOM capture to active container & debounced focus-restore RAF

## [0.2.4] - 2026-03-28

### Added

- **Keyboard Navigation**: Browse items w/ arrow keys, Enter to pick up, move across tiers & rows, Escape to cancel
- **Drag & Drop**: Visual row layout helpers for keyboard drag preview resolution
- **Store**: Keyboard mode state & actions for item navigation

### Changed

- **Drag & Drop**: Removed keyboard sensor in favor of custom keyboard browse/drag interaction
- **Drag & Drop**: Pointer-exit cleanup for keyboard mode transitions

## [0.2.3] - 2026-03-28

### Changed

- **Settings**: Extracted reusable UI components (SegmentedControl, SettingRow, SettingsSection, Toggle) from TierSettings
- **Settings**: Renamed `exportBackgroundColor` to `exportBackgroundOverride`
- **Export**: Resolve export background from override or theme default

### Fixed

- **Board**: Reset now keeps items in unranked pool instead of deleting them

## [0.2.2] - 2026-03-22

### Changed

- **CI**: Deploy to Cloudflare only on version tags via prod branch

## [0.2.1] - 2026-03-22

### Fixed

- **Color Picker**: Only use preset swatch order for user-picked preset colors — prevents custom colors from being remapped when switching palettes

## [0.2.0] - 2026-03-22

Phase 2 (Customization & Export) complete — theming, preferences, multi-board export, and a full color picker.

### Added

- **Theming**: 8 color themes and 5 text styles controlled via CSS custom properties (`--t-*` tokens), with `ThemePicker`, `TextStylePicker`, and `useThemeApplicator` hook
- **Color Picker**: Full color wheel with shade slider and live preview for tier label colors
- **Export All**: Export every board at once as JSON, multi-page PDF, or ZIP of images with per-board progress tracking
- **Preferences Panel**: Tabbed settings with display, layout, export, data, and behavior sections
- **Settings Store**: `useSettingsStore` — global user preferences persisted to localStorage (item size, shape, labels, compact mode, label width, row controls, theme, text style, palette)
- **JSON Export/Import**: Full board state serialization with schema validation on import
- **Export Options**: Custom background color for PNG/JPEG/WebP and PDF exports
- **Display Settings**: Configurable item sizes (64/104/140px), shapes (square/rounded/circle), and label widths (narrow/default/wide)
- **Drag & Drop**: Trailing last-row space detection — drops after the last item on the final row now append to the end
- **Settings**: Lists management section in TierSettings for board count and quick creation

### Changed

- **Styling**: Replaced all hardcoded hex colors with CSS custom property tokens (`var(--t-*)`) across every component
- **Theme System**: Token definitions, palette system, and per-theme tier color palettes in `src/theme/`
- **Layout**: Board components dynamically adjust sizing, shapes, and label widths based on settings store values
- **Color Utils**: Extended `color.ts` with RGB/hex parsing, normalization, and conversion helpers
- **Export Pipeline**: Extracted `renderToDataUrl` helper and lazy-loaded jsPDF for better code splitting
- **Code Style**: Prettier and `eslint-config-prettier` integration with codebase-wide formatting normalization
- **CSS**: Globals wrapped in `@layer base` to prevent specificity conflicts
- **CI**: Removed test step from CI and release workflows

### Fixed

- **Transitions**: Stable ref sync in `useBoardTransition` — replaced direct assignment with `useEffect` to avoid render-during-render warnings
- **Dialogs**: `ConfirmDialog` ref sync updated for consistency

### Removed

- **Testing**: Vitest dependency and all stale test files
- **UI**: Empty board banner removed from App

---

## [0.1.0] - 2026-03-12

Phase 1 (Core Polish) complete — the app feels complete as a standalone local tool.

### Added

- **Transitions**: Fade animation on board switch with timer cleanup via `useBoardTransition` hook
- **Auto-Save**: `PERSISTED_FIELDS` array in board manager store for cleaner auto-save comparison

### Changed

- **Performance**: Memoized `useDroppable` data objects in `TierRow` and `UnrankedPool` to eliminate object identity churn
- **Auto-Save**: Replaced manual field-by-field comparison with `PERSISTED_FIELDS`-driven check

### Fixed

- **Callbacks**: Stabilized `onClose`/`onCancel` callbacks via refs in `TierSettings` and `ConfirmDialog` to prevent listener re-registration churn
- **Re-Renders**: Wrapped `TierItem`, `TierLabel`, `ColorPicker`, and `DragOverlayItem` with `React.memo`
- **Color Parsing**: Validated hex input in `getTextColor` to prevent `NaN` propagation from malformed strings
- **Tier Deletion**: Consistent unranked ordering on `deleteTier` — items prepended to match `clearTierItems` behavior
- **Popups**: Added resize listener to `usePopupClose` for popup repositioning on window resize

---

<details>
<summary><strong>Patch Releases (0.0.1 – 0.1.8)</strong></summary>

## [0.1.8] - 2026-03-22

### Added

- **Color Picker**: Full color wheel with shade slider for selecting any tier label color, with live preview during picking
- **Dependencies**: Added `@uiw/react-color-wheel` and `@uiw/react-color-shade-slider` for color selection UI
- **Popup Hook**: `ignoreRefs` and `closeOnEscape` options on `usePopupClose`

### Changed

- **Color Utils**: Extended `color.ts` with RGB/hex parsing, normalization, and conversion helpers
- **Tier Row**: Updated to support expanded color picker with custom color mode

## [0.1.7] - 2026-03-20

### Changed

- **CI**: Removed test step from CI and release workflows — Vitest was already removed in 0.1.6

## [0.1.6] - 2026-03-20

### Added

- **Theming**: 8 color themes and 5 text styles controlled via CSS custom properties (`--t-*` tokens)
- **Appearance UI**: `ThemePicker` and `TextStylePicker` components with appearance section in settings modal
- **Theme Applicator**: `useThemeApplicator` hook syncs theme and text style selections to `:root` CSS properties
- **Theme System**: Token definitions, palette system, and per-theme tier color palettes in `src/theme/`
- **Docs**: Screenshot added to `docs/assets`

### Changed

- **Styling**: Replaced all hardcoded hex colors with CSS custom property tokens (`var(--t-*)`) across every component
- **Settings Store**: Extended with `themeId`, `textStyleId`, and `paletteId` fields
- **Tier Colors**: Default tier colors now sourced from palette system instead of hardcoded constants

### Removed

- **Testing**: Vitest dependency and all stale test files

## [0.1.5] - 2026-03-19

### Added

- **Export All**: Export every board at once as JSON, multi-page PDF, or ZIP of images with per-board progress tracking via `ExportProgressOverlay`
- **Board Manager**: `exportLock` and `loadAllBoardData` for multi-board export coordination
- **Dependencies**: Added jszip for image ZIP export

### Changed

- **Export Pipeline**: Extracted `renderToDataUrl` helper and lazy-loaded jsPDF for better code splitting
- **Action Bar**: Export-all options wired into `BoardActionBar` dropdown

## [0.1.4] - 2026-03-17

### Added

- **Drag & Drop**: Trailing last-row space detection — drops after the last item on the final row now append to the end instead of inserting mid-row
- **Settings**: Lists management section in TierSettings for board count and quick creation

### Changed

- **Tier Labels**: Font sizes reduced to `text-sm` at medium/large presets, switched to `font-normal` weight
- **Board Manager**: Repositioned with CSS-based positioning, safe-area insets, and responsive breakpoints

### Removed

- **UI**: Empty board banner removed from App

## [0.1.3] - 2026-03-17

### Added

- **Formatting**: Prettier configuration, formatting scripts, and `eslint-config-prettier` integration

### Changed

- **Code Style**: Normalized formatting across the entire codebase — 40 files reformatted
- **CSS**: Globals wrapped in `@layer base` to prevent specificity conflicts

### Fixed

- **Transitions**: Stable ref sync in `useBoardTransition` — replaced direct assignment with `useEffect` to avoid render-during-render warnings
- **Dialogs**: `ConfirmDialog` ref sync updated for consistency

## [0.1.2] - 2026-03-16

### Added

- **Preferences**: Tabbed Preferences panel with display, layout, export, data, and behavior sections — replaces the previous two-button settings modal
- **Export**: JSON export and import options wired into the action bar export menu
- **Display Settings**: Board components now read `itemSize`, `itemShape`, `showLabels`, `compactMode`, `labelWidth`, and `hideRowControls` from the settings store

### Changed

- **Layout**: `TierRow` dynamically adjusts padding, gaps, and label column width based on settings
- **Items**: `TierItem` rendering updated to support square, rounded, and circle shapes at small/medium/large sizes
- **Labels**: `TierLabel` width now controlled by the `labelWidth` setting (narrow/default/wide)

## [0.1.1] - 2026-03-16

### Added

- **Settings Store**: `useSettingsStore` — global user preferences persisted to localStorage with Zustand, including item size presets (64/104/140px), shape options, and label width presets
- **JSON Export/Import**: Serializes full board state to downloadable `.json` files with schema validation on import
- **Export Options**: Custom background color (`bgColor`) parameter for PNG/JPEG/WebP and PDF exports
- **Store Actions**: `clearAllItems` (removes items without resetting tier structure) and `importBoard` (imports board from JSON data)

## [0.0.7] - 2026-03-10

### Added

- **Multi-Board**: Board registry with per-board localStorage persistence — supports create, switch, delete, duplicate, and rename operations with legacy migration and title deduplication
- **Auto-Save**: Debounced subscribe-based auto-save replaces Zustand `persist` middleware for finer control
- **Board Manager UI**: Floating panel (bottom-right) with create, switch, rename, duplicate, and delete controls
- **Dialogs**: Capture-phase Escape key handler on `ConfirmDialog` — pressing Escape now only closes the innermost dialog
- **Upload UX**: Click-to-upload empty state on `UnrankedPool` with shared `processImageFiles` utility

### Changed

- **Persistence**: Stripped `persist` middleware from `useTierListStore` — now fully managed by `useBoardManagerStore`
- **UI Cleanup**: Removed redundant "New List" and "Add Tier" buttons

### Fixed

- **Dialogs**: Escape key in `ConfirmDialog` no longer bubbles to dismiss parent modals

## [0.0.6] - 2026-03-10

### Added

- **Trash Zone**: Droppable area at the bottom of the board during drag for item deletion with visual feedback
- **Item Management**: Per-item permanent delete button in recently deleted list and confirm dialog before clearing all items

## [0.0.5] - 2026-03-07

### Added

- **Text Items**: Items with just a label and colored background, no image required
- **Deletion & Restore**: Deleted items move to a "recently deleted" list, recoverable until permanently removed
- **Undo/Redo**: Action history stack with Ctrl+Z / Ctrl+Shift+Z support and snapshot-based state restoration
- **Export Formats**: JPEG and WebP with configurable quality, plus clipboard copy as PNG blob
- **Export Menu**: Format dropdown in action bar with PNG, JPEG, WebP, PDF, and clipboard options

### Changed

- **Color Utility**: Extracted `getTextColor` to shared `src/utils/color.ts` module
- **Item Rendering**: `TierItem` and `DragOverlayItem` updated to support text-only items with colored backgrounds

## [0.0.4] - 2026-03-06

### Changed

- **Layout**: Items sized to fill tier row height for a more compact, polished layout with grid outlines on tier rows

## [0.0.3] - 2026-03-06

### Added

- **Testing**: Unit tests for Zustand store drag lifecycle and drag insertion logic
- **Auditing**: Headless CDP audit script for end-to-end drag parity checks

## [0.0.2] - 2026-03-06

### Added

- **Core Types**: `TierItem`, `Tier`, `ContainerSnapshot`, `TierListData` with preset tier colors and storage constants
- **State Management**: `useTierListStore` — Zustand store with localStorage persistence, versioned schema migration, and `safeStorage` wrapper
- **Drag & Drop**: Snapshot-based drag preview lifecycle with pure insertion logic in `dragInsertion.ts`
- **Components**: `TierRow`, `TierLabel`, `TierItem`, `TierList`, `ColorPicker`, `DragOverlayItem`, `UnrankedPool`, `ImageUploader`, `TierSettings`, `BoardActionBar`, `ConfirmDialog`, `Toolbar`
- **App Shell**: Root `App` component with error banner, export orchestration, and `useDragAndDrop` / `usePopupClose` hooks
- **Export**: PNG via html-to-image, PDF via jsPDF with automatic page sizing

## [0.0.1] - 2026-03-06

### Added

- **Scaffold**: Vite 7 + React 19 + TypeScript with strict mode
- **Styling**: Tailwind CSS 4 via `@tailwindcss/vite` plugin
- **Linting**: ESLint flat config with TypeScript and React Hooks rules

</details>
