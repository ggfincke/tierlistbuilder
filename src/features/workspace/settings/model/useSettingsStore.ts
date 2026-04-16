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
import { migrateSettingsState } from './settingsStorageMigration'

const DEFAULT_SETTINGS: AppSettings = {
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
  preHighContrastThemeId: null,
  preHighContrastPaletteId: null,
  toolbarPosition: 'top',
  showAltTextButton: false,
}

interface SettingsStore extends AppSettings
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
  toggleHighContrast: (enabled: boolean) => void
  resetSettings: () => void
}

const createSettingSetter = <K extends keyof AppSettings>(
  set: (partial: Partial<SettingsStore>) => void,
  key: K
) =>
{
  return (value: AppSettings[K]) =>
    set({ [key]: value } as Pick<AppSettings, K>)
}

// subscribeWithSelector wraps persist so the cloud-sync layer can subscribe
// to AppSettings field changes w/ a custom equalityFn (the field projection
// returns a fresh object each tick & default referential equality would
// fire on every store action otherwise)
export const useSettingsStore = create<SettingsStore>()(
  subscribeWithSelector(
    persist(
      (set) => ({
        ...DEFAULT_SETTINGS,

        setItemSize: createSettingSetter(set, 'itemSize'),
        setShowLabels: createSettingSetter(set, 'showLabels'),
        setItemShape: createSettingSetter(set, 'itemShape'),
        setCompactMode: createSettingSetter(set, 'compactMode'),
        setExportBackgroundOverride: createSettingSetter(
          set,
          'exportBackgroundOverride'
        ),
        setBoardBackgroundOverride: createSettingSetter(
          set,
          'boardBackgroundOverride'
        ),
        setLabelWidth: createSettingSetter(set, 'labelWidth'),
        setHideRowControls: createSettingSetter(set, 'hideRowControls'),
        setConfirmBeforeDelete: createSettingSetter(set, 'confirmBeforeDelete'),
        setThemeId: createSettingSetter(set, 'themeId'),
        setPaletteId: createSettingSetter(set, 'paletteId'),
        setTextStyleId: createSettingSetter(set, 'textStyleId'),
        setTierLabelBold: createSettingSetter(set, 'tierLabelBold'),
        setTierLabelItalic: createSettingSetter(set, 'tierLabelItalic'),
        setTierLabelFontSize: createSettingSetter(set, 'tierLabelFontSize'),
        setBoardLocked: createSettingSetter(set, 'boardLocked'),
        setReducedMotion: createSettingSetter(set, 'reducedMotion'),
        setToolbarPosition: createSettingSetter(set, 'toolbarPosition'),
        setShowAltTextButton: createSettingSetter(set, 'showAltTextButton'),
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
        resetSettings: () => set(DEFAULT_SETTINGS),
      }),
      {
        name: SETTINGS_STORAGE_KEY,
        storage: createAppPersistStorage(),
        version: SETTINGS_STORAGE_VERSION,
        migrate: (persistedState) =>
          migrateSettingsState(persistedState, DEFAULT_SETTINGS),
      }
    )
  )
)
