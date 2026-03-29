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
  tierLabelBold: false,
  tierLabelItalic: false,
  tierLabelFontSize: 'small',
  boardLocked: false,
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
  setTierLabelBold: (bold: boolean) => void
  setTierLabelItalic: (italic: boolean) => void
  setTierLabelFontSize: (size: TierLabelFontSize) => void
  setBoardLocked: (locked: boolean) => void
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
      setTierLabelBold: createSettingSetter(set, 'tierLabelBold'),
      setTierLabelItalic: createSettingSetter(set, 'tierLabelItalic'),
      setTierLabelFontSize: createSettingSetter(set, 'tierLabelFontSize'),
      setBoardLocked: createSettingSetter(set, 'boardLocked'),
      resetSettings: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      storage: createAppPersistStorage(),
      version: 6,
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
        if (version < 5)
        {
          delete state.syncTierColorsWithTheme
        }
        if (version < 6)
        {
          state = { ...state, boardLocked: false }
        }
        return state
      },
    }
  )
)
