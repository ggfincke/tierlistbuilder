// src/features/platform/preferences/model/usePreferencesStore.ts
// * global preferences store persisted independently of per-board data

import { create } from 'zustand'
import { persist, subscribeWithSelector } from 'zustand/middleware'

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

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  itemSize: 'medium',
  showLabels: false,
  defaultLabelPlacementMode: 'overlay',
  itemShape: 'square',
  compactMode: false,
  exportBackgroundOverride: null,
  boardBackgroundOverride: null,
  labelWidth: 'default',
  hideRowControls: false,
  confirmBeforeDelete: false,
  themeId: 'classic',
  paletteId: 'classic',
  textStyleId: 'default',
  tierLabelBold: false,
  tierLabelItalic: false,
  tierLabelFontSize: 'small',
  boardLocked: false,
  reducedMotion: false,
  toolbarPosition: 'top',
  showAltTextButton: false,
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
  setItemShape: (shape: ItemShape) => void
  setCompactMode: (compact: boolean) => void
  setExportBackgroundOverride: (color: string | null) => void
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
  setShowAltTextButton: (show: boolean) => void
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
        setItemShape: createPreferenceSetter(set, get, 'itemShape'),
        setCompactMode: createPreferenceSetter(set, get, 'compactMode'),
        setExportBackgroundOverride: createPreferenceSetter(
          set,
          get,
          'exportBackgroundOverride'
        ),
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
        setShowAltTextButton: createPreferenceSetter(
          set,
          get,
          'showAltTextButton'
        ),
        setAutoCropTrimSoftShadows: createPreferenceSetter(
          set,
          get,
          'autoCropTrimSoftShadows'
        ),
        toggleHighContrast: (enabled) =>
          set((state) =>
          {
            if (enabled)
            {
              return {
                preHighContrastThemeId: state.themeId,
                preHighContrastPaletteId: state.paletteId,
                themeId: 'high-contrast' as const,
                paletteId: THEME_PALETTE['high-contrast'],
              }
            }
            const restoreTheme =
              state.preHighContrastThemeId &&
              state.preHighContrastThemeId !== 'high-contrast'
                ? state.preHighContrastThemeId
                : ('classic' as const)
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
      }
    )
  )
)
