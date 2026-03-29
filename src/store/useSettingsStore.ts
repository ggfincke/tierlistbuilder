// src/store/useSettingsStore.ts
// * global settings store — user preferences persisted independently of per-board data

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type {
  AppSettings,
  ItemShape,
  ItemSize,
  LabelWidth,
  TextStyleId,
  ThemeId,
  TierLabelFontSize,
} from '../types'
import { createAppPersistStorage, SETTINGS_STORAGE_KEY } from '../utils/storage'
import { THEMES } from '../theme/tokens'

const DEFAULT_SETTINGS: AppSettings = {
  itemSize: 'medium',
  showLabels: false,
  itemShape: 'square',
  compactMode: false,
  exportBackgroundOverride: null,
  labelWidth: 'default',
  hideRowControls: false,
  confirmBeforeDelete: false,
  themeId: 'classic',
  textStyleId: 'default',
  syncTierColorsWithTheme: true,
  tierLabelBold: false,
  tierLabelItalic: false,
  tierLabelFontSize: 'small',
}

interface SettingsStore extends AppSettings
{
  setItemSize: (size: ItemSize) => void
  setShowLabels: (show: boolean) => void
  setItemShape: (shape: ItemShape) => void
  setCompactMode: (compact: boolean) => void
  setExportBackgroundOverride: (color: string | null) => void
  setLabelWidth: (width: LabelWidth) => void
  setHideRowControls: (hide: boolean) => void
  setConfirmBeforeDelete: (confirm: boolean) => void
  setThemeId: (themeId: ThemeId) => void
  setTextStyleId: (textStyleId: TextStyleId) => void
  setSyncTierColorsWithTheme: (sync: boolean) => void
  setTierLabelBold: (bold: boolean) => void
  setTierLabelItalic: (italic: boolean) => void
  setTierLabelFontSize: (size: TierLabelFontSize) => void
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

export const useSettingsStore = create<SettingsStore>()(
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
      setLabelWidth: createSettingSetter(set, 'labelWidth'),
      setHideRowControls: createSettingSetter(set, 'hideRowControls'),
      setConfirmBeforeDelete: createSettingSetter(set, 'confirmBeforeDelete'),
      setThemeId: createSettingSetter(set, 'themeId'),
      setTextStyleId: createSettingSetter(set, 'textStyleId'),
      setSyncTierColorsWithTheme: createSettingSetter(
        set,
        'syncTierColorsWithTheme'
      ),
      setTierLabelBold: createSettingSetter(set, 'tierLabelBold'),
      setTierLabelItalic: createSettingSetter(set, 'tierLabelItalic'),
      setTierLabelFontSize: createSettingSetter(set, 'tierLabelFontSize'),
      resetSettings: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      storage: createAppPersistStorage(),
      version: 4,
      migrate: (persisted, version) =>
      {
        let state = persisted as Record<string, unknown>
        if (version < 2)
        {
          state = {
            ...state,
            themeId: state.themeId ?? 'classic',
            textStyleId: state.textStyleId ?? 'default',
          }
        }
        if (version < 3)
        {
          state = {
            ...state,
            syncTierColorsWithTheme: state.syncTierColorsWithTheme ?? true,
            tierLabelBold: state.tierLabelBold ?? false,
            tierLabelItalic: state.tierLabelItalic ?? false,
            tierLabelFontSize: state.tierLabelFontSize ?? 'small',
          }
        }
        if (version < 4)
        {
          const themeId = (state.themeId as string) ?? 'classic'
          const oldBg = state.exportBackgroundColor as string | undefined
          const themeBg = THEMES[themeId as keyof typeof THEMES]?.['export-bg']
          state = {
            ...state,
            exportBackgroundOverride: oldBg && oldBg !== themeBg ? oldBg : null,
          }
          delete state.exportBackgroundColor
        }
        return state
      },
    }
  )
)
