// src/features/workspace/settings/model/useSettingsStore.ts
// * global settings store — user preferences persisted independently of per-board data

import { create } from 'zustand'
import { persist, subscribeWithSelector } from 'zustand/middleware'

import type {
  AppSettings,
  ItemShape,
  ItemSize,
  LabelWidth,
  TierLabelFontSize,
  ToolbarPosition,
} from '@tierlistbuilder/contracts/workspace/settings'
import type {
  PaletteId,
  TextStyleId,
  ThemeId,
} from '@tierlistbuilder/contracts/lib/theme'
import { createAppPersistStorage } from '~/shared/lib/browserStorage'
import { THEME_PALETTE } from '~/shared/theme/palettes'
import {
  SETTINGS_STORAGE_KEY,
  SETTINGS_STORAGE_VERSION,
} from '../data/local/settingsStorage'

export const DEFAULT_APP_SETTINGS: AppSettings = {
  itemSize: 'medium',
  showLabels: false,
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

interface SettingsStore extends AppSettings, HighContrastTransitionState
{
  setItemSize: (size: ItemSize) => void
  setShowLabels: (show: boolean) => void
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
const createSettingSetter = <K extends keyof AppSettings>(
  set: (partial: Partial<SettingsStore>) => void,
  get: () => SettingsStore,
  key: K
) =>
{
  return (value: AppSettings[K]) =>
  {
    if (get()[key] === value) return
    set({ [key]: value } as Pick<AppSettings, K>)
  }
}

// subscribeWithSelector wraps persist so AppSettings projections can use a
// custom equalityFn instead of firing on every store action
export const useSettingsStore = create<SettingsStore>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        ...DEFAULT_APP_SETTINGS,
        ...DEFAULT_HIGH_CONTRAST_TRANSITION,

        setItemSize: createSettingSetter(set, get, 'itemSize'),
        setShowLabels: createSettingSetter(set, get, 'showLabels'),
        setItemShape: createSettingSetter(set, get, 'itemShape'),
        setCompactMode: createSettingSetter(set, get, 'compactMode'),
        setExportBackgroundOverride: createSettingSetter(
          set,
          get,
          'exportBackgroundOverride'
        ),
        setBoardBackgroundOverride: createSettingSetter(
          set,
          get,
          'boardBackgroundOverride'
        ),
        setLabelWidth: createSettingSetter(set, get, 'labelWidth'),
        setHideRowControls: createSettingSetter(set, get, 'hideRowControls'),
        setConfirmBeforeDelete: createSettingSetter(
          set,
          get,
          'confirmBeforeDelete'
        ),
        setThemeId: createSettingSetter(set, get, 'themeId'),
        setPaletteId: createSettingSetter(set, get, 'paletteId'),
        setTextStyleId: createSettingSetter(set, get, 'textStyleId'),
        setTierLabelBold: createSettingSetter(set, get, 'tierLabelBold'),
        setTierLabelItalic: createSettingSetter(set, get, 'tierLabelItalic'),
        setTierLabelFontSize: createSettingSetter(
          set,
          get,
          'tierLabelFontSize'
        ),
        setBoardLocked: createSettingSetter(set, get, 'boardLocked'),
        setReducedMotion: createSettingSetter(set, get, 'reducedMotion'),
        setToolbarPosition: createSettingSetter(set, get, 'toolbarPosition'),
        setShowAltTextButton: createSettingSetter(
          set,
          get,
          'showAltTextButton'
        ),
        setAutoCropTrimSoftShadows: createSettingSetter(
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
        name: SETTINGS_STORAGE_KEY,
        storage: createAppPersistStorage(),
        version: SETTINGS_STORAGE_VERSION,
        partialize: ({
          preHighContrastThemeId: _t,
          preHighContrastPaletteId: _p,
          ...rest
        }) => rest,
      }
    )
  )
)
