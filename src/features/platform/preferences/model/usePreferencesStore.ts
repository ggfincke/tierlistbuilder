// src/features/platform/preferences/model/usePreferencesStore.ts
// * global preferences store persisted independently of per-board data

import { create } from 'zustand'
import { persist, subscribeWithSelector } from 'zustand/middleware'

import {
  EXPORT_ITEMS_PER_ROW_DEFAULT,
  normalizeExportItemsPerRow,
} from '@tierlistbuilder/contracts/platform/preferences'
import { LABEL_FONT_SIZE_PX_DEFAULT } from '@tierlistbuilder/contracts/workspace/board'
import type {
  AppPreferences,
  ItemShape,
  ItemSize,
  LabelWidth,
  TierLabelFontSize,
  ToolbarPosition,
} from '@tierlistbuilder/contracts/platform/preferences'
import type { LabelPlacementMode } from '@tierlistbuilder/contracts/workspace/board'
import type {
  PaletteId,
  TextStyleId,
  ThemeId,
} from '@tierlistbuilder/contracts/lib/theme'
import { createAppPersistStorage } from '~/shared/lib/browserStorage'
import { THEME_PALETTE } from '~/shared/theme/palettes'
import {
  PREFERENCES_STORAGE_KEY,
  PREFERENCES_STORAGE_VERSION,
} from '../data/local/preferencesStorage'

const DEFAULT_THEME_ID: ThemeId = 'scoreboard'
export const HIGH_CONTRAST_THEME_ID: ThemeId = 'volt'
const DEFAULT_PALETTE_ID: PaletteId = THEME_PALETTE[DEFAULT_THEME_ID]

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  itemSize: 'medium',
  showLabels: false,
  defaultLabelPlacementMode: 'overlay',
  defaultLabelFontSizePx: LABEL_FONT_SIZE_PX_DEFAULT,
  itemShape: 'square',
  compactMode: false,
  exportBackgroundOverride: null,
  exportItemsPerRow: EXPORT_ITEMS_PER_ROW_DEFAULT,
  boardBackgroundOverride: null,
  labelWidth: 'default',
  hideRowControls: false,
  confirmBeforeDelete: false,
  themeId: DEFAULT_THEME_ID,
  paletteId: DEFAULT_PALETTE_ID,
  textStyleId: 'default',
  tierLabelBold: false,
  tierLabelItalic: false,
  tierLabelFontSize: 'small',
  boardLocked: false,
  reducedMotion: false,
  toolbarPosition: 'top',
  showItemEditButton: true,
  autoCropTrimSoftShadows: true,
}

// runtime-only transition state for the high-contrast toggle — remembers the
// theme & palette to restore when the user turns HC back off. not persisted
// because it's a transient undo hint, not a user preference
interface HighContrastTransitionState
{
  preHighContrastThemeId: ThemeId | null
  preHighContrastPaletteId: PaletteId | null
}

const DEFAULT_HIGH_CONTRAST_TRANSITION: HighContrastTransitionState = {
  preHighContrastThemeId: null,
  preHighContrastPaletteId: null,
}

interface PreferencesStore extends AppPreferences, HighContrastTransitionState
{
  setItemSize: (size: ItemSize) => void
  setShowLabels: (show: boolean) => void
  setDefaultLabelPlacementMode: (mode: LabelPlacementMode) => void
  setDefaultLabelFontSizePx: (px: number) => void
  setItemShape: (shape: ItemShape) => void
  setCompactMode: (compact: boolean) => void
  setExportBackgroundOverride: (color: string | null) => void
  setExportItemsPerRow: (count: number) => void
  setBoardBackgroundOverride: (color: string | null) => void
  setLabelWidth: (width: LabelWidth) => void
  setHideRowControls: (hide: boolean) => void
  setConfirmBeforeDelete: (confirm: boolean) => void
  setThemeId: (themeId: ThemeId) => void
  setPaletteId: (paletteId: PaletteId) => void
  setTextStyleId: (textStyleId: TextStyleId) => void
  setTierLabelBold: (bold: boolean) => void
  setTierLabelItalic: (italic: boolean) => void
  setTierLabelFontSize: (size: TierLabelFontSize) => void
  setBoardLocked: (locked: boolean) => void
  setReducedMotion: (reduced: boolean) => void
  setToolbarPosition: (position: ToolbarPosition) => void
  setShowItemEditButton: (show: boolean) => void
  setAutoCropTrimSoftShadows: (trim: boolean) => void
  toggleHighContrast: (enabled: boolean) => void
}

// guard against same-value writes so re-clicking the active option doesn't
// trigger a persist-middleware serialization + localStorage write + subscriber
// fan-out
const createPreferenceSetter = <K extends keyof AppPreferences>(
  set: (partial: Partial<PreferencesStore>) => void,
  get: () => PreferencesStore,
  key: K
) =>
{
  return (value: AppPreferences[K]) =>
  {
    if (get()[key] === value) return
    set({ [key]: value } as Pick<AppPreferences, K>)
  }
}

// subscribeWithSelector wraps persist so AppPreferences projections can use a
// custom equalityFn instead of firing on every store action
export const usePreferencesStore = create<PreferencesStore>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        ...DEFAULT_APP_PREFERENCES,
        ...DEFAULT_HIGH_CONTRAST_TRANSITION,

        setItemSize: createPreferenceSetter(set, get, 'itemSize'),
        setShowLabels: createPreferenceSetter(set, get, 'showLabels'),
        setDefaultLabelPlacementMode: createPreferenceSetter(
          set,
          get,
          'defaultLabelPlacementMode'
        ),
        setDefaultLabelFontSizePx: createPreferenceSetter(
          set,
          get,
          'defaultLabelFontSizePx'
        ),
        setItemShape: createPreferenceSetter(set, get, 'itemShape'),
        setCompactMode: createPreferenceSetter(set, get, 'compactMode'),
        setExportBackgroundOverride: createPreferenceSetter(
          set,
          get,
          'exportBackgroundOverride'
        ),
        setExportItemsPerRow: (count) =>
        {
          const next = normalizeExportItemsPerRow(count)
          if (get().exportItemsPerRow === next) return
          set({ exportItemsPerRow: next })
        },
        setBoardBackgroundOverride: createPreferenceSetter(
          set,
          get,
          'boardBackgroundOverride'
        ),
        setLabelWidth: createPreferenceSetter(set, get, 'labelWidth'),
        setHideRowControls: createPreferenceSetter(set, get, 'hideRowControls'),
        setConfirmBeforeDelete: createPreferenceSetter(
          set,
          get,
          'confirmBeforeDelete'
        ),
        setThemeId: createPreferenceSetter(set, get, 'themeId'),
        setPaletteId: createPreferenceSetter(set, get, 'paletteId'),
        setTextStyleId: createPreferenceSetter(set, get, 'textStyleId'),
        setTierLabelBold: createPreferenceSetter(set, get, 'tierLabelBold'),
        setTierLabelItalic: createPreferenceSetter(set, get, 'tierLabelItalic'),
        setTierLabelFontSize: createPreferenceSetter(
          set,
          get,
          'tierLabelFontSize'
        ),
        setBoardLocked: createPreferenceSetter(set, get, 'boardLocked'),
        setReducedMotion: createPreferenceSetter(set, get, 'reducedMotion'),
        setToolbarPosition: createPreferenceSetter(set, get, 'toolbarPosition'),
        setShowItemEditButton: createPreferenceSetter(
          set,
          get,
          'showItemEditButton'
        ),
        setAutoCropTrimSoftShadows: createPreferenceSetter(
          set,
          get,
          'autoCropTrimSoftShadows'
        ),
        toggleHighContrast: (enabled) =>
          set((state) =>
          {
            // High contrast toggles to/from the Volt theme — the Scoreboard
            // system's loud-mode theme doubles as the high-contrast option.
            if (enabled)
            {
              return {
                preHighContrastThemeId: state.themeId,
                preHighContrastPaletteId: state.paletteId,
                themeId: HIGH_CONTRAST_THEME_ID,
                paletteId: THEME_PALETTE[HIGH_CONTRAST_THEME_ID],
              }
            }
            const restoreTheme =
              state.preHighContrastThemeId &&
              state.preHighContrastThemeId !== HIGH_CONTRAST_THEME_ID
                ? state.preHighContrastThemeId
                : DEFAULT_THEME_ID
            const restorePalette =
              state.preHighContrastPaletteId ?? THEME_PALETTE[restoreTheme]
            return {
              themeId: restoreTheme,
              paletteId: restorePalette,
              preHighContrastThemeId: null,
              preHighContrastPaletteId: null,
            }
          }),
      }),
      {
        name: PREFERENCES_STORAGE_KEY,
        storage: createAppPersistStorage(),
        version: PREFERENCES_STORAGE_VERSION,
        partialize: ({
          preHighContrastThemeId: _t,
          preHighContrastPaletteId: _p,
          ...rest
        }) => rest,
        // Pre-1.0 storage bumps intentionally reset persisted preferences
        // instead of preserving retired schema values.
        migrate: () =>
        {
          return { ...DEFAULT_APP_PREFERENCES }
        },
      }
    )
  )
)
