# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.0] - 2026-04-05

### Added

- **PWA**: Web app manifest, app icon, service worker registration — installable as a standalone app (#18)
- **Accessibility**: Focus trapping in modals, `aria-inert` background suppression, live region announcements, & color name labels (#18)
- **Shortcuts Panel**: `?` key opens keyboard shortcuts reference overlay (#18)
- **Item Edit Popover**: Inline edit popover for renaming items & changing alt text (#18)
- **Global Shortcuts**: Centralized shortcut handler w/ Ctrl/Cmd+Shift+T for toolbar cycling (#18, #20)
- **Toolbar Position**: Configurable placement (top, bottom, left, right) via layout settings tab (#19)
- **Responsive Toolbar**: Side toolbar collapses to top on small viewports via `useViewportWidth` hook (#20)
- **Menu Animations**: Position-aware open animations (down/up/left/right) for menus (#20)
- **Alt Text Toggle**: `showAltTextButton` setting (default off) w/ toggle in layout tab (#20)
- **Reusable UI Primitives**: `BaseModal`, `TextInput`, `SecondaryButton`, `ItemOverlayButton`, `ShortcutsList`, `SavePresetModal` extracted as shared components (#21)

### Changed

- **Menus**: Replaced `useHybridMenu` w/ `useNestedMenus` hook for cleaner submenu state management (#21)
- **Modals**: Extracted `useModalDialog` & `useInlineEdit` hooks; modals now use shared `BaseModal` shell (#21)
- **Selection**: `useRovingSelection` hook replaces ad-hoc selection logic in pickers & lists (#21)
- **Popup Positioning**: New `useAnchoredPopup` hook & expanded `popupPosition` utilities w/ overflow flipping (#20, #21)
- **Board Ops**: Extracted pure board operations into `src/domain/boardOps.ts`, slimmed tier list store (#21)
- **Export**: Consolidated export utilities w/ simplified signatures & shared helpers (#21)
- **Submenu Overflow**: `useMenuOverflowFlip` detects viewport edges & flips submenu direction (#20)
- **Board Manager**: Flips to left side when toolbar is positioned on the right (#20)
- **Preset Picker**: Defaults to classic preset; board manager pill hidden while modal is open (#22)

### Fixed

- **Security**: Override `serialize-javascript` to v7 for prototype pollution fix (#22)
- **Z-Index**: Board manager trigger hidden during preset picker to avoid overlap (#22)

### Removed

- **Hook**: `useHybridMenu` replaced by `useNestedMenus` (#21)
- **Hook**: `useUndoRedo` inlined into global shortcuts (#18)
- **Theme**: Removed unused `tierColors.ts` exports (#21)

## [0.4.0] - 2026-03-30

### Added

- **Board Lock**: Toggle that disables drag-drop, editing, row controls, undo/redo, shuffle, keyboard drag, trash zone, & upload
- **Tier Descriptions**: Optional subtitle beneath tier name, editable via row settings, rendered in labels & static export
- **Shuffle & Sort**: Shuffle all items or unranked only w/ confirmation dialog; sort A-Z per tier row
- **Tier Drag Reorder**: Grip handle on tier rows to reorder via dnd-kit sortable w/ dedicated collision detection & drag overlay
- **Presets**: Built-in presets (Classic, Top 10, Yes/No/Maybe, etc.) & user-saved presets persisted via dedicated store
- **Preset Picker**: Modal for selecting built-in & user presets when creating boards
- **Palette Picker**: Independent palette selection decoupled from theme, w/ new ocean palette
- **Inline Title Editing**: Click-to-edit board title in toolbar
- **Hybrid Menu Hook**: `useHybridMenu` state machine for menus that open on hover & pin on click/tap

### Changed

- **Export Menu**: Refactored to click-toggled submenus via `useHybridMenu` instead of CSS hover reveals
- **Action Button**: Added active chrome & focus-visible styles
- **Palette System**: Unified palette defaults/presets into single ordered colors array, removed `paletteType` discriminator from `TierPaletteColorSpec`
- **Palette**: Renamed amoled palette to twilight, refreshed classic palette colors
- **Board Data**: Bumped board data version to 3; blank boards now start w/ no tiers
- **Store**: Added preset store w/ versioned migration for simplified color spec

### Fixed

- **Tests**: Expanded tier color tests for new palette structure

## [0.3.0] - 2026-03-29

### Added

- **Keyboard Navigation**: Arrow key item browsing, Enter to pick up, move across tiers & rows, Escape to cancel
- **Testing**: Vitest setup w/ unit tests for domain logic, drag utilities, color resolution, & board data
- **CI**: Deploy to Cloudflare only on version tags via prod branch

### Changed

- **Architecture**: Introduced `src/domain/` layer (boardData, tierColors, tierListRuntime) & `src/services/` layer (boardSession, themeRuntime)
- **Architecture**: Split monolithic modules into focused files — dragInsertion into 4 modules, TierSettings into per-tab components, useDragAndDrop into collision/preview/sensor
- **Architecture**: Extracted shared primitives (BoardPrimitives, OverlayPrimitives, useDismissibleLayer, useAnchoredPosition)
- **Architecture**: Centralized localStorage access into `storage.ts` w/ versioned board storage envelopes
- **Architecture**: Render exports off-screen without touching the live board store
- **Store**: Slimmed stores — tier store uses `TierColorSpec` API, board manager is thin registry, orchestration in services
- **Store**: Extracted app-level hooks (useAppBootstrap, useCurrentPaletteId, useExportController)
- **Theme**: Added `THEME_META` array & flattened palette defaults to plain hex strings

### Fixed

- **Drag & Drop**: Defensive guards for stale/deleted items during keyboard browse & drag
- **Drag & Drop**: Snapshot consistency validation & scoped DOM capture
- **Color Picker**: Preset swatch order only applied to user-picked preset colors
- **Board**: Reset now keeps items in unranked pool instead of deleting them

### Removed

- **Store**: `updateTitle` & `syncTitle` — title now flows through board manager rename only
- **Settings**: Tier color sync confirm flow (now automatic via TierColorSpec)

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
