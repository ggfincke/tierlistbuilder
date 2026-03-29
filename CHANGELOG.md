commit 094cf4cb4163fcac95427ea56a08aac93ec6a80b
Author: Garrett Fincke <garrettfincke@gmail.com>
Date: Sun Mar 29 09:36:10 2026 -0400

    0.3.0

diff --git a/CHANGELOG.md b/CHANGELOG.md
index 0a0e323..654b385 100644
--- a/CHANGELOG.md
+++ b/CHANGELOG.md
@@ -7,6 +7,60 @@ and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0

## [Unreleased]

+## [0.3.0] - 2026-03-29

- +### Added
- +- **Keyboard Navigation**: Arrow key item browsing, Enter to pick up, move across tiers & rows, Escape to cancel
  +- **Testing**: Vitest setup w/ unit tests for domain logic, drag utilities, color resolution, & board data
  +- **CI**: Deploy to Cloudflare only on version tags via prod branch
- +### Changed
- +- **Architecture**: Introduced `src/domain/` layer (boardData, tierColors, tierListRuntime) & `src/services/` layer (boardSession, themeRuntime)
  +- **Architecture**: Split monolithic modules into focused files — dragInsertion into 4 modules, TierSettings into per-tab components, useDragAndDrop into collision/preview/sensor
  +- **Architecture**: Extracted shared primitives (BoardPrimitives, OverlayPrimitives, useDismissibleLayer, useAnchoredPosition)
  +- **Architecture**: Centralized localStorage access into `storage.ts` w/ versioned board storage envelopes
  +- **Architecture**: Render exports off-screen without touching the live board store
  +- **Store**: Slimmed stores — tier store uses `TierColorSpec` API, board manager is thin registry, orchestration in services
  +- **Store**: Extracted app-level hooks (useAppBootstrap, useCurrentPaletteId, useExportController)
  +- **Theme**: Added `THEME_META` array & flattened palette defaults to plain hex strings
- +### Fixed
- +- **Drag & Drop**: Defensive guards for stale/deleted items during keyboard browse & drag
  +- **Drag & Drop**: Snapshot consistency validation & scoped DOM capture
  +- **Color Picker**: Preset swatch order only applied to user-picked preset colors
  +- **Board**: Reset now keeps items in unranked pool instead of deleting them
- +### Removed
- +- **Store**: `updateTitle` & `syncTitle` — title now flows through board manager rename only
  +- **Settings**: Tier color sync confirm flow (now automatic via TierColorSpec)
- +## [0.2.7] - 2026-03-29
- +### Added
- +- **Testing**: Vitest setup w/ initial unit tests for domain logic, drag utilities, & color resolution
- +## [0.2.6] - 2026-03-29
- +### Changed
- +- **Architecture**: Introduced domain layer, services layer, & centralized storage module
  +- **Architecture**: Split monolithic modules into focused files (dragInsertion, TierSettings, useDragAndDrop)
  +- **Architecture**: Extracted shared primitives & overlay mechanics (BoardPrimitives, useDismissibleLayer, useAnchoredPosition)
  +- **Architecture**: Render exports off-screen w/o touching live board store
  +- **Store**: Slimmed stores — `TierColorSpec` discriminated union replaces `TierColorSource`, board manager is thin registry
  +- **Store**: Extracted app-level hooks (useAppBootstrap, useCurrentPaletteId, useExportController)
  +- **Theme**: Added `THEME_META` array & flattened palette defaults
- +### Removed
- +- **Store**: `updateTitle` & `syncTitle` — title flows through board manager rename only
  +- **Settings**: Tier color sync confirm flow (automatic via TierColorSpec)
- ## [0.2.5] - 2026-03-28
  ### Fixed
  @@ -54,8 +108,6 @@ and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0
  ## [0.2.0] - 2026-03-22
  -Phase 2 (Customization & Export) complete — theming, preferences, multi-board export, and a full color picker.

* ### Added
  - **Theming**: 8 color themes and 5 text styles controlled via CSS custom properties (`--t-*` tokens), with `ThemePicker`, `TextStylePicker`, and `useThemeApplicator` hook
